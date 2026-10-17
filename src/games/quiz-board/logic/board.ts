// src/games/quiz-board/logic/board.ts
// Pure board-building helpers: no Firestore here, so they're easy to test.
import {
    getQuestionBank,
    generateSingleCorrectInstance,
    fitsLevel,
    LEVEL_FALLBACK,
    LEVEL_VALUES,
    QUIZ_LEVELS,
    acceptedAnswers,
    needsOptions,
    QUIZ_CATEGORIES,
} from '../../../shared/quiz';
import type {
    QuizCategory,
    QuizDifficulty,
    QuizLevel,
    QuizQuestion,
} from '../../../shared/quiz';
import type {
    QuizBoardCurrent,
    QuizBoardMode,
    QuizBoardSize,
    QuizBoardTile,
} from '../../../shared/types';

// ── BOARD SIZES ───────────────────────────────────────────────────
// One board row = one prize value. A row either uses the 6-level rule
// (`level`: tagged questions go to their own row) or simply lists the
// difficulties it draws from, best first in `fallback` if those run out.
export type BoardRow = {
    value: number;
    level?: QuizLevel;
    difficulties?: QuizDifficulty[];
    fallback?: QuizDifficulty[];
};

export const BOARD_SIZES: Record<
    QuizBoardSize,
    {
        label: string;
        emoji: string;
        blurb: string;
        categories: number;
        rows: BoardRow[];
        goldenTiles: number;     // hidden bet tiles, placed when the board is built
        doubleWhenLeft: number;  // this many tiles left → they're all worth double
    }
> = {
    quick: {
        label: 'Quick Show',
        emoji: '⚡',
        blurb: '4 categories · 20 tiles · ₹1,000–₹5,000',
        categories: 4,
        goldenTiles: 2,
        doubleWhenLeft: 3,
        rows: [
            { value: 1000, difficulties: ['easy'], fallback: ['medium'] },
            { value: 2000, difficulties: ['easy', 'medium'], fallback: ['hard'] },
            { value: 3000, difficulties: ['medium'], fallback: ['easy', 'hard'] },
            { value: 4000, difficulties: ['medium', 'hard'], fallback: ['easy'] },
            { value: 5000, difficulties: ['hard'], fallback: ['medium'] },
        ],
    },
    full: {
        label: 'Full Show',
        emoji: '📺',
        blurb: '5 categories · 30 tiles · ₹1,000–₹6,000',
        categories: 5,
        goldenTiles: 3,
        doubleWhenLeft: 4,
        rows: QUIZ_LEVELS.map((level) => ({ value: LEVEL_VALUES[level], level })),
    },
};

export const sizeOf = (size?: QuizBoardSize) => BOARD_SIZES[size ?? 'full'];

// ── DOUBLE MONEY & GOLDEN TILES ───────────────────────────────────
export const tilesLeft = (tiles: QuizBoardTile[]) => tiles.filter((t) => !t.used).length;

// The last few tiles on the board are worth double.
export const doubleMoneyActive = (tiles: QuizBoardTile[], size?: QuizBoardSize) =>
    tilesLeft(tiles) <= sizeOf(size).doubleWhenLeft;

export const topPrize = (size?: QuizBoardSize) => {
    const rows = sizeOf(size).rows;
    return rows[rows.length - 1].value;
};

export const GOLDEN_MIN_WAGER = 500;
export const GOLDEN_WAGER_STEP = 500;

// Bet up to the board's top prize (₹5,000 Quick / ₹6,000 Full), doubled
// during Double Money, whatever the player's money: one tile can swing the
// game, but never decide it on its own.
export const goldenMaxWager = (size: QuizBoardSize | undefined, double: boolean): number =>
    topPrize(size) * (double ? 2 : 1);

export const clampWager = (wager: number, max: number): number => {
    const stepped = Math.round(wager / GOLDEN_WAGER_STEP) * GOLDEN_WAGER_STEP;
    return Math.min(max, Math.max(GOLDEN_MIN_WAGER, stepped));
};

// Bump whenever a change only works if EVERY phone has it (timer and clock
// handling especially). The lobby flags phones reporting an older number.
export const QB_CLIENT_VERSION = 3;

export const DEFAULT_WINDOW_MS = 30_000;
export const LOCK_MS = 3_000;          // silent pause before the reveal
export const SEEN_HISTORY_LIMIT = 800; // ids remembered per group

// Categories that don't suit a board (riddles need thinking time, not recall).
const EXCLUDED: QuizCategory[] = ['logic'];

export const BOARD_CATEGORIES = (Object.keys(QUIZ_CATEGORIES) as QuizCategory[]).filter(
    (c) => !EXCLUDED.includes(c)
);

const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

export const randomCategories = (count = BOARD_SIZES.full.categories): QuizCategory[] =>
    shuffle(BOARD_CATEGORIES).slice(0, count);

const byId = (): Map<string, QuizQuestion> =>
    new Map(getQuestionBank().map((q) => [q.id, q]));

export const findQuestion = (id: string): QuizQuestion | undefined => byId().get(id);

// Normalised prompt — the same question can exist twice under different ids.
const promptKey = (q: QuizQuestion) => q.prompt.trim().toLowerCase();

