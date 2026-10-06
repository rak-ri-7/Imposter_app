// src/games/timer/logic/distractions.ts
export type DistractionType =
    | 'flash'
    | 'disappear'
    | 'shake'
    | 'colorChaos'
    | 'dark'
    | 'moveText'
    | 'shrinkText'
    | 'invertText'
    | 'jumpscare'
    | 'fakeNumber'
    | 'fakeStop';

export type ActiveDistraction = {
    type: DistractionType;
    id: number;
    value?: string | number;
    durationMs: number;
};

const pickRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const pickWeighted = <T,>(items: { value: T; weight: number }[]): T => {
    const total = items.reduce((sum, i) => sum + i.weight, 0);
    let r = Math.random() * total;
    for (const item of items) {
        if (r < item.weight) return item.value;
        r -= item.weight;
    }
    return items[items.length - 1].value;
};

// ── QUESTION PHASE ──────────────────────────────────────────────
const QUESTION_TYPE_WEIGHTS: { value: DistractionType; weight: number }[] = [
    { value: 'flash', weight: 15 },
    { value: 'colorChaos', weight: 15 },
    { value: 'disappear', weight: 15 },
    { value: 'shake', weight: 15 },
    { value: 'dark', weight: 10 },
    { value: 'moveText', weight: 15 },
    { value: 'shrinkText', weight: 10 },
    { value: 'invertText', weight: 5 },
];

// Per-type durations — noticeably longer than before so they actually register.
const QUESTION_DURATIONS: Partial<Record<DistractionType, number>> = {
    flash: 1000,
    colorChaos: 1400,
    disappear: 1700,
    shake: 1300,
    dark: 1100,
    moveText: 1500,
    shrinkText: 1400,
    invertText: 1000,
};

// How many distractions this question gets, decided once per question.
// Kept at your original cap: 0 common, 1 common, 2 rare.
const QUESTION_COUNT_WEIGHTS: { value: 0 | 1 | 2; weight: number }[] = [
    { value: 0, weight: 40 },
    { value: 1, weight: 45 },
    { value: 2, weight: 15 },
];

export const pickQuestionDistractionCount = (): 0 | 1 | 2 =>
    pickWeighted(QUESTION_COUNT_WEIGHTS);

export const QUESTION_DISTRACTION_MIN_GAP_MS = 1400;
export const QUESTION_DISTRACTION_MAX_GAP_MS = 2800;

export const generateQuestionDistraction = (idSeed: number): ActiveDistraction => {
    const type = pickWeighted(QUESTION_TYPE_WEIGHTS);
    return { type, id: idSeed, durationMs: QUESTION_DURATIONS[type] ?? 1200 };
};

// ── RUNNING (TIMER) PHASE ───────────────────────────────────────
export const RUNNING_PHASE_MIN_ANSWER_SECONDS = 6;
export const RUNNING_PHASE_MAX_ANSWER_SECONDS = 15;
export const RUNNING_PHASE_SAFE_GAP_MS = 3000;
export const RUNNING_PHASE_MIN_DELAY_MS = 500;
export const RUNNING_PHASE_FIRE_PROBABILITY = 0.45;

const RUNNING_TYPE_WEIGHTS: { value: DistractionType; weight: number }[] = [
    { value: 'jumpscare', weight: 30 },
    { value: 'fakeStop', weight: 25 },
    { value: 'fakeNumber', weight: 25 },
    { value: 'flash', weight: 12 },
    { value: 'dark', weight: 8 },
];

// Jump scare now holds noticeably longer since it's a full takeover.
const RUNNING_DURATIONS: Partial<Record<DistractionType, number>> = {
    jumpscare: 1000,
    fakeStop: 700,
    fakeNumber: 700,
    flash: 500,
    dark: 500,
};

export const getRunningDistractionBaseWindow = (
    answerSeconds: number
): { eligible: boolean; startMs: number; endMs: number } => {
    if (
        answerSeconds < RUNNING_PHASE_MIN_ANSWER_SECONDS ||
        answerSeconds >= RUNNING_PHASE_MAX_ANSWER_SECONDS
    ) {
        return { eligible: false, startMs: 0, endMs: 0 };
    }
    const answerMs = answerSeconds * 1000;
    const endMs = answerMs - RUNNING_PHASE_SAFE_GAP_MS;
    const startMs = RUNNING_PHASE_MIN_DELAY_MS;

    if (endMs <= startMs) {
        return { eligible: false, startMs: 0, endMs: 0 };
    }
    return { eligible: true, startMs, endMs };
};

export const generateRunningDistraction = (idSeed: number): ActiveDistraction => {
    const type = pickWeighted(RUNNING_TYPE_WEIGHTS);
    let value: string | number | undefined;
    if (type === 'fakeNumber') value = Math.floor(Math.random() * 20) + 1;
    if (type === 'jumpscare') value = pickRandom(['👹', '💀', '😱', '👻']);
    return { type, id: idSeed, value, durationMs: RUNNING_DURATIONS[type] ?? 700 };
};