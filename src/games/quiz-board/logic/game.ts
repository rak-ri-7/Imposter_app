// src/games/quiz-board/logic/game.ts
// Every write goes through a transaction that re-checks the phase first, so
// a late tap or a second device acting at the same moment is a no-op.
import {
    doc,
    runTransaction,
    serverTimestamp,
    increment,
    Timestamp,
    Transaction,
} from 'firebase/firestore';
import { db } from '../../../shared/firebase/config';
import { returnToMenu } from '../../../shared/firebase/groups';
import type {
    Group,
    QuizBoardGameState,
    QuizBoardMode,
    QuizBoardRound,
} from '../../../shared/types';
import type { QuizCategory } from '../../../shared/quiz';
import {
    appendSeen,
    buildBoard,
    instanceForTile,
    replacementQuestionId,
    DEFAULT_WINDOW_MS,
    LOCK_MS,
} from './board';

export const toMillis = (ts: Timestamp | number | null | undefined): number | null => {
    if (!ts) return null;
    if (typeof ts === 'number') return ts;
    return typeof ts.toMillis === 'function' ? ts.toMillis() : null;
};

// Buzz queue in server-time order. Buzzes the server hasn't stamped yet
// (null for a moment after tapping) go last until they resolve.
export const buzzOrder = (buzzes: QuizBoardGameState['buzzes']): string[] =>
    Object.entries(buzzes ?? {})
        .map(([id, ts]) => ({ id, ms: toMillis(ts) }))
        .sort((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity))
        .map((b) => b.id);

export const isQuizBoardState = (gs: unknown): gs is QuizBoardGameState =>
    !!gs && (gs as { game?: string }).game === 'quiz-board';

const read = async (tx: Transaction, groupId: string) => {
    const groupRef = doc(db, 'groups', groupId);
    const snap = await tx.get(groupRef);
    if (!snap.exists()) return null;
    const data = snap.data() as Group;
    if (!isQuizBoardState(data.gameState)) return null;
    return { groupRef, data, gs: data.gameState };
};

// ── START ───────────────────────────────────────────────────────────

export const startQuizBoard = async (
    group: Group,
    settings: { mode: QuizBoardMode; categories: QuizCategory[] }
): Promise<void> => {
    const tiles = buildBoard(settings.categories, group.quizSeenIds ?? []);
    const players = group.players;
    const picker = players[Math.floor(Math.random() * players.length)];

    const gameState: QuizBoardGameState = {
        game: 'quiz-board',
        mode: settings.mode,
        phase: 'board',
        categories: settings.categories,
        tiles,
        pickerId: picker.id,
        current: null,
        windowMs: DEFAULT_WINDOW_MS,
        endsAt: null,
        isPaused: false,
        pausedRemainingMs: null,
        lockEndsAt: null,
        forceEnded: false,
        buzzes: {},
        picks: {},
        money: Object.fromEntries(players.map((p) => [p.id, 0])),
        rounds: [],
        pointsAwarded: false,
    };

    await runTransaction(db, async (tx) => {
        const groupRef = doc(db, 'groups', group.id);
        const snap = await tx.get(groupRef);
        if (!snap.exists()) return;
        const data = snap.data() as Group;
        if (data.currentGame !== 'quiz-board' || isQuizBoardState(data.gameState)) return;
        tx.update(groupRef, { status: 'running', gameState });
    });
};

// ── PICK A TILE ─────────────────────────────────────────────────────

export const pickTile = async (
    groupId: string,
    playerId: string,
    tileIndex: number,
    serverNow: number
): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const cur = await read(tx, groupId);
        if (!cur) return;
        const { gs, data, groupRef } = cur;
        if (gs.phase !== 'board') return;
        if (playerId !== gs.pickerId && playerId !== data.hostId) return;
        const tile = gs.tiles[tileIndex];
        if (!tile || tile.used) return;

        const current = instanceForTile(tile, tileIndex);
        tx.update(groupRef, {
            'gameState.phase': 'question',
            'gameState.current': current,
            'gameState.endsAt': serverNow + gs.windowMs,
            'gameState.isPaused': false,
            'gameState.pausedRemainingMs': null,
            'gameState.lockEndsAt': null,
            'gameState.forceEnded': false,
            'gameState.buzzes': {},
            'gameState.picks': {},
            quizSeenIds: appendSeen(data.quizSeenIds, [tile.questionId]),
        });
    });
};

