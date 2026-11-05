// 🏛️ Race Before the Roof Falls: Firestore side. Every move runs the pure
// engine (engine.ts) inside a transaction, on the server clock. The engine
// brings the game up to date before each move, so a move always lands on
// the current state (a door that has just timed out can't be pushed).
//
// Timed steps (a door running out, the rope window closing, a hold
// completing…) are done by `rrfTick`: the host's phone calls it the moment
// something is due, every other phone a few seconds later as backup.
import { doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../../shared/firebase/config';
import { getServerNow, isTimeSynced, syncServerTimeOffset } from '../../../shared/firebase/time';
import { returnToMenu, scoreFields } from '../../../shared/firebase/groups';
import type { Group, RrfGameState, RrfTeam, RrfTeamId } from '../../../shared/types';
import * as E from './engine';

export const isRrfState = (gs: unknown): gs is RrfGameState => !!gs && (gs as { game?: string }).game === 'roof-race';

// Firestore refuses undefined values anywhere in a document.
const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const present = (data: Group) => data.players.map((p) => p.id);
// The server time of the last write: no phone's clock may judge a move as earlier than that.
const lastWrite = (data: Group): number | undefined => data.rrfAt?.toMillis?.();
const groupRef = (groupId: string) => doc(db, 'groups', groupId);

export type Result = { success: boolean; reason?: string };

// Run `fn` on the current game inside a transaction. `fn` returns null to
// leave the document alone.
const step = async (groupId: string, fn: (gs: RrfGameState, data: Group, now: number) => E.Result | null): Promise<Result> => {
    let result: Result = { success: false, reason: 'stale' };
    try {
        await runTransaction(db, async (tx) => {
            result = { success: false, reason: 'stale' };
            const snap = await tx.get(groupRef(groupId));
            if (!snap.exists()) return;
            const data = snap.data() as Group;
            if (!isRrfState(data.gameState)) return;
            const r = fn(data.gameState, data, E.judgedNow(getServerNow(), lastWrite(data)));
            if (!r) return;
            if (!r.ok) {
                result = { success: false, reason: r.reason };
                return;
            }
            tx.update(groupRef(groupId), { gameState: clean(r.gs), rrfAt: serverTimestamp() });
            result = { success: true };
        });
    } catch (e) {
        if (__DEV__) console.warn('[roof-race] transaction failed', e);
        result = { success: false, reason: 'Network trouble. Try again.' };
    }
    return result;
};

// ── Lobby ────────────────────────────────────────────────────────────
// Teams come from the session ("👥 Play as Teams"); the lobby only holds
// the number of expeditions.
export const rrfSetExpeditions = async (groupId: string, actorId: string, expeditions: number): Promise<void> => {
    if (!(E.EXPEDITION_OPTIONS as readonly number[]).includes(expeditions)) return;
    try {
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(groupRef(groupId));
            if (!snap.exists()) return;
            const data = snap.data() as Group;
            if (data.hostId !== actorId) return;
            if (isRrfState(data.gameState) && data.gameState.phase !== 'over') return; // a game is on
            tx.update(groupRef(groupId), { rrfLobby: { expeditions } });
        });
    } catch (e) {
        if (__DEV__) console.warn('[roof-race] lobby update failed', e);
    }
};

export const sessionTeams = (group: Group): E.FromSession =>
    E.fromSessionTeams(group.teamsEnabled, group.teams, group.players.map((p) => p.id));

// ── Start ────────────────────────────────────────────────────────────
// Returns why it couldn't start (the session teams don't fit), or null.
export const startRrf = async (group: Group): Promise<string | null> => {
    // Deadlines are set from this phone's clock: check it against the server's first.
    if (!isTimeSynced()) await syncServerTimeOffset(group.id);
    let problem: string | null = null;
    try {
        await runTransaction(db, async (tx) => {
            problem = null;
            const snap = await tx.get(groupRef(group.id));
            if (!snap.exists()) return;
            const data = snap.data() as Group;
            if (isRrfState(data.gameState) && data.gameState.phase !== 'over') return; // already running
            const from = sessionTeams(data);
            if (!from.ok) {
                problem = from.problem;
                return;
            }
            const expeditions = data.rrfLobby?.expeditions ?? E.DEFAULT_EXPEDITIONS;
            const gs = E.newGame(from.teams, expeditions, E.judgedNow(getServerNow(), lastWrite(data)), Math.random, from.sides);
            tx.update(groupRef(group.id), { gameState: clean(gs), status: 'playing', rrfAt: serverTimestamp(), rrfDrafts: {} });
        });
    } catch (e) {
        if (__DEV__) console.warn('[roof-race] start failed', e);
        problem = 'Network trouble. Try again.';
    }
    return problem;
};