// Best question for one tile. Preference order:
//   1. right difficulty for the row, never seen by this group
//   2. right difficulty, seen before (oldest first)
//   3. the row's fallback difficulties, same order
// Questions already on this board (by id or prompt) are never reused.
export const pickQuestionForTile = (
    category: QuizCategory,
    row: BoardRow,
    seenIds: string[],
    takenIds: Set<string>,
    takenPrompts: Set<string>,
    mode: QuizBoardMode = 'options'
): QuizQuestion | null => {
    const bank = getQuestionBank().filter(
        (q) =>
            q.category === category &&
            !takenIds.has(q.id) &&
            !takenPrompts.has(promptKey(q)) &&
            // buzzer mode has no options on screen: skip "which of these…"
            (mode === 'options' || !needsOptions(q))
    );
    const seenAt = new Map(seenIds.map((id, i) => [id, i]));

    const choose = (pool: QuizQuestion[]): QuizQuestion | null => {
        if (pool.length === 0) return null;
        const fresh = pool.filter((q) => !seenAt.has(q.id));
        if (fresh.length > 0) return shuffle(fresh)[0];
        // everything seen: play the one seen longest ago
        return [...pool].sort((a, b) => (seenAt.get(a.id) ?? 0) - (seenAt.get(b.id) ?? 0))[0];
    };

    if (row.level) {
        const exact = choose(bank.filter((q) => fitsLevel(q, row.level!)));
        if (exact) return exact;
        for (const difficulty of LEVEL_FALLBACK[row.level]) {
            const q = choose(bank.filter((x) => x.difficulty === difficulty));
            if (q) return q;
        }
        return null;
    }
    const wanted = row.difficulties ?? [];
    const exact = choose(bank.filter((q) => wanted.includes(q.difficulty)));
    if (exact) return exact;
    for (const difficulty of row.fallback ?? []) {
        const q = choose(bank.filter((x) => x.difficulty === difficulty));
        if (q) return q;
    }
    return null;
};

// Builds the whole board, row-major (cheapest row first). A tile's `level`
// is its row number on this board (1 = top/cheapest).
export const buildBoard = (
    categories: QuizCategory[],
    seenIds: string[],
    size: QuizBoardSize = 'full',
    mode: QuizBoardMode = 'options'
): QuizBoardTile[] => {
    const takenIds = new Set<string>();
    const takenPrompts = new Set<string>();
    const tiles: QuizBoardTile[] = [];
    const questions = byId();

    const goldenSlots = new Set(
        shuffle(Array.from({ length: categories.length * sizeOf(size).rows.length }, (_, i) => i))
            .slice(0, sizeOf(size).goldenTiles)
    );

    sizeOf(size).rows.forEach((row, r) => {
        for (const category of categories) {
            const q = pickQuestionForTile(category, row, seenIds, takenIds, takenPrompts, mode);
            if (!q) throw new Error(`No question available for ${category} row ${r + 1}`);
            takenIds.add(q.id);
            takenPrompts.add(promptKey(questions.get(q.id)!));
            const isGolden = goldenSlots.has(tiles.length);
            tiles.push({
                category,
                level: r + 1,
                value: row.value,
                questionId: q.id,
                used: false,
                ...(isGolden ? { golden: true } : {}),
            });
        }
    });
    return tiles;
};

// A fresh question for a tile whose round was voided.
export const replacementQuestionId = (
    tiles: QuizBoardTile[],
    tileIndex: number,
    seenIds: string[],
    size: QuizBoardSize = 'full',
    mode: QuizBoardMode = 'options'
): string | null => {
    const tile = tiles[tileIndex];
    const row = sizeOf(size).rows[tile.level - 1];
    if (!row) return null;
    const questions = byId();
    const takenIds = new Set(tiles.map((t) => t.questionId));
    const takenPrompts = new Set(
        tiles
            .map((t) => questions.get(t.questionId))
            .filter((q): q is QuizQuestion => !!q)
            .map(promptKey)
    );
    const q = pickQuestionForTile(
        tile.category,
        row,
        seenIds,
        takenIds,
        takenPrompts,
        mode
    );
    return q?.id ?? null;
};

// Resolves placeholders and picks 4 options (exactly one correct).
export const instanceForTile = (tile: QuizBoardTile, tileIndex: number): QuizBoardCurrent => {
    const q = findQuestion(tile.questionId);
    if (!q) throw new Error(`Question ${tile.questionId} is missing from the bank`);
    const inst = generateSingleCorrectInstance(q);
    const correct = inst.options.find((o) => o.correct);
    const answer = correct?.text ?? '';
    const also = acceptedAnswers(q).filter((a) => a !== answer);
    return {
        tileIndex,
        questionId: q.id,
        prompt: inst.prompt,
        options: inst.options,
        answer,
        ...(also.length ? { alsoAccepted: also } : {}),
    };
};

export const appendSeen = (seen: string[] | undefined, ids: string[]): string[] => {
    const set = new Set(ids);
    return [...(seen ?? []).filter((id) => !set.has(id)), ...ids].slice(-SEEN_HISTORY_LIMIT);
};
