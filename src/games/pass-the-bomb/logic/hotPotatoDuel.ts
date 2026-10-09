// ── HOT POTATO ENGINE ─────────────────────────────────────────────
// Shared by two modes:
//   • 'duel'       — the final 2-player duel. The holder when the fuse
//                    runs out loses a life; the other player scores.
//   • 'tournament' — the ghost challenge (wire-cutter + the ghosts who bet
//                    right). Any number of players. Whoever is holding it when
//                    the fuse runs out is knocked out; a fresh fuse starts with
//                    the rest, until one is left — they win the life.
//
// Pass order is fixed per fuse: hpPlayers is the order, and a pass always
// goes to the next player in it (wrapping round). In the tournament the
// order is shuffled at the start of every fuse and the first player in it
// starts holding. Nobody chooses who gets it.
//
// A hidden fuse and a limited pass budget. No wires. The bomb's mood is
// driven by HOW the players pass, decided on the server inside each pass:
//   😐 Neutral — plain hidden fuse (start of every fuse)
//   😠 Angry   — quick back-and-forth passing → the fuse speeds up
//   😴 Lazy    — holding it a long time → after a pass the bomb takes
//                1–4s to actually leave (longer holds = lazier). If the
//                fuse runs out mid-delay, it blows up on the PASSER.
//   🥱 Bored   — steady, same-rhythm passing → random naps where the
//                fuse stops for a few seconds
// Mood shifts are weighted dice rolls, not fixed thresholds.
//
// When the fuse hits zero the bomb freezes in whoever's hands it's in and
// a ~3.5s finale plays on every phone (countdown, last words). Only then
// does it resolve — and 1 time in 5 it's a DUD: it fizzles and the holder
// survives. The dud is rolled at that moment, so nothing in the state can
// give it away beforehand.

import { doc, runTransaction, deleteField, increment } from 'firebase/firestore';
import { db } from '../../../shared/firebase/config';
import { Group, BombGameState } from '../../../shared/types';
import { addScore } from '../../../shared/firebase/groups';
import {
    FUSE_POINTS,
    applyFusePoints,
    applyLifeGain,
    ROUND_WIN_SCORE,
} from './bombHelpers';

export type HpMood = 'neutral' | 'angry' | 'lazy' | 'bored';
export type HpContext = 'duel' | 'tournament';

// ── Tuning ────────────────────────────────────────────────────────
const SETTINGS: Record<
    HpContext,
    { timerMin: number; timerMax: number; passMin: number; passMax: number }
> = {
    duel: { timerMin: 10, timerMax: 50, passMin: 4, passMax: 7 },
    // Several fuses in a row, so each one is shorter and tighter.
    tournament: { timerMin: 8, timerMax: 30, passMin: 3, passMax: 5 },
};

export const HP_TOURNAMENT_BETWEEN_MS = 2500; // "X is out!" beat between fuses
export const HP_FINALE_MS = 3500;  // dramatic build-up between zero and the result
export const HP_DUD_CHANCE = 0.2;  // 1 in 5 bombs are duds

// What went wrong with the dud — one is picked by the server when it happens
// (stored as an index), so every phone shows the same line.
export const HP_DUD_LINES: { emoji: string; title: string; line: string }[] = [
    {
        emoji: '🌬️',
        title: 'Saved by the breeze',
        line: 'The fuse was a hair from the end when a gust of wind snuffed the spark out. Get rid of it before someone finds a lighter.',
    },
    {
        emoji: '☕',
        title: 'Not quite gunpowder',
        line: "Turns out the gunpowder was mostly chai powder. Somebody's getting a refund.",
    },
    {
        emoji: '😮‍💨',
        title: 'It just… gave up',
        line: "The bomb coughed, wheezed and went back to sleep. Whatever you do, don't wake it.",
    },
    {
        emoji: '🌧️',
        title: 'Damp fuse',
        line: "A drop of rain landed right on the fuse. Pure luck. Don't push it.",
    },
    {
        emoji: '🔌',
        title: 'Factory defect',
        line: 'Someone forgot to connect the wires. Quality control has been notified.',
    },
];

export const hpDudLine = (index?: number) =>
    HP_DUD_LINES[(index ?? 0) % HP_DUD_LINES.length];

