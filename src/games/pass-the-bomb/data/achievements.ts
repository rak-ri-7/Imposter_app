// ── HIDDEN ACHIEVEMENTS (Pass the Bomb, timer mode) ───────────────
// Nobody reads a list: you just play, and the game tells everyone the
// moment you've done something worth bragging about. Each one can be
// earned once per game per player. Tracking lives in
// logic/timer/achievementEngine.ts.

export type AchievementId =
    | 'whisperer' | 'squad' | 'assassin' | 'serial' | 'hothands' | 'icecold'
    | 'comeback' | 'vest' | 'heartbreaker' | 'unwanted' | 'bear' | 'untouchable';

export type Achievement = {
    id: AchievementId;
    emoji: string;
    name: string;
    how: string;          // shown once it's earned (replay, results, collection)
    fp?: number;          // FP reward…
    life?: boolean;       // …or +1 life (FP_IF_FULL if already at 3 lives)
};

export const LIFE_ACHIEVEMENT_FP_IF_FULL = 50;
export const HOT_HANDS_PASSES = 5;
export const HOT_HANDS_MS = 1000;
export const ICE_COLD_MS = 10_000;
export const SERIAL_EXPLOSIONS = 3;
export const SQUAD_DEFUSES = 3;
export const UNTOUCHABLE_ROUNDS = 3;
export const UNTOUCHABLE_MIN_HOLDS = 2; // a round only counts if you held the bomb this often

export const ACHIEVEMENTS: Record<AchievementId, Achievement> = {
    whisperer: { id: 'whisperer', emoji: '🧯', name: 'BOMB WHISPERER', how: 'Defused the bomb two rounds in a row.', fp: 40 },
    squad: { id: 'squad', emoji: '🧯🧯🧯', name: 'BOMB SQUAD', how: 'Defused the bomb 3 times in one game.', life: true },
    assassin: { id: 'assassin', emoji: '🎯', name: 'ASSASSIN', how: 'Passed the bomb to someone and it blew up on them.', fp: 15 },
    serial: { id: 'serial', emoji: '🦹', name: 'SERIAL KILLER', how: 'Caused 3 explosions in one game.', fp: 40 },
    hothands: { id: 'hothands', emoji: '⚡', name: 'HOT HANDS', how: 'Made 5 lightning passes (under 1s each) in one round.', fp: 15 },
    icecold: { id: 'icecold', emoji: '🧊', name: 'ICE COLD', how: 'Held the bomb 10s+ and still passed it safely.', fp: 20 },
    comeback: { id: 'comeback', emoji: '🪦', name: 'COMEBACK KID', how: 'Came back from being a ghost.', fp: 25 },
    vest: { id: 'vest', emoji: '🛡️', name: 'SAVED BY THE VEST', how: 'A vest took the blast for you.', fp: 10 },
    heartbreaker: { id: 'heartbreaker', emoji: '💘', name: 'HEARTBREAKER', how: "Was the bomb's crush and survived the round.", fp: 20 },
    unwanted: { id: 'unwanted', emoji: '🙅', name: 'UNWANTED', how: 'The bomb took one look at you and ran.', fp: 10 },
    bear: { id: 'bear', emoji: '☠️', name: 'POKED THE BEAR', how: 'Kept poking the Toxic Bomb until it blew. (Consolation prize.)', fp: 10 },
    untouchable: { id: 'untouchable', emoji: '👑', name: 'UNTOUCHABLE', how: 'Held the bomb 2+ times in each of 3 rounds in a row, and never lost a life.', life: true },
};

export const ALL_ACHIEVEMENTS = Object.keys(ACHIEVEMENTS) as AchievementId[];

export const rewardText = (a: Achievement, gotLife?: boolean): string =>
    a.life ? (gotLife === false ? `+${LIFE_ACHIEVEMENT_FP_IF_FULL} FP` : '+1 ❤️') : `+${a.fp ?? 0} FP`;
