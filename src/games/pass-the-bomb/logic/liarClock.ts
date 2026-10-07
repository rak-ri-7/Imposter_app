// THE LIAR: the countdown on screen is wrong, and nobody knows by how much.
//
// Display-only. The real timer, the panic phase and the explosion never
// change — this only decides what number a player SEES. Every device works it
// out from the same two numbers (the round and how many passes have
// happened), so everyone is lied to identically, and each pass re-rolls the
// lie.

const PANIC_SECONDS = 5; // same value as PANIC_THRESHOLD in game.ts: below this the real panic countdown takes over

export const LIAR_MIN_LIE_SECONDS = 2;
export const LIAR_MAX_LIE_SECONDS = 12;
export const LIAR_GENEROUS_SHARE = 0.65; // how often the clock shows MORE time than is really left

// A small deterministic hash -> a number in [0, 1).
const hash01 = (a: number, b: number): number => {
    let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b)) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d) >>> 0;
    h ^= h >>> 12;
    h = Math.imul(h, 0x297a2d39) >>> 0;
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
};

// How far off the clock is right now: positive = shows too much time,
// negative = shows too little. Re-rolled on every pass.
export const liarOffset = (roundNumber: number, passCount: number): number => {
    const seed = roundNumber * 1000 + passCount;
    const generous = hash01(seed, 1) < LIAR_GENEROUS_SHARE;
    const span = LIAR_MAX_LIE_SECONDS - LIAR_MIN_LIE_SECONDS + 1;
    const size = LIAR_MIN_LIE_SECONDS + Math.floor(hash01(seed, 2) * span);
    return generous ? size : -size;
};

// What the clock shows. Above the panic threshold it is the real time plus
// the lie, never below 1 (a "tight" lie freezes the clock at 0:01 until the
// real panic arrives). From the panic threshold down it is the truth.
export const liarDisplayedRemaining = (realRemaining: number, offset: number): number =>
    realRemaining <= PANIC_SECONDS ? realRemaining : Math.max(1, realRemaining + offset);