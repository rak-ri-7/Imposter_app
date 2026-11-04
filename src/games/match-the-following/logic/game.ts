// ✏️ Match the Following: Firestore side. Every move runs the pure engine
// (engine.ts) inside a transaction. Timed steps re-check, inside the
// transaction, that their time is really up on the server clock (or that
// everyone still here is done), so a fast phone can't cut a phase short.
import { doc, runTransaction, Transaction } from 'firebase/firestore';
import { db } from '../../../shared/firebase/config';
import { getServerNow, isTimeSynced, syncServerTimeOffset } from '../../../shared/firebase/time';
import { returnToMenu, scoreFields } from '../../../shared/firebase/groups';
import type { Group, MtfDeck, MtfGameState } from '../../../shared/types';
import * as E from './engine';

export const isMtfState = (gs: unknown): gs is MtfGameState =>
    !!gs && (gs as { game?: string }).game === 'match-the-following';

// Firestore refuses undefined values anywhere in a document.
const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const read = async (tx: Transaction, groupId: string) => {
    const groupRef = doc(db, 'groups', groupId);
    const snap = await tx.get(groupRef);
    if (!snap.exists()) return null;
    const data = snap.data() as Group;
    if (!isMtfState(data.gameState)) return null;
    return { groupRef, data, gs: data.gameState };
};

type Result = { success: boolean; reason?: string };

const step = async (
    groupId: string,
    fn: (gs: MtfGameState, data: Group) => { ok: true; gs: MtfGameState } | { ok: false; reason: string } | null
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
        if (__DEV__) console.warn('[match-the-following] transaction failed', e);
        result = { success: false, reason: 'Network trouble. Try again.' };
    }
    return result;
};

const present = (data: Group) => data.players.map((p) => p.id);
const due = (gs: MtfGameState, data: Group) => E.isDue(gs, getServerNow(), present(data));

// ── Start ────────────────────────────────────────────────────────────
export const startMtf = async (group: Group, roundsTotal: number, deck: MtfDeck): Promise<void> => {
    // Deadlines are set from this phone's clock: check it against the server's first.
    if (!isTimeSynced()) await syncServerTimeOffset(group.id);
    await runTransaction(db, async (tx) => {
        const groupRef = doc(db, 'groups', group.id);
        const snap = await tx.get(groupRef);
        if (!snap.exists()) return;
        const data = snap.data() as Group;
        if (isMtfState(data.gameState) && data.gameState.phase !== 'over') return; // already running
        if (data.players.length < E.MIN_PLAYERS) return;
        const gs = E.newGame(data.players.map((p) => p.id), roundsTotal, deck, getServerNow());
        tx.update(groupRef, { gameState: clean(gs), status: 'playing' });
    });
};

// ── Players ──────────────────────────────────────────────────────────
export const mtfAnswer = (groupId: string, playerId: string, input: E.AnswerInput) =>
    step(groupId, (gs) => E.submitAnswer(gs, playerId, input, getServerNow()));

export const mtfSaveBoard = (groupId: string, playerId: string, lines: Record<string, string>, lock: boolean, rev: number) =>
    step(groupId, (gs) => E.submitBoard(gs, playerId, lines, lock, rev));

// ── Timed steps (host first, everyone else as backup) ────────────────
export const mtfToMatch = (groupId: string, seq: number) =>
    step(groupId, (gs, data) => (gs.phase === 'answer' && gs.seq === seq && due(gs, data) ? { ok: true, gs: E.toMatch(gs, getServerNow(), Math.random, present(data)) } : null));

export const mtfToReveal = (groupId: string, seq: number) =>
    step(groupId, (gs, data) => (gs.phase === 'match' && gs.seq === seq && due(gs, data) ? { ok: true, gs: E.toReveal(gs, getServerNow()) } : null));

// The reveal ran its course, or the host tapped "Skip" (`playerId`).
export const mtfToRoundEnd = (groupId: string, seq: number, playerId?: string) =>
    step(groupId, (gs, data) => {
        if (gs.phase !== 'reveal' || gs.seq !== seq) return null;
        if (playerId ? data.hostId !== playerId : !due(gs, data)) return null;
        return { ok: true, gs: E.toRoundEnd(gs, getServerNow()) };
    });

// The summary's timer ran out, or the host tapped "Next round" (`playerId`).
export const mtfNextRound = (groupId: string, round: number, playerId?: string) =>
    step(groupId, (gs, data) => {
        if (gs.phase !== 'roundEnd' || gs.round !== round) return null;
        if (playerId ? data.hostId !== playerId : !due(gs, data)) return null;
        return { ok: true, gs: E.nextRound(gs, present(data), getServerNow()) };
    });

// ── Host: stop now ───────────────────────────────────────────────────
export const endMtfEarly = async (groupId: string): Promise<void> => {
    await step(groupId, (gs) => (gs.phase === 'over' ? null : { ok: true, gs: E.endEarly(gs) }));
};

// ── Leaderboard points, once, then back to the menu ────────────────────
export const finishMtf = async (group: Group): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const cur = await read(tx, group.id);
        if (!cur) return;
        const { gs, groupRef, data } = cur;
        if (gs.pointsAwarded) return;
        const updates: Record<string, unknown> = { 'gameState.pointsAwarded': true };
        if (gs.phase === 'over') {
            for (const s of E.standings(gs, present(data))) {
                if (s.points > 0) Object.assign(updates, scoreFields('match-the-following', s.playerId, s.points));
            }
        }
        tx.update(groupRef, updates);
    });
    await returnToMenu(group.id);
};
