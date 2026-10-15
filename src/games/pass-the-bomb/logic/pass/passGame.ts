import { doc, updateDoc, runTransaction, increment } from 'firebase/firestore';
import { db } from '../../../../shared/firebase/config';
import { Group, PassGameState, PassSide, PassTurn, PassReceipt } from '../../../../shared/types';
import { getRandomQuestion, generateSingleCorrectInstance } from '../../data/quizQuestions';
import {
    settleTicketOnAnswer,
    settleTicketOnCallout,
    settleTicketsOnRoundEnd,
    catchFumble,
    publishTicketNews,
    TicketNewsItem,
} from './passPerks';

// ── PASS MODE ────────────────────────────────────────────────────────
// Turn-based, no clocks anywhere. Every change is a player's tap, applied in
// a transaction, so there are no deadlines, watchdogs or failsafes to keep
// in sync between phones.
//
// The game is played between SIDES. In solo play every player is their own
// side (side id = player id); in team play each team is a side. Pools,
// lives, the holder and explosions all belong to sides, so one engine runs
// both. Any member of the holding side can pick the target and answer —
// in solo that's just the one player.
//
// Each side has ONE stack of passes for the round (gs.budget at the start),
// spent on anyone still alive. The holder picks a target (automatic when only
// one is possible), then answers a 4-option question:
//   • right → the bomb moves to the target, costing 1 pass
//   • wrong → the FIRST miss on a question costs 1 pass; further misses on
//             the same question are free (the options are just greyed out).
//             So the worst one brutal question can cost is 2 passes.
// Can't pay (stack at 0) → the bomb goes off. Every new round tops all
// stacks back up to the starting size, so a round is always about
// players × stack questions long, however many people play.

// Passes per side: the host types it in the lobby (default 10, 5–20).
export const PASS_STACK_DEFAULT = 10;
export const PASS_STACK_MIN = 5;
export const PASS_STACK_MAX = 20;

export const clampStack = (n: number): number =>
    Number.isFinite(n)
        ? Math.min(PASS_STACK_MAX, Math.max(PASS_STACK_MIN, Math.round(n)))
        : PASS_STACK_DEFAULT;

// Fewer lives with more sides, so a big group doesn't play forever.
export const PASS_MAX_LIVES = 2;
export const livesFor = (sideCount: number): number => (sideCount <= 4 ? PASS_MAX_LIVES : 1);

export const CALLOUT_MIN_VOTERS = 2;    // with 1 possible voter, one vote would be a "majority"
// Passes stripped by a successful cheat callout — scales with the stack.
export const calloutPenalty = (gs: PassGameState): number => Math.max(2, Math.ceil(gs.budget / 4));
const MAX_USED_QUESTIONS = 200;

// Leaderboard points at game end. In team play every member of the side gets
// the full amount. Placeholders — set these to match timer mode's values.
export const PASS_WIN_SCORE = 10;
export const PASS_RUNNER_UP_SCORE = 5; // only awarded with 3+ sides

// ── CURRENCY ──────────────────────────────────────────────────────────
// Earned for clean play, never deducted (a wrong answer already costs a pass).
// In team play the wallet belongs to the team. Change the name in one place.
export const CURRENCY = { name: 'Pass Marks', short: 'marks', icon: '✋' } as const;

export const EARN_FIRST_TRY = 3;       // correct with no wrong answers
export const EARN_SECOND_TRY = 1;      // correct after exactly one wrong answer
export const EARN_STREAK_BONUS = 5;    // every 3rd first-try answer in a row
export const EARN_STREAK_EVERY = 3;
export const EARN_SURVIVE_ROUND = 2;   // every side still standing when the bomb goes off elsewhere
export const EARN_HAZARD = 1;          // every time the bomb is passed to you
export const EARN_CLUTCH = 3;          // extra for surviving a round on CLUTCH_MAX_LEFT passes or fewer
export const CLUTCH_MAX_LEFT = 2;

// Store prices. Extra passes get dearer each time a side buys one, so a
// strong side can't stockpile its way to invincibility.
export const PRICE_PASS_BASE = 6;
export const PRICE_PASS_STEP = 3;
export const PRICE_FIFTY_FIFTY = 12;
export const PRICE_SWAP = 7;

// Hidden-passes mode only (advanced): nobody sees anyone else's pass count.
export const PRICE_GLOVES = 10;   // Hush Gloves — your fumbles make no sound…
export const GLOVES_TURNS = 5;    // …for your next 5 turns holding the bomb
export const PRICE_AUDIT = 8;     // privately see one side's exact pass total

