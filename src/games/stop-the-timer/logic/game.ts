// src/games/timer/logic/game.ts
import { doc, updateDoc, runTransaction, increment, serverTimestamp, Timestamp, Transaction } from 'firebase/firestore';
import { db } from '../../../shared/firebase/config';
import { Group, TimerGameState } from '../../../shared/types';
import { returnToMenu, scoreFields } from '../../../shared/firebase/groups';
import { generateQuestionForRound } from '../data/questions';

export const COUNTDOWN_SECONDS = 10;
export const HARD_COUNTDOWN_SECONDS = 15; // hard questions need longer to work out

// Seconds to work out the answer before the hidden timer starts.
export const countdownSecondsFor = (difficulty?: string): number =>
    difficulty === 'hard' ? HARD_COUNTDOWN_SECONDS : COUNTDOWN_SECONDS;
export const MAX_TIMER_SECONDS = 34;
export const MAX_TIMER_MS = MAX_TIMER_SECONDS * 1000; // stops must land strictly before this

export const toMillis = (ts: Timestamp | number | null | undefined): number | null => {
    if (!ts) return null;
    if (typeof ts === 'number') return ts;
    return ts.toMillis();
};

export const startTimerGame = async (group: Group): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    const question = generateQuestionForRound(1);

    const gameState: TimerGameState = {
        question: question.question,
        answer: question.answer,
        difficulty: question.difficulty,
        phase: 'question',
        countdownStartedAt: serverTimestamp() as unknown as Timestamp,
        timerStartedAt: null,
        stops: {},
        finalStops: {},
        roundNumber: 1,
        distractionsEnabled: true,
        recentTemplates: [question.templateId],
    };

    await updateDoc(groupRef, {
        status: 'question',
        gameState,
    });
};

const readTimerState = async (tx: Transaction, groupId: string) => {
    const groupRef = doc(db, 'groups', groupId);
    const snap = await tx.get(groupRef);
    if (!snap.exists()) return null;
    const data = snap.data() as Group;
    return { groupRef, data, gameState: data.gameState as TimerGameState };
};

// Transaction: only the first caller while the round is still in 'question'
// wins; duplicates from other devices see the phase has moved on.
export const startTimer = async (groupId: string): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const cur = await readTimerState(tx, groupId);
        if (!cur || cur.gameState.phase !== 'question') return;
        tx.update(cur.groupRef, {
            status: 'running',
            'gameState.phase': 'running',
            'gameState.timerStartedAt': serverTimestamp(),
            'gameState.stops': {},
            'gameState.finalStops': {},
        });
    });
};

// Marks the moment this player stopped, using the server's clock. Ignored
// once the round is no longer running or the player already stopped.
export const stopTimer = async (groupId: string, playerId: string): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const cur = await readTimerState(tx, groupId);
        if (!cur || cur.gameState.phase !== 'running') return;
        if (cur.gameState.stops?.[playerId] !== undefined) return;
        tx.update(cur.groupRef, {
            [`gameState.stops.${playerId}`]: serverTimestamp(),
        });
    });
};

// Host-authoritative reveal. Converts every stop into elapsed ms.
// A player who never stopped, or stopped after the cutoff, gets `null` —
// an explicit "didn't stop" instead of a magic number.
export const revealResults = async (groupId: string, playerIds: string[]): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const cur = await readTimerState(tx, groupId);
        if (!cur || cur.gameState.phase !== 'running') return;

        const startMs = toMillis(cur.gameState.timerStartedAt);
        if (startMs === null) throw new Error('Timer start time not resolved yet');

        const finalStops: Record<string, number | null> = {};
        for (const pid of playerIds) {
            const stopMs = toMillis(cur.gameState.stops?.[pid]);
            if (stopMs === null) {
                finalStops[pid] = null;
                continue;
            }
            const elapsed = Math.max(stopMs - startMs, 0);
            finalStops[pid] = elapsed < MAX_TIMER_MS ? elapsed : null;
        }

        tx.update(cur.groupRef, {
            status: 'result',
            'gameState.phase': 'result',
            'gameState.finalStops': finalStops,
        });
    });
};

// Points for the current round as scores.* increments, or null when the
// round was already awarded.
const buildAwardUpdates = (data: Group, gameState: TimerGameState) => {
    if (gameState.pointsAwardedRound === gameState.roundNumber) return null;
    const ranking = calculateRanking(gameState.finalStops ?? {}, gameState.answer, data.players);
    const updates: Record<string, unknown> = {
        'gameState.pointsAwardedRound': gameState.roundNumber,
    };
    for (const r of ranking) {
        if (r.points > 0) Object.assign(updates, scoreFields('stop-the-timer', r.playerId, r.points));
    }
    return updates;
};