const pickDudLine = () => Math.floor(Math.random() * HP_DUD_LINES.length);

const FAST_HOLD_MS = 1500;    // average hold below this → angry territory
const SLOW_HOLD_MS = 6000;    // a single hold above this → lazy territory
const STEADY_SPREAD = 0.2;    // holds within ±20% of each other → bored territory
const MOOD_LOCK_PASSES = 2;   // a new mood sticks for at least this many passes

const ANGRY_START_SPEED = 1.3;
const ANGRY_STEP = 1.2;       // each further quick pass while angry
const ANGRY_MAX_SPEED = 2.5;

const LAZY_MIN_MS = 1000;
const LAZY_MAX_MS = 4000;

const NAP_CHANCE = 0.5;       // chance a pass while bored schedules a nap
const NAP_DELAY_MIN_MS = 500;
const NAP_DELAY_MAX_MS = 3000;
const NAP_LEN_MIN_MS = 2000;
const NAP_LEN_MAX_MS = 4000;

const CLOCK_TOLERANCE_MS = 500;
const MAX_PASS_HISTORY = 50;

const rand = (min: number, max: number) => min + Math.random() * (max - min);

const shuffled = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

// ── State helpers (shared by server functions and the screen) ─────

export const hpContextOf = (gs: BombGameState): HpContext =>
    (gs.hpContext ?? 'duel') as HpContext;

// Is a fuse running right now, in the phase it belongs to?
export const hpIsLive = (gs: BombGameState): boolean => {
    if (gs.hpTimerStartedAt == null) return false;
    return hpContextOf(gs) === 'tournament'
        ? gs.phase === 'ghost-tournament' && gs.ghostTournament?.stage === 'fuse'
        : gs.phase === 'duel';
};

// Who has the bomb right now (a lazy pass hasn't landed until it lands).
export const hpHolder = (gs: BombGameState): string =>
    gs.hpHolderId ?? gs.currentHolderId;

const napOverlapMs = (gs: BombGameState, from: number, to: number): number => {
    const nap = gs.hpNap;
    if (!nap) return 0;
    return Math.max(0, Math.min(to, nap.until) - Math.max(from, nap.from));
};

// Seconds of fuse left at `now`.
export const hpRemaining = (gs: BombGameState, now = Date.now()): number => {
    const start = gs.hpTimerStartedAt ?? now;
    const elapsedMs = Math.max(0, now - start - napOverlapMs(gs, start, now));
    return Math.max(0, (gs.hpTimerDuration ?? 0) - (elapsedMs / 1000) * (gs.hpSpeed ?? 1));
};

// The real-time moment the fuse reaches zero.
export const hpZeroAt = (gs: BombGameState): number => {
    const start = gs.hpTimerStartedAt ?? 0;
    const base = start + ((gs.hpTimerDuration ?? 0) / (gs.hpSpeed ?? 1)) * 1000;
    const nap = gs.hpNap;
    if (!nap) return base;
    const napStart = Math.max(start, nap.from);
    return napStart < base ? base + Math.max(0, nap.until - napStart) : base;
};

export const hpIsNapping = (gs: BombGameState, now = Date.now()): boolean =>
    !!gs.hpNap && now >= gs.hpNap.from && now < gs.hpNap.until;

// The fuse has hit zero: the bomb is frozen and the finale is playing.
export const hpInFinale = (gs: BombGameState, now = Date.now()): boolean =>
    hpIsLive(gs) && now >= hpZeroAt(gs);

// Who actually had the bomb at time t — a lazy pass only lands when it arrives.
export const hpHolderAt = (gs: BombGameState, t: number): string =>
    gs.hpLazy && gs.hpLazy.arrivesAt <= t ? gs.hpLazy.to : hpHolder(gs);

// The player a pass from `fromId` goes to: the next one in the fixed order.
export const hpNextInOrder = (gs: BombGameState, fromId: string): string | undefined => {
    const order = gs.hpPlayers ?? [];
    const i = order.indexOf(fromId);
    if (i < 0 || order.length < 2) return undefined;
    return order[(i + 1) % order.length];
};

export const hpPassesUsed = (gs: BombGameState, playerId: string): number =>
    gs.hpPassMode === 'each'
        ? gs.hpPassCounts?.[playerId] ?? 0
        : gs.hpTotalPasses ?? 0;