export const STORE = { name: 'Front Office', icon: '🏪' } as const;

export type PassItem = 'fiftyFifty' | 'swap';

export const passPrice = (gs: PassGameState, sideId: string): number =>
    PRICE_PASS_BASE + PRICE_PASS_STEP * (gs.passesBought?.[sideId] ?? 0);

export const itemPrice = (item: PassItem): number =>
    item === 'fiftyFifty' ? PRICE_FIFTY_FIFTY : PRICE_SWAP;

export const walletOf = (gs: PassGameState, sideId?: string): number =>
    sideId ? gs.wallet?.[sideId] ?? 0 : 0;

export const itemsOf = (gs: PassGameState, sideId?: string) => ({
    fiftyFifty: (sideId && gs.items?.[sideId]?.fiftyFifty) || 0,
    swap: (sideId && gs.items?.[sideId]?.swap) || 0,
});

// ── Read helpers (safe to use in screens) ─────────────────────────────
export const passAlive = (gs: PassGameState): string[] =>
    gs.sideIds.filter((id) => !gs.ghosts.includes(id));

export const sideById = (gs: PassGameState, sideId?: string | null): PassSide | undefined =>
    gs.sides.find((s) => s.id === sideId);

// The side a player plays for (their own id in solo play).
export const sideOf = (gs: PassGameState, playerId: string): string | undefined =>
    gs.sides.find((s) => s.memberIds.includes(playerId))?.id;

// A side's passes left this round.
export const totalPassesLeft = (gs: PassGameState, sideId?: string | null): number =>
    sideId ? gs.stacks?.[sideId] ?? 0 : 0;

// Who may vote on a cheating call: every player on an alive side that isn't holding.
export const calloutVoters = (gs: PassGameState): string[] =>
    gs.sides
        .filter((s) => s.id !== gs.holderId && !gs.ghosts.includes(s.id))
        .flatMap((s) => s.memberIds);

export const calloutVotesNeeded = (gs: PassGameState): number =>
    Math.floor(calloutVoters(gs).length / 2) + 1;

// ── Internal helpers ──────────────────────────────────────────────────
const withStack = (gs: PassGameState, sideId: string, value: number): PassGameState['stacks'] => ({
    ...gs.stacks,
    [sideId]: Math.max(0, value),
});

const drawQuestion = (used: string[]) => {
    const q = getRandomQuestion(used);
    return {
        question: generateSingleCorrectInstance(q),
        used: [...used, q.id].slice(-MAX_USED_QUESTIONS),
    };
};

// With only one other side alive there's no choice to make — pick it.
const autoTarget = (gs: PassGameState, holderId: string): string | null => {
    const options = passAlive(gs).filter((id) => id !== holderId);
    return options.length === 1 ? options[0] : null;
};

// A fresh question for `gs.holderId`, with the target auto-picked if obvious.
// `newStint` = the bomb has just arrived at this side (a new turn holding it),
// which is when Hush Gloves are checked and one of their turns is used up.
// A new question within the same stint (a callout) keeps the current muffle.
const withFreshTurn = (gs: PassGameState, seq: number, newStint: boolean): PassGameState => {
    const { question, used } = drawQuestion(gs.usedQuestionIds);
    let muffled = !newStint && !!gs.turn?.muffled;
    let glovesTurns = gs.glovesTurns;
    if (newStint && gs.hiddenPasses) {
        const left = gs.glovesTurns?.[gs.holderId] ?? 0;
        if (left > 0) {
            muffled = true;
            glovesTurns = { ...(gs.glovesTurns ?? {}), [gs.holderId]: left - 1 };
        }
    }
    const turn: PassTurn = {
        seq,
        targetId: autoTarget(gs, gs.holderId),
        question,
        wrongPicks: [],
        removed: [],
        muffled,
    };
    return {
        ...gs,
        ...(glovesTurns ? { glovesTurns } : {}),
        // Counts turns holding the bomb — a haunt lasts for exactly one.
        stint: newStint ? (gs.stint ?? 0) + 1 : gs.stint ?? 0,
        turn,
        usedQuestionIds: used,
        callout: { seq, voterIds: [], againstIds: [] },
    };
};

// Appends to a side's public purchase record (Receipts).
export const withReceipt = (gs: PassGameState, side: string, receipt: PassReceipt): PassReceipt[] => [
    ...(gs.receipts?.[side] ?? []),
    receipt,
];