// ── DURING THE QUESTION ─────────────────────────────────────────────

export const buzzIn = async (groupId: string, playerId: string): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const cur = await read(tx, groupId);
        if (!cur) return;
        const { gs, groupRef } = cur;
        if (gs.phase !== 'question' || gs.isPaused || gs.mode !== 'buzzer') return;
        if (gs.buzzes && playerId in gs.buzzes) return;
        tx.update(groupRef, { [`gameState.buzzes.${playerId}`]: serverTimestamp() });
    });
};

export const pickOption = async (
    groupId: string,
    playerId: string,
    option: number
): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const cur = await read(tx, groupId);
        if (!cur) return;
        const { gs, groupRef } = cur;
        if (gs.phase !== 'question' || gs.isPaused || gs.mode !== 'options') return;
        if (gs.picks && playerId in gs.picks) return;
        tx.update(groupRef, {
            [`gameState.picks.${playerId}`]: { option, at: serverTimestamp() },
        });
    });
};

export const pauseQuestion = async (groupId: string, serverNow: number): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const cur = await read(tx, groupId);
        if (!cur) return;
        const { gs, groupRef } = cur;
        if (gs.phase !== 'question' || gs.isPaused || !gs.endsAt) return;
        tx.update(groupRef, {
            'gameState.isPaused': true,
            'gameState.pausedRemainingMs': Math.max(0, gs.endsAt - serverNow),
        });
    });
};

export const resumeQuestion = async (groupId: string, serverNow: number): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const cur = await read(tx, groupId);
        if (!cur) return;
        const { gs, groupRef } = cur;
        if (gs.phase !== 'question' || !gs.isPaused) return;
        tx.update(groupRef, {
            'gameState.isPaused': false,
            'gameState.endsAt': serverNow + (gs.pausedRemainingMs ?? 0),
            'gameState.pausedRemainingMs': null,
        });
    });
};

// Timer ran out, everyone answered, or the host ended it early.
export const closeQuestion = async (
    groupId: string,
    serverNow: number,
    forced: boolean
): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const cur = await read(tx, groupId);
        if (!cur) return;
        const { gs, groupRef } = cur;
        if (gs.phase !== 'question') return;
        tx.update(groupRef, {
            'gameState.phase': 'locking',
            'gameState.lockEndsAt': serverNow + LOCK_MS,
            'gameState.isPaused': false,
            'gameState.forceEnded': forced,
        });
    });
};

// ── SCORING ─────────────────────────────────────────────────────────

const buzzerDeltas = (order: string[], winnerId: string | null, value: number) => {
    const deltas: Record<string, number> = {};
    for (const id of order) deltas[id] = id === winnerId ? value : -value;
    return deltas;
};

// Writes a finished round: money, tile, next picker, phase 'result'.
const finishRound = (
    tx: Transaction,
    cur: NonNullable<Awaited<ReturnType<typeof read>>>,
    round: QuizBoardRound
) => {
    const { gs, groupRef } = cur;
    const tiles = gs.tiles.map((t, i) => (i === round.tileIndex ? { ...t, used: true } : t));
    const updates: Record<string, unknown> = {
        'gameState.phase': 'result',
        'gameState.tiles': tiles,
        'gameState.rounds': [...(gs.rounds ?? []), round],
        'gameState.pickerId': round.winnerId ?? gs.pickerId,
    };
    for (const [id, d] of Object.entries(round.deltas)) {
        if (d !== 0) updates[`gameState.money.${id}`] = increment(d);
    }
    tx.update(groupRef, updates);
};

