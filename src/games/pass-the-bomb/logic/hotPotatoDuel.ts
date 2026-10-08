// ── HOT POTATO DUEL ──────────────────────────────────────────────
// The final 2-player duel. A hidden timer (10–50s) and a limited pass
// budget. No wires: whoever is holding the bomb when the timer runs out
// loses a life.
//
// The bomb's mood is driven by HOW the players pass, decided on the
// server inside each pass so every phone sees the same thing:
//   😐 Neutral — plain hidden timer (start of every duel)
//   😠 Angry   — quick back-and-forth passing → the fuse speeds up
//   😴 Lazy    — holding it a long time → after a pass the bomb takes
//                1–4s to actually leave (longer holds = lazier). If the
//                timer runs out mid-delay, it blows up on the PASSER.
//   🥱 Bored   — steady, same-rhythm passing → random naps where the
//                fuse stops for a few seconds
// Mood shifts are weighted dice rolls, not fixed thresholds, so the same
// play doesn't always produce the same mood.

import { doc, runTransaction, deleteField } from 'firebase/firestore';
import { db } from '../../../shared/firebase/config';
import { Group, BombGameState } from '../../../shared/types';
import { addScore } from '../../../shared/firebase/groups';
import { FUSE_POINTS, applyFusePoints, ROUND_WIN_SCORE } from './bombHelpers';

export type HpMood = 'neutral' | 'angry' | 'lazy' | 'bored';

// ── Tuning ────────────────────────────────────────────────────────
export const HP_PASS_MIN = 4;
export const HP_PASS_MAX = 7;
const HP_TIMER_MIN_S = 10;
const HP_TIMER_MAX_S = 50;

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

// ── Clock helpers (shared by server functions and the screen) ─────
// The fuse runs from hpTimerStartedAt at hpSpeed, except during a nap.

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

// Who actually has the bomb at time t — a lazy pass only lands when it arrives.
export const hpHolderAt = (gs: BombGameState, t: number): string =>
    gs.hpLazy && gs.hpLazy.arrivesAt <= t ? gs.hpLazy.to : gs.currentHolderId;

export const hpPassesUsed = (gs: BombGameState, playerId: string): number =>
    gs.hpPassMode === 'each'
        ? gs.hpPassCounts?.[playerId] ?? 0
        : gs.hpTotalPasses ?? 0;

export const hpOutOfPasses = (gs: BombGameState, playerId: string): boolean =>
    hpPassesUsed(gs, playerId) >= (gs.hpPassBudget ?? HP_PASS_MIN);

// ── Start / reset ─────────────────────────────────────────────────
// Folded into markDuelReady's write when both players are ready.
export const buildHotPotatoStart = (now: number): Record<string, unknown> => ({
    'gameState.hpTimerStartedAt': now,
    'gameState.hpTimerDuration': rand(HP_TIMER_MIN_S, HP_TIMER_MAX_S),
    'gameState.hpSpeed': 1,
    'gameState.hpMood': 'neutral',
    'gameState.hpMoodLockUntil': 0,
    'gameState.hpHolds': [],
    'gameState.hpHoldStartedAt': now,
    'gameState.hpPassMode': Math.random() < 0.5 ? 'each' : 'total',
    'gameState.hpPassBudget':
        HP_PASS_MIN + Math.floor(Math.random() * (HP_PASS_MAX - HP_PASS_MIN + 1)),
    'gameState.hpPassCounts': {},
    'gameState.hpTotalPasses': 0,
    'gameState.hpLazy': deleteField(),
    'gameState.hpNap': deleteField(),
});

// Clears every hot potato field — used when a round starts.
export const hotPotatoResetFields = (): Record<string, unknown> => ({
    'gameState.hpTimerStartedAt': deleteField(),
    'gameState.hpTimerDuration': deleteField(),
    'gameState.hpSpeed': deleteField(),
    'gameState.hpMood': deleteField(),
    'gameState.hpMoodLockUntil': deleteField(),
    'gameState.hpHolds': deleteField(),
    'gameState.hpHoldStartedAt': deleteField(),
    'gameState.hpPassMode': deleteField(),
    'gameState.hpPassBudget': deleteField(),
    'gameState.hpPassCounts': deleteField(),
    'gameState.hpTotalPasses': deleteField(),
    'gameState.hpLazy': deleteField(),
    'gameState.hpNap': deleteField(),
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

export const hotPotatoPass = async (
    group: Group,
    fromId: string,
    toId: string
): Promise<HotPotatoPassResult> => {
    const groupRef = doc(db, 'groups', group.id);
    let result: HotPotatoPassResult = { success: false, reason: 'stale' };

    try {
        await runTransaction(db, async (transaction) => {
            result = { success: false, reason: 'stale' }; // fresh on every retry

            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const gs = snap.data().gameState as BombGameState;
            if (gs.phase !== 'duel' || gs.hpTimerStartedAt == null) return;
            if (gs.currentHolderId !== fromId) return;
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
                'gameState.passHistory': [
                    ...gs.passHistory,
                    { from: fromId, to: toId, timestamp: now, instruction: '(Hot potato)' },
                ].slice(-MAX_PASS_HISTORY),
                'gameState.holdCounts': {
                    ...gs.holdCounts,
                    [toId]: (gs.holdCounts?.[toId] ?? 0) + 1,
                },
            };
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
            // clock: carry the real remaining time forward from now, so nothing
            // already burned (or slept through) is counted twice.
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
                updates['gameState.currentHolderId'] = toId;
                updates['gameState.hpHoldStartedAt'] = now;
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
            if (gs.phase !== 'duel' || !gs.hpLazy) return;
            if (Date.now() < gs.hpLazy.arrivesAt - CLOCK_TOLERANCE_MS) return;

            transaction.update(groupRef, {
                'gameState.currentHolderId': gs.hpLazy.to,
                'gameState.hpHoldStartedAt': gs.hpLazy.arrivesAt,
                'gameState.hpLazy': deleteField(),
            });
        });
    } catch (e) {
        if (__DEV__) console.warn('[completeLazyTransfer] transaction failed', e);
    }
};

// ── Explosion ─────────────────────────────────────────────────────
// Any phone may call this once the fuse hits zero (host first, others as
// backup). Whoever held the bomb at that exact moment loses a life — if a
// lazy pass hadn't landed yet, that's the passer.
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
            if (gs.phase !== 'duel' || gs.hpTimerStartedAt == null) return;

            const zeroAt = hpZeroAt(gs);
            if (Date.now() < zeroAt - CLOCK_TOLERANCE_MS) return; // too early

            const victim = hpHolderAt(gs, zeroAt);
            const survivor =
                group.players.find((p) => p.id !== victim && !gs.ghosts.includes(p.id))?.id;

            const currentLives = gs.lives[victim] ?? 0;
            const newLives = Math.max(0, currentLives - 1);
            const eliminated = newLives === 0 && !gs.ghosts.includes(victim);

            const updates: Record<string, unknown> = {
                'gameState.phase': 'exploded',
                'gameState.defused': false,
                'gameState.explodedPlayerId': victim,
                'gameState.currentHolderId': victim,
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