// Awards points and starts the next round in ONE transaction.
export const nextRound = async (groupId: string): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const cur = await readTimerState(tx, groupId);
        if (!cur || cur.gameState.phase !== 'result') return;
        const { gameState, data } = cur;
        const recent = gameState.recentTemplates ?? [];
        const question = generateQuestionForRound(gameState.roundNumber + 1, recent);

        tx.update(cur.groupRef, {
            ...(buildAwardUpdates(data, gameState) ?? {}),
            status: 'question',
            'gameState.question': question.question,
            'gameState.answer': question.answer,
            'gameState.difficulty': question.difficulty,
            'gameState.phase': 'question',
            'gameState.countdownStartedAt': serverTimestamp(),
            'gameState.timerStartedAt': null,
            'gameState.stops': {},
            'gameState.finalStops': {},
            'gameState.roundNumber': gameState.roundNumber + 1,
            // Last 12 question types, so the generator can avoid repeats.
            'gameState.recentTemplates': [...recent, question.templateId].slice(-12),
        });
    });
};

// ── PLAYER DROPPED OUT ───────────────────────────────────────────
// The host can void the round in progress: it jumps to the result screen
// with no points for anyone (marked as already awarded, so ending the game
// can't score it later). Everyone then waits there until the player is
// back, or the host carries on without them.
export const voidTimerRound = async (
    groupId: string,
    requesterId: string,
    awayIds: string[]
): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const cur = await readTimerState(tx, groupId);
        if (!cur || cur.data.hostId !== requesterId) return;
        const { gameState } = cur;
        if (gameState.phase !== 'question' && gameState.phase !== 'running') return;
        tx.update(cur.groupRef, {
            status: 'result',
            'gameState.phase': 'result',
            'gameState.finalStops': {},
            'gameState.pointsAwardedRound': gameState.roundNumber,
            'gameState.voidedRound': { round: gameState.roundNumber, awayIds },
        });
    });
};

// `lastSeen` is each player's last check-in, so the choice lapses as soon
// as they check in again.
export const continueWithoutAwayTimerGame = async (
    groupId: string,
    requesterId: string,
    lastSeen: Record<string, number>
): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const cur = await readTimerState(tx, groupId);
        if (!cur || cur.data.hostId !== requesterId) return;
        const updates: Record<string, unknown> = {};
        for (const [id, ms] of Object.entries(lastSeen)) {
            updates[`gameState.awayIgnored.${id}`] = ms;
        }
        if (Object.keys(updates).length > 0) tx.update(cur.groupRef, updates);
    });
};

export type RankingEntry = {
    playerId: string;
    stoppedAt: number | null; // null = didn't stop in time
    diff: number;             // ms from the answer; Infinity if didn't stop
    rank: number;             // place shown; ties share it and the next takes the next (1, 1, 2, …)
    points: number;
    didNotStop: boolean;
};

export const calculateRanking = (
    finalStops: Record<string, number | null>,
    answer: number,
    players: { id: string; name: string }[]
): RankingEntry[] => {
    const answerMs = answer * 1000;
    const totalPlayers = players.length;

    const entries: RankingEntry[] = players.map((player) => {
        const raw = finalStops[player.id];
        // Treat missing entries and legacy 34000-sentinel values as "didn't stop".
        const stoppedAt = typeof raw === 'number' && raw < MAX_TIMER_MS ? raw : null;
        return {
            playerId: player.id,
            stoppedAt,
            didNotStop: stoppedAt === null,
            diff: stoppedAt === null ? Infinity : Math.abs(stoppedAt - answerMs),
            rank: 0,
            points: 0,
        };
    });

    const stopped = entries.filter((e) => !e.didNotStop).sort((a, b) => a.diff - b.diff);
    const notStopped = entries.filter((e) => e.didNotStop);

    // Equal diffs (to the millisecond) share a place: 1, 1, 2 (same as the
    // menu leaderboard). Points still follow how many players beat you
    // (the 1, 1, 3 position), so a tie above you doesn't inflate your points.
    let position = 0;
    stopped.forEach((e, i) => {
        const prev = stopped[i - 1];
        const tied = !!prev && prev.diff === e.diff;
        if (!tied) position = i + 1;
        e.rank = tied ? prev.rank : (prev ? prev.rank + 1 : 1);
        e.points = Math.max(0, totalPlayers - position);
    });

    // Everyone who didn't stop shares the place after the last stopper, 0 points.
    const lastRank = stopped.length > 0 ? stopped[stopped.length - 1].rank : 0;
    notStopped.forEach((e) => {
        e.rank = lastRank + 1;
        e.points = 0;
    });

    return [...stopped, ...notStopped];
};

// Awards the final round's points exactly once, then returns to the menu.
export const endTimerGame = async (group: Group): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const cur = await readTimerState(tx, group.id);
        if (!cur || cur.gameState.phase !== 'result') return;
        const updates = buildAwardUpdates(cur.data, cur.gameState);
        if (updates) tx.update(cur.groupRef, updates);
    });
    await returnToMenu(group.id, {
        currentPlayers: group.players,
        benchedPlayers: group.benchedPlayers ?? [],
    });
};