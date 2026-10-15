// ── SHARED QUIZ BANK ──────────────────────────────────────────────
// One question bank for every game. Each game picks the difficulties it
// wants with a QuestionFilter (see each game's own presets).
//   easy   → instantly recognisable; good for fast, timed games
//   medium → fair for anyone; shared by fast and slow games
//   hard   → needs real knowledge; for games where a miss costs something
export type QuizDifficulty = 'easy' | 'medium' | 'hard';

export type QuizCategory =
    | 'language'
    | 'logic'
    | 'pop-culture'
    | 'movies'
    | 'anime'
    | 'arts'
    | 'literature'
    | 'geography'
    | 'india'
    | 'history'
    | 'science'
    | 'technology'
    | 'women'
    | 'animals'
    | 'food'
    | 'sport'
    | 'football'
    | 'nature';


export const QUIZ_CATEGORIES: Record<QuizCategory, { label: string; emoji: string }> = {
    language: { label: 'Language', emoji: '🔤' },
    logic: { label: 'Logic & Riddles', emoji: '🧩' },
    'pop-culture': { label: 'Pop Culture', emoji: '🌟' },
    movies: { label: 'Movies', emoji: '🎬' },
    anime: { label: 'Anime', emoji: '🍥' },
    arts: { label: 'Music & Art', emoji: '🎨' },
    literature: { label: 'Literature', emoji: '📚' },
    geography: { label: 'Geography', emoji: '🌍' },
    india: { label: 'India', emoji: '🇮🇳' },
    history: { label: 'History', emoji: '🏛️' },
    science: { label: 'Science & Inventions', emoji: '🧪' },
    technology: { label: 'Technology', emoji: '💻' },
    women: { label: 'Women Who Made History', emoji: '👩' },
    animals: { label: 'Animal Kingdom', emoji: '🐾' },
    food: { label: 'Food', emoji: '🍛' },
    sport: { label: 'Sport', emoji: '🏏' },
    football: { label: 'Football', emoji: '⚽' },
    nature: { label: 'Nature', emoji: '🌿' },
};

// Board value level for Jeopardy-style games (1 = cheapest row, 5 = top).
// Optional: questions without one get a default from their difficulty.
export type QuizLevel = 1 | 2 | 3 | 4 | 5;

export type QuizQuestion = {
    id: string;
    difficulty: QuizDifficulty;
    level?: QuizLevel;
    category: QuizCategory;
    prompt: string; // may contain [PLACEHOLDER] tokens
    correctPool: string[];
    wrongPool: string[];
};

export type QuizOption = {
    text: string;
    correct: boolean;
};

export type QuizInstance = {
    questionId: string;
    prompt: string; // fully resolved — no placeholders left
    options: QuizOption[];
};

export type QuestionFilter = {
    difficulty?: QuizDifficulty | QuizDifficulty[];
    category?: QuizCategory;
};