// After the silent pause: options mode scores itself; buzzer mode goes to
// the host's judging screen (or straight to the result if nobody buzzed).
export const revealAnswer = async (groupId: string): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const cur = await read(tx, groupId);
        if (!cur) return;
        const { gs, groupRef } = cur;
        if (gs.phase !== 'locking' || !gs.current) return;
        const tile = gs.tiles[gs.current.tileIndex];

        const base = {
            tileIndex: gs.current.tileIndex,
            questionId: gs.current.questionId,
            value: tile.value,
            answer: gs.current.answer,
            mode: gs.mode,
            forceEnded: !!gs.forceEnded,
            pickerBefore: gs.pickerId,
        };

        if (gs.mode === 'buzzer') {
            const order = buzzOrder(gs.buzzes);
            if (order.length > 0) {
                tx.update(groupRef, { 'gameState.phase': 'judging' });
                return;
            }
            finishRound(tx, cur, { ...base, winnerId: null, deltas: {}, buzzOrder: [] });
            return;
        }

        // Options: fastest correct wins the tile value, every wrong pick
        // loses it, slower correct picks and non-answers are 0.
        const correctIndex = gs.current.options.findIndex((o) => o.correct);
        const entries = Object.entries(gs.picks ?? {}).map(([id, p]) => ({
            id,
            option: p.option,
            ms: toMillis(p.at) ?? Infinity,
        }));
        const winner =
            entries
                .filter((e) => e.option === correctIndex)
                .sort((a, b) => a.ms - b.ms)[0]?.id ?? null;
        const deltas: Record<string, number> = {};
        for (const e of entries) {
            if (e.option !== correctIndex) deltas[e.id] = -tile.value;
            else if (e.id === winner) deltas[e.id] = tile.value;
        }
        finishRound(tx, cur, {
            ...base,
            winnerId: winner,
            deltas,
            buzzOrder: [],
            picks: Object.fromEntries(entries.map((e) => [e.id, e.option])),
        });
    });
};

// Buzzer mode: the host names the one player who was right (or nobody).
export const judgeRound = async (groupId: string, winnerId: string | null): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const cur = await read(tx, groupId);
        if (!cur) return;
        const { gs } = cur;
        if (gs.phase !== 'judging' || !gs.current) return;
        const order = buzzOrder(gs.buzzes);
        if (winnerId && !order.includes(winnerId)) return;
        const tile = gs.tiles[gs.current.tileIndex];
        finishRound(tx, cur, {
            tileIndex: gs.current.tileIndex,
            questionId: gs.current.questionId,
            value: tile.value,
            answer: gs.current.answer,
            mode: 'buzzer',
            winnerId,
            deltas: buzzerDeltas(order, winnerId, tile.value),
            buzzOrder: order,
            forceEnded: !!gs.forceEnded,
            pickerBefore: gs.pickerId,
        });
    });
};

// ── AFTER THE ROUND: review, correct, void ──────────────────────────
// All of these act on the latest round, and only until the next tile is
// picked (phase 'result' or 'board').

const lastRoundCtx = async (tx: Transaction, groupId: string) => {
    const cur = await read(tx, groupId);
    if (!cur) return null;
    const { gs } = cur;
    if (gs.phase !== 'result' && gs.phase !== 'board') return null;
    const rounds = gs.rounds ?? [];
    const round = rounds[rounds.length - 1];
    if (!round || round.voided) return null;
    return { ...cur, rounds, round, index: rounds.length - 1 };
};

const withRound = (rounds: QuizBoardRound[], index: number, round: QuizBoardRound) =>
    rounds.map((r, i) => (i === index ? round : r));

// "Review" is only a nudge to the host — it changes nothing by itself.
export const requestReview = async (groupId: string, playerId: string): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const ctx = await lastRoundCtx(tx, groupId);
        if (!ctx || ctx.round.mode !== 'buzzer' || playerId === ctx.data.hostId) return;
        const reviewBy = ctx.round.reviewBy ?? [];
        if (reviewBy.includes(playerId)) return;
        tx.update(ctx.groupRef, {
            'gameState.rounds': withRound(ctx.rounds, ctx.index, {
                ...ctx.round,
                reviewBy: [...reviewBy, playerId],
                reviewSeen: false,
            }),
        });
    });
};

export const dismissReview = async (groupId: string): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const ctx = await lastRoundCtx(tx, groupId);
        if (!ctx) return;
        tx.update(ctx.groupRef, {
            'gameState.rounds': withRound(ctx.rounds, ctx.index, {
                ...ctx.round,
                reviewSeen: true,
            }),
        });
    });
};