export const glovesLeft = (gs: PassGameState, sideId?: string): number =>
    sideId ? gs.glovesTurns?.[sideId] ?? 0 : 0;

const bumpStat = (
    stats: PassGameState['stats'],
    id: string,
    key: 'passes' | 'wrong'
): PassGameState['stats'] => {
    const cur = stats[id] ?? { passes: 0, wrong: 0 };
    return { ...stats, [id]: { ...cur, [key]: cur[key] + 1 } };
};

// The bomb goes off on side `victim`. Returns the whole next state.
// `news`: pass the transaction's ticket-news array when the caller publishes
// it itself (so results from earlier in the same tap aren't lost). Without
// it, explode publishes its own round-end results.
const explode = (gs: PassGameState, victim: string, news?: TicketNewsItem[]): PassGameState => {
    const lives = Math.max(0, (gs.lives[victim] ?? 0) - 1);
    const eliminated = lives === 0;
    const ghosts = eliminated ? [...gs.ghosts, victim] : gs.ghosts;
    // Stacks are topped back up when the next round starts (continuePassGame).

    // Everyone else still standing earns a little for surviving the round.
    // Hanging on by a thread pays extra (clutch).
    const wallet = { ...(gs.wallet ?? {}) };
    const clutch: string[] = [];
    for (const id of gs.sideIds) {
        if (id === victim || ghosts.includes(id)) continue;
        const close = totalPassesLeft(gs, id) <= CLUTCH_MAX_LEFT;
        if (close) clutch.push(id);
        wallet[id] = (wallet[id] ?? 0) + EARN_SURVIVE_ROUND + (close ? EARN_CLUTCH : 0);
    }

    const seq = gs.turn.seq + 1;
    const after: PassGameState = {
        ...gs,
        haunt: null,
        wallet,
        streak: { ...(gs.streak ?? {}), [victim]: 0 },
        phase: 'pass-exploded',
        ghosts,
        lives: { ...gs.lives, [victim]: lives },
        eliminationOrder: eliminated ? [...gs.eliminationOrder, victim] : gs.eliminationOrder,
        lastExplosion: { sideId: victim, eliminated, round: gs.round, clutch },
        turn: { ...gs.turn, seq, targetId: null },
        callout: { seq, voterIds: [], againstIds: [] },
    };
    // The round is over — settle Lucky Centre tickets that depend on it.
    const own = news ?? [];
    const settled = settleTicketsOnRoundEnd(after, victim, own);
    return news ? settled : publishTicketNews(settled, own);
};

// Common guard for anything the holding side does.
const holderGuard = (gs: PassGameState | undefined, playerId: string): gs is PassGameState =>
    gs?.mode === 'pass' && gs.phase === 'pass-playing' && sideOf(gs, playerId) === gs.holderId;

// ── START ─────────────────────────────────────────────────────────────
// Team play uses the group's teams (from the Game Menu), keeping only players
// who are actually in this game and dropping teams left empty by benching.
export const canPlayPassAsTeams = (group: Group): boolean =>
    buildTeamSides(group).length >= 2;

const buildTeamSides = (group: Group): PassSide[] => {
    if (!group.teamsEnabled || !group.teams) return [];
    const inGame = new Set(group.players.map((p) => p.id));
    return group.teams
        .map((t) => ({
            id: t.id,
            name: t.name,
            color: t.color,
            memberIds: t.playerIds.filter((id) => inGame.has(id)),
        }))
        .filter((s) => s.memberIds.length > 0);
};

// How many sides the game would have — the lobby uses this for the lives count.
export const passSideCount = (group: Group, asTeams: boolean): number => {
    const teams = asTeams ? buildTeamSides(group).length : 0;
    return teams >= 2 ? teams : group.players.length;
};