export const hpOutOfPasses = (gs: BombGameState, playerId: string): boolean =>
    hpPassesUsed(gs, playerId) >= (gs.hpPassBudget ?? SETTINGS.duel.passMin);

// ── Start / reset ─────────────────────────────────────────────────
// Returns the fields for a fresh fuse; fold them into the write that
// starts the duel (markDuelReady) or a tournament stage.
// Duel: pass the duelists with the starting holder; their order is kept.
// Tournament: the order is shuffled here and the first player starts holding.
export const buildHotPotatoStart = (opts: {
    now: number;
    players: string[];
    holderId?: string;
    context: HpContext;
}): Record<string, unknown> => {
    const s = SETTINGS[opts.context];
    const order = opts.context === 'tournament' ? shuffled(opts.players) : opts.players;
    const holderId = opts.context === 'tournament' ? order[0] : opts.holderId ?? order[0];
    // "Total" only makes sense for two; with a group it'd run out in seconds.
    const passMode =
        opts.players.length === 2 && Math.random() < 0.5 ? 'total' : 'each';
    return {
        'gameState.hpContext': opts.context,
        'gameState.hpPlayers': order,
        'gameState.hpHolderId': holderId,
        'gameState.hpTimerStartedAt': opts.now,
        'gameState.hpTimerDuration': rand(s.timerMin, s.timerMax),
        'gameState.hpSpeed': 1,
        'gameState.hpMood': 'neutral',
        'gameState.hpMoodLockUntil': 0,
        'gameState.hpHolds': [],
        'gameState.hpHoldStartedAt': opts.now,
        'gameState.hpPassMode': passMode,
        'gameState.hpPassMin': s.passMin,
        'gameState.hpPassMax': s.passMax,
        'gameState.hpPassBudget':
            s.passMin + Math.floor(Math.random() * (s.passMax - s.passMin + 1)),
        'gameState.hpPassCounts': {},
        'gameState.hpTotalPasses': 0,
        'gameState.hpLazy': deleteField(),
        'gameState.hpNap': deleteField(),
    };
};

// Clears every hot potato field — used when a round starts or a
// tournament ends.
export const hotPotatoResetFields = (): Record<string, unknown> => ({
    'gameState.hpContext': deleteField(),
    'gameState.hpPlayers': deleteField(),
    'gameState.hpHolderId': deleteField(),
    'gameState.hpTimerStartedAt': deleteField(),
    'gameState.hpTimerDuration': deleteField(),
    'gameState.hpSpeed': deleteField(),
    'gameState.hpMood': deleteField(),
    'gameState.hpMoodLockUntil': deleteField(),
    'gameState.hpHolds': deleteField(),
    'gameState.hpHoldStartedAt': deleteField(),
    'gameState.hpPassMode': deleteField(),
    'gameState.hpPassMin': deleteField(),
    'gameState.hpPassMax': deleteField(),
    'gameState.hpPassBudget': deleteField(),
    'gameState.hpPassCounts': deleteField(),
    'gameState.hpTotalPasses': deleteField(),
    'gameState.hpLazy': deleteField(),
    'gameState.hpNap': deleteField(),
    'gameState.hpDudPlayerId': deleteField(),
    'gameState.hpDudLine': deleteField(),
});

// ── Mood ──────────────────────────────────────────────────────────
const decideMood = (
    current: HpMood,
    holds: number[],
    lastHold: number,
    passIndex: number,
    lockUntil: number
): HpMood => {
    if (passIndex < lockUntil) return current; // a fresh mood sticks for a bit

    const recent = holds.slice(-3);
    const avg = recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length);
    const spread =
        recent.length > 0 ? (Math.max(...recent) - Math.min(...recent)) / Math.max(1, avg) : 1;

    let candidate: HpMood | null = null;
    let chance = 0;

    if (lastHold >= SLOW_HOLD_MS) {
        candidate = 'lazy';
        chance = Math.min(0.9, 0.35 + (lastHold - SLOW_HOLD_MS) / 10000);
    } else if (recent.length >= 2 && avg < FAST_HOLD_MS) {
        candidate = 'angry';
        chance = Math.min(0.9, 0.35 + ((FAST_HOLD_MS - avg) / FAST_HOLD_MS) * 0.5);
    } else if (recent.length >= 3 && avg < SLOW_HOLD_MS && spread <= STEADY_SPREAD) {
        candidate = 'bored';
        chance = 0.45;
    } else if (current !== 'neutral') {
        candidate = 'neutral'; // nothing extreme going on — it may settle down
        chance = 0.35;
    }

    if (!candidate || candidate === current) return current;
    return Math.random() < chance ? candidate : current;
};