// Host corrects a buzzer-mode call. Money moves by the difference between
// the new and old result, so nothing is applied twice.
export const correctRound = async (groupId: string, winnerId: string | null): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const ctx = await lastRoundCtx(tx, groupId);
        if (!ctx || ctx.round.mode !== 'buzzer') return;
        const { round, gs } = ctx;
        if (winnerId === round.winnerId) return;
        if (winnerId && !round.buzzOrder.includes(winnerId)) return;

        const deltas = buzzerDeltas(round.buzzOrder, winnerId, round.value);
        const updates: Record<string, unknown> = {
            'gameState.rounds': withRound(ctx.rounds, ctx.index, {
                ...round,
                winnerId,
                deltas,
                changed: true,
                reviewSeen: true,
            }),
            // whoever is now right picks next; nobody right → back to the
            // player who picked this tile
            'gameState.pickerId': winnerId ?? round.pickerBefore ?? gs.pickerId,
        };
        const ids = new Set([...Object.keys(deltas), ...Object.keys(round.deltas)]);
        for (const id of ids) {
            const diff = (deltas[id] ?? 0) - (round.deltas[id] ?? 0);
            if (diff !== 0) updates[`gameState.money.${id}`] = increment(diff);
        }
        tx.update(ctx.groupRef, updates);
    });
};

// Undo the round completely. Everyone has seen the answer, so the tile
// reopens with a different question from the same category and row.
export const voidRound = async (groupId: string): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const ctx = await lastRoundCtx(tx, groupId);
        if (!ctx) return;
        const { round, gs, data } = ctx;

        const newId = replacementQuestionId(gs.tiles, round.tileIndex, data.quizSeenIds ?? []);
        const tiles = gs.tiles.map((t, i) =>
            i === round.tileIndex
                ? { ...t, used: false, questionId: newId ?? t.questionId }
                : t
        );
        const updates: Record<string, unknown> = {
            'gameState.tiles': tiles,
            'gameState.rounds': withRound(ctx.rounds, ctx.index, {
                ...round,
                voided: true,
                reviewSeen: true,
            }),
            'gameState.pickerId': round.pickerBefore ?? gs.pickerId,
        };
        for (const [id, d] of Object.entries(round.deltas)) {
            if (d !== 0) updates[`gameState.money.${id}`] = increment(-d);
        }
        tx.update(ctx.groupRef, updates);
    });
};

// ── MOVING ON ───────────────────────────────────────────────────────

export const continueToBoard = async (groupId: string): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const cur = await read(tx, groupId);
        if (!cur) return;
        const { gs, data, groupRef } = cur;
        if (gs.phase !== 'result') return;
        const done = gs.tiles.every((t) => t.used);
        const pickerHere = data.players.some((p) => p.id === gs.pickerId);
        tx.update(groupRef, {
            'gameState.phase': done ? 'final' : 'board',
            'gameState.current': null,
            'gameState.endsAt': null,
            'gameState.lockEndsAt': null,
            'gameState.buzzes': {},
            'gameState.picks': {},
            'gameState.pickerId': pickerHere ? gs.pickerId : data.hostId,
        });
    });
};

export const endBoardEarly = async (groupId: string): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const cur = await read(tx, groupId);
        if (!cur) return;
        const { gs, groupRef } = cur;
        if (gs.phase !== 'board' && gs.phase !== 'result') return;
        tx.update(groupRef, {
            'gameState.phase': 'final',
            'gameState.current': null,
        });
    });
};

// ── STANDINGS & FINISH ──────────────────────────────────────────────

export type Standing = { playerId: string; money: number; rank: number; points: number };

// Rank by rupees (ties share a rank). Leaderboard points follow placing,
// like Stop the Timer, so a rupee-sized score can't swamp the other games.
export const standings = (
    money: Record<string, number>,
    players: { id: string }[]
): Standing[] => {
    const rows = players
        .map((p) => ({ playerId: p.id, money: money?.[p.id] ?? 0, rank: 0, points: 0 }))
        .sort((a, b) => b.money - a.money);
    rows.forEach((r, i) => {
        const prev = rows[i - 1];
        r.rank = prev && prev.money === r.money ? prev.rank : i + 1;
        r.points = Math.max(0, rows.length - r.rank);
    });
    return rows;
};

// Adds leaderboard points exactly once, then returns everyone to the menu.
export const finishQuizBoard = async (group: Group): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const cur = await read(tx, group.id);
        if (!cur) return;
        const { gs, data, groupRef } = cur;
        if (gs.pointsAwarded) return;
        const updates: Record<string, unknown> = { 'gameState.pointsAwarded': true };
        // Only award a game that was actually played.
        if ((gs.rounds ?? []).some((r) => !r.voided)) {
            for (const s of standings(gs.money, data.players)) {
                if (s.points > 0) updates[`scores.${s.playerId}`] = increment(s.points);
            }
        }
        tx.update(groupRef, updates);
    });
    await returnToMenu(group.id);
};
