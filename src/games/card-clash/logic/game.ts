// 🃏 Clash Cards: game logic. All state lives in groups/{id}.gameState and
// every change goes through a transaction with a phase/round guard, so a
// double tap or two phones acting at once can't apply anything twice.
import { deleteField, doc, runTransaction, Transaction } from 'firebase/firestore';
import { db } from '../../../shared/firebase/config';
import { returnToMenu, scoreFields } from '../../../shared/firebase/groups';
import type { ClashCall, ClashDefence, ClashFold, ClashGameState, ClashResult, Group } from '../../../shared/types';
import { DECKS, DECK_CARDS, cardById } from '../data/decks';
import type { ClashDeckId } from '../data/types';

export const CALL_MS = 30000;        // the caller's time to pick a stat
export const ANSWER_MS = 20000;      // after a call: time for everyone to tap CLASH!
export const PASS_AFTER = 3;         // 🎁 calls in a row before the caller may pass the call
export const FOLD_DECIDE_MS = 15000; // 🏳️ time to accept a fold or call the bluff
export const FOLD_RESULT_MS = 6500;  // 🏳️ how long the side clash's result shows
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
export type ClashLength = 'capped' | 'unlimited';

export const startCardClash = async (
    group: Group,
    deck: ClashDeckId,
    perPlayer: number,
    lengthMode: ClashLength = 'capped'
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
            scratched: {},
            outRound: {},
            lengthMode,
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

// ── Scratch-off: a called stat is crossed off for EVERYONE ───────────
// The stats left shrink with every clash, in three waves: all 10; when
// they're gone, a random 5 reopen; when those are gone, the other 5; when
// those are gone, that clash is the last and most cards wins. So a game is
// at most 20 scratching calls. Calling from a ★ gold card ignores the list
// and scratches nothing (as do the Wildcard and the Gold Defence).
export const scratchedStats = (gs: ClashGameState): string[] =>
    Object.keys(gs.scratched ?? {}).filter((k) => gs.scratched?.[k] === true);

// Main stats nobody has called yet (in this wave).
export const openStats = (gs: ClashGameState): string[] => {
    const off = new Set(scratchedStats(gs));
    return DECKS[gs.deck].stats.map((s) => s.key).filter((k) => !off.has(k));
};

// Scratch one stat; when every open stat is gone, the next wave opens.
const scratchUpdates = (gs: ClashGameState, statKey: string): Record<string, unknown> => {
    const deck = DECKS[gs.deck];
    const updates: Record<string, unknown> = {};
    const next: Record<string, boolean> = {};
    for (const k of scratchedStats(gs)) next[k] = true;
    next[statKey] = true;
    const allGone = deck.stats.every((s) => next[s.key]);
    const wave = gs.statWave ?? 1;
    if (!allGone) {
        updates['gameState.scratched'] = next;
    } else if (wave === 1) {
        // A random 5 reopen; the other 5 stay crossed off for wave 3.
        const reserve = shuffle(deck.stats.map((s) => s.key)).slice(5);
        updates['gameState.scratched'] = Object.fromEntries(reserve.map((k) => [k, true]));
        updates['gameState.statReserve'] = reserve;
        updates['gameState.statWave'] = 2;
    } else if (wave === 2) {
        // The other 5 (the ones never reopened) come back.
        const reserve = new Set(gs.statReserve ?? []);
        updates['gameState.scratched'] = Object.fromEntries(
            deck.stats.filter((s) => !reserve.has(s.key)).map((s) => [s.key, true])
        );
        updates['gameState.statWave'] = 3;
    } else if (gs.lengthMode === 'unlimited') {
        // ♾️ No cap: start the waves over with all 10.
        updates['gameState.scratched'] = {};
        updates['gameState.statWave'] = 1;
        updates['gameState.statReserve'] = deleteField();
    } else {
        updates['gameState.scratched'] = next;
        updates['gameState.statsOut'] = true; // this clash is the last
    }
    return updates;
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
            const caller = gs.callerId;
            const goldFree = isGold(gs, gs.piles[caller]?.[0]);
            const scratched: Record<string, boolean> = {};
            for (const k of scratchedStats(gs)) scratched[k] = true;
            const unlocked = deck.stats.filter((s) => goldFree || !scratched[s.key]);
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
                if (!unlocked.some((s) => s.key === choice.statKey)) {
                    result = { success: false, reason: 'scratched' };
                    return;
                }
                statKey = choice.statKey;
            } else {
                statKey = pick(unlocked.length > 0 ? unlocked : deck.stats).key;
            }

            // Players can leave or be benched mid-game: if that leaves fewer
            // than 2 holding cards, the game is over (nothing to call).
            const alive = alivePlayers(gs, data.players);
            if (alive.length < 2) {
                tx.update(groupRef, { 'gameState.phase': 'over' });
                result = { success: false, reason: 'over' };
                return;
            }

            // Announce the call; the cards stay hidden until everyone else
            // has tapped CLASH! (or ANSWER_MS runs out).
            const called: ClashCall = {
                stage: 'clash',
                statKey,
                by: caller,
                ...(wildcard ? { wildcard: true } : {}),
                ...(isAuto ? { auto: true } : {}),
                waitingFor: alive.filter((id) => id !== caller),
            };
            const updates: Record<string, unknown> = {
                'gameState.phase': 'answering',
                'gameState.called': called,
                'gameState.ready': {},
                'gameState.streak': {
                    playerId: caller,
                    count: gs.streak?.playerId === caller ? gs.streak.count + 1 : 1,
                },
            };
            if (wildcard) updates[`gameState.wildcardUsed.${playerId}`] = true;
            // Scratch the called stat; when every open stat is gone, the next wave.
            if (!wildcard && !goldFree) Object.assign(updates, scratchUpdates(gs, statKey));
            tx.update(groupRef, updates);
            result = { success: true };
        });
    } catch (e) {
        if (__DEV__) console.warn('[callStat] transaction failed', e);
    }
    return result;
};