export const startPassGame = async (
    group: Group,
    stackSize: number,
    asTeams: boolean,
    hiddenPasses: boolean
): Promise<void> => {
    const teamSides = asTeams ? buildTeamSides(group) : [];
    const teamMode = teamSides.length >= 2;
    const sides: PassSide[] = teamMode
        ? teamSides
        : group.players.map((p) => ({ id: p.id, name: p.name, memberIds: [p.id] }));
    const sideIds = sides.map((s) => s.id);
    const budget = clampStack(stackSize);
    const startLives = livesFor(sideIds.length);

    const stacks: PassGameState['stacks'] = {};
    const lives: Record<string, number> = {};
    for (const id of sideIds) {
        lives[id] = startLives;
        stacks[id] = budget;
    }

    const base: PassGameState = {
        mode: 'pass',
        teamMode,
        hiddenPasses,
        phase: 'pass-playing',
        budget,
        sides,
        sideIds,
        holderId: sideIds[Math.floor(Math.random() * sideIds.length)],
        stacks,
        lives,
        ghosts: [],
        eliminationOrder: [],
        round: 1,
        turn: { seq: 0, targetId: null, question: { questionId: '', prompt: '', options: [] }, wrongPicks: [] },
        usedQuestionIds: [],
        stats: {},
        callout: { seq: 0, voterIds: [], againstIds: [] },
        wallet: {},
        streak: {},
        passesBought: {},
        items: {},
        glovesTurns: {},
        receipts: {},
    };
    const gameState = withFreshTurn(base, 1, true);

    await updateDoc(doc(db, 'groups', group.id), { status: 'playing', gameState });
};

// ── CHOOSE TARGET ─────────────────────────────────────────────────────
// Picked before the question is revealed, and locked until it's answered.
export const choosePassTarget = async (
    group: Group,
    playerId: string,
    targetId: string
): Promise<boolean> => {
    const groupRef = doc(db, 'groups', group.id);
    let ok = false;
    try {
        await runTransaction(db, async (tx) => {
            ok = false;
            const snap = await tx.get(groupRef);
            if (!snap.exists()) return;
            const gs = snap.data().gameState as PassGameState | undefined;
            if (!holderGuard(gs, playerId) || gs.turn.targetId) return;
            if (targetId === gs.holderId || !passAlive(gs).includes(targetId)) return;

            tx.update(groupRef, { 'gameState.turn.targetId': targetId });
            ok = true;
        });
    } catch (e) {
        if (__DEV__) console.warn('[choosePassTarget] failed', e);
    }
    return ok;
};

// ── ANSWER ────────────────────────────────────────────────────────────
// In team play every member of the holding side can tap; the first tap to
// land counts. A second tap on the same question still counts if it lands
// before the question changes — teammates share the risk.
export type PassAnswerResult = 'correct' | 'wrong' | 'exploded' | 'stale';

export const answerPassQuestion = async (
    group: Group,
    playerId: string,
    optionIndex: number,
    seq: number
): Promise<PassAnswerResult> => {
    const groupRef = doc(db, 'groups', group.id);
    let result: PassAnswerResult = 'stale';
    try {
        await runTransaction(db, async (tx) => {
            result = 'stale';
            const news: TicketNewsItem[] = []; // fresh per attempt — transactions can retry
            const snap = await tx.get(groupRef);
            if (!snap.exists()) return;
            const gs = snap.data().gameState as PassGameState | undefined;
            if (!holderGuard(gs, playerId)) return;
            const t = gs.turn;
            // seq: a tap on an old question (double tap, or after a callout) does nothing.
            if (t.seq !== seq || !t.targetId) return;
            if (t.wrongPicks.includes(optionIndex) || (t.removed ?? []).includes(optionIndex)) return;
            const option = t.question.options[optionIndex];
            if (!option) return;

            const from = gs.holderId;
            const to = t.targetId;

            let next: PassGameState;
            if (option.correct) {
                // Earnings for clean play.
                const wrongBefore = t.wrongPicks.length;
                const streak = wrongBefore === 0 ? (gs.streak?.[from] ?? 0) + 1 : 0;
                let earned =
                    wrongBefore === 0 ? EARN_FIRST_TRY : wrongBefore === 1 ? EARN_SECOND_TRY : 0;
                if (wrongBefore === 0 && streak % EARN_STREAK_EVERY === 0) earned += EARN_STREAK_BONUS;

                next = withFreshTurn(
                    {
                        ...gs,
                        stacks: withStack(gs, from, totalPassesLeft(gs, from) - 1),
                        holderId: to,
                        stats: bumpStat(gs.stats, playerId, 'passes'),
                        lastPass: { from, to, seq: t.seq, byPlayerId: playerId },
                        wallet: {
                            ...(gs.wallet ?? {}),
                            [from]: walletOf(gs, from) + earned,
                            [to]: walletOf(gs, to) + EARN_HAZARD, // hazard pay
                        },
                        streak: { ...(gs.streak ?? {}), [from]: streak },
                        lastEarn: { sideId: from, amount: earned, streak, seq: t.seq },
                    },
                    t.seq + 1,
                    true
                );
                // Lucky Centre: this side's ticket, if any.
                next = settleTicketOnAnswer(next, from, wrongBefore === 0 ? 'first-try' : 'correct', news);
                result = 'correct';
                // The receiver may have nothing left to pass with — it goes off in their hands.
                if (totalPassesLeft(next, to) === 0) next = explode(next, to, news);
            } else {
                // Only the first miss on a question costs a pass.
                const costs = true;
                next = {
                    ...gs,
                    stacks: costs ? withStack(gs, from, totalPassesLeft(gs, from) - 1) : gs.stacks,
                    stats: bumpStat(gs.stats, playerId, 'wrong'),
                    streak: { ...(gs.streak ?? {}), [from]: 0 },
                    turn: { ...t, wrongPicks: [...t.wrongPicks, optionIndex] },
                };
                // Lucky Centre ticket busts; a haunting ghost catches the dropped pass.
                next = settleTicketOnAnswer(next, from, 'wrong', news);
                if (costs) next = catchFumble(next);
                result = 'wrong';
                if (totalPassesLeft(next, from) === 0) {
                    next = explode(next, from, news);
                    result = 'exploded';
                }
            }

            next = publishTicketNews(next, news);
            tx.update(groupRef, { gameState: next });
        });
    } catch (e) {
        if (__DEV__) console.warn('[answerPassQuestion] failed', e);
    }
    return result;
};

