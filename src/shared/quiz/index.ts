import type {
    QuizQuestion,
    QuizOption,
    QuizInstance,
    QuizDifficulty,
    QuizLevel,
    QuizCategory,
    QuestionFilter,
} from './types';
import { QUIZ_CATEGORIES } from './types';
import { quizQuestions } from './bank';

export * from './types';
export { quizQuestions };

// The bank games draw from. Built into the app today; call setQuestionBank()
// at startup to swap in a downloaded bank later — nothing else changes.
let activeBank: QuizQuestion[] = quizQuestions;
export const setQuestionBank = (questions: QuizQuestion[]): void => {
    if (questions.length > 0) activeBank = questions;
};
export const getQuestionBank = (): QuizQuestion[] => activeBank;

// Fisher-Yates — every ordering is equally likely
const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

const pickRandomSample = <T,>(pool: T[], n: number): T[] =>
    shuffle(pool).slice(0, Math.min(n, pool.length));

export const generateSingleCorrectInstance = (question: QuizQuestion): QuizInstance => {
    const { resolvedPrompt, isNegative } = resolvePromptPlaceholders(question.prompt);

    const effectiveCorrectPool = isNegative ? question.wrongPool : question.correctPool;
    const effectiveWrongPool = isNegative ? question.correctPool : question.wrongPool;

    const correct = pickRandomSample(effectiveCorrectPool, 1)[0];
    const wrongPicks = pickRandomSample(effectiveWrongPool, 3);

    const options = shuffle([
        { text: correct, correct: true },
        ...wrongPicks.map((text) => ({ text, correct: false })),
    ]);

    return {
        questionId: question.id,
        prompt: resolvedPrompt,
        options,
    };
};

// ── PROMPT PLACEHOLDERS ─────────────────────────────────────────────
// 1. Flavor tokens (e.g. [PERCENTAGE]) — text substitution only.
// 2. Polarity tokens (e.g. [IS_OR_IS_NOT]) — if a negative value is
//    rolled, correctPool/wrongPool swap for that instance.
//    RULE: any question using a polarity token needs BOTH pools to have
//    >= 3 entries, and every entry must be unambiguously true or false.
export type PromptPlaceholder = {
    token: string;
    values: string[];
    negativeValues?: string[];
};

export const promptPlaceholders: Record<string, PromptPlaceholder> = {
    '[NOT_A]': {
        token: '[NOT_A]',
        values: ['A', 'Not a'],
        negativeValues: ['Not a'],
    },
    '[NOT_AN]': {
        token: '[NOT_AN]',
        values: ['An', 'Not an'],
        negativeValues: ['Not an'],
    },
    '[IS_OR_IS_NOT]': {
        token: '[IS_OR_IS_NOT]',
        values: ['is', 'is not'],
        negativeValues: ['is not'],
    },
    '[NOT_BLANK]': {
        token: '[NOT_BLANK]',
        values: ['', 'not '],
        negativeValues: ['not '],
    },
    '[CAN_CANNOT]': {
        token: '[CAN_CANNOT]',
        values: ['can', 'cannot'],
        negativeValues: ['cannot'],
    },
    '[HAVE_DO_NOT]': {
        token: '[HAVE_DO_NOT]',
        values: ['have', 'do not have'],
        negativeValues: ['do not have'],
    },
    // flavor only — never trigger a pool swap
    '[PERCENTAGE]': {
        token: '[PERCENTAGE]',
        values: ['10%', '20%', '25%', '30%', '40%', '50%', '60%', '75%'],
    },
    '[COLOR]': {
        token: '[COLOR]',
        values: ['red', 'blue', 'green', 'yellow'],
    },
};

const TOKEN_REGEX = /\[[A-Z_]+\]/g;

const resolvePromptPlaceholders = (
    prompt: string
): { resolvedPrompt: string; isNegative: boolean } => {
    let isNegative = false;
    const resolvedPrompt = prompt.replace(TOKEN_REGEX, (token) => {
        const def = promptPlaceholders[token];
        if (!def) return token;
        const value = def.values[Math.floor(Math.random() * def.values.length)];
        if (def.negativeValues?.includes(value)) isNegative = true;
        return value;
    });
    return { resolvedPrompt, isNegative };
};

const CORRECT_COUNT_WEIGHTS = [2, 2, 2, 3, 3, 3, 1];

export const generateQuizInstance = (question: QuizQuestion): QuizInstance => {
    const { resolvedPrompt, isNegative } = resolvePromptPlaceholders(question.prompt);

    const effectiveCorrectPool = isNegative ? question.wrongPool : question.correctPool;
    const effectiveWrongPool = isNegative ? question.correctPool : question.wrongPool;

    let correctCount =
        CORRECT_COUNT_WEIGHTS[Math.floor(Math.random() * CORRECT_COUNT_WEIGHTS.length)];

    correctCount = Math.min(correctCount, effectiveCorrectPool.length, 3);
    correctCount = Math.max(correctCount, 1);

    let wrongCount = 4 - correctCount;
    if (wrongCount > effectiveWrongPool.length) {
        wrongCount = Math.max(1, effectiveWrongPool.length);
        correctCount = Math.min(4 - wrongCount, effectiveCorrectPool.length);
    }

    const correctPicks: QuizOption[] = pickRandomSample(effectiveCorrectPool, correctCount)
        .map((text) => ({ text, correct: true }));
    const wrongPicks: QuizOption[] = pickRandomSample(effectiveWrongPool, wrongCount)
        .map((text) => ({ text, correct: false }));

    return {
        questionId: question.id,
        prompt: resolvedPrompt,
        options: shuffle([...correctPicks, ...wrongPicks]),
    };
};