// ── Resolving a call: the clash maths ────────────────────────────────
// The call's top cards meet: highest value takes them all (ties: gold,
// then 🎲). A normal card beating a gold one sets up the Gold Defence
// instead, with nothing moved yet.
const resolveClashUpdates = (
    gs: ClashGameState,
    players: { id: string }[],
    c: ClashCall
): Record<string, unknown> => {
    const everyone = alivePlayers(gs, players);
    const done = { 'gameState.called': deleteField(), 'gameState.ready': deleteField() };
    if (everyone.length < 2) return { ...done, 'gameState.phase': 'over' };
    // 🏳️ The folder sits the main clash out.
    const folderId = gs.fold?.round === gs.round ? gs.fold.folderId : undefined;
    const alive = everyone.filter((id) => id !== folderId);
    if (alive.length < 2) {
        // Nobody left to clash with: the caller decides on the fold straight away.
        const decider = alive[0] ?? c.by;
        return {
            ...done,
            'gameState.phase': 'fold-decide',
            'gameState.fold.deciderId': decider,
            'gameState.fold.deciderCard': gs.piles[decider]?.[0],
            'gameState.fold.deciderOnTop': true,
            // Record the clash as played (for the clash count).
            'gameState.last': {
                round: gs.round,
                stage: 'clash',
                callerId: c.by,
                statKey: c.statKey,
                plays: {},
                winnerId: decider,
                folderId,
            } as ClashResult,
        };
    }
    // Everyone's top card; the highest value takes them all.
    const plays: Record<string, string> = {};
    const values: Record<string, number> = {};
    for (const id of alive) {
        const cardId = gs.piles[id][0];
        plays[id] = cardId;
        values[id] = cardById(cardId)?.stats[c.statKey] ?? 0;
    }
    const goldOf = (id: string) => isGold(gs, plays[id]);
    const { winnerId, tied, goldTie } = decide(alive, values, goldOf);
    const goldCards = alive.filter(goldOf).map((id) => plays[id]);
    const base: ClashResult = {
        round: gs.round,
        stage: 'clash',
        callerId: c.by,
        statKey: c.statKey,
        plays,
        winnerId,
        ...(c.wildcard ? { wildcard: true } : {}),
        ...(c.auto ? { auto: true } : {}),
        ...(tied ? { tied } : {}),
        ...(goldTie ? { goldTie: true } : {}),
        ...(goldCards.length > 0 ? { gold: goldCards } : {}),
        ...(c.counterBy ? { counterBy: c.counterBy, counterFrom: c.counterFrom } : {}),
        ...(folderId ? { folderId } : {}),
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
            firstStatKey: c.statKey,
            firstValues: values,
            pot: plays,
        };
        updates = {
            'gameState.phase': 'reveal',
            'gameState.last': { ...base, defenceNext: true },
            'gameState.defence': defence,
            // 🔄 A counter-caller's penalty waits for the defence's result.
            ...(c.counterBy ? { 'gameState.counterPenalty': c.counterBy } : {}),
        };
    } else {
        const settled = settlePot(gs, plays, winnerId);
        const penaltyCard = applyCounterPenalty(gs, settled, c.counterBy, winnerId);
        updates = {
            'gameState.phase': 'reveal',
            'gameState.piles': settled.piles,
            'gameState.outRound': settled.outRound,
            'gameState.last': {
                ...base,
                ...(settled.out.length > 0 ? { out: settled.out } : {}),
                ...(penaltyCard ? { penaltyCard } : {}),
            },
        };
    }
    return { ...updates, ...done };
};