// ── Pass ──────────────────────────────────────────────────────────
export type HotPotatoPassResult = {
    success: boolean;
    reason?: 'stale' | 'no-passes' | 'in-transit';
};

// The target is always the next player in the fixed order — worked out
// here from fresh data, so a stale screen can't pass out of turn.
export const hotPotatoPass = async (
    group: Group,
    fromId: string
): Promise<HotPotatoPassResult> => {
    const groupRef = doc(db, 'groups', group.id);
    let result: HotPotatoPassResult = { success: false, reason: 'stale' };

    try {
        await runTransaction(db, async (transaction) => {
            result = { success: false, reason: 'stale' }; // fresh on every retry

            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const gs = snap.data().gameState as BombGameState;
            if (!hpIsLive(gs)) return;
            if (hpHolder(gs) !== fromId) return;
            const toId = hpNextInOrder(gs, fromId);
            if (!toId) return;
            if (gs.hpLazy) {
                result = { success: false, reason: 'in-transit' };
                return;
            }

            const now = Date.now();
            if (now >= hpZeroAt(gs) - CLOCK_TOLERANCE_MS) return; // already blown
            if (hpOutOfPasses(gs, fromId)) {
                result = { success: false, reason: 'no-passes' };
                return;
            }

            const isDuel = hpContextOf(gs) === 'duel';
            const counts = gs.hpPassCounts ?? {};
            const total = gs.hpTotalPasses ?? 0;
            const holdMs = Math.max(0, now - (gs.hpHoldStartedAt ?? now));
            const holds = [...(gs.hpHolds ?? []), holdMs].slice(-4);
            const prevMood = (gs.hpMood ?? 'neutral') as HpMood;
            const mood = decideMood(prevMood, holds, holdMs, total, gs.hpMoodLockUntil ?? 0);

            const updates: Record<string, unknown> = {
                'gameState.hpHolds': holds,
                'gameState.hpPassCounts': { ...counts, [fromId]: (counts[fromId] ?? 0) + 1 },
                'gameState.hpTotalPasses': total + 1,
            };
            // Only the duel is part of the round's story — the tournament's
            // passes stay out of the replay and the hold stats.
            if (isDuel) {
                updates['gameState.passHistory'] = [
                    ...gs.passHistory,
                    { from: fromId, to: toId, timestamp: now, instruction: '(Hot potato)' },
                ].slice(-MAX_PASS_HISTORY);
            }
            if (mood !== prevMood) {
                updates['gameState.hpMood'] = mood;
                updates['gameState.hpMoodLockUntil'] = total + 1 + MOOD_LOCK_PASSES;
            }

            // Angry speeds the fuse up (more each pass it stays angry);
            // any other mood runs at normal speed.
            const prevSpeed = gs.hpSpeed ?? 1;
            const speed =
                mood === 'angry'
                    ? prevMood === 'angry'
                        ? Math.min(ANGRY_MAX_SPEED, prevSpeed * ANGRY_STEP)
                        : Math.max(prevSpeed, ANGRY_START_SPEED)
                    : 1;

            // Bored: maybe schedule a nap, if one isn't already pending.
            const napFree = !gs.hpNap || gs.hpNap.until <= now;
            const scheduleNap = mood === 'bored' && napFree && Math.random() < NAP_CHANCE;

            // Changing the speed or replacing a finished nap means re-basing the
            // clock: carry the real remaining time forward from now.
            if (speed !== prevSpeed || (scheduleNap && gs.hpNap)) {
                updates['gameState.hpTimerStartedAt'] = now;
                updates['gameState.hpTimerDuration'] = hpRemaining(gs, now);
                updates['gameState.hpSpeed'] = speed;
            }
            if (scheduleNap) {
                const napFrom = now + rand(NAP_DELAY_MIN_MS, NAP_DELAY_MAX_MS);
                updates['gameState.hpNap'] = {
                    from: napFrom,
                    until: napFrom + rand(NAP_LEN_MIN_MS, NAP_LEN_MAX_MS),
                };
            }

            // Lazy: the bomb lingers in the passer's hands for a rolled delay,
            // longer the longer they held it. Otherwise it moves straight away.
            if (mood === 'lazy') {
                const holdBonus = Math.random() * Math.min(1500, holdMs / 8);
                const delay = Math.min(
                    LAZY_MAX_MS,
                    LAZY_MIN_MS + Math.random() * 1500 + holdBonus
                );
                updates['gameState.hpLazy'] = { from: fromId, to: toId, arrivesAt: now + delay };
            } else {
                updates['gameState.hpHolderId'] = toId;
                updates['gameState.hpHoldStartedAt'] = now;
                if (isDuel) {
                    updates['gameState.currentHolderId'] = toId;
                    updates['gameState.holdCounts'] = {
                        ...gs.holdCounts,
                        [toId]: (gs.holdCounts?.[toId] ?? 0) + 1,
                    };
                }
            }

            transaction.update(groupRef, updates);
            result = { success: true };
        });
    } catch (e) {
        if (__DEV__) console.warn('[hotPotatoPass] transaction failed', e);
    }
    return result;
};

