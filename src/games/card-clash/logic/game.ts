// 🃏 Clash Cards: game logic. All state lives in groups/{id}.gameState and
// every change goes through a transaction with a phase/round guard, so a
// double tap or two phones acting at once can't apply anything twice.
import { deleteField, doc, runTransaction, Transaction } from 'firebase/firestore';
import { db } from '../../../shared/firebase/config';
import { returnToMenu, scoreFields } from '../../../shared/firebase/groups';
import type { ClashDefence, ClashGameState, ClashResult, Group } from '../../../shared/types';
import { DECKS, DECK_CARDS, cardById } from '../data/decks';
import type { ClashDeckId } from '../data/types';

export const CALL_MS = 30000;        // the caller's time to pick a stat
// How long a clash result stays up: see logic/timeline.ts.
export const HAND_SIZES = [6, 8, 10] as const;
export const DEFAULT_HAND = 8;

export const isClashState = (gs: unknown): gs is ClashGameState =>
    !!gs && (gs as { game?: string }).game === 'card-clash';

const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const read = async (tx: Transaction, groupId: string) => {
    const groupRef = doc(db, 'groups', groupId);
    const snap = await tx.get(groupRef);
    if (!snap.exists()) return null;
    const data = snap.data() as Group;
    if (!isClashState(data.gameState)) return null;
    return { groupRef, data, gs: data.gameState };
};

// Players still holding cards (and still in the group).
export const alivePlayers = (gs: ClashGameState, players: { id: string }[]): string[] =>
    players.map((p) => p.id).filter((id) => (gs.piles[id]?.length ?? 0) > 0);

// ── Start ────────────────────────────────────────────────────────────
export const startCardClash = async (
    group: Group,
    deck: ClashDeckId,
    perPlayer: number
): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const groupRef = doc(db, 'groups', group.id);
        const snap = await tx.get(groupRef);
        if (!snap.exists()) return;
        const data = snap.data() as Group;
        if (isClashState(data.gameState) && data.gameState.phase !== 'over') return; // already running
        const ids = shuffle(data.players.map((p) => p.id));
        if (ids.length < 2) return;
        const pool = shuffle(DECK_CARDS[deck]);
        const each = Math.max(1, Math.min(perPlayer, Math.floor(pool.length / ids.length)));
        const piles: Record<string, string[]> = Object.fromEntries(ids.map((id) => [id, [] as string[]]));
        for (let i = 0; i < each * ids.length; i++) piles[ids[i % ids.length]].push(pool[i].id);
        // ★ One gold card each, somewhere in the pile.
        const gold: Record<string, boolean> = {};
        for (const id of ids) gold[pick(piles[id])] = true;
        const gs: ClashGameState = {
            game: 'card-clash',
            deck,
            phase: 'calling',
            round: 1,
            piles,
            callerId: ids[0],
            startedWith: each,
            wildcardUsed: {},
            skipsUsed: {},
            hintsUsed: {},
            outRound: {},
            gold,
        };
        tx.update(groupRef, { gameState: gs, status: 'playing' });
    });
};

// ── Lifelines: ⏭️ Skip (anyone) and 🔍 Hint (the caller), once a game ──
// Skip sends your top card to the bottom of your pile. Hint is private:
// the caller's phone shows each opponent's continent / animal group.
export const skipCard = async (
    groupId: string,
    playerId: string,
    round: number
): Promise<{ success: boolean; reason?: string }> => {
    let result: { success: boolean; reason?: string } = { success: false, reason: 'stale' };
    try {
        await runTransaction(db, async (tx) => {
            result = { success: false, reason: 'stale' };
            const cur = await read(tx, groupId);
            if (!cur) return;
            const { gs, groupRef } = cur;
            if (gs.phase !== 'calling' || gs.round !== round) return;
            if (gs.skipsUsed?.[playerId] !== undefined) {
                result = { success: false, reason: 'used' };
                return;
            }
            const pile = gs.piles[playerId] ?? [];
            if (pile.length < 2) {
                result = { success: false, reason: 'last-card' };
                return;
            }
            tx.update(groupRef, {
                [`gameState.piles.${playerId}`]: [...pile.slice(1), pile[0]],
                [`gameState.skipsUsed.${playerId}`]: round,
            });
            result = { success: true };
        });
    } catch (e) {
        if (__DEV__) console.warn('[skipCard] transaction failed', e);
    }
    return result;
};

