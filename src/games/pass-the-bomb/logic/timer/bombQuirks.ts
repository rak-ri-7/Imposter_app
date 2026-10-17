// ── BOMB QUIRKS ───────────────────────────────────────────────────
// Personalities are about the CLOCK (angry, calm, liar…). Quirks are about
// how people PLAY: the bomb picks them up mid-round from the way it's been
// passed, and the round's personality decides what flavour each one takes.
//
//   💘 Crush     the same player receives it a 3rd time this round (each player can have one)
//   🙅 Stranger  it reaches someone who still hadn't had it after 4+ passes
//   😴 Lazy      someone held it 8s+ before passing
//
// Quirks only happen in normal timer rounds (not Quiz Bomb, not the final
// duel) and only while the round is 'playing' — the panic countdown is left
// alone. The game logic lives in game.ts (passBomb / completePendingPass);
// this file is the rule table, the tuning, and every word players see.

export type QuirkKind = 'crush' | 'stranger' | 'lazy';

export type QuirkVariant =
    | 'crush' | 'toxic' | 'cuddler' | 'twofaced' | 'obsessed' | 'rebound'
    | 'stranger' | 'hostile' | 'shy' | 'gaslighter'
    | 'lazy' | 'seething' | 'sleepy';

// ── TUNING ────────────────────────────────────────────────────────
export const CRUSH_RECEIPTS = 3;        // 3rd time the same player gets it → crush
export const STRANGER_PASSES = 4;       // reaching someone new after 4+ passes → stranger
export const LAZY_HOLD_MS = 8000;       // a hold this long makes it lazy
export const LAZY_DELAY_MS = 2000;      // a lazy bomb leaves this long after the tap
export const LAZY_WAKE_MS = 3000;       // passing within this of catching it wakes it up
export const QUIRK_REVEAL_MS = 4500;    // the mid-game card; the fuse is paused meanwhile

export const CRUSH_TAPS_MIN = 2;        // crush: taps needed to let go (random, never shown)
export const CRUSH_TAPS_MAX = 4;
export const TOXIC_CALM_MS = 3000;      // toxic: leave it alone this long, then one tap passes
export const TOXIC_MAX_TAPS = 3;        // toxic: the 3rd impatient tap blows it
export const TOXIC_SPEEDUP = 1.3;       // toxic: each impatient tap speeds the fuse by this
export const TOXIC_BURN_S = 3;          //   …and burns this many seconds off it
export const CUDDLE_MIN_MS = 3000;      // cuddler: stuck (fuse paused) for 3–5s on every catch
export const CUDDLE_MAX_MS = 5000;
export const TWOFACED_CHANCE = 0.5;     // two-faced: chance the crush's pass sneaks back
export const SNEAK_MS = 2000;           //   …this long after it "left"
export const OBSESSED_MAX_RETURNS = 2;  // obsessed: runs back to its crush at most this often
export const STRANGER_BITE_S = 10;      // stranger: seconds bitten off the fuse
export const STRANGER_PANIC_BELOW_S = 15; // …under this much left, straight to panic instead
export const GASLIGHT_MAX_BITE_S = 20;  // gaslighter: secretly bites 0–20s
export const SEETHING_SPEED = 2;        // seething: fuse speed while a lazy pass drags

export const randInt = (min: number, max: number) =>
    min + Math.floor(Math.random() * (max - min + 1));

// ── WHICH FLAVOUR, FOR WHICH PERSONALITY ─────────────────────────
const COMBOS: Record<QuirkKind, Partial<Record<string, QuirkVariant>>> = {
    crush: { angry: 'toxic', calm: 'cuddler', liar: 'twofaced', cursed: 'obsessed', boomerang: 'rebound' },
    stranger: { angry: 'hostile', calm: 'shy', liar: 'gaslighter' },
    lazy: { angry: 'seething', calm: 'sleepy' },
};

export const variantFor = (kind: QuirkKind, personalityEffect: string | undefined): QuirkVariant =>
    COMBOS[kind][personalityEffect ?? ''] ?? kind;

// Stranger: chance it flees (the rest of the time it bites the fuse).
export const strangerFleeChance = (v: QuirkVariant): number =>
    v === 'hostile' ? 0 : v === 'shy' ? 1 : 0.5;

// ── WORDS ─────────────────────────────────────────────────────────
export type QuirkInfo = {
    kind: QuirkKind;
    emoji: string;
    name: string;      // shown big on the reveal card
    hint: string;      // cryptic one-liner on the card — players learn the rest the hard way
    explain: string;   // the full rules: replay screen + Bomb Collection
};

