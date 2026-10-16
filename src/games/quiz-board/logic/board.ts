// src/games/quiz-board/logic/board.ts
// Pure board-building helpers: no Firestore here, so they're easy to test.
import {
    getQuestionBank,
    generateSingleCorrectInstance,
    fitsLevel,
    LEVEL_FALLBACK,
    LEVEL_VALUES,
    QUIZ_LEVELS,
    QUIZ_CATEGORIES,
} from '../../../shared/quiz';
import type { QuizCategory, QuizLevel, QuizQuestion } from '../../../shared/quiz';
import type { QuizBoardCurrent, QuizBoardTile } from '../../../shared/types';

export const MIN_CATEGORIES = 3;
export const MAX_CATEGORIES = 5;
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

export const randomCategories = (count = MAX_CATEGORIES): QuizCategory[] =>
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
    level: QuizLevel,
    seenIds: string[],
    takenIds: Set<string>,
    takenPrompts: Set<string>
): QuizQuestion | null => {
    const bank = getQuestionBank().filter(
        (q) => q.category === category && !takenIds.has(q.id) && !takenPrompts.has(promptKey(q))
    );
    const seenAt = new Map(seenIds.map((id, i) => [id, i]));

    const choose = (pool: QuizQuestion[]): QuizQuestion | null => {
        if (pool.length === 0) return null;
        const fresh = pool.filter((q) => !seenAt.has(q.id));
        if (fresh.length > 0) return shuffle(fresh)[0];
        // everything seen: play the one seen longest ago
        return [...pool].sort((a, b) => (seenAt.get(a.id) ?? 0) - (seenAt.get(b.id) ?? 0))[0];
    };

    const exact = choose(bank.filter((q) => fitsLevel(q, level)));
    if (exact) return exact;
    for (const difficulty of LEVEL_FALLBACK[level]) {
        const q = choose(bank.filter((x) => x.difficulty === difficulty));
        if (q) return q;
    }
    return null;
};

// Builds the whole board, row-major (all level-1 tiles first).
export const buildBoard = (categories: QuizCategory[], seenIds: string[]): QuizBoardTile[] => {
    const takenIds = new Set<string>();
    const takenPrompts = new Set<string>();
    const tiles: QuizBoardTile[] = [];
    const questions = byId();

    for (const level of QUIZ_LEVELS) {
        for (const category of categories) {
            const q = pickQuestionForTile(category, level, seenIds, takenIds, takenPrompts);
            if (!q) throw new Error(`No question available for ${category} level ${level}`);
            takenIds.add(q.id);
            takenPrompts.add(promptKey(questions.get(q.id)!));
            tiles.push({
                category,
                level,
                value: LEVEL_VALUES[level],
                questionId: q.id,
                used: false,
            });
        }
    }
    return tiles;
};

// A fresh question for a tile whose round was voided.
export const replacementQuestionId = (
    tiles: QuizBoardTile[],
    tileIndex: number,
    seenIds: string[]
): string | null => {
    const tile = tiles[tileIndex];
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
        tile.level as QuizLevel,
        seenIds,
        takenIds,
        takenPrompts
    );
    return q?.id ?? null;
};

// Resolves placeholders and picks 4 options (exactly one correct).
export const instanceForTile = (tile: QuizBoardTile, tileIndex: number): QuizBoardCurrent => {
    const q = findQuestion(tile.questionId);
    if (!q) throw new Error(`Question ${tile.questionId} is missing from the bank`);
    const inst = generateSingleCorrectInstance(q);
    const correct = inst.options.find((o) => o.correct);
    return {
        tileIndex,
        questionId: q.id,
        prompt: inst.prompt,
        options: inst.options,
        answer: correct?.text ?? '',
    };
};

export const appendSeen = (seen: string[] | undefined, ids: string[]): string[] => {
    const set = new Set(ids);
    return [...(seen ?? []).filter((id) => !set.has(id)), ...ids].slice(-SEEN_HISTORY_LIMIT);
};