export const takeHint = async (
    groupId: string,
    playerId: string,
    round: number
): Promise<{ success: boolean; reason?: string }> => {
    let result: { success: boolean; reason?: string } = { success: false, reason: 'stale' };
    try {
        await runTransaction(db, async (tx) => {
            result = { success: false, reason: 'stale' };
            const cur = await read(tx, groupId);
            if (!cur) return;
            const { gs, groupRef } = cur;
            if (gs.phase !== 'calling' || gs.round !== round || gs.callerId !== playerId) return;
            if (gs.hintsUsed?.[playerId] !== undefined) {
                result = { success: false, reason: 'used' };
                return;
            }
            tx.update(groupRef, { [`gameState.hintsUsed.${playerId}`]: round });
            result = { success: true };
        });
    } catch (e) {
        if (__DEV__) console.warn('[useHint] transaction failed', e);
    }
    return result;
};

// ── Who wins a clash ─────────────────────────────────────────────────
// Highest value wins. A tie at the top goes to a gold card over a normal
// one; anything still tied is a 🎲 roll.
export const isGold = (gs: Pick<ClashGameState, 'gold'>, cardId: string | undefined): boolean =>
    !!cardId && !!gs.gold?.[cardId];

const decide = (
    ids: string[],
    values: Record<string, number>,
    goldOf: (id: string) => boolean
): { winnerId: string; tied?: string[]; goldTie?: boolean } => {
    const top = Math.max(...ids.map((id) => values[id]));
    const atTop = ids.filter((id) => values[id] === top);
    if (atTop.length === 1) return { winnerId: atTop[0] };
    const goldAtTop = atTop.filter(goldOf);
    const goldTie = goldAtTop.length > 0 && goldAtTop.length < atTop.length;
    const pool = goldTie ? goldAtTop : atTop;
    return {
        winnerId: pick(pool),
        ...(pool.length > 1 ? { tied: pool } : {}),
        ...(goldTie ? { goldTie: true } : {}),
    };
};

// Moves every card in `pot` (each player's top card) to the winner's pile
// bottom, winner's own card first. Returns the new piles and who ran out.
const settlePot = (
    gs: ClashGameState,
    pot: Record<string, string>,
    winnerId: string
): { piles: Record<string, string[]>; out: string[]; outRound: Record<string, number> } => {
    const ids = Object.keys(pot);
    const piles: Record<string, string[]> = { ...gs.piles };
    for (const id of ids) piles[id] = gs.piles[id].slice(1);
    const won = [pot[winnerId], ...ids.filter((id) => id !== winnerId).map((id) => pot[id])];
    piles[winnerId] = [...piles[winnerId], ...won];
    const out = ids.filter((id) => piles[id].length === 0);
    const outRound = { ...(gs.outRound ?? {}) };
    for (const id of out) outRound[id] = gs.round;
    return { piles, out, outRound };
};

// ── The caller picks a stat (or 🃏, or time ran out) ─────────────────
export type CallChoice = { statKey: string } | { wildcard: true } | { auto: true };

