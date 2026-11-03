// ⚖️ Court of Thieves: Firestore side. Every move runs the pure engine
// (engine.ts) inside a transaction guarded by phase + round/seq, so a double
// tap or two phones stepping in at once can't apply anything twice.
// Times are server-clock ms (shared/firebase/time.ts), so every phone
// agrees when the lights go out and come back.
import { doc, runTransaction, Transaction } from 'firebase/firestore';
import { db } from '../../../shared/firebase/config';
import { getServerNow, isTimeSynced, syncServerTimeOffset } from '../../../shared/firebase/time';
import { returnToMenu, scoreFields } from '../../../shared/firebase/groups';
import type { CotGameState, Group } from '../../../shared/types';
import * as E from './engine';

export const isCotState = (gs: unknown): gs is CotGameState =>
    !!gs && (gs as { game?: string }).game === 'court-of-thieves';

// Firestore refuses undefined values anywhere in a document.
const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const read = async (tx: Transaction, groupId: string) => {
    const groupRef = doc(db, 'groups', groupId);
    const snap = await tx.get(groupRef);
    if (!snap.exists()) return null;
    const data = snap.data() as Group;
    if (!isCotState(data.gameState)) return null;
    return { groupRef, data, gs: data.gameState };
};

type Result = { success: boolean; reason?: string };

// Run an engine step that may refuse, and report why.
const step = async (
    groupId: string,
    fn: (gs: CotGameState, data: Group) => { ok: true; gs: CotGameState } | { ok: false; reason: string } | null
): Promise<Result> => {
    let result: Result = { success: false, reason: 'stale' };
    try {
        await runTransaction(db, async (tx) => {
            result = { success: false, reason: 'stale' };
            const cur = await read(tx, groupId);
            if (!cur) return;
            const r = fn(cur.gs, cur.data);
            if (!r) return;
            if (!r.ok) {
                result = { success: false, reason: r.reason };
                return;
            }
            tx.update(cur.groupRef, { gameState: clean(r.gs) });
            result = { success: true };
        });
    } catch (e) {
        if (__DEV__) console.warn('[court-of-thieves] transaction failed', e);
        result = { success: false, reason: 'Network trouble. Try again.' };
    }
    return result;
};

// ── Start ────────────────────────────────────────────────────────────
export const startCot = async (group: Group, roundsTotal: number, dealMs: number): Promise<void> => {
    // Every deadline in the game is set from this phone's clock: make sure
    // it's been checked against the server's before dealing.
    if (!isTimeSynced()) await syncServerTimeOffset(group.id);
    await runTransaction(db, async (tx) => {
        const groupRef = doc(db, 'groups', group.id);
        const snap = await tx.get(groupRef);
        if (!snap.exists()) return;
        const data = snap.data() as Group;
        if (isCotState(data.gameState) && data.gameState.phase !== 'over') return; // already running
        if (data.players.length < E.MIN_PLAYERS) return;
        const gs = E.newGame(data.players.map((p) => p.id), roundsTotal, dealMs, getServerNow());
        tx.update(groupRef, { gameState: clean(gs), status: 'playing' });
    });
};

// ── Timed steps (host first, everyone else as backup) ────────────────
// Each one re-checks, inside the transaction, that its time is really up on
// the server clock (or that the person it waits for has left), so a phone
// with a fast clock can't end a phase early.
const present = (data: Group) => data.players.map((p) => p.id);
const due = (gs: CotGameState, data: Group) => E.isDue(gs, getServerNow(), present(data));

export const cotToOutage = (groupId: string, seq: number) =>
    step(groupId, (gs, data) => (gs.phase === 'roles' && gs.seq === seq && due(gs, data) ? { ok: true, gs: E.toOutage(gs) } : null));

export const cotResolveOutage = (groupId: string, round: number) =>
    step(groupId, (gs, data) => {
        if (gs.phase !== 'outage' || gs.round !== round) return null;
        if (!due(gs, data)) return null;
        return { ok: true, gs: E.resolveOutage(gs, getServerNow()) };
    });

export const cotToDeals = (groupId: string, seq: number) =>
    step(groupId, (gs, data) => (gs.phase === 'lights' && gs.seq === seq && due(gs, data) ? { ok: true, gs: E.toDeals(gs, getServerNow()) } : null));