// 🔄 A counter-caller who didn't win also hands their next card to the
// winner. Edits `settled` in place; returns the card (if there was one).
const applyCounterPenalty = (
    gs: ClashGameState,
    settled: { piles: Record<string, string[]>; out: string[]; outRound: Record<string, number> },
    counterBy: string | undefined,
    winnerId: string
): string | undefined => {
    if (!counterBy || counterBy === winnerId) return undefined;
    const pile = settled.piles[counterBy];
    if (!pile || pile.length === 0) return undefined;
    const [card, ...rest] = pile;
    settled.piles[counterBy] = rest;
    settled.piles[winnerId] = [...settled.piles[winnerId], card];
    if (rest.length === 0 && !settled.out.includes(counterBy)) {
        settled.out.push(counterBy);
        settled.outRound[counterBy] = gs.round;
    }
    return card;
};

// Gold Defence maths: gold wins a tie; the winner takes the whole pot; a
// fallen gold moves to the challenger's card.
const resolveDefenceUpdates = (gs: ClashGameState, c: ClashCall): Record<string, unknown> => {
    const d = gs.defence!;
    const statKey = c.statKey;
    const gv = cardById(d.goldCard)?.stats[statKey] ?? 0;
    const cv = cardById(d.challengerCard)?.stats[statKey] ?? 0;
    const goldHolds = gv >= cv;
    const winnerId = goldHolds ? d.defenderId : d.challengerId;
    const settled = settlePot(gs, d.pot, winnerId);
    const penaltyCard = applyCounterPenalty(gs, settled, gs.counterPenalty, winnerId);
    const { piles, out, outRound } = settled;
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
        ...(c.auto ? { auto: true } : {}),
        ...(gv === cv ? { goldTie: true } : {}),
        ...(!goldHolds ? { goldTo: d.challengerCard } : {}),
        ...(out.length > 0 ? { out } : {}),
        ...(penaltyCard ? { penaltyCard, counterBy: gs.counterPenalty } : {}),
        ...(gs.fold?.round === gs.round ? { folderId: gs.fold.folderId } : {}),
    };
    return {
        'gameState.phase': 'reveal',
        'gameState.piles': piles,
        'gameState.outRound': outRound,
        'gameState.gold': gold,
        'gameState.last': last,
        'gameState.defence': deleteField(),
        'gameState.counterPenalty': deleteField(),
        'gameState.called': deleteField(),
        'gameState.ready': deleteField(),
    };
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
            const { gs, data, groupRef } = cur;
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

            // Announce it; the challenger taps CLASH! (or time runs out).
            const challengerHere = data.players.some((p) => p.id === d.challengerId);
            const called: ClashCall = {
                stage: 'defence',
                statKey,
                by: d.defenderId,
                ...(isAuto ? { auto: true } : {}),
                waitingFor: challengerHere ? [d.challengerId] : [],
            };
            tx.update(
                groupRef,
                challengerHere
                    ? { 'gameState.phase': 'answering', 'gameState.called': called, 'gameState.ready': {} }
                    : resolveDefenceUpdates(gs, called)
            );
            result = { success: true };
        });
    } catch (e) {
        if (__DEV__) console.warn('[callDefence] transaction failed', e);
    }
    return result;
};