export const callStat = async (
    groupId: string,
    playerId: string,
    round: number,
    choice: CallChoice
): Promise<{ success: boolean; reason?: string }> => {
    let result: { success: boolean; reason?: string } = { success: false, reason: 'stale' };
    try {
        await runTransaction(db, async (tx) => {
            result = { success: false, reason: 'stale' };
            const cur = await read(tx, groupId);
            if (!cur) return;
            const { gs, data, groupRef } = cur;
            if (gs.phase !== 'calling' || gs.round !== round) return;
            const isAuto = 'auto' in choice;
            if (!isAuto && gs.callerId !== playerId) return;

            const deck = DECKS[gs.deck];
            let statKey: string;
            let wildcard = false;
            if ('wildcard' in choice) {
                if (gs.wildcardUsed?.[playerId]) {
                    result = { success: false, reason: 'wildcard-used' };
                    return;
                }
                statKey = pick(deck.wildcards).key;
                wildcard = true;
            } else if ('statKey' in choice) {
                if (!deck.stats.some((s) => s.key === choice.statKey)) return;
                statKey = choice.statKey;
            } else {
                statKey = pick(deck.stats).key;
            }

            // Players can leave or be benched mid-game: if that leaves fewer
            // than 2 holding cards, the game is over (nothing to call).
            const alive = alivePlayers(gs, data.players);
            if (alive.length < 2) {
                tx.update(groupRef, { 'gameState.phase': 'over' });
                result = { success: false, reason: 'over' };
                return;
            }

            // Everyone's top card; the highest value takes them all.
            const plays: Record<string, string> = {};
            const values: Record<string, number> = {};
            for (const id of alive) {
                const cardId = gs.piles[id][0];
                plays[id] = cardId;
                values[id] = cardById(cardId)?.stats[statKey] ?? 0;
            }
            const goldOf = (id: string) => isGold(gs, plays[id]);
            const { winnerId, tied, goldTie } = decide(alive, values, goldOf);
            const goldCards = alive.filter(goldOf).map((id) => plays[id]);
            const base: ClashResult = {
                round: gs.round,
                stage: 'clash',
                callerId: gs.callerId,
                statKey,
                plays,
                winnerId,
                ...(wildcard ? { wildcard: true } : {}),
                ...(isAuto ? { auto: true } : {}),
                ...(tied ? { tied } : {}),
                ...(goldTie ? { goldTie: true } : {}),
                ...(goldCards.length > 0 ? { gold: goldCards } : {}),
            };

            let updates: Record<string, unknown>;
            // A normal card beat a gold card: Gold Defence before anything moves.
            // The beaten gold card that came closest defends.
            const goldLosers = goldOf(winnerId) ? [] : alive.filter((id) => id !== winnerId && goldOf(id));
            if (goldLosers.length > 0) {
                const best = Math.max(...goldLosers.map((id) => values[id]));
                const defenderId = pick(goldLosers.filter((id) => values[id] === best));
                const defence: ClashDefence = {
                    defenderId,
                    challengerId: winnerId,
                    goldCard: plays[defenderId],
                    challengerCard: plays[winnerId],
                    firstStatKey: statKey,
                    firstValues: values,
                    pot: plays,
                };
                updates = {
                    'gameState.phase': 'reveal',
                    'gameState.last': { ...base, defenceNext: true },
                    'gameState.defence': defence,
                };
            } else {
                const { piles, out, outRound } = settlePot(gs, plays, winnerId);
                updates = {
                    'gameState.phase': 'reveal',
                    'gameState.piles': piles,
                    'gameState.outRound': outRound,
                    'gameState.last': { ...base, ...(out.length > 0 ? { out } : {}) },
                };
            }
            if (wildcard) updates[`gameState.wildcardUsed.${playerId}`] = true;
            tx.update(groupRef, updates);
            result = { success: true };
        });
    } catch (e) {
        if (__DEV__) console.warn('[callStat] transaction failed', e);
    }
    return result;
};

// ── ⚡ Gold Defence: the gold card's owner calls a different stat ─────
// Gold wins a tie. Whoever wins takes the whole first-clash pot; if the
// challenger wins, the gold moves from the beaten card to theirs.
export type DefenceChoice = { statKey: string } | { auto: true };