const difficultyMatches = (q: QuizQuestion, d?: QuizDifficulty | QuizDifficulty[]) =>
    !d || (Array.isArray(d) ? d.includes(q.difficulty) : q.difficulty === d);

// Picks an unused question matching the filter. If every match has been
// used, matches can repeat. If nothing matches at all, the category is
// dropped first, then the difficulty — so a game never runs dry.
export const getRandomQuestion = (usedIds: string[], filter: QuestionFilter = {}): QuizQuestion => {
    const matching = (f: QuestionFilter) =>
        activeBank.filter(
            (q) => difficultyMatches(q, f.difficulty) && (!f.category || q.category === f.category)
        );
    let candidates = matching(filter);
    if (candidates.length === 0) candidates = matching({ difficulty: filter.difficulty });
    if (candidates.length === 0) candidates = activeBank;

    const unused = candidates.filter((q) => !usedIds.includes(q.id));
    const pool = unused.length > 0 ? unused : candidates;
    return pool[Math.floor(Math.random() * pool.length)];
};

// How many questions each category has at a difficulty — handy for deciding
// which categories are big enough to offer as a pick.
export const countByCategory = (
    difficulty?: QuizDifficulty | QuizDifficulty[]
): Record<QuizCategory, number> => {
    const counts = Object.fromEntries(
        Object.keys(QUIZ_CATEGORIES).map((c) => [c, 0])
    ) as Record<QuizCategory, number>;
    for (const q of activeBank) {
        if (difficultyMatches(q, difficulty)) counts[q.category] += 1;
    }
    return counts;
};

// ── DEV VALIDATION ─────────────────────────────────────────────────
// Call once in dev / a unit test. Returns a list of problems (empty = OK).
export const validateQuestionBank = (questions: QuizQuestion[] = activeBank): string[] => {
    const problems: string[] = [];
    const seenIds = new Set<string>();
    const seenPrompts = new Set<string>();

    for (const q of questions) {
        if (seenIds.has(q.id)) problems.push(`${q.id}: duplicate id`);
        seenIds.add(q.id);
        if (seenPrompts.has(q.prompt)) problems.push(`${q.id}: duplicate prompt "${q.prompt}"`);
        seenPrompts.add(q.prompt);

        const tokens = q.prompt.match(TOKEN_REGEX) ?? [];
        const unknown = tokens.filter((t) => !promptPlaceholders[t]);
        if (unknown.length) problems.push(`${q.id}: unknown token(s) ${unknown.join(', ')}`);

        const hasPolarity = tokens.some((t) => promptPlaceholders[t]?.negativeValues?.length);
        if (hasPolarity && q.correctPool.length < 3)
            problems.push(`${q.id}: polarity question needs >= 3 in correctPool (has ${q.correctPool.length})`);
        if (q.wrongPool.length < 3)
            problems.push(`${q.id}: wrongPool needs >= 3 (has ${q.wrongPool.length})`);

        if (!['easy', 'medium', 'hard'].includes(q.difficulty))
            problems.push(`${q.id}: difficulty must be 'easy', 'medium' or 'hard'`);
        if (!QUIZ_CATEGORIES[q.category]) problems.push(`${q.id}: unknown category '${q.category}'`);

        const overlap = q.correctPool.filter((c) => q.wrongPool.includes(c));
        if (overlap.length) problems.push(`${q.id}: in both pools: ${overlap.join(', ')}`);
    }
    return problems;
};

// ── QUESTION BANK ─────────────────────────────────────────────────

// ── PRIZE MONEY (Jeopardy-style boards) ─────────────────────────────
// Each board row has a rupee value. The second round doubles them.
export const LEVEL_VALUES: Record<QuizLevel, number> = {
    1: 1000,
    2: 2000,
    3: 3000,
    4: 4000,
    5: 5000,
};
export const DOUBLE_ROUND_MULTIPLIER = 2;

// Until questions are tagged with a level, difficulty decides it.
const DEFAULT_LEVEL: Record<QuizDifficulty, QuizLevel> = { easy: 1, medium: 3, hard: 5 };

export const levelOf = (q: QuizQuestion): QuizLevel => q.level ?? DEFAULT_LEVEL[q.difficulty];

export const prizeFor = (q: QuizQuestion, multiplier = 1): number =>
    LEVEL_VALUES[levelOf(q)] * multiplier;

// Which levels can fill each board row, best fit first — so a category with
// no level-2 question can still fill row 2 from its neighbours.
export const ROW_LEVELS: Record<QuizLevel, QuizLevel[]> = {
    1: [1, 2],
    2: [2, 1, 3],
    3: [3, 2, 4],
    4: [4, 5, 3],
    5: [5, 4],
};

// ₹1,00,000 style (Indian digit grouping), without relying on Intl.
export const formatRupees = (amount: number): string => {
    const sign = amount < 0 ? '-' : '';
    const digits = String(Math.round(Math.abs(amount)));
    if (digits.length <= 3) return `${sign}₹${digits}`;
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return `${sign}₹${rest},${last3}`;
};
