// src/games/timer/logic/useTimerGame.ts
import { useState, useEffect, useRef } from 'react';
import { Group, TimerGameState } from '../../../shared/types';
import {
    startCountdown,
    startTimer,
    stopTimer,
    revealResults,
    nextRound,
    awardTimerPointsAndContinue,
    endTimerGame,
    calculateRanking,
} from './game';

const COUNTDOWN_SECONDS = 10;
const MAX_TIMER_SECONDS = 34;

export const useTimerGame = (group: Group | null, playerId: string) => {
    const [loading, setLoading] = useState(false);
    const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
    const [hasStopped, setHasStopped] = useState(false);
    const countdownRef = useRef<any>(null);
    const autoRevealRef = useRef<any>(null);
    const timerTriggeredRef = useRef(false);

    const isHost = group?.hostId === playerId;
    const gameState = (group?.gameState && 'phase' in group.gameState) ? group.gameState as TimerGameState | undefined : undefined;
    const totalPlayers = group?.players.length ?? 0;
    const allStopped = gameState
        ? Object.keys(gameState.stops).length >= totalPlayers
        : false;

    // Self-correcting countdown: computed from elapsed real time, not a
    // decrementing counter. This prevents drift/stalls if a tick is delayed
    // (e.g. by Firestore writes or animation work on the host device) —
    // the next tick always recalculates the true remaining time instead of
    // staying permanently behind.
    useEffect(() => {
        if (gameState?.phase !== 'question') return;

        const startedAt = Date.now();
        timerTriggeredRef.current = false;
        setCountdown(COUNTDOWN_SECONDS);

        countdownRef.current = setInterval(() => {
            const elapsedSeconds = (Date.now() - startedAt) / 1000;
            const remaining = Math.max(0, Math.ceil(COUNTDOWN_SECONDS - elapsedSeconds));

            setCountdown((prev) => (prev === remaining ? prev : remaining));

            if (remaining <= 0 && !timerTriggeredRef.current) {
                timerTriggeredRef.current = true;
                clearInterval(countdownRef.current);
                if (isHost) handleStartTimer();
            }
        }, 200); // finer tick so the display catches up quickly after any delay

        return () => clearInterval(countdownRef.current);
    }, [gameState?.phase, gameState?.roundNumber]);

    // Auto-reveal after 20s
    useEffect(() => {
        if (gameState?.phase !== 'running' || !isHost) return;

        autoRevealRef.current = setTimeout(() => {
            revealResults(group!.id, group!.players.map((p) => p.id));
        }, MAX_TIMER_SECONDS * 1000);

        return () => clearTimeout(autoRevealRef.current);
    }, [gameState?.phase]);

    // Auto-reveal when all stopped
    useEffect(() => {
        if (!allStopped || gameState?.phase !== 'running' || !isHost) return;
        clearTimeout(autoRevealRef.current);
        revealResults(group!.id, group!.players.map((p) => p.id));
    }, [allStopped, gameState?.phase]);
    // Reset hasStopped on new round
    useEffect(() => {
        if (gameState?.phase === 'question' || gameState?.phase === 'countdown') {
            setHasStopped(false);
        }
    }, [gameState?.phase, gameState?.roundNumber]);

    const handleStartCountdown = async () => {
        if (!group || !isHost) return;
        setLoading(true);
        try {
            await startCountdown(group.id);
        } finally {
            setLoading(false);
        }
    };

    const handleStartTimer = async () => {
        if (!group) return;
        try {
            await startTimer(group.id);
        } catch (e) {
            console.error(e);
        }
    };

    const handleStop = async () => {
        if (!group || !gameState || hasStopped) return;
        setHasStopped(true);
        await stopTimer(group.id, playerId); // no longer passes timerStartedAt
    };

    const handleNextRound = async () => {
        if (!group || !isHost) return;
        setLoading(true);
        try {
            await awardTimerPointsAndContinue(group, () => { });
            await nextRound(group);
        } finally {
            setLoading(false);
        }
    };

    const handleEndGame = async () => {
        if (!group || !isHost) return;
        setLoading(true);
        try {
            await awardTimerPointsAndContinue(group, () => { });
            await endTimerGame(group);
        } finally {
            setLoading(false);
        }
    };

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
        handleStartCountdown,
        handleStop,
        handleNextRound,
        handleEndGame,
        getRanking,
    };
};