// ── Lazy transfer lands ───────────────────────────────────────────
// Any phone may call this once the delay is up; guarded, so extra or
// early calls do nothing.
export const completeLazyTransfer = async (groupId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const gs = snap.data().gameState as BombGameState;
            if (!hpIsLive(gs) || !gs.hpLazy) return;
            if (Date.now() < gs.hpLazy.arrivesAt - CLOCK_TOLERANCE_MS) return;
            // Fuse is at or past zero: don't land the pass — explodeHotPotato
            // decides who was really holding it (hpHolderAt).
            if (Date.now() >= hpZeroAt(gs) - CLOCK_TOLERANCE_MS) return;

            const to = gs.hpLazy.to;
            const updates: Record<string, unknown> = {
                'gameState.hpHolderId': to,
                'gameState.hpHoldStartedAt': gs.hpLazy.arrivesAt,
                'gameState.hpLazy': deleteField(),
            };
            if (hpContextOf(gs) === 'duel') {
                updates['gameState.currentHolderId'] = to;
                updates['gameState.holdCounts'] = {
                    ...gs.holdCounts,
                    [to]: (gs.holdCounts?.[to] ?? 0) + 1,
                };
            }
            transaction.update(groupRef, updates);
        });
    } catch (e) {
        if (__DEV__) console.warn('[completeLazyTransfer] transaction failed', e);
    }
};

// ── Tournament outcome ────────────────────────────────────────────
// The victim is knocked out. More than one left → a short "X is out!"
// beat, then a fresh fuse (advanceTournamentStage). One left → they win
// the life (a ghost comes back; the wire-cutter gets back the life the
// bomb took). Nobody loses a life in the tournament.
const tournamentOutcome = (gs: BombGameState, victim: string): Record<string, unknown> => {
    const t = gs.ghostTournament!;
    const poolIds = t.poolIds.filter((id) => id !== victim);
    const eliminatedIds = [...t.eliminatedIds, victim];

    if (poolIds.length > 1) {
        return {
            ...hotPotatoResetFields(),
            'gameState.ghostTournament': {
                ...t,
                stage: 'between',
                poolIds,
                eliminatedIds,
                lastEliminatedId: victim,
                nextStageAt: Date.now() + HP_TOURNAMENT_BETWEEN_MS,
            },
        };
    }

    const winnerId = poolIds[0];
    const updates: Record<string, unknown> = {
        ...hotPotatoResetFields(),
        'gameState.ghostTournament': {
            ...t,
            stage: 'result',
            poolIds,
            eliminatedIds,
            lastEliminatedId: victim,
            winnerId,
        },
    };
    if (!t.debug && winnerId) {
        applyLifeGain(updates, gs, winnerId);
        if (winnerId !== t.wireCutterId) {
            updates[`scores.${winnerId}`] = increment(ROUND_WIN_SCORE);
        }
    }
    return updates;
};