// ── The answer beat: everyone else taps CLASH!, then the reveal ──────
const resolveCall = (gs: ClashGameState, players: { id: string }[]): Record<string, unknown> | null => {
    const c = gs.called;
    if (!c) return null;
    if (c.stage === 'defence') return gs.defence ? resolveDefenceUpdates(gs, c) : null;
    return resolveClashUpdates(gs, players, c);
};

// This player is in; once everyone is, the call resolves.
const readyUpdates = (
    gs: ClashGameState,
    players: { id: string }[],
    playerId: string,
    extra: Record<string, unknown> = {},
    patch: Partial<ClashGameState> = {}
): Record<string, unknown> => {
    const c = gs.called!;
    const ready = { ...(gs.ready ?? {}), [playerId]: true };
    // Players who left can't tap: don't wait for them.
    const stillWaiting = c.waitingFor.filter((id) => !ready[id] && players.some((p) => p.id === id));
    if (stillWaiting.length > 0) return { ...extra, [`gameState.ready.${playerId}`]: true };
    return mergeNested({ ...extra, ...(resolveCall({ ...gs, ...patch, ready }, players) ?? {}) });
};

// Firestore refuses an update that sets both 'a.b' and 'a.b.c': fold the
// deeper fields into the object being set.
const mergeNested = (u: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = { ...u };
    for (const key of Object.keys(out)) {
        const parent = Object.keys(out).find((p) => key.startsWith(p + '.') && typeof out[p] === 'object' && out[p] !== null);
        if (!parent) continue;
        const obj = { ...(out[parent] as Record<string, unknown>) };
        obj[key.slice(parent.length + 1)] = out[key];
        out[parent] = obj;
        delete out[key];
    }
    return out;
};

// ── 🔄 Counter-call (once a game): swap the called stat for another open
// one. Both stay scratched; everyone (the caller too) taps CLASH! again.
// If the counter-caller doesn't win, they also lose their next card.
export const canCounter = (gs: ClashGameState, playerId: string): boolean => {
    const c = gs.called;
    return (
        gs.phase === 'answering' &&
        !!c &&
        c.stage === 'clash' &&
        !c.wildcard &&
        !c.counterBy &&
        gs.fold?.round !== gs.round &&
        c.waitingFor.includes(playerId) &&
        !gs.ready?.[playerId] &&
        !gs.countersUsed?.[playerId] &&
        openStats(gs).some((k) => k !== c.statKey)
    );
};

export const counterCall = async (
    groupId: string,
    playerId: string,
    round: number,
    statKey: string
): Promise<{ success: boolean; reason?: string }> => {
    let result: { success: boolean; reason?: string } = { success: false, reason: 'stale' };
    try {
        await runTransaction(db, async (tx) => {
            result = { success: false, reason: 'stale' };
            const cur = await read(tx, groupId);
            if (!cur) return;
            const { gs, data, groupRef } = cur;
            if (gs.round !== round || !canCounter(gs, playerId)) return;
            const c = gs.called!;
            if (statKey === c.statKey || !openStats(gs).includes(statKey)) {
                result = { success: false, reason: 'scratched' };
                return;
            }
            const alive = alivePlayers(gs, data.players);
            const called: ClashCall = {
                stage: 'clash',
                statKey,
                by: c.by,
                counterBy: playerId,
                counterFrom: c.statKey,
                waitingFor: alive.filter((id) => id !== playerId),
            };
            tx.update(groupRef, {
                'gameState.called': called,
                'gameState.ready': {},
                [`gameState.countersUsed.${playerId}`]: true,
                ...scratchUpdates(gs, statKey),
            });
            result = { success: true };
        });
    } catch (e) {
        if (__DEV__) console.warn('[counterCall] transaction failed', e);
    }
    return result;
};

