import { BombGameState } from '../../../shared/types';

// A boomerang pass: on a Boomerang bomb, whoever has just received the bomb
// may send it straight back to the player who gave it to them — once per
// round each — without obeying their instruction. Worked out from the game
// state alone, so the pass needs no extra flag from the screen.
export const isBoomerangPass = (
    gameState: BombGameState,
    fromId: string,
    toId: string
): boolean => {
    if (gameState.personalityEffect !== 'boomerang') return false;
    if (gameState.boomerangUsed?.[fromId]) return false; // already used up (or already passed on)

    const history = gameState.passHistory ?? [];
    const last = history[history.length - 1];
    // the last pass must be the one that handed the bomb to fromId, from toId
    return !!last && last.to === fromId && last.from === toId;
};