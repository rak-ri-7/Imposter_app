// ── ✏️ MATCH THE FOLLOWING ───────────────────────────────────────────
// Everyone answers a situation (typed, max 50 characters, or a preset),
// then each phone draws lines between names and answers, like the school
// exam section. See games/match-the-following/logic/engine.ts.
export type MtfPhase = 'answer' | 'match' | 'reveal' | 'roundEnd' | 'over';
export type MtfSpice = 1 | 2;               // a question's level: wholesome · cheeky
export type MtfDeck = 'wholesome' | 'cheeky' | 'tricky'; // the host's pick (cheeky includes wholesome; tricky = only the dilemmas)
export type MtfAnswer = { text: string; preset?: boolean; at: number };
export type MtfRoundResult = {
    round: number;
    questionId: string;
    prompt: string;
    answers: Record<string, MtfAnswer | null>;      // null = no answer in time
    correct: Record<string, number>;                // viewer -> correct lines this round
    lines: Record<string, number>;                  // viewer -> lines they had to draw
    fooled: Record<string, number>;                 // author -> people who matched them wrong
    readBy: Record<string, number>;                 // author -> people who matched them right
    revealOrder: string[];                          // authors, in the order their answers are revealed
};
export type MtfGameState = {
    game: 'match-the-following';
    phase: MtfPhase;
    round: number;
    roundsTotal: number;
    deck: MtfDeck;
    seats: string[];                                // the players, in colour order
    questionId: string;
    prompt: string;
    presets: string[];
    usedQuestionIds: string[];
    answers: Record<string, MtfAnswer>;
    targets: Record<string, string[]>;              // viewer -> whose names are on their board
    order: Record<string, string[]>;                // viewer -> the answer column's order (author ids)
    lines: Record<string, Record<string, string>>;  // viewer -> name -> answer (author id)
    locked: Record<string, boolean>;
    phaseEndsAt?: number;                           // server-clock ms
    revealAt?: number;                              // the reveal's start (steps are timed from it)
    score: Record<string, number>;                  // this game's points
    fooledTotal: Record<string, number>;
    readByTotal: Record<string, number>;
    seenTotal: Record<string, number>;              // how many boards each author appeared on
    last?: MtfRoundResult;
    history?: MtfRoundResult[];
    seq: number;
    endedEarly?: boolean;
    pointsAwarded?: boolean;
};
