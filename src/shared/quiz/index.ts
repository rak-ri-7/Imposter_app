import type {
    QuizQuestion,
    QuizOption,
    QuizInstance,
    QuizDifficulty,
    QuizLevel,
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

// ── SESSION MEMORY ─────────────────────────────────────────────────
// Every question handed out by getRandomQuestion is remembered for the life
// of the app session, across ALL trivia games, so nothing repeats until every
// question that fits the current filter has been asked. Only then does that
// pool start over (other pools keep their history).
const askedThisSession = new Set<string>();
let lastAskedId: string | null = null;

export const resetQuizSession = (): void => {
    askedThisSession.clear();
    lastAskedId = null;
};

// Picks a question matching the filter that hasn't been asked yet — neither in
// this game (usedIds) nor earlier this session. If nothing fresh is left, the
// session history for the matching questions is cleared and the pool starts
// over (never repeating the question just asked). If nothing matches at all,
// the category is dropped first, then the difficulty — so a game never runs dry.
export const getRandomQuestion = (usedIds: string[], filter: QuestionFilter = {}): QuizQuestion => {
    const matching = (f: QuestionFilter) =>
        activeBank.filter(
            (q) => difficultyMatches(q, f.difficulty) && (!f.category || q.category === f.category)
        );
    let candidates = matching(filter);
    if (candidates.length === 0) candidates = matching({ difficulty: filter.difficulty });
    if (candidates.length === 0) candidates = activeBank;

    const fresh = (q: QuizQuestion) => !askedThisSession.has(q.id) && !usedIds.includes(q.id);
    let pool = candidates.filter(fresh);
    if (pool.length === 0) {
        // Pool exhausted: forget these questions and go round again.
        for (const q of candidates) askedThisSession.delete(q.id);
        pool = candidates.filter((q) => !usedIds.includes(q.id) && q.id !== lastAskedId);
        if (pool.length === 0) pool = candidates.filter((q) => q.id !== lastAskedId);
        if (pool.length === 0) pool = candidates;
    }

    const picked = pool[Math.floor(Math.random() * pool.length)];
    askedThisSession.add(picked.id);
    lastAskedId = picked.id;
    return picked;
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
// Six board rows, two per difficulty. The second round doubles them.
export const QUIZ_LEVELS: QuizLevel[] = [1, 2, 3, 4, 5, 6];

export const LEVEL_VALUES: Record<QuizLevel, number> = {
    1: 1000,
    2: 2000,
    3: 3000,
    4: 4000,
    5: 5000,
    6: 6000,
};
// Which difficulty fills each row.
export const LEVEL_DIFFICULTY: Record<QuizLevel, QuizDifficulty> = {
    1: 'easy',
    2: 'easy',
    3: 'medium',
    4: 'medium',
    5: 'hard',
    6: 'hard',
};

// A tagged question fits only its own row; an untagged one fits either row
// of its difficulty.
export const fitsLevel = (q: QuizQuestion, level: QuizLevel): boolean =>
    q.level ? q.level === level : q.difficulty === LEVEL_DIFFICULTY[level];

// Fallback difficulties for a row, best first — used only if a category has
// nothing left at the row's own difficulty.
export const LEVEL_FALLBACK: Record<QuizLevel, QuizDifficulty[]> = {
    1: ['easy', 'medium'],
    2: ['easy', 'medium'],
    3: ['medium', 'easy', 'hard'],
    4: ['medium', 'hard', 'easy'],
    5: ['hard', 'medium'],
    6: ['hard', 'medium'],
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

// ── OPTIONS-ONLY QUESTIONS ──────────────────────────────────────────
// Questions that only make sense with the choices shown: polarity tokens
// ("[NOT_A] mammal?") or wording like "Which of these…". Games that ask
// without options (Quiz Board's buzzer mode) leave them out.
const CHOICE_TOKENS = /\[(NOT_A|NOT_AN|IS_OR_IS_NOT|NOT_BLANK|CAN_CANNOT|HAVE_DO_NOT)\]/;
const CHOICE_WORDING =
    /\b(which|what|who)\s+(one\s+)?(of|among)\s+(these|the following|them)\b|\bthe following\b|\bof these\b|\bamong these\b|\bthese\b/i;

export const needsOptions = (q: QuizQuestion): boolean =>
    !!q.optionsOnly || CHOICE_TOKENS.test(q.prompt) || CHOICE_WORDING.test(q.prompt);

// Every right answer to a question asked without options (e.g. "Which
// mammal lays eggs?" → Platypus, Echidna). Empty for options-only ones.
export const acceptedAnswers = (q: QuizQuestion): string[] =>
    needsOptions(q) ? [] : [...q.correctPool];