// ── CHEAT CALLOUT ─────────────────────────────────────────────────────
// Every player on a non-holding, alive side can vote "cheating" or "let it
// go", and can change or take back their vote at any time (choice = null).
//   • "cheating" reaches a majority → the holder loses calloutPenalty(gs)
//     passes and the question is skipped (same target).
//   • enough "let it go" votes that "cheating" can no longer win → dropped.
//   • every "cheating" vote taken back → dropped.
export type CalloutChoice = 'cheating' | 'let-go' | null;

export const votePassCallout = async (
    group: Group,
    voterId: string,
    seq: number,
    choice: CalloutChoice
): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    try {
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(groupRef);
            if (!snap.exists()) return;
            const gs = snap.data().gameState as PassGameState | undefined;
            if (gs?.mode !== 'pass' || gs.phase !== 'pass-playing') return;
            if (gs.turn.seq !== seq) return;
            // No calling cheating before the holder has even seen a question
            // (still picking a target). Taking a vote back is always allowed.
            const questionSeen = !!gs.turn.targetId || gs.turn.wrongPicks.length > 0;
            if (choice === 'cheating' && !questionSeen) return;
            const voters = calloutVoters(gs);
            if (voters.length < CALLOUT_MIN_VOTERS || !voters.includes(voterId)) return;

            const live = gs.callout?.seq === seq ? gs.callout : null;
            let voterIds = (live?.voterIds ?? []).filter((id) => id !== voterId);
            let againstIds = (live?.againstIds ?? []).filter((id) => id !== voterId);
            if (choice === 'cheating') voterIds = [...voterIds, voterId];
            // "Let it go" only means something while someone has called cheating.
            if (choice === 'let-go' && voterIds.length > 0) againstIds = [...againstIds, voterId];

            const needed = calloutVotesNeeded(gs);
            const dropped =
                voterIds.length === 0 || againstIds.length > voters.length - needed;

            if (dropped) {
                const hadCallout = (live?.voterIds.length ?? 0) > 0;
                tx.update(groupRef, {
                    'gameState.callout': { seq, voterIds: [], againstIds: [] },
                    ...(hadCallout ? { 'gameState.lastCalloutDropped': { seq } } : {}),
                });
                return;
            }

            if (voterIds.length < needed) {
                tx.update(groupRef, { 'gameState.callout': { seq, voterIds, againstIds } });
                return;
            }

            // Guilty — strip passes from the holder's stack.
            const holder = gs.holderId;
            const target = gs.turn.targetId;
            const targetKept = !!target;
            let next = withFreshTurn(
                {
                    ...gs,
                    stacks: withStack(gs, holder, totalPassesLeft(gs, holder) - calloutPenalty(gs)),
                    lastCallout: { sideId: holder, seq, targetKept },
                    streak: { ...(gs.streak ?? {}), [holder]: 0 },
                },
                seq + 1,
                false
            );
            // Keep the chosen target.
            if (target) {
                next = { ...next, turn: { ...next.turn, targetId: target } };
            }
            const news: TicketNewsItem[] = [];
            next = settleTicketOnCallout(next, holder, news);
            if (totalPassesLeft(next, holder) === 0) next = explode(next, holder, news);
            next = publishTicketNews(next, news);

            tx.update(groupRef, { gameState: next });
        });
    } catch (e) {
        if (__DEV__) console.warn('[votePassCallout] failed', e);
    }
};

