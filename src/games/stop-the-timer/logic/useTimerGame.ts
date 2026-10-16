// src/games/timer/logic/useTimerGame.ts
import { useState, useEffect, useRef } from 'react';
import { Group, TimerGameState } from '../../../shared/types';
import {
    COUNTDOWN_SECONDS,
    MAX_TIMER_MS,
    toMillis,
    startTimer,
    stopTimer,
    revealResults,
    nextRound,
    endTimerGame,
    calculateRanking,
} from './game';

// How much of the gap between a server timestamp and this device's clock we
// accept as real network delay. Anything beyond that is treated as clock
// skew, so a phone with a wrong clock can never start or reveal early.
const MAX_TRUSTED_LAG_MS = 2000;
// Extra wait before auto-reveal so a stop sent at ~33.9s still lands.
const REVEAL_GRACE_MS = 750;

const localStartFrom = (serverMs: number) => {
    const lag = Math.min(Math.max(Date.now() - serverMs, 0), MAX_TRUSTED_LAG_MS);
    return Date.now() - lag;
};

export const useTimerGame = (group: Group | null, playerId: string) => {
    const [loading, setLoading] = useState(false);
    const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
    // Which round's countdown (keyed by its server start time) has reached 0.
    const [countdownDoneKey, setCountdownDoneKey] = useState<number | null>(null);
    const [localStopped, setLocalStopped] = useState(false);

    const triggeredKeyRef = useRef<number | null>(null);
    const revealedKeyRef = useRef<number | null>(null);
    const autoRevealRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const busyRef = useRef(false);

    const groupRef = useRef(group);
    groupRef.current = group;

    const isHost = group?.hostId === playerId;
    const gameState =
        group?.gameState && 'phase' in group.gameState
            ? (group.gameState as TimerGameState)
            : undefined;
    const phase = gameState?.phase;
    const roundNumber = gameState?.roundNumber;
    // Unique per round — safer than roundNumber, which restarts at 1 each game.
    const countdownStartMs = toMillis(gameState?.countdownStartedAt);
    const timerStartMs = toMillis(gameState?.timerStartedAt);

    const playerIds = group?.players.map((p) => p.id) ?? [];
    const stops = gameState?.stops ?? {};
    const stoppedCount = playerIds.filter((id) => id in stops).length;
    const allStopped = playerIds.length > 0 && stoppedCount >= playerIds.length;
    const hasStopped = localStopped || playerId in stops;

    const revealOnce = (key: number) => {
        const g = groupRef.current;
        if (!g || revealedKeyRef.current === key) return;
        revealedKeyRef.current = key;
        if (autoRevealRef.current) clearTimeout(autoRevealRef.current);
        revealResults(g.id, g.players.map((p) => p.id)).catch((e) => {
            console.error(e);
            revealedKeyRef.current = null;
        });
    };

    // Reset local stop flag at the start of each round.
    useEffect(() => {
        if (phase === 'question') setLocalStopped(false);
    }, [phase, countdownStartMs]);

    // Countdown display, synced to the server's countdownStartedAt.
    useEffect(() => {
        if (phase !== 'question' || countdownStartMs === null) return;

        const key = countdownStartMs;
        const startedAt = localStartFrom(countdownStartMs);

        const tick = () => {
            const elapsedSeconds = (Date.now() - startedAt) / 1000;
            const remaining = Math.max(0, Math.ceil(COUNTDOWN_SECONDS - elapsedSeconds));
            setCountdown((prev) => (prev === remaining ? prev : remaining));
            if (remaining <= 0) {
                clearInterval(interval);
                setCountdownDoneKey(key);
            }
        };
        const interval = setInterval(tick, 200);
        tick();

        return () => clearInterval(interval);
    }, [phase, countdownStartMs]);

    // Host starts the timer once THIS round's countdown is done. Keyed by the
    // round's start time, so a leftover 0 from the previous round can't fire it.
    useEffect(() => {
        if (
            phase !== 'question' ||
            !isHost ||
            countdownStartMs === null ||
            countdownDoneKey !== countdownStartMs ||
            triggeredKeyRef.current === countdownStartMs
        ) return;

        triggeredKeyRef.current = countdownStartMs;
        const g = groupRef.current;
        if (!g) return;
        startTimer(g.id).catch((e) => {
            console.error(e);
            triggeredKeyRef.current = null;
        });
    }, [phase, isHost, countdownStartMs, countdownDoneKey]);

    // Auto-reveal at the cutoff, measured from the server's timer start.
    useEffect(() => {
        if (phase !== 'running' || !isHost || timerStartMs === null) return;

        const startedAt = localStartFrom(timerStartMs);
        const remainingMs = Math.max(0, startedAt + MAX_TIMER_MS + REVEAL_GRACE_MS - Date.now());
        autoRevealRef.current = setTimeout(() => revealOnce(timerStartMs), remainingMs);

        return () => {
            if (autoRevealRef.current) clearTimeout(autoRevealRef.current);
        };
    }, [phase, isHost, timerStartMs]);

    // Early reveal when everyone has stopped.
    useEffect(() => {
        if (!allStopped || phase !== 'running' || !isHost || timerStartMs === null) return;
        revealOnce(timerStartMs);
    }, [allStopped, phase, isHost, timerStartMs]);

    const runExclusive = async (fn: () => Promise<void>) => {
        if (busyRef.current) return;
        busyRef.current = true;
        setLoading(true);
        try {
            await fn();
        } catch (e) {
            console.error(e);
        } finally {
            busyRef.current = false;
            setLoading(false);
        }
    };

    const handleStop = async () => {
        if (!group || phase !== 'running' || hasStopped) return;
        setLocalStopped(true);
        try {
            await stopTimer(group.id, playerId);
        } catch (e) {
            console.error(e);
            setLocalStopped(false);
        }
    };

    const handleNextRound = () =>
        runExclusive(async () => {
            const g = groupRef.current;
            if (!g || !isHost) return;
            await nextRound(g.id);
        });

    const handleEndGame = () =>
        runExclusive(async () => {
            const g = groupRef.current;
            if (!g || !isHost) return;
            await endTimerGame(g);
        });

    const getRanking = () => {
        if (!gameState || !group) return [];
        return calculateRanking(gameState.finalStops ?? {}, gameState.answer, group.players);
    };

    return {
        isHost,
        gameState,
        loading,
        countdown,
        hasStopped,
        allStopped,
        timerStartMs, // pass this to useRunningDistractions as timerStartedAt
        handleStop,
        handleNextRound,
        handleEndGame,
        getRanking,
    };
};