export const cotEndDeals = (groupId: string, seq: number) =>
    step(groupId, (gs, data) => (gs.phase === 'deals' && gs.seq === seq && due(gs, data) ? { ok: true, gs: E.endDeals(gs, getServerNow()) } : null));

// ── The court ────────────────────────────────────────────────────────
export const cotPick = (groupId: string, playerId: string, suspect: string) =>
    step(groupId, (gs) => E.pickSuspect(gs, playerId, suspect));

// Time's up, or everyone has locked in (`whenAllPicked`).
export const cotCloseArrest = (groupId: string, seq: number, whenAllPicked = false) =>
    step(groupId, (gs, data) => {
        if (gs.phase !== 'arrest' || gs.seq !== seq) return null;
        if (whenAllPicked ? !E.allPicked(gs, present(data)) : !due(gs, data)) return null;
        return { ok: true, gs: E.closeArrest(gs, getServerNow()) };
    });

// A speaker's turn ends (time's up, or they tapped "I'm done").
export const cotEndTurn = (groupId: string, seq: number, turn: number, playerId?: string) =>
    step(groupId, (gs, data) => {
        if (gs.phase !== 'trial' || gs.seq !== seq || gs.trial?.turn !== turn) return null;
        // The speaker may finish early; anyone else only once time's up.
        if (playerId) {
            if (gs.trial.speakers[turn]?.id !== playerId) return { ok: false, reason: "It's not your turn." };
        } else if (!due(gs, data)) return null;
        return { ok: true, gs: E.endTurn(gs, turn, getServerNow()) };
    });

export const cotDecide = (groupId: string, playerId: string, guilty: boolean) =>
    step(groupId, (gs) => E.decide(gs, playerId, guilty, getServerNow()));

// The Judge ran out of time: not guilty.
export const cotVerdictTimeout = (groupId: string, seq: number) =>
    step(groupId, (gs, data) => (gs.phase === 'verdict' && gs.seq === seq && due(gs, data) ? E.decide(gs, null, false, getServerNow()) : null));

// The summary's timer ran out, or the host tapped "Next round" (`playerId`).
export const cotNextRound = (groupId: string, round: number, playerId?: string) =>
    step(groupId, (gs, data) => {
        if (gs.phase !== 'roundEnd' || gs.round !== round) return null;
        if (playerId ? data.hostId !== playerId : !due(gs, data)) return null;
        return { ok: true, gs: E.nextRound(gs, present(data), getServerNow()) };
    });

// ── The Thief's moves ────────────────────────────────────────────────
export const cotHeistAct = (groupId: string, playerId: string, input: E.HeistInput) =>
    step(groupId, (gs) => E.heistAct(gs, playerId, input, getServerNow()));

// ── Deals ────────────────────────────────────────────────────────────
export const cotSend = (groupId: string, playerId: string, target: E.CotTarget, input: E.SendInput) =>
    step(groupId, (gs) => E.sendNew(gs, playerId, target, input, getServerNow()));

export const cotReply = (groupId: string, playerId: string, threadId: string, input: E.SendInput) =>
    step(groupId, (gs) => E.reply(gs, playerId, threadId, input, getServerNow()));

export const cotRespond = (groupId: string, playerId: string, threadId: string, msgId: string, choice: E.OfferChoice) =>
    step(groupId, (gs) => E.respond(gs, playerId, threadId, msgId, choice));

// ── Host: stop now ───────────────────────────────────────────────────
export const endCotEarly = async (groupId: string): Promise<void> => {
    await step(groupId, (gs) => (gs.phase === 'over' ? null : { ok: true, gs: E.endEarly(gs) }));
};

// ── Leaderboard points, once, then back to the menu ────────────────────
export const finishCot = async (group: Group): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const cur = await read(tx, group.id);
        if (!cur) return;
        const { gs, groupRef, data } = cur;
        if (gs.pointsAwarded) return;
        const updates: Record<string, unknown> = { 'gameState.pointsAwarded': true };
        if (gs.phase === 'over') {
            for (const s of E.standings(gs, data.players.map((p) => p.id))) {
                if (s.points > 0) Object.assign(updates, scoreFields('court-of-thieves', s.playerId, s.points));
            }
        }
        tx.update(groupRef, updates);
    });
    await returnToMenu(group.id);
};