// ── STUCK HOLDER ──────────────────────────────────────────────────────
// No clocks means nothing moves the game on if the holding side can't act.
//   • Every member of the holding side has left the group → anyone can skip
//     them, and that side is knocked out for good (it can't play any more).
//   • Still in the group but not answering (asleep, lost signal) → only the
//     host can skip them, and it costs that side a life like a normal explosion.
export const skipStuckHolder = async (
    group: Group,
    requesterId: string,
    seq: number
): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    try {
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(groupRef);
            if (!snap.exists()) return;
            const data = snap.data();
            const gs = data.gameState as PassGameState | undefined;
            if (gs?.mode !== 'pass' || gs.phase !== 'pass-playing' || gs.turn.seq !== seq) return;

            const holder = gs.holderId;
            const gone = isSideGone(gs, holder, (data.players ?? []) as { id: string }[]);
            if (!gone && data.hostId !== requesterId) return;

            const next = gone
                ? explode({ ...gs, lives: { ...gs.lives, [holder]: 1 } }, holder) // straight out
                : explode(gs, holder);
            tx.update(groupRef, {
                gameState: {
                    ...next,
                    lastExplosion: { ...next.lastExplosion!, reason: gone ? 'left' : 'skipped' },
                },
            });
        });
    } catch (e) {
        if (__DEV__) console.warn('[skipStuckHolder] failed', e);
    }
};

// True when none of a side's members are still in the group.
export const isSideGone = (
    gs: PassGameState,
    sideId: string,
    players: { id: string }[]
): boolean => {
    const present = new Set(players.map((p) => p.id));
    const side = sideById(gs, sideId);
    return !side || side.memberIds.every((id) => !present.has(id));
};

// ── NEXT ROUND ────────────────────────────────────────────────────────
// Anyone can tap it — no host needed. The bomb goes to the side with the
// fewest passes left as the round ended (the best trivia side's reward),
// never the side it just blew up on; ties broken at random. Then every side
// still in is topped back up to the starting stack (passes bought above
// that are kept).
export const continuePassGame = async (group: Group): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    try {
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(groupRef);
            if (!snap.exists()) return;
            const gs = snap.data().gameState as PassGameState | undefined;
            if (gs?.mode !== 'pass' || gs.phase !== 'pass-exploded') return;

            const alive = passAlive(gs);
            if (alive.length <= 1) {
                const winnerId = alive[0] ?? null;
                const updates: Record<string, unknown> = {
                    'gameState.phase': 'pass-result',
                    'gameState.winnerId': winnerId,
                };
                // Leaderboard points go in this same transaction. Only one call
                // can move the game out of 'pass-exploded', so they're never
                // awarded twice.
                const award = (sideId: string | null | undefined, points: number) => {
                    if (!sideId || points <= 0) return;
                    for (const id of sideById(gs, sideId)?.memberIds ?? []) {
                        updates[`scores.${id}`] = increment(points);
                    }
                };
                award(winnerId, PASS_WIN_SCORE);
                // Runner-up = the last side knocked out. With only 2 sides that's
                // just the loser, so it only counts with 3 or more.
                if (gs.sideIds.length >= 3) {
                    award(gs.eliminationOrder[gs.eliminationOrder.length - 1], PASS_RUNNER_UP_SCORE);
                }
                tx.update(groupRef, updates);
                return;
            }

            const victim = gs.lastExplosion?.sideId;
            const notVictim = alive.filter((id) => id !== victim);
            const pool = notVictim.length > 0 ? notVictim : alive;
            const fewest = Math.min(...pool.map((id) => totalPassesLeft(gs, id)));
            const tied = pool.filter((id) => totalPassesLeft(gs, id) === fewest);
            const holderId = tied[Math.floor(Math.random() * tied.length)];

            const stacks = { ...gs.stacks };
            for (const id of alive) stacks[id] = Math.max(stacks[id] ?? 0, gs.budget);

            const { lastPass: _drop, ...rest } = gs;
            const next = withFreshTurn(
                { ...rest, stacks, phase: 'pass-playing', round: gs.round + 1, holderId },
                gs.turn.seq + 1,
                true
            );

            tx.update(groupRef, { gameState: next });
        });
    } catch (e) {
        if (__DEV__) console.warn('[continuePassGame] failed', e);
    }
};

// ── STORE ─────────────────────────────────────────────────────────────
// Open to every side that isn't holding the bomb, any time during play —
// shopping happens in the waiting time, so the game never pauses for it.
// Purchases only touch the buyer's own wallet, stack and items, so they
// can't clash with the holder's answer (and the transaction handles races).
export type StoreResult = 'ok' | 'not-allowed' | 'insufficient' | 'error';

export const shopperSide = (gs: PassGameState | undefined, playerId: string): string | null => {
    if (gs?.mode !== 'pass' || gs.phase === 'pass-result') return null;
    const side = sideOf(gs, playerId);
    if (!side || gs.ghosts.includes(side)) return null;
    // The holding side is busy answering — no shopping on your own turn.
    if (gs.phase === 'pass-playing' && side === gs.holderId) return null;
    return side;
};

// One extra pass on the buyer's own stack.
export const buyPass = async (group: Group, playerId: string): Promise<StoreResult> => {
    const groupRef = doc(db, 'groups', group.id);
    let result: StoreResult = 'error';
    try {
        await runTransaction(db, async (tx) => {
            result = 'not-allowed';
            const snap = await tx.get(groupRef);
            if (!snap.exists()) return;
            const gs = snap.data().gameState as PassGameState | undefined;
            const side = shopperSide(gs, playerId);
            if (!gs || !side) return;

            const price = passPrice(gs, side);
            const funds = walletOf(gs, side);
            if (funds < price) {
                result = 'insufficient';
                return;
            }
            tx.update(groupRef, {
                [`gameState.wallet.${side}`]: funds - price,
                [`gameState.passesBought.${side}`]: (gs.passesBought?.[side] ?? 0) + 1,
                [`gameState.stacks.${side}`]: totalPassesLeft(gs, side) + 1,
                [`gameState.receipts.${side}`]: withReceipt(gs, side, {
                    item: 'pass',
                    byPlayerId: playerId,
                    round: gs.round,
                }),
            });
            result = 'ok';
        });
    } catch (e) {
        if (__DEV__) console.warn('[buyPass] failed', e);
        result = 'error';
    }
    return result;
};

export const buyPassItem = async (
    group: Group,
    playerId: string,
    item: PassItem
): Promise<StoreResult> => {
    const groupRef = doc(db, 'groups', group.id);
    let result: StoreResult = 'error';
    try {
        await runTransaction(db, async (tx) => {
            result = 'not-allowed';
            const snap = await tx.get(groupRef);
            if (!snap.exists()) return;
            const gs = snap.data().gameState as PassGameState | undefined;
            const side = shopperSide(gs, playerId);
            if (!gs || !side) return;

            const price = itemPrice(item);
            const funds = walletOf(gs, side);
            if (funds < price) {
                result = 'insufficient';
                return;
            }
            tx.update(groupRef, {
                [`gameState.wallet.${side}`]: funds - price,
                [`gameState.items.${side}.${item}`]: itemsOf(gs, side)[item] + 1,
                [`gameState.receipts.${side}`]: withReceipt(gs, side, {
                    item,
                    byPlayerId: playerId,
                    round: gs.round,
                }),
            });
            result = 'ok';
        });
    } catch (e) {
        if (__DEV__) console.warn('[buyPassItem] failed', e);
        result = 'error';
    }
    return result;
};