// ── 🏳️ Fold (once a game): "my card is weak". The folder sits the clash
// out. The decider (the caller with 2 players, or the main clash's winner)
// accepts and takes the folded card, or calls the bluff: then the folder
// picks a stat blind, and the decider's card meets the folder's NEXT card.
// Decider wins: both folder cards. Folder wins: the decider's card.
export const canFold = (gs: ClashGameState, playerId: string): boolean => {
    const c = gs.called;
    const pile = gs.piles[playerId] ?? [];
    return (
        gs.phase === 'answering' &&
        !!c &&
        c.stage === 'clash' &&
        !c.counterBy &&
        gs.fold?.round !== gs.round &&
        c.waitingFor.includes(playerId) &&
        !gs.ready?.[playerId] &&
        !gs.foldsUsed?.[playerId] &&
        pile.length >= 2 &&
        !isGold(gs, pile[0])
    );
};

export const foldCall = async (
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
            const { gs, data, groupRef } = cur;
            if (gs.round !== round || !canFold(gs, playerId)) return;
            const fold: ClashFold = { round, folderId: playerId, card: gs.piles[playerId][0] };
            tx.update(
                groupRef,
                readyUpdates(
                    gs,
                    data.players,
                    playerId,
                    { 'gameState.fold': fold, [`gameState.foldsUsed.${playerId}`]: true },
                    { fold }
                )
            );
            result = { success: true };
        });
    } catch (e) {
        if (__DEV__) console.warn('[foldCall] transaction failed', e);
    }
    return result;
};

// Accept (or time ran out) / call the bluff.
export const canCallBluff = (gs: ClashGameState): boolean =>
    openStats(gs).length > 0 && (gs.piles[gs.fold?.folderId ?? '']?.length ?? 0) >= 2;

export const decideFold = async (
    groupId: string,
    playerId: string,
    round: number,
    choice: 'accept' | 'bluff' | 'auto'
): Promise<void> => {
    try {
        await runTransaction(db, async (tx) => {
            const cur = await read(tx, groupId);
            if (!cur) return;
            const { gs, groupRef } = cur;
            const f = gs.fold;
            if (gs.phase !== 'fold-decide' || gs.round !== round || !f?.deciderId) return;
            if (choice !== 'auto' && f.deciderId !== playerId) return;
            if (choice === 'bluff') {
                if (!canCallBluff(gs)) return;
                tx.update(groupRef, { 'gameState.phase': 'fold-pick' });
                return;
            }
            // Accepted: the decider takes the folded card (and, with no main
            // clash, their own card goes to the bottom as if they'd won).
            const d = f.deciderId;
            const piles = { ...gs.piles };
            piles[f.folderId] = gs.piles[f.folderId].slice(1);
            piles[d] = f.deciderOnTop ? [...gs.piles[d].slice(1), gs.piles[d][0], f.card] : [...gs.piles[d], f.card];
            const out = piles[f.folderId].length === 0 ? [f.folderId] : [];
            tx.update(groupRef, {
                'gameState.phase': 'fold-result',
                'gameState.piles': piles,
                ...(out.length ? { [`gameState.outRound.${f.folderId}`]: gs.round } : {}),
                'gameState.fold.accepted': true,
                'gameState.fold.result': { winnerId: d, folderNext: '', values: {}, ...(out.length ? { out } : {}) },
            });
        });
    } catch (e) {
        if (__DEV__) console.warn('[decideFold] transaction failed', e);
    }
};