// A dud in the tournament: nobody is knocked out — the holder survives and
// a fresh fuse (new order) starts after the usual beat.
const tournamentDud = (gs: BombGameState, holder: string): Record<string, unknown> => {
    const t = gs.ghostTournament!;
    return {
        ...hotPotatoResetFields(),
        'gameState.ghostTournament': {
            ...t,
            stage: 'between',
            lastDudId: holder,
            lastDudLine: pickDudLine(),
            nextStageAt: Date.now() + HP_TOURNAMENT_BETWEEN_MS,
        },
    };
};

// ── Explosion ─────────────────────────────────────────────────────
// Any phone may call this once the fuse has hit zero AND the finale has
// played (host first, others as backup). Whoever held the bomb at the
// moment it hit zero is hit — if a lazy pass hadn't landed yet, that's the
// passer — unless it turns out to be a dud.
export const explodeHotPotato = async (group: Group): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    // Typed this way so TypeScript doesn't narrow it to `null` after the
    // transaction (it can't see the assignment inside the callback).
    let survivorId = null as string | null;

    try {
        await runTransaction(db, async (transaction) => {
            survivorId = null; // a retried attempt must not inherit the last one's result

            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const gs = snap.data().gameState as BombGameState;
            if (!hpIsLive(gs)) return;

            const zeroAt = hpZeroAt(gs);
            // Too early — the fuse hasn't run out, or the finale is still playing.
            if (Date.now() < zeroAt + HP_FINALE_MS - CLOCK_TOLERANCE_MS) return;

            const victim = hpHolderAt(gs, zeroAt);
            const dud = Math.random() < HP_DUD_CHANCE; // rolled now, never stored early

            if (hpContextOf(gs) === 'tournament') {
                transaction.update(
                    groupRef,
                    dud ? tournamentDud(gs, victim) : tournamentOutcome(gs, victim)
                );
                return;
            }

            if (dud) {
                // Duel dud: the round ends, nobody loses a life, nobody scores.
                transaction.update(groupRef, {
                    'gameState.phase': 'exploded',
                    'gameState.defused': false,
                    'gameState.explodedPlayerId': victim,
                    'gameState.hpDudPlayerId': victim,
                    'gameState.hpDudLine': pickDudLine(),
                    'gameState.currentHolderId': victim,
                    'gameState.hpHolderId': victim,
                    'gameState.wireChoice': deleteField(),
                    'gameState.hpLazy': deleteField(),
                });
                return;
            }

            // Duel: the victim loses a life, the other duelist scores.
            const survivor = (gs.hpPlayers ?? []).find((id) => id !== victim);
            const currentLives = gs.lives[victim] ?? 0;
            const newLives = Math.max(0, currentLives - 1);
            const eliminated = newLives === 0 && !gs.ghosts.includes(victim);

            const updates: Record<string, unknown> = {
                'gameState.phase': 'exploded',
                'gameState.defused': false,
                'gameState.explodedPlayerId': victim,
                'gameState.currentHolderId': victim,
                'gameState.hpHolderId': victim,
                'gameState.wireChoice': deleteField(),
                'gameState.hpLazy': deleteField(),
                'gameState.lives': { ...gs.lives, [victim]: newLives },
                'gameState.lastLifeLostPlayerId': victim,
            };
            if (eliminated) {
                updates['gameState.ghosts'] = [...gs.ghosts, victim];
                updates['gameState.ghostEvents'] = [...(gs.ghostEvents ?? []), victim];
                if (!(gs.everGhosted ?? []).includes(victim)) {
                    updates['gameState.everGhosted'] = [...(gs.everGhosted ?? []), victim];
                }
            }

            applyFusePoints(updates, gs, victim, FUSE_POINTS.WIRE_EXPLODED_SELF, 'Hot potato!');
            if (survivor) {
                applyFusePoints(updates, gs, survivor, FUSE_POINTS.WIRE_DEFUSED, 'Survived the hot potato!');
            }

            transaction.update(groupRef, updates);
            survivorId = survivor ?? null;
        });
    } catch (e) {
        if (__DEV__) console.warn('[explodeHotPotato] transaction failed', e);
    }

    // Outside the transaction: only the call that actually exploded the bomb scores.
    if (survivorId) {
        await addScore(group.id, survivorId, ROUND_WIN_SCORE, group.scores);
    }
};