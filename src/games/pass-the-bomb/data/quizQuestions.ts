// Pass the Bomb's link to the shared quiz bank (src/shared/quiz). Existing
// imports of '../data/quizQuestions' keep working; only the presets below
// are specific to this game.
import type { QuestionFilter } from '../../../shared/quiz';

export * from '../../../shared/quiz';

// Which questions each mode draws from.
export const TIMER_QUIZ: QuestionFilter = { difficulty: ['easy', 'medium'] };
export const PASS_QUIZ: QuestionFilter = { difficulty: ['medium', 'hard'] };