export const foldPick = async (
    groupId: string,
    playerId: string,
    round: number,
    choice: { statKey: string } | { auto: true }
): Promise<{ success: boolean; reason?: string }> => {
    let result: { success: boolean; reason?: string } = { success: false, reason: 'stale' };
    try {
        await runTransaction(db, async (tx) => {
            result = { success: false, reason: 'stale' };
            const cur = await read(tx, groupId);
            if (!cur) return;
            const { gs, groupRef } = cur;
            const f = gs.fold;
            if (gs.phase !== 'fold-pick' || gs.round !== round || !f?.deciderId || !f.deciderCard) return;
            const isAuto = 'auto' in choice;
            if (!isAuto && f.folderId !== playerId) return;
            const open = openStats(gs);
            if (open.length === 0) return;
            let statKey: string;
            if ('statKey' in choice) {
                if (!open.includes(choice.statKey)) {
                    result = { success: false, reason: 'scratched' };
                    return;
                }
                statKey = choice.statKey;
            } else {
                statKey = pick(open);
            }
            const d = f.deciderId;
            const fid = f.folderId;
            const next = gs.piles[fid][1];
            const plays: Record<string, string> = { [d]: f.deciderCard, [fid]: next };
            const values = {
                [d]: cardById(f.deciderCard)?.stats[statKey] ?? 0,
                [fid]: cardById(next)?.stats[statKey] ?? 0,
            };
            const { winnerId, tied } = decide([d, fid], values, (id) => isGold(gs, plays[id]));
            const piles = { ...gs.piles };
            const folderRest = gs.piles[fid].slice(2);
            // The decider's card: still on top (no main clash) or already in their pile.
            const deciderRest = f.deciderOnTop
                ? gs.piles[d].slice(1)
                : (() => {
                      const p = [...gs.piles[d]];
                      const i = p.lastIndexOf(f.deciderCard!);
                      if (i >= 0) p.splice(i, 1);
                      return p;
                  })();
            if (winnerId === d) {
                piles[d] = [...deciderRest, f.deciderCard, f.card, next];
                piles[fid] = folderRest;
            } else {
                piles[d] = deciderRest;
                piles[fid] = [...folderRest, f.card, next, f.deciderCard];
            }
            const out = [d, fid].filter((id) => piles[id].length === 0);
            tx.update(groupRef, {
                'gameState.phase': 'fold-result',
                'gameState.piles': piles,
                ...Object.fromEntries(out.map((id) => [`gameState.outRound.${id}`, gs.round])),
                'gameState.fold.statKey': statKey,
                ...(isAuto ? { 'gameState.fold.auto': true } : {}),
                'gameState.fold.result': {
                    winnerId,
                    folderNext: next,
                    values,
                    ...(tied ? { tied: true } : {}),
                    ...(out.length ? { out } : {}),
                },
                ...scratchUpdates(gs, statKey),
            });
            result = { success: true };
        });
    } catch (e) {
        if (__DEV__) console.warn('[foldPick] transaction failed', e);
    }
    return result;
};

// After the fold's result: next clash (the fold's winner calls), or the end.
export const finishFold = async (groupId: string, round: number): Promise<void> => {
    try {
        await runTransaction(db, async (tx) => {
            const cur = await read(tx, groupId);
            if (!cur) return;
            const { gs, data, groupRef } = cur;
            if (gs.phase !== 'fold-result' || gs.round !== round) return;
            const alive = alivePlayers(gs, data.players);
            const winner = gs.fold?.result?.winnerId;
            if (alive.length < 2 || isFinalClash(gs)) {
                tx.update(groupRef, { 'gameState.phase': 'over', 'gameState.fold': deleteField() });
                return;
            }
            tx.update(groupRef, {
                'gameState.phase': 'calling',
                'gameState.round': gs.round + 1,
                'gameState.callerId': winner && alive.includes(winner) ? winner : pick(alive),
                'gameState.fold': deleteField(),
            });
        });
    } catch (e) {
        if (__DEV__) console.warn('[finishFold] transaction failed', e);
    }
};

export const markReady = async (groupId: string, playerId: string, round: number): Promise<void> => {
    try {
        await runTransaction(db, async (tx) => {
            const cur = await read(tx, groupId);
            if (!cur) return;
            const { gs, data, groupRef } = cur;
            const c = gs.called;
            if (gs.phase !== 'answering' || gs.round !== round || !c) return;
            if (!c.waitingFor.includes(playerId) || gs.ready?.[playerId]) return;
            tx.update(groupRef, readyUpdates(gs, data.players, playerId));
        });
    } catch (e) {
        if (__DEV__) console.warn('[markReady] transaction failed', e);
    }
};

// Out of time (host's phone, others as backup): reveal anyway.
export const resolveAnswers = async (
    groupId: string,
    round: number,
    stage: 'clash' | 'defence'
): Promise<void> => {
    try {
        await runTransaction(db, async (tx) => {
            const cur = await read(tx, groupId);
            if (!cur) return;
            const { gs, data, groupRef } = cur;
            if (gs.phase !== 'answering' || gs.round !== round || gs.called?.stage !== stage) return;
            const updates = resolveCall(gs, data.players);
            if (updates) tx.update(groupRef, updates);
        });
    } catch (e) {
        if (__DEV__) console.warn('[resolveAnswers] transaction failed', e);
    }
};