export const callDefence = async (
    groupId: string,
    playerId: string,
    round: number,
    choice: DefenceChoice
): Promise<{ success: boolean; reason?: string }> => {
    let result: { success: boolean; reason?: string } = { success: false, reason: 'stale' };
    try {
        await runTransaction(db, async (tx) => {
            result = { success: false, reason: 'stale' };
            const cur = await read(tx, groupId);
            if (!cur) return;
            const { gs, groupRef } = cur;
            const d = gs.defence;
            if (gs.phase !== 'defending' || gs.round !== round || !d) return;
            const isAuto = 'auto' in choice;
            if (!isAuto && d.defenderId !== playerId) return;

            const open = DECKS[gs.deck].stats.filter((s) => s.key !== d.firstStatKey);
            let statKey: string;
            if ('statKey' in choice) {
                if (!open.some((s) => s.key === choice.statKey)) {
                    result = { success: false, reason: 'stat-used' };
                    return;
                }
                statKey = choice.statKey;
            } else {
                statKey = pick(open).key;
            }

            const gv = cardById(d.goldCard)?.stats[statKey] ?? 0;
            const cv = cardById(d.challengerCard)?.stats[statKey] ?? 0;
            const goldHolds = gv >= cv;
            const winnerId = goldHolds ? d.defenderId : d.challengerId;
            const { piles, out, outRound } = settlePot(gs, d.pot, winnerId);
            const gold = { ...(gs.gold ?? {}) };
            if (!goldHolds) {
                delete gold[d.goldCard];
                gold[d.challengerCard] = true;
            }
            const last: ClashResult = {
                round: gs.round,
                stage: 'defence',
                callerId: d.defenderId,
                statKey,
                plays: { [d.defenderId]: d.goldCard, [d.challengerId]: d.challengerCard },
                winnerId,
                pot: d.pot,
                firstStatKey: d.firstStatKey,
                gold: [d.goldCard],
                ...(isAuto ? { auto: true } : {}),
                ...(gv === cv ? { goldTie: true } : {}),
                ...(!goldHolds ? { goldTo: d.challengerCard } : {}),
                ...(out.length > 0 ? { out } : {}),
            };
            tx.update(groupRef, {
                'gameState.phase': 'reveal',
                'gameState.piles': piles,
                'gameState.outRound': outRound,
                'gameState.gold': gold,
                'gameState.last': last,
                'gameState.defence': deleteField(),
            });
            result = { success: true };
        });
    } catch (e) {
        if (__DEV__) console.warn('[callDefence] transaction failed', e);
    }
    return result;
};

// ── After the reveal: Gold Defence, next clash, or the end ───────────
// The winner of the clash calls next. `stage` is the reveal being left, so
// a late tap from a phone still on the first reveal can't skip the defence's.
export const nextClash = async (
    groupId: string,
    round: number,
    stage: 'clash' | 'defence' = 'clash'
): Promise<void> => {
    try {
        await runTransaction(db, async (tx) => {
            const cur = await read(tx, groupId);
            if (!cur) return;
            const { gs, data, groupRef } = cur;
            if (gs.phase !== 'reveal' || gs.round !== round) return;
            if ((gs.last?.stage ?? 'clash') !== stage) return;
            if (gs.last?.defenceNext && gs.defence) {
                tx.update(groupRef, {
                    'gameState.phase': 'defending',
                    'gameState.callerId': gs.defence.defenderId,
                });
                return;
            }
            const alive = alivePlayers(gs, data.players);
            if (alive.length < 2) {
                tx.update(groupRef, { 'gameState.phase': 'over' });
                return;
            }
            const winner = gs.last?.winnerId;
            tx.update(groupRef, {
                'gameState.phase': 'calling',
                'gameState.round': gs.round + 1,
                'gameState.callerId': winner && alive.includes(winner) ? winner : pick(alive),
            });
        });
    } catch (e) {
        if (__DEV__) console.warn('[nextClash] transaction failed', e);
    }
};