// ── Moves ────────────────────────────────────────────────────────────
// The key-holder's tiles, saved as they're placed so the explorers can
// follow along. Only for show (the push is what counts), so it's a plain
// write to its own small field, tagged with the lock it belongs to: a new
// lock, a retry or a tremor makes old tiles stale.
export const draftKey = (gs: RrfGameState, team: RrfTeam): string => `${gs.expedition}:${team.door}:${team.retry ? 1 : 0}:${team.frozenUntil}`;
export const draftFor = (group: Group, gs: RrfGameState, team: RrfTeam): string[] | null => {
    const d = group.rrfDrafts?.[team.id];
    return d && d.key === draftKey(gs, team) ? d.tiles : null;
};
export const rrfSaveDraft = async (groupId: string, team: RrfTeamId, key: string, tiles: string[]): Promise<void> => {
    try {
        await updateDoc(groupRef(groupId), { [`rrfDrafts.${team}`]: { key, tiles }, rrfAt: serverTimestamp() });
    } catch {
        // Only a preview for the explorers: the next tap tries again.
    }
};

export const rrfPush = (groupId: string, playerId: string, answer: string[]) =>
    step(groupId, (gs, data, now) => E.pushDoor(gs, playerId, answer, now, present(data)));

export const rrfRope = (groupId: string, playerId: string) =>
    step(groupId, (gs, data, now) => E.throwRope(gs, playerId, now, present(data)));

export const rrfProposeTremor = (groupId: string, playerId: string) =>
    step(groupId, (gs, data, now) => E.proposeTremor(gs, playerId, now, present(data)));

export const rrfAnswerTremor = (groupId: string, playerId: string, yes: boolean) =>
    step(groupId, (gs, data, now) => E.answerTremor(gs, playerId, yes, now, present(data)));

export const rrfPlaceSeal = (groupId: string, playerId: string, tileId: string, slot: number) =>
    step(groupId, (gs, data, now) => E.placeSeal(gs, playerId, tileId, slot, now, present(data)));

export const rrfPushSeal = (groupId: string, playerId: string) =>
    step(groupId, (gs, data, now) => E.pushSeal(gs, playerId, now, present(data)));

// ✋ A hold is stamped with the moment the finger went down on the
// phone, not when the write reached the server, so a slow network doesn't
// cost anyone the race. Clamped to the last second so it can't be gamed.
const HOLD_LAG_MS = 1000;
const stamp = (tappedAt: number, now: number, floor = 0) => Math.min(now, Math.max(tappedAt, now - HOLD_LAG_MS, floor));

// Presses and releases from this phone go out one at a time, in order, so a
// quick tap can't land its release before its press.
let holdQueue: Promise<unknown> = Promise.resolve();
const queued = (fn: () => Promise<Result>): Promise<Result> => {
    const run = holdQueue.then(fn, fn);
    holdQueue = run.catch(() => undefined);
    return run;
};

export const rrfHoldDown = (groupId: string, playerId: string, tappedAt: number) =>
    queued(() => step(groupId, (gs, data, now) => E.holdDown(gs, playerId, now, present(data), Math.random, stamp(tappedAt, now, lastWrite(data)))));

export const rrfHoldUp = (groupId: string, playerId: string) =>
    queued(() => step(groupId, (gs, data, now) => (gs.holds[playerId] ? E.holdUp(gs, playerId, now, present(data)) : null)));

// ── Timed steps ──────────────────────────────────────────────────────
// Does whatever is due. Backup phones only act once it's `grace` overdue,
// so the host normally does it first and the others find nothing to do.
export const rrfTick = (groupId: string, graceMs: number) =>
    step(groupId, (gs, data, now) => {
        const p = present(data);
        if (E.nextDue(gs, p) > now - graceMs) return null;
        const next = E.advance(gs, now, p);
        return E.changed(gs, next) ? { ok: true, gs: next } : null;
    });

// Host: skip the story or the expedition summary.
export const rrfSkip = (groupId: string, playerId: string) =>
    step(groupId, (gs, data, now) => (data.hostId === playerId ? E.skip(gs, now, present(data)) : null));

// Host: stop now (the expedition in progress doesn't count).
export const endRrfEarly = (groupId: string, playerId: string) =>
    step(groupId, (gs, data) => (gs.phase === 'over' || data.hostId !== playerId ? null : { ok: true, gs: E.endEarly(gs) }));

// ── Leaderboard points, once, then back to the menu ──────────────────
export const finishRrf = async (group: Group): Promise<void> => {
    try {
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(groupRef(group.id));
            if (!snap.exists()) return;
            const data = snap.data() as Group;
            const gs = data.gameState;
            if (!isRrfState(gs) || gs.pointsAwarded) return;
            const updates: Record<string, unknown> = { 'gameState.pointsAwarded': true };
            if (gs.phase === 'over') {
                for (const [pid, pts] of Object.entries(E.playerPoints(gs, present(data)))) {
                    if (pts > 0) Object.assign(updates, scoreFields('roof-race', pid, pts));
                }
            }
            tx.update(groupRef(group.id), updates);
        });
    } catch (e) {
        if (__DEV__) console.warn('[roof-race] finish failed', e);
    }
    await returnToMenu(group.id);
};
