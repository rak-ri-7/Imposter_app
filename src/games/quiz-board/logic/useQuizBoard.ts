// src/games/quiz-board/logic/useQuizBoard.ts
// One hook for every Quiz Board screen: derived state, a server-synced
// clock, and the host's automatic steps (timer out → lock → reveal).
import { useEffect, useRef, useState } from 'react';
import type { Group, QuizBoardGameState } from '../../../shared/types';
import { getServerNow, resyncServerTimeOffset } from '../../../shared/firebase/time';
import { playSound } from '../../../shared/sounds/soundManager';
import {
    buzzOrder,
    closeQuestion,
    deadlineOf,
    isQuizBoardState,
    isStamped,
    restampQuestion,
    revealAnswer,
    toMillis,
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

    // Deadlines corrected for the clock error of whichever phone wrote them.
    const endsAt = gs ? deadlineOf(gs, gs.endsAt) : null;
    const lockEndsAt = gs ? deadlineOf(gs, gs.lockEndsAt) : null;
    const clockAtMs = gs ? toMillis(gs.clockAt) : null;

    const remainingMs =
        gs && phase === 'question'
            ? gs.isPaused
                ? gs.pausedRemainingMs ?? 0
                : Math.min(gs.windowMs, Math.max(0, (endsAt ?? 0) - now))
            : 0;

    // TEMP debug: one line per question so a clock problem shows in the terminal.
    useEffect(() => {
        if (!__DEV__ || !gs || phase !== 'question') return;
        const t = getServerNow();
        console.log(
            `[quiz-clock] me=${playerId.slice(0, 5)} host=${isHost} rawEndsAt=${gs.endsAt} ` +
                `fixedEndsAt=${endsAt} serverNow=${t} secsLeft=${endsAt ? Math.round((endsAt - t) / 1000) : 'n/a'} ` +
                `skew=${endsAt && gs.endsAt ? endsAt - gs.endsAt : 0} localDiff=${t - Date.now()} paused=${!!gs.isPaused}`
        );
    }, [phase, gs?.current?.questionId, clockAtMs]);

    // A fresh server timestamp just arrived, so server time is about that
    // right now. If this phone's clock disagrees by more than a few seconds,
    // re-measure it (rate-limited inside).
    useEffect(() => {
        if (!group || clockAtMs === null) return;
        const diff = getServerNow() - clockAtMs;
        if (diff < -1500 || diff > 3000) resyncServerTimeOffset(group.id);
    }, [clockAtMs, group?.id]);

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
        const key = `${phase}:${gs.current?.questionId}:${gs.endsAt}:${gs.lockEndsAt}:${clockAtMs}`;
        const rawEndsAt = gs.endsAt ?? null;
        const rawLockEndsAt = gs.lockEndsAt ?? null;

        const check = () => {
            const t = getServerNow();
            if (actedRef.current === key) return;

            // Host: a timer from an older app version gets a fresh, trusted
            // 30s from this phone instead of possibly expiring on arrival.
            if (
                isHost &&
                phase === 'question' &&
                !gs.isPaused &&
                rawEndsAt !== null &&
                !isStamped(gs, rawEndsAt)
            ) {
                actedRef.current = key;
                if (__DEV__) console.log('[quiz-clock] restarting an unstamped timer');
                restampQuestion(group.id, t, rawEndsAt).catch(() => {
                    actedRef.current = null;
                });
                return;
            }

            if (phase === 'question' && !gs.isPaused && endsAt !== null) {
                // Golden tile: only the picker answers, so close once they have.
                const golden = gs.current?.golden;
                const everyoneAnswered =
                    gs.mode === 'options' &&
                    (golden
                        ? golden.playerId in (gs.picks ?? {})
                        : players.length > 0 &&
                          players.every((p) => p.id in (gs.picks ?? {})));
                if (t >= endsAt + grace || (isHost && everyoneAnswered)) {
                    actedRef.current = key;
                    if (__DEV__)
                        console.log(
                            `[quiz-clock] CLOSING by ${playerId.slice(0, 5)} host=${isHost} ` +
                                `reason=${t >= endsAt + grace ? 'timeout' : 'everyone-answered'} ` +
                                `secsPastDeadline=${Math.round((t - endsAt) / 1000)} picks=${Object.keys(gs.picks ?? {}).length}/${players.length}`
                        );
                    closeQuestion(group.id, t, false, rawEndsAt).catch(() => {
                        actedRef.current = null;
                    });
                }
            } else if (phase === 'locking' && lockEndsAt !== null && t >= lockEndsAt + grace) {
                actedRef.current = key;
                revealAnswer(group.id, rawLockEndsAt).catch(() => {
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
        clockAtMs,
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