// ── 🎁 Pass the call ─────────────────────────────────────────────────
// After PASS_AFTER calls in a row, the caller may hand the call on: to the
// other player, or with more, to a 🎲 roll among everyone else still in.
export const canPassCall = (gs: ClashGameState): boolean =>
    gs.phase === 'calling' && gs.streak?.playerId === gs.callerId && (gs.streak?.count ?? 0) >= PASS_AFTER;

export const passCall = async (
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
            const { gs, data, groupRef } = cur;
            if (gs.round !== round || gs.callerId !== playerId) return;
            if (!canPassCall(gs)) {
                result = { success: false, reason: 'locked' };
                return;
            }
            const pool = alivePlayers(gs, data.players).filter((id) => id !== playerId);
            if (pool.length === 0) return;
            const to = pick(pool);
            tx.update(groupRef, {
                'gameState.callerId': to,
                'gameState.streak': { playerId: to, count: 0 },
                'gameState.passedCall': { round, from: playerId, to, pool },
            });
            result = { success: true };
        });
    } catch (e) {
        if (__DEV__) console.warn('[passCall] transaction failed', e);
    }
    return result;
};

// ── 🏁 Host calls time: finish in N more clashes ─────────────────────
// Counts the clash in progress. Only ever shortens an earlier call.
export const FINISH_OPTIONS = [5, 10] as const;

// A 20-clash game is a hard limit: it ends after clash 20 whatever happens
// (gold-card calls, Wildcards and Gold Defences don't scratch stats, so
// the stat waves alone can run past 20).
export const CLASH_CAP = 20;

// The last clash of this game, or undefined if there's no limit.
export const lastClashOf = (gs: ClashGameState): number | undefined => {
    const cap = gs.lengthMode === 'unlimited' ? undefined : CLASH_CAP;
    if (gs.endAtRound === undefined) return cap;
    return cap === undefined ? gs.endAtRound : Math.min(cap, gs.endAtRound);
};

export const isFinalClash = (gs: ClashGameState): boolean => {
    const last = lastClashOf(gs);
    return !!gs.statsOut || (last !== undefined && gs.round >= last);
};

// Clashes left including the one being played now (null = no limit).
export const clashesLeft = (gs: ClashGameState): number | null => {
    const last = lastClashOf(gs);
    if (last === undefined) return null;
    return Math.max(0, last - gs.round + (gs.phase === 'reveal' ? 0 : 1));
};

// Did the host's 🏁 set the ending (rather than the 20-clash limit)?
export const hostCalledTime = (gs: ClashGameState): boolean =>
    gs.endAtRound !== undefined && (gs.lengthMode === 'unlimited' || gs.endAtRound < CLASH_CAP);

export const finishIn = async (
    groupId: string,
    playerId: string,
    n: number
): Promise<{ success: boolean; reason?: string }> => {
    let result: { success: boolean; reason?: string } = { success: false, reason: 'stale' };
    try {
        await runTransaction(db, async (tx) => {
            result = { success: false, reason: 'stale' };
            const cur = await read(tx, groupId);
            if (!cur) return;
            const { gs, data, groupRef } = cur;
            if (data.hostId !== playerId) {
                result = { success: false, reason: 'not-host' };
                return;
            }
            if (gs.phase === 'over' || n < 1) return;
            const endAt = clashesPlayed(gs) + n;
            const current = lastClashOf(gs);
            if (current !== undefined && current <= endAt) {
                result = { success: false, reason: 'not-shorter' };
                return;
            }
            tx.update(groupRef, { 'gameState.endAtRound': endAt });
            result = { success: true };
        });
    } catch (e) {
        if (__DEV__) console.warn('[finishIn] transaction failed', e);
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
            // 🏳️ Someone folded: the clash's winner now decides on it.
            const f = gs.fold;
            if (f?.round === gs.round && !f.deciderId && gs.last) {
                const d = gs.last.winnerId;
                tx.update(groupRef, {
                    'gameState.phase': 'fold-decide',
                    'gameState.fold.deciderId': d,
                    'gameState.fold.deciderCard': gs.last.plays[d],
                    'gameState.fold.deciderOnTop': false,
                });
                return;
            }
            const alive = alivePlayers(gs, data.players);
            if (alive.length < 2 || isFinalClash(gs)) {
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