export const QUIRK_INFO: Record<QuirkVariant, QuirkInfo> = {
    crush: {
        kind: 'crush', emoji: '💘', name: 'LOVESTRUCK BOMB',
        hint: 'Love is hard to let go of.',
        explain: 'Got the same player 3 times. Whenever its crush holds it, they have to tap Pass 2–4 times before it lets go.',
    },
    toxic: {
        kind: 'crush', emoji: '☠️', name: 'TOXIC BOMB',
        hint: 'It hates being rushed.',
        explain: 'Angry + crush. Every impatient tap speeds up the fuse and burns 3s off it, and the 3rd one blows it on the spot. Leave it untouched for 3s, then one tap passes it.',
    },
    cuddler: {
        kind: 'crush', emoji: '🧸', name: 'CUDDLY BOMB',
        hint: 'It just wants a hug.',
        explain: "Calm + crush. Every time its crush catches it, the fuse pauses but they can't pass for 3–5 seconds.",
    },
    twofaced: {
        kind: 'crush', emoji: '🎭', name: 'TWO-FACED BOMB',
        hint: "Goodbyes aren't always goodbyes.",
        explain: 'Liar + crush. When its crush passes it, half the time it sneaks back to them 2 seconds later.',
    },
    obsessed: {
        kind: 'crush', emoji: '🔁', name: 'OBSESSED BOMB',
        hint: 'It always comes back.',
        explain: 'Cursed + crush. After its crush passes it, the next pass sends it straight back to them (up to 2 times a round).',
    },
    rebound: {
        kind: 'crush', emoji: '🪃', name: 'REBOUND BOMB',
        hint: "Your first goodbye won't stick.",
        explain: "Boomerang + crush. Its crush's first pass bounces straight back into their hands.",
    },
    stranger: {
        kind: 'stranger', emoji: '🙅', name: 'STRANGER DANGER BOMB',
        hint: "It doesn't trust new faces.",
        explain: "Reached someone who hadn't had it after 4+ passes. 50/50: it flees to someone else, or bites 10s off the fuse (under 15s left: straight to panic).",
    },
    hostile: {
        kind: 'stranger', emoji: '👊', name: 'HOSTILE BOMB',
        hint: 'It bites.',
        explain: 'Angry + stranger. Never flees: it always bites 10s off the fuse (under 15s left: straight to panic).',
    },
    shy: {
        kind: 'stranger', emoji: '🫣', name: 'SHY BOMB',
        hint: 'It runs from strangers.',
        explain: 'Calm + stranger. It always flees from someone new, landing on another player.',
    },
    gaslighter: {
        kind: 'stranger', emoji: '🌀', name: 'GASLIGHTER BOMB',
        hint: 'Did it bite? You will never know.',
        explain: 'Liar + stranger. 50/50 flee or bite, but the bite is secretly anywhere from 0 to 20 seconds.',
    },
    lazy: {
        kind: 'lazy', emoji: '😴', name: 'LAZY BOMB',
        hint: "It's in no hurry.",
        explain: "Someone held it 8s+. Every pass now leaves 2 seconds after the tap. If it blows meanwhile, it's on the passer. A pass within 3s of catching it wakes it up.",
    },
    seething: {
        kind: 'lazy', emoji: '😤', name: 'SEETHING BOMB',
        hint: 'Slow… and furious.',
        explain: 'Angry + lazy. Passes drag for 2 seconds and the fuse burns double speed while they do.',
    },
    sleepy: {
        kind: 'lazy', emoji: '💤', name: 'SLEEPY BOMB',
        hint: 'It naps on the way.',
        explain: 'Calm + lazy. Passes drag for 2 seconds, but the fuse is paused while they do.',
    },
};

export const ALL_QUIRK_VARIANTS = Object.keys(QUIRK_INFO) as QuirkVariant[];

// The story line at the top of the reveal card.
export const quirkStoryLine = (
    kind: QuirkKind,
    subjectName: string,
    personalityName: string,
    detail?: { receipts?: number; heldSec?: number }
): string => {
    const bomb = personalityName ? `the ${titleCase(personalityName)}` : 'the bomb';
    if (kind === 'crush') {
        return `${subjectName} got ${bomb} for the ${ordinal(detail?.receipts ?? CRUSH_RECEIPTS)} time… it has a crush on ${subjectName}.`;
    }
    if (kind === 'stranger') {
        return `${titleFirst(bomb)} has never met ${subjectName} before… and it doesn't like strangers.`;
    }
    return `${subjectName} sat on ${bomb} for ${detail?.heldSec ?? 8}s… it got way too comfortable.`;
};

const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
const titleCase = (s: string) =>
    s.toLowerCase().replace(/^the\s+/, '').replace(/\b\w/g, (c) => c.toUpperCase());
const titleFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