// Host: stop now and rank by cards held (then golds).
export const endClashEarly = async (groupId: string): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const cur = await read(tx, groupId);
        if (!cur || cur.gs.phase === 'over') return;
        tx.update(cur.groupRef, { 'gameState.phase': 'over', 'gameState.endedEarly': true });
    });
};

// ── Standings & leaderboard points ──────────────────────────────────
// Still holding cards beats knocked out; more cards beats fewer; among the
// knocked out, lasting longer is better. Equal records share a place.
//
// Points: the winner always scores (6 in a 2-player game, 10 with more).
// A game that reaches MIN_CLASHES_FOR_ALL clashes also pays the rest:
// 2 for the loser of a 2-player game; with 3+, 5 for the runner-up and
// 2 for everyone else. A game the host ends early pays only if it got there.
export const MIN_CLASHES_FOR_ALL = 10;
export const CLASH_POINTS = {
    duel: { win: 6, rest: 2 },
    group: { win: 10, runnerUp: 5, rest: 2 },
} as const;

// Clashes actually played to the end (one waiting on its Gold Defence isn't).
export const clashesPlayed = (gs: ClashGameState): number =>
    gs.last ? gs.last.round - (gs.last.defenceNext ? 1 : 0) : 0;

const pointsFor = (rank: number, nPlayers: number, fullGame: boolean): number => {
    if (nPlayers <= 2) return rank === 1 ? CLASH_POINTS.duel.win : fullGame ? CLASH_POINTS.duel.rest : 0;
    if (rank === 1) return CLASH_POINTS.group.win;
    if (!fullGame) return 0;
    return rank === 2 ? CLASH_POINTS.group.runnerUp : CLASH_POINTS.group.rest;
};

export type ClashStanding = {
    playerId: string;
    cards: number;
    golds: number;
    outRound?: number;
    rank: number;
    points: number;
};

export const clashStandings = (gs: ClashGameState, players: { id: string }[]): ClashStanding[] => {
    const rows = players
        .filter((p) => gs.piles[p.id] !== undefined)
        .map((p) => ({
            playerId: p.id,
            cards: gs.piles[p.id]?.length ?? 0,
            golds: (gs.piles[p.id] ?? []).filter((c) => isGold(gs, c)).length,
            outRound: gs.outRound?.[p.id],
            rank: 0,
            points: 0,
        }));
    // Golds break a tie on cards (only matters when the host ends early).
    const score = (r: (typeof rows)[number]) => (r.cards > 0 ? 1e6 + r.cards * 100 + r.golds : r.outRound ?? 0);
    rows.sort((a, b) => score(b) - score(a));
    const fullGame = clashesPlayed(gs) >= MIN_CLASHES_FOR_ALL;
    const paid = fullGame || !gs.endedEarly;
    let place = 0;
    rows.forEach((r, i) => {
        const prev = rows[i - 1];
        // Dense places: a shared 1st still leaves a runner-up.
        if (!prev || score(prev) !== score(r)) place += 1;
        r.rank = place;
        r.points = paid ? pointsFor(place, rows.length, fullGame) : 0;
    });
    return rows;
};

// Adds leaderboard points exactly once, then back to the menu.
export const finishCardClash = async (group: Group): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const cur = await read(tx, group.id);
        if (!cur) return;
        const { gs, data, groupRef } = cur;
        if (gs.pointsAwarded) return;
        const updates: Record<string, unknown> = { 'gameState.pointsAwarded': true };
        if (gs.phase === 'over' && clashesPlayed(gs) > 0) {
            for (const s of clashStandings(gs, data.players)) {
                if (s.points > 0) Object.assign(updates, scoreFields('card-clash', s.playerId, s.points));
            }
        }
        tx.update(groupRef, updates);
    });
    await returnToMenu(group.id);
};