// Used by the holding side on their own question, once the target is set.
//   • 50/50 — removes two wrong options (needs at least two untried wrong
//     ones left). Removed options don't cost anything.
//   • Swap  — a brand-new question, same target, no pass lost.
export const applyPassItem = async (
    group: Group,
    playerId: string,
    item: PassItem,
    seq: number
): Promise<boolean> => {
    const groupRef = doc(db, 'groups', group.id);
    let ok = false;
    try {
        await runTransaction(db, async (tx) => {
            ok = false;
            const snap = await tx.get(groupRef);
            if (!snap.exists()) return;
            const gs = snap.data().gameState as PassGameState | undefined;
            if (!holderGuard(gs, playerId)) return;
            const t = gs.turn;
            if (t.seq !== seq || !t.targetId) return;
            const side = gs.holderId;
            const owned = itemsOf(gs, side)[item];
            if (owned <= 0) return;
            const spend = { [`gameState.items.${side}.${item}`]: owned - 1 };

            if (item === 'fiftyFifty') {
                const removed = t.removed ?? [];
                const untriedWrong = t.question.options
                    .map((o, i) => ({ o, i }))
                    .filter(({ o, i }) => !o.correct && !t.wrongPicks.includes(i) && !removed.includes(i))
                    .map(({ i }) => i);
                if (untriedWrong.length < 2) return;
                const pick = [...untriedWrong].sort(() => Math.random() - 0.5).slice(0, 2);
                tx.update(groupRef, { ...spend, 'gameState.turn.removed': [...removed, ...pick] });
                ok = true;
                return;
            }

            // Swap: new question, same target. The seq bump voids any tap still
            // aimed at the old question. A live cheating call carries over —
            // swapping isn't a way to dodge one.
            const { question, used } = drawQuestion(gs.usedQuestionIds);
            const live = gs.callout?.seq === seq ? gs.callout : null;
            tx.update(groupRef, {
                ...spend,
                'gameState.turn': {
                    seq: seq + 1,
                    targetId: t.targetId,
                    question,
                    wrongPicks: [],
                    removed: [],
                    muffled: !!t.muffled, // same stint — the gloves stay on
                },
                'gameState.usedQuestionIds': used,
                'gameState.callout': {
                    seq: seq + 1,
                    voterIds: live?.voterIds ?? [],
                    againstIds: live?.againstIds ?? [],
                },
                'gameState.lastSwap': { sideId: side, seq },
            });
            ok = true;
        });
    } catch (e) {
        if (__DEV__) console.warn('[applyPassItem] failed', e);
    }
    return ok;
};

// ── HIDDEN-PASSES ITEMS ───────────────────────────────────────────────
// Hush Gloves: for your next GLOVES_TURNS turns holding the bomb, your wrong
// answers make no sound or flash on anyone else's phone. Turns are counted
// when the bomb arrives (see withFreshTurn), so buying more just adds turns.
export const buyHushGloves = async (group: Group, playerId: string): Promise<StoreResult> => {
    const groupRef = doc(db, 'groups', group.id);
    let result: StoreResult = 'error';
    try {
        await runTransaction(db, async (tx) => {
            result = 'not-allowed';
            const snap = await tx.get(groupRef);
            if (!snap.exists()) return;
            const gs = snap.data().gameState as PassGameState | undefined;
            const side = shopperSide(gs, playerId);
            if (!gs || !side || !gs.hiddenPasses) return;

            const funds = walletOf(gs, side);
            if (funds < PRICE_GLOVES) {
                result = 'insufficient';
                return;
            }
            tx.update(groupRef, {
                [`gameState.wallet.${side}`]: funds - PRICE_GLOVES,
                [`gameState.glovesTurns.${side}`]: glovesLeft(gs, side) + GLOVES_TURNS,
                [`gameState.receipts.${side}`]: withReceipt(gs, side, {
                    item: 'gloves',
                    byPlayerId: playerId,
                    round: gs.round,
                }),
            });
            result = 'ok';
        });
    } catch (e) {
        if (__DEV__) console.warn('[buyHushGloves] failed', e);
        result = 'error';
    }
    return result;
};

// Audit: a private, one-off look at another side's exact pass total, taken
// at the moment of purchase. The number is returned to the buyer only —
// nothing secret is stored. The audit itself shows up on the receipts.
export const buyAudit = async (
    group: Group,
    playerId: string,
    targetSideId: string
): Promise<{ result: StoreResult; total?: number }> => {
    const groupRef = doc(db, 'groups', group.id);
    let out: { result: StoreResult; total?: number } = { result: 'error' };
    try {
        await runTransaction(db, async (tx) => {
            out = { result: 'not-allowed' };
            const snap = await tx.get(groupRef);
            if (!snap.exists()) return;
            const gs = snap.data().gameState as PassGameState | undefined;
            const side = shopperSide(gs, playerId);
            if (!gs || !side || !gs.hiddenPasses) return;
            if (targetSideId === side || !passAlive(gs).includes(targetSideId)) return;

            const funds = walletOf(gs, side);
            if (funds < PRICE_AUDIT) {
                out = { result: 'insufficient' };
                return;
            }
            tx.update(groupRef, {
                [`gameState.wallet.${side}`]: funds - PRICE_AUDIT,
                [`gameState.receipts.${side}`]: withReceipt(gs, side, {
                    item: 'audit',
                    targetId: targetSideId,
                    byPlayerId: playerId,
                    round: gs.round,
                }),
            });
            out = { result: 'ok', total: totalPassesLeft(gs, targetSideId) };
        });
    } catch (e) {
        if (__DEV__) console.warn('[buyAudit] failed', e);
        out = { result: 'error' };
    }
    return out;
};