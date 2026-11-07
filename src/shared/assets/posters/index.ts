// src/shared/assets/posters/index.ts
// Each game's poster (2:3), for the game info panel.
import type { GameType } from '../../types';

export const POSTER_BY_GAME: Partial<Record<GameType, number>> = {
    imposter: require('./imposter.jpg'),
    'roof-race': require('./roof-race.jpg'),
    'match-the-following': require('./match-the-following.jpg'),
    'court-of-thieves': require('./court-of-thieves.jpg'),
    'pass-the-bomb': require('./bomb-story.jpg'),
    'quiz-board': require('./quiz-board.jpg'),
    'card-clash': require('./card-stats.jpg'),
    'clash-holdem': require('./holdem-deck.jpg'),
    'stop-the-timer': require('./stop-the-timer.jpg'),
};
