// src/games/quiz-board/logic/useQuizBoard.ts
// One hook for every Quiz Board screen: derived state, a server-synced
// clock, and the host's automatic steps (timer out → lock → reveal).
import { useEffect, useRef, useState } from 'react';
import type { Group, QuizBoardGameState } from '../../../shared/types';
import { getServerNow } from '../../../shared/firebase/time';
import { playSound } from '../../../shared/sounds/soundManager';
import {
    buzzOrder,
    closeQuestion,
    isQuizBoardState,
    revealAnswer,
} from './game';

// Other phones step in if the host's phone hasn't acted this long after
// a deadline (asleep, backgrounded, dropped).
const BACKUP_GRACE_MS = 4000;

export const useQuizBoard = (group: Group | null, playerId: string) => {
    const gs: QuizBoardGameState | null =
        group && isQuizBoardState(group.gameState) ? group.gameState : null;
    const isHost = group?.hostId === playerId;
    const phase = gs?.phase;

    // ── clock ────────────────────────────────────────────────────────
    const [now, setNow] = useState(getServerNow());
    const ticking = phase === 'question' || phase === 'locking';
    useEffect(() => {
        if (!ticking) return;
        setNow(getServerNow());
        const t = setInterval(() => setNow(getServerNow()), 200);
        return () => clearInterval(t);
    }, [ticking]);

    const remainingMs =
        gs && phase === 'question'
            ? gs.isPaused
                ? gs.pausedRemainingMs ?? 0
                : Math.max(0, (gs.endsAt ?? 0) - now)
            : 0;

    // ── derived ──────────────────────────────────────────────────────
    const players = group?.players ?? [];
    const allPeople = [...players, ...(group?.benchedPlayers ?? [])];
    const nameOf = (id: string | null | undefined) =>
        (id && allPeople.find((p) => p.id === id)?.name) || 'Someone';

    const queue = gs ? buzzOrder(gs.buzzes) : [];
    const hasBuzzed = !!gs && playerId in (gs.buzzes ?? {});
    const myPick = gs?.picks?.[playerId]?.option;
    const answeredCount = gs ? Object.keys(gs.picks ?? {}).length : 0;
    const lastRound = gs?.rounds?.[gs.rounds.length - 1];
    const canPick = !!gs && phase === 'board' && (playerId === gs.pickerId || isHost);

    // ── host automation (with backup from other phones) ──────────────
    const actedRef = useRef<string | null>(null);
    useEffect(() => {
        if (!group || !gs) return;
        const grace = isHost ? 0 : BACKUP_GRACE_MS;
        const key = `${phase}:${gs.current?.questionId}:${gs.endsAt}:${gs.lockEndsAt}`;

        const check = () => {
            const t = getServerNow();
            if (actedRef.current === key) return;

            if (phase === 'question' && !gs.isPaused && gs.endsAt) {
                const everyoneAnswered =
                    gs.mode === 'options' &&
                    players.length > 0 &&
                    players.every((p) => p.id in (gs.picks ?? {}));
                if (t >= gs.endsAt + grace || (isHost && everyoneAnswered)) {
                    actedRef.current = key;
                    closeQuestion(group.id, t, false).catch(() => {
                        actedRef.current = null;
                    });
                }
            } else if (phase === 'locking' && gs.lockEndsAt && t >= gs.lockEndsAt + grace) {
                actedRef.current = key;
                revealAnswer(group.id).catch(() => {
                    actedRef.current = null;
                });
            }
        };
        check();
        const interval = setInterval(check, 250);
        return () => clearInterval(interval);
    }, [
        group?.id,
        isHost,
        phase,
        gs?.endsAt,
        gs?.lockEndsAt,
        gs?.isPaused,
        gs?.current?.questionId,
        answeredCount,
        players.length,
    ]);

    // ── sounds ───────────────────────────────────────────────────────
    const prevPhase = useRef(phase);
    useEffect(() => {
        const prev = prevPhase.current;
        prevPhase.current = phase;
        if (phase === 'result' && prev !== 'result' && lastRound) {
            const d = lastRound.deltas?.[playerId] ?? 0;
            if (d > 0) playSound('right-answer');
            else if (d < 0) playSound('wrong-answer');
        }
    }, [phase]);

    return {
        groupId: group?.id ?? '',
        gs,
        isHost,
        phase,
        now,
        remainingMs,
        queue,
        hasBuzzed,
        myPick,
        answeredCount,
        lastRound,
        canPick,
        nameOf,
        players,
    };
};

export type QuizBoardCtx = ReturnType<typeof useQuizBoard>;
