// src/shared/assets/tiles/index.ts
// Each game's picture for its Game Menu tile: our own pixel avatars acting
// out the game (the painted posters are saved for the game's info sheet).
// Drawn at 165 × 112, saved at 3× for sharp phones.
import type { GameType } from '../../types';

export const TILE_ART_BY_GAME: Partial<Record<GameType, number>> = {
    imposter: require('./imposter.jpg'),
    'roof-race': require('./roof-race.jpg'),
    'match-the-following': require('./match-the-following.jpg'),
    'court-of-thieves': require('./court-of-thieves.jpg'),
    'pass-the-bomb': require('./pass-the-bomb.jpg'),
    'quiz-board': require('./quiz-board.jpg'),
    'card-clash': require('./card-clash.jpg'),
    'clash-holdem': require('./clash-holdem.jpg'),
    'stop-the-timer': require('./stop-the-timer.jpg'),
};
