// ── THE POT ───────────────────────────────────────────────────────
// While you hold the bomb (fuse running), your personal pot grows each
// second, escalating: +1, +2, +3, … up to a cap per second. It's banked
// as FP when your pass lands. It's lost if the bomb blows up in your hands
// or the panic countdown starts while you (or your lazy pass) still have it.
//
// Only where nobody can time their greed: hidden-timer games, mixed games,
// and Liar-bomb rounds of visible games (the clock lies). Never in Quiz
// Bomb rounds or the final duel.
import { BombGameState } from '../../../../shared/types';

export const POT_CAP_HIDDEN = 3;   // per-second cap, hidden-timer games
export const POT_CAP_OTHER = 5;    // per-second cap, mixed games / Liar rounds

export const potCapFor = (gs: Pick<BombGameState, 'timerMode' | 'personalityEffect' | 'duelRound'>): number => {
    if (gs.duelRound || gs.personalityEffect === 'quiz' || gs.personalityEffect === 'auction') return 0;
    if (gs.timerMode === 'off') return POT_CAP_HIDDEN;
    if (gs.timerMode === 'mixed') return POT_CAP_OTHER;
    if (gs.personalityEffect === 'liar') return POT_CAP_OTHER;
    return 0;
};

export const potRound = (gs: Pick<BombGameState, 'timerMode' | 'personalityEffect' | 'duelRound'>): boolean =>
    potCapFor(gs) > 0;

// FP in the pot after holding for `heldMs`: whole seconds only.
// cap 3: 1, 3, 6, 9, 12…   cap 5: 1, 3, 6, 10, 15, 20…
export const potForHold = (heldMs: number, cap: number): number => {
    if (cap <= 0 || !Number.isFinite(heldMs) || heldMs <= 0) return 0;
    const secs = Math.floor(heldMs / 1000);
    let total = 0;
    for (let k = 1; k <= secs; k++) total += Math.min(k, cap);
    return total;
};

export const POT_RULE = 'Hold to grow your pot · your pass banks it · boom or panic burns it';

// What the holder's pot showed when their phone last looked — so the
// panic screen can say how much just burned. This phone only.
export const potPreview: { round: number; holderId: string; amount: number } = {
    round: -1,
    holderId: '',
    amount: 0,
};
