// The clash reveal, beat by beat (ms from when a phone sees the result).
// The flow screen uses `total` to move on, so the animation and the
// auto-advance always agree.
import type { ClashResult } from '../../../shared/types';

export const ROLL_MS = 3500; // 🎲 a tie at the top

export const revealTimeline = (
    cards: number,
    tied: boolean,
    opts: { defenceNext?: boolean; flights?: number } = {}
) => {
    const flights = opts.flights ?? cards;
    const dealIn = 0;                                    // face-down cards slide in
    const flipStart = 650;                               // first card turns over
    const flipGap = 380;                                 // next card turns this much later
    const flipsDone = flipStart + (cards - 1) * flipGap + 450;
    const rollStart = flipsDone + 350;                   // tie: dice roll
    const winAt = rollStart + (tied ? ROLL_MS : 0);      // winner slams + glows
    if (opts.defenceNext) {
        // A gold card lost: the shield goes up, no cards move.
        const shieldAt = winAt + 900;
        const landed = shieldAt + 1400;                  // the host's button shows from here
        return { dealIn, flipStart, flipGap, flipsDone, rollStart, winAt, shieldAt, flyAt: Infinity, landed, total: landed + 2200 };
    }
    const flyAt = winAt + 1100;                          // beaten cards fly to the winner's pile
    const landed = flyAt + 650 + 120 * Math.max(0, flights - 1);
    const total = landed + 1600;                         // a beat to read the result
    return { dealIn, flipStart, flipGap, flipsDone, rollStart, winAt, shieldAt: Infinity, flyAt, landed, total };
};

export const timelineFor = (last: ClashResult) =>
    revealTimeline(Object.keys(last.plays).length, !!last.tied, {
        defenceNext: !!last.defenceNext,
        flights: Object.keys(last.pot ?? last.plays).length,
    });
