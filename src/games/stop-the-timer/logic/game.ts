// src/games/timer/logic/game.ts
import { doc, updateDoc, getDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../../../shared/firebase/config';
import { Group, TimerGameState } from '../../../shared/types';
import { addScore, returnToMenu } from '../../../shared/firebase/groups';
import { generateQuestionForRound } from '../data/questions';

const MAX_TIMER_MS = 34000; // sentinel for "never stopped"

const toMillis = (ts: Timestamp | number | null | undefined): number | null => {
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
        timerStartedAt: null,
        stops: {},
        finalStops: {},
        roundNumber: 1,
        distractionsEnabled: true
    };

    await updateDoc(groupRef, {
        status: 'question',
        gameState,
    });
};

export const startCountdown = async (groupId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, {
        status: 'countdown',
        'gameState.phase': 'countdown',
    });
};

export const startTimer = async (groupId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, {
        status: 'running',
        'gameState.phase': 'running',
        'gameState.timerStartedAt': serverTimestamp(),
        'gameState.stops': {},
        'gameState.finalStops': {},
    });
};

// Still just marks the moment this player stopped, using the server's
// clock. No elapsed-time math happens here — that only ever happens once,
// centrally, in revealResults below.
export const stopTimer = async (
    groupId: string,
    playerId: string
): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, {
        [`gameState.stops.${playerId}`]: serverTimestamp(),
    });
};

// Host-authoritative reveal: does a fresh one-time fetch (not the live
// listener, which can catch timestamps mid-resolution), converts every
// player's stop into a plain elapsed-ms number relative to timerStartedAt,
// and writes that as finalStops. Every device — including the host's own
// UI — then only ever reads finalStops to render results, so nobody
// computes ranking from potentially-still-resolving snapshot data again.
export const revealResults = async (
    groupId: string,
    playerIds: string[]
): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    const snap = await getDoc(groupRef);
    if (!snap.exists()) return;

    const data = snap.data() as Group;
    const gameState = data.gameState as TimerGameState;
    const startMs = toMillis(gameState.timerStartedAt) ?? 0;

    const finalStops: Record<string, number> = {};
    for (const pid of playerIds) {
        const stopMs = toMillis(gameState.stops?.[pid]);
        finalStops[pid] = stopMs !== null ? stopMs - startMs : MAX_TIMER_MS;
    }

    await updateDoc(groupRef, {
        status: 'result',
        'gameState.phase': 'result',
        'gameState.finalStops': finalStops,
    });
};

export const nextRound = async (group: Group): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    const gameState = group.gameState as TimerGameState;
    const question = generateQuestionForRound(gameState.roundNumber + 1);

    await updateDoc(groupRef, {
        status: 'question',
        'gameState.question': question.question,
        'gameState.answer': question.answer,
        'gameState.difficulty': question.difficulty,
        'gameState.phase': 'question',
        'gameState.timerStartedAt': null,
        'gameState.stops': {},
        'gameState.finalStops': {},
        'gameState.roundNumber': gameState.roundNumber + 1,
    });
};

// Back to simple: ranks plain numbers. By the time anyone calls this,
// finalStops has already been computed once, correctly, by the host in
// revealResults — this function never touches Timestamps or clocks.
// src/games/timer/logic/game.ts — replace calculateRanking with this
export const calculateRanking = (
    finalStops: Record<string, number>,
    answer: number,
    players: { id: string; name: string }[]
): { playerId: string; stoppedAt: number; diff: number; rank: number; points: number; didNotStop: boolean }[] => {
    const answerMs = answer * 1000;
    const totalPlayers = players.length;

    const withStatus = players.map((player) => {
        const stoppedAt = finalStops[player.id] ?? MAX_TIMER_MS;
        const didNotStop = stoppedAt >= MAX_TIMER_MS;
        const diff = didNotStop ? Infinity : Math.abs(stoppedAt - answerMs);
        return { playerId: player.id, stoppedAt, diff, didNotStop, rank: 0, points: 0 };
    });

    const stoppedPlayers = withStatus.filter((p) => !p.didNotStop);
    const notStoppedPlayers = withStatus.filter((p) => p.didNotStop);

    // Only players who actually stopped are ranked and eligible for points.
    stoppedPlayers.sort((a, b) => a.diff - b.diff);
    stoppedPlayers.forEach((r, i) => {
        r.rank = i + 1;
        r.points = totalPlayers - 1 - i;
    });

    // Players who never stopped always get 0 points, ranked after everyone
    // who did. If nobody stopped at all, stoppedPlayers is empty and every
    // player ends up here with 0 points — nobody wins.
    notStoppedPlayers.forEach((r, i) => {
        r.rank = stoppedPlayers.length + i + 1;
        r.points = 0;
    });

    return [...stoppedPlayers, ...notStoppedPlayers];
};

export const awardTimerPointsAndContinue = async (
    group: Group,
    onDone: () => void
): Promise<void> => {
    const gameState = group.gameState as TimerGameState;
    const ranking = calculateRanking(
        gameState.finalStops ?? {},
        gameState.answer,
        group.players
    );

    for (const r of ranking) {
        if (r.points > 0) {
            await addScore(group.id, r.playerId, r.points, group.scores);
        }
    }

    onDone();
};

export const endTimerGame = async (group: Group): Promise<void> => {
    await returnToMenu(group.id, {
        currentPlayers: group.players,
        benchedPlayers: group.benchedPlayers ?? [],
    });
};