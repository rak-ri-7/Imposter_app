import { doc, updateDoc, deleteField, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '../../../../shared/firebase/config';
import {
    Group,
    BombGameState,
    PassDispute,
    WireBet,
    BombQuirkState,
    BombCrush,
    PendingPass,
    QuirkDetail,
    RoundQuirk,
    PassEvent,
} from '../../../../shared/types';
import {
    QuirkVariant,
    QUIRK_INFO,
    QUIRK_REVEAL_MS,
    CRUSH_RECEIPTS,
    STRANGER_PASSES,
    LAZY_HOLD_MS,
    LAZY_DELAY_MS,
    LAZY_WAKE_MS,
    CRUSH_TAPS_MIN,
    CRUSH_TAPS_MAX,
    TOXIC_CALM_MS,
    TOXIC_MAX_TAPS,
    TOXIC_SPEEDUP,
    TOXIC_BURN_S,
    CUDDLE_MIN_MS,
    CUDDLE_MAX_MS,
    TWOFACED_CHANCE,
    SNEAK_MS,
    OBSESSED_MAX_RETURNS,
    STRANGER_BITE_S,
    STRANGER_PANIC_BELOW_S,
    GASLIGHT_MAX_BITE_S,
    SEETHING_SPEED,
    randInt,
    variantFor,
    strangerFleeChance,
} from './bombQuirks';
import {
    getRandomInstruction,
    getRandomPersonality,
    resolveInstructionTargets,
    EligibilityContext,
    instructions,
} from '../../data/content';
import { applyGameEvent, applyRoundEndEvents } from './achievementEngine';
import { potCapFor, potForHold } from './bombPot';
import { buildActiveQuiz } from './Fastestfinger';
import { FUSE_POINTS, applyFusePoints, auctionRefundUpdates, ROUND_WIN_SCORE, GAME_WIN_SCORE_BONUS, RUNNER_UP_SCORE_BONUS, markDisputeOutcome } from './bombHelpers';
import { settleBets, settleWinnerBets } from './betEngine';
import { FP_PER_POINT } from '../../data/betOdds';
import { payGhostStipends } from './ghostEconomy';
import { isBoomerangPass } from './boomerang';
import { getRunnerUp } from './placings';
import { addScore } from '../../../../shared/firebase/groups';
import { buildHotPotatoStart, hotPotatoResetFields } from './hotPotatoDuel';
import { startDuelFastestFinger } from './duelFastestFinger';
import { startHotSeatDuel } from './hotSeatDuel';



const BOMB_MIN_DURATION = 20;
const BOMB_MAX_DURATION = 90;
export const PANIC_THRESHOLD = 5;
export const GHOST_WINDOW_MAX_MS = 5000;
export const GHOST_WINDOW_MIN_MS = 3000;

// Failsafe: non-host phones step in this long after a missed deadline.
export const FAILSAFE_GRACE_MS = 2000;
export const FAILSAFE_RETRY_MS = 1000;

// Phone clocks can disagree slightly — server functions allow this much early.
const CLOCK_TOLERANCE_MS = 500;

const CALM_RESUME_MIN_MS = 2000;
const CALM_RESUME_MAX_MS = 4000;
export const GHOST_REVEAL_MS = 3000; // eerie intro, only when a ghost accepted


// ── DOCUMENT-SIZE SAFETY CAPS ────────────────────────────────────
// Firestore documents cap out at 1MB. passHistory/usedPersonalities/
// usedQuizQuestions all grow monotonically across a long game with no
// natural reset, so each write appends unboundedly unless capped. These
// caps keep the document small regardless of how many rounds are played,
// without meaningfully affecting gameplay — passHistory beyond the last
// 50 events isn't used by any live logic (only the current round's
// replay screen needs recent entries), and re-seeing a used personality
// or quiz question after 8/40 unique ones have cycled through is a
// negligible repetition cost against the alternative of the doc growing
// forever.
const MAX_PASS_HISTORY = 50;
const MAX_USED_PERSONALITIES = 8;
const MAX_USED_QUIZ_QUESTIONS = 40;
const MAX_ROUND_SUMMARIES = 10;
const REVEAL_DURATION_MS = 3000;

export const ITEM_PRICES = {
    WIRE_REVEALER: 20,
    BOMB_SHIELD: 30,
} as const;

const REVEALER_ACCURACY_START = 85;
const REVEALER_ACCURACY_STEP = 15;
const REVEALER_ACCURACY_FLOOR = 55;
// Accuracy of the NEXT revealer a player would get, given how many they've bought.
export const nextRevealerAccuracy = (bought: number): number =>
    Math.max(
        REVEALER_ACCURACY_FLOOR,
        REVEALER_ACCURACY_START - bought * REVEALER_ACCURACY_STEP
    );


const getRandomDuration = () =>
    Math.floor(Math.random() * (BOMB_MAX_DURATION - BOMB_MIN_DURATION + 1)) +
    BOMB_MIN_DURATION;

const pickLowestFpHolder = (playerIds: string[], fp: Record<string, number>): string => {
    const low = Math.min(...playerIds.map((id) => fp[id] ?? 0));
    return pickRandomHolder(playerIds.filter((id) => (fp[id] ?? 0) === low));
};

const pickRandomHolder = (playerIds: string[]): string =>
    playerIds[Math.floor(Math.random() * playerIds.length)];

const pickRandomWire = (): 'red' | 'blue' =>
    Math.floor(Math.random() * 2) === 0 ? 'red' : 'blue';

// Bets placed on a wire cut that never happened get their tickets back.
const refundActiveBets = (gameState: BombGameState): Record<string, unknown> => {
    const updates: Record<string, unknown> = {
        'gameState.activeBets': {},
        'gameState.ghostWindowEndsAt': deleteField(),
        'gameState.ghostRevealEndsAt': deleteField(),
    };
    for (const bet of Object.values(gameState.activeBets ?? {})) {
        updates[`gameState.bettingTickets.${bet.ghostId}`] =
            (gameState.bettingTickets?.[bet.ghostId] ?? 0) + 1;
    }
    return updates;
};

const buildEligibilityContext = (
    gameState: BombGameState,
    holderId: string,
    activePlayerIds: string[]
): EligibilityContext => ({
    passHistoryLength: gameState.passHistory.length,
    roundNumber: gameState.roundNumber,
    chainPassed: gameState.chainPassed,
    activePlayerIds,
    holderId,
    previousRoundWireCutPlayerId: gameState.previousRoundWireCutPlayerId,
    lastLifeLostPlayerId: gameState.lastLifeLostPlayerId,
    everGhosted: gameState.everGhosted ?? [],
    seatingOrder: gameState.seatingOrder ?? [],
    holdCounts: gameState.holdCounts ?? {},
    firstHolderEver: gameState.firstHolderEver,
    firstPasserOf: gameState.firstPasserOf,
    lastPassedTo: gameState.lastPassedTo,
    wireCutters: gameState.wireCutters ?? [],
    passCounts: gameState.passCounts ?? {},

});

// Only one call per round gets to advance it — protects the payouts that
// run before the new round is written.
const claimRoundAdvance = async (groupId: string, roundNumber: number): Promise<boolean> => {
    const groupRef = doc(db, 'groups', groupId);
    let claimed = false;
    await runTransaction(db, async (transaction) => {
        claimed = false; // a retried attempt must not inherit the last one's result
        const snap = await transaction.get(groupRef);
        if (!snap.exists()) return;
        const gameState = snap.data().gameState as BombGameState;
        if (gameState.phase !== 'replay') return;
        // Someone is already advancing this round, unless that claim is old:
        // still on the replay long after claiming means that advance failed.
        const claimAge = Date.now() - (gameState.roundAdvanceClaimedAt ?? 0);
        if (gameState.roundAdvanceClaimed === roundNumber && claimAge < STALE_CLAIM_MS) return;
        transaction.update(groupRef, {
            'gameState.roundAdvanceClaimed': roundNumber,
            'gameState.roundAdvanceClaimedAt': Date.now(),
        });
        claimed = true;
    });
    return claimed;
};

const STALE_CLAIM_MS = 15_000;

// The advance failed: let the host's Next Round button work again.
const releaseRoundAdvance = async (groupId: string, roundNumber: number): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(groupRef);
        if (!snap.exists()) return;
        const gameState = snap.data().gameState as BombGameState;
        if (gameState.phase !== 'replay' || gameState.roundAdvanceClaimed !== roundNumber) return;
        transaction.update(groupRef, {
            'gameState.roundAdvanceClaimed': deleteField(),
            'gameState.roundAdvanceClaimedAt': deleteField(),
        });
    });
};



export const SHOP_PRICES = {
    BETTING_TICKET: 20,
    TBC_TICKET: 30,
} as const;

export const purchaseBettingTicket = async (
    group: Group,
    playerId: string
): Promise<{ success: boolean; reason?: string }> => {
    const groupRef = doc(db, 'groups', group.id);
    let result: { success: boolean; reason?: string } = { success: false };

    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(groupRef);
        if (!snap.exists()) {
            result = { success: false, reason: 'not-found' };
            return;
        }
        const gameState = snap.data().gameState as BombGameState;


        // First purchase of this item type is always free for this player —
        // not an automatic grant, they still have to tap buy, it just costs
        // 0 FP exactly once. Every purchase after that costs full price.
        const alreadyClaimedFree = gameState.freeBettingClaimed?.[playerId] ?? false;
        const price = alreadyClaimedFree ? SHOP_PRICES.BETTING_TICKET : 0;

        // FP can be negative — a free claim (price 0) must not be gated on it.
        const currentFP = gameState.fusePoints?.[playerId] ?? 0;
        if (price > 0 && currentFP < price) {
            result = { success: false, reason: 'insufficient-fp' };
            return;
        }

        const updates: Record<string, unknown> = {
            [`gameState.fusePoints.${playerId}`]: currentFP - price,
            [`gameState.bettingTickets.${playerId}`]:
                (gameState.bettingTickets?.[playerId] ?? 0) + 1,
        };
        if (!alreadyClaimedFree) {
            updates[`gameState.freeBettingClaimed.${playerId}`] = true;
        }


        transaction.update(groupRef, updates);
        result = { success: true };
    });

    return result;
};

export const purchaseTbcTicket = async (
    group: Group,
    playerId: string
): Promise<{ success: boolean; reason?: string }> => {
    const groupRef = doc(db, 'groups', group.id);
    let result: { success: boolean; reason?: string } = { success: false };

    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(groupRef);
        if (!snap.exists()) {
            result = { success: false, reason: 'not-found' };
            return;
        }
        const gameState = snap.data().gameState as BombGameState;

        const alreadyClaimedFree = gameState.freeTbcClaimed?.[playerId] ?? false;
        const price = alreadyClaimedFree ? SHOP_PRICES.TBC_TICKET : 0;

        const currentFP = gameState.fusePoints?.[playerId] ?? 0;
        if (price > 0 && currentFP < price) {
            result = { success: false, reason: 'insufficient-fp' };
            return;
        }

        const updates: Record<string, unknown> = {
            [`gameState.fusePoints.${playerId}`]: currentFP - price,
            [`gameState.tbcTickets.${playerId}`]:
                (gameState.tbcTickets?.[playerId] ?? 0) + 1,
        };
        if (!alreadyClaimedFree) {
            updates[`gameState.freeTbcClaimed.${playerId}`] = true;
        }


        transaction.update(groupRef, updates);
        result = { success: true };
    });

    return result;
};

export const purchaseWireRevealer = async (
    group: Group,
    playerId: string
): Promise<{ success: boolean; reason?: string; accuracy?: number }> => {
    const groupRef = doc(db, 'groups', group.id);
    let result: { success: boolean; reason?: string; accuracy?: number } = { success: false };

    await runTransaction(db, async (transaction) => {
        result = { success: false, reason: 'not-found' };
        const snap = await transaction.get(groupRef);
        if (!snap.exists()) return;
        const gameState = snap.data().gameState as BombGameState;

        const fp = gameState.fusePoints?.[playerId] ?? 0;
        if (fp < ITEM_PRICES.WIRE_REVEALER) {
            result = { success: false, reason: 'insufficient-fp' };
            return;
        }

        const bought = gameState.revealerPurchases?.[playerId] ?? 0;
        const accuracy = nextRevealerAccuracy(bought);
        const owned = [...(gameState.revealerItems?.[playerId] ?? []), accuracy]
            .sort((a, b) => b - a); // best first

        const updates: Record<string, unknown> = {
            [`gameState.fusePoints.${playerId}`]: fp - ITEM_PRICES.WIRE_REVEALER,
            [`gameState.revealerPurchases.${playerId}`]: bought + 1,
            [`gameState.revealerItems.${playerId}`]: owned,
        };


        transaction.update(groupRef, updates);
        result = { success: true, accuracy };
    });
    return result;
};

export const purchaseBombShield = async (
    group: Group,
    playerId: string
): Promise<{ success: boolean; reason?: string }> => {
    const groupRef = doc(db, 'groups', group.id);
    let result: { success: boolean; reason?: string } = { success: false };

    await runTransaction(db, async (transaction) => {
        result = { success: false, reason: 'not-found' };
        const snap = await transaction.get(groupRef);
        if (!snap.exists()) return;
        const gameState = snap.data().gameState as BombGameState;

        const fp = gameState.fusePoints?.[playerId] ?? 0;
        if (fp < ITEM_PRICES.BOMB_SHIELD) {
            result = { success: false, reason: 'insufficient-fp' };
            return;
        }

        const updates: Record<string, unknown> = {
            [`gameState.fusePoints.${playerId}`]: fp - ITEM_PRICES.BOMB_SHIELD,
            [`gameState.shieldItems.${playerId}`]: (gameState.shieldItems?.[playerId] ?? 0) + 1,
        };

        transaction.update(groupRef, updates);
        result = { success: true };
    });
    return result;
};

export const activateWireRevealer = async (
    group: Group,
    playerId: string
): Promise<{ success: boolean; reason?: string }> => {
    const groupRef = doc(db, 'groups', group.id);
    let result: { success: boolean; reason?: string } = { success: false };

    await runTransaction(db, async (transaction) => {
        result = { success: false, reason: 'not-allowed' };
        const snap = await transaction.get(groupRef);
        if (!snap.exists()) return;
        const gameState = snap.data().gameState as BombGameState;

        // Holder only, during the real countdown, before a wire is locked.
        if (gameState.phase !== 'panic' || gameState.currentHolderId !== playerId) return;
        if (!gameState.panicStartedAt || gameState.ghostWindowEndsAt) return;
        if (gameState.wireChoice) return;
        if (gameState.revealerHints?.[playerId]) {
            result = { success: false, reason: 'already-used' };
            return;
        }

        const owned = gameState.revealerItems?.[playerId] ?? [];
        if (owned.length === 0) {
            result = { success: false, reason: 'none-owned' };
            return;
        }
        const [accuracy, ...rest] = owned; // spend the best one

        const correct = gameState.correctWire;
        const other = correct === 'red' ? 'blue' : 'red';
        const wire = Math.random() * 100 < accuracy ? correct : other;

        transaction.update(groupRef, {
            [`gameState.revealerItems.${playerId}`]: rest,
            [`gameState.revealerHints.${playerId}`]: { wire, accuracy },
        });
        result = { success: true };
    });
    return result;
};

export const armBombShield = async (
    group: Group,
    playerId: string
): Promise<{ success: boolean; reason?: string }> => {
    const groupRef = doc(db, 'groups', group.id);
    let result: { success: boolean; reason?: string } = { success: false };

    await runTransaction(db, async (transaction) => {
        result = { success: false, reason: 'not-allowed' };
        const snap = await transaction.get(groupRef);
        if (!snap.exists()) return;
        const gameState = snap.data().gameState as BombGameState;

        if (gameState.phase !== 'replay') return;           // between rounds only
        if (gameState.ghosts.includes(playerId)) return;
        const active = group.players.filter((p) => !gameState.ghosts.includes(p.id));
        if (active.length <= 2) {
            result = { success: false, reason: 'duel-next' }; // no shields in the duel
            return;
        }
        if ((gameState.shieldArmed ?? []).includes(playerId)) {
            result = { success: false, reason: 'already-armed' };
            return;
        }
        const owned = gameState.shieldItems?.[playerId] ?? 0;
        if (owned <= 0) {
            result = { success: false, reason: 'none-owned' };
            return;
        }
        transaction.update(groupRef, {
            [`gameState.shieldItems.${playerId}`]: owned - 1,
            'gameState.shieldArmed': [...(gameState.shieldArmed ?? []), playerId],
        });
        result = { success: true };
    });
    return result;
};


// ── START GAME ───────────────────────────────────────────────────
export const startBombGame = async (
    group: Group,
    timerMode: 'on' | 'off' | 'mixed',
    seatingOrder: string[],
    strictMemoryMode: boolean = true
): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    const playerIds = group.players.map((p) => p.id);
    const personality = getRandomPersonality([], group.players.length, timerMode);
    const duration = getRandomDuration();
    const startingHolder = pickRandomHolder(playerIds);
    const correctWire = pickRandomWire();

    // No game history yet — build a "fresh game" context per player so
    // history-dependent instructions (memory ones) are correctly excluded
    // from the very first assignment.
    const freshCtx: Omit<EligibilityContext, 'holderId'> = {
        passHistoryLength: 0,
        roundNumber: 1,
        chainPassed: [],
        activePlayerIds: playerIds,
        everGhosted: [],
        seatingOrder,
        holdCounts: { [startingHolder]: 1 },
        firstHolderEver: startingHolder,
        firstPasserOf: {},
        lastPassedTo: {},
        wireCutters: [],
        passCounts: {},
    };
    const texts: Record<string, string> = {};
    const ids: Record<string, string> = {};
    const fallbackTexts: Record<string, string> = {};
    const used: string[] = [];
    for (const pid of playerIds) {
        const ctx: EligibilityContext = { ...freshCtx, holderId: pid };
        const instruction = getRandomInstruction(used, ctx);
        texts[pid] = instruction.text;
        ids[pid] = instruction.id;
        fallbackTexts[pid] = instruction.fallbackText ?? '';
        used.push(instruction.id);
    }


    const lives: Record<string, number> = {};
    playerIds.forEach((id) => (lives[id] = 3));

    const ghostImmunePlayer =
        personality.effect === 'ghost'
            ? playerIds[Math.floor(Math.random() * playerIds.length)]
            : '';

    const gameState: BombGameState = {
        phase: 'reveal',
        revealEndsAt: Date.now() + REVEAL_DURATION_MS,
        currentHolderId: startingHolder,
        timerMode,
        timerStartedAt: 0,
        timerDuration: duration,

        correctWire: correctWire as 'red' | 'blue',
        personality: personality.id,
        personalityName: personality.name,
        personalityEmoji: personality.emoji,
        personalityEffect: personality.effect,
        personalityDescription: personality.description,
        instructions: texts,
        instructionIds: ids,
        instructionFallbacks: fallbackTexts,
        passHistory: [],
        lives,
        ghosts: [],
        everGhosted: [],
        roundNumber: 1,
        usedPersonalities: [personality.id],
        usedInstructions: [],
        boomerangUsed: {},
        chainPassed: [startingHolder],
        ghostImmunePlayers: ghostImmunePlayer ? [ghostImmunePlayer] : [],
        speedMultiplier: 1,
        seatingOrder,
        wrongPassCounts: {},
        holdCounts: { [startingHolder]: 1 },
        disputes: [],
        isPaused: false,
        usedQuizQuestions: [],
        roundSummaries: [],
        firstHolderEver: startingHolder,
        strictMemoryMode,
        fusePoints: {},
        duelChips: {},
        pointEvents: [],
        bettingTickets: {},
        tbcTickets: {},
        freeBettingClaimed: {},
        freeTbcClaimed: {},
        roundStartLives: lives,

    };

    // Quiz Bomb: fold the very first question directly into this same
    // write, rather than a separate follow-up call — closes the gap that
    // used to force BombFlowScreen to fall back on checking
    // `personalityEffect === 'quiz'` just to avoid a round-start flicker.
    if (personality.effect === 'quiz') {
        const { activeQuiz, usedQuestionId } = buildActiveQuiz(
            gameState.usedQuizQuestions,
            'quiz-round',
            false // main-game questions no longer chain themselves —
            // passBomb() triggers the next one once the holder passes.
        );
        gameState.activeQuiz = activeQuiz;
        gameState.usedQuizQuestions = [
            ...gameState.usedQuizQuestions,
            usedQuestionId,
        ].slice(-MAX_USED_QUIZ_QUESTIONS);
    }

    await updateDoc(groupRef, {
        status: 'playing',
        gameState,
    });
};

// ── PASS BOMB ────────────────────────────────────────────────────
export type PassResult =
    | { success: true; pending?: boolean; woke?: boolean }
    | {
        success: false;
        reason:
        | 'wrong-answer' | 'clingy-locked' | 'stale'
        | 'quirk-reveal'   // the mid-game quirk card is up (fuse paused)
        | 'in-transit'     // a lazy / sneaky pass is still on its way
        | 'crush'          // crush: it won't let go yet, tap again
        | 'toxic'          // toxic: impatient tap, the fuse sped up
        | 'toxic-boom'     // toxic: the 3rd impatient tap blew it
        | 'cuddled'        // cuddler: stuck in a hug for a few seconds
        | 'rebound'        // rebound: the pass bounced straight back
        | 'auction';       // auction round: Pass opens an auction instead
        penaltySeconds?: number;
        remainingLockMs?: number;
    };

// ── QUIRK PLUMBING (rules and words live in bombQuirks.ts) ──────────

// Quirks only exist in normal, live timer rounds.
const quirksLive = (gs: BombGameState): boolean =>
    gs.phase === 'playing' && !gs.duelRound && gs.personalityEffect !== 'quiz' &&
    gs.personalityEffect !== 'auction';

const cloneQuirks = (gs: BombGameState): BombQuirkState =>
    JSON.parse(JSON.stringify(gs.bombQuirks ?? {}));

// Firestore rejects undefined: JSON drops it.
const cleanQuirks = (q: BombQuirkState): BombQuirkState => JSON.parse(JSON.stringify(q));

// The timer as it will be once `updates` land — for follow-up maths.
const timerView = (gs: BombGameState, updates: Record<string, unknown>): BombGameState => ({
    ...gs,
    timerDuration: (updates['gameState.timerDuration'] as number | undefined) ?? gs.timerDuration,
    timerStartedAt: (updates['gameState.timerStartedAt'] as number | undefined) ?? gs.timerStartedAt,
    speedMultiplier: (updates['gameState.speedMultiplier'] as number | undefined) ?? gs.speedMultiplier,
    isPaused: (updates['gameState.isPaused'] as boolean | undefined) ?? gs.isPaused,
    pausedAt: (updates['gameState.pausedAt'] as number | undefined) ?? gs.pausedAt,
});

// Restart the clock at `now` with `remainingSec` left (optionally a new speed).
const reanchorTimer = (
    updates: Record<string, unknown>,
    gs: BombGameState,
    now: number,
    remainingSec: number,
    speed?: number
) => {
    const view = timerView(gs, updates);
    updates['gameState.timerDuration'] = Math.max(0, remainingSec);
    updates['gameState.timerStartedAt'] = now;
    updates['gameState.speedMultiplier'] = speed ?? view.speedMultiplier;
    // a paused clock is frozen at pausedAt, which must match the new anchor
    if (view.isPaused) updates['gameState.pausedAt'] = now;
};

// Freeze the fuse until `until`. An existing pause keeps its start, and its
// end only ever moves later. resumeTimer (every phone's watcher) unfreezes it.
export const pauseFuseUntil = (
    updates: Record<string, unknown>,
    gs: BombGameState,
    now: number,
    until: number
) => {
    const view = timerView(gs, updates);
    const pausedAt = view.isPaused && view.pausedAt ? view.pausedAt : now;
    const existingEnd = Math.max(
        gs.isPaused ? gs.pauseResumeAt ?? 0 : 0,
        (updates['gameState.pauseResumeAt'] as number | undefined) ?? 0
    );
    updates['gameState.isPaused'] = true;
    updates['gameState.pausedAt'] = pausedAt;
    updates['gameState.pauseResumeAt'] = Math.max(existingEnd, until);
};

// The full-screen mid-game card on every phone, with the fuse paused.
// Also records the find in the round log and the group's Bomb Collection.
// Returns when the card (and the pause) ends.
const revealQuirk = (
    updates: Record<string, unknown>,
    gs: BombGameState,
    data: Group,
    variant: QuirkVariant,
    playerId: string,
    now: number,
    detail?: QuirkDetail
): number => {
    const collection = data.bombCollection ?? {};
    const isNew = !collection[variant];
    if (isNew) updates[`bombCollection.${variant}`] = { foundAt: now, foundBy: playerId };
    const found = Object.keys(collection).length + (isNew ? 1 : 0);
    const clean = detail
        ? (JSON.parse(JSON.stringify(detail)) as QuirkDetail)
        : undefined;
    const hasDetail = !!clean && Object.keys(clean).length > 0;
    const endsAt = now + QUIRK_REVEAL_MS;

    updates['gameState.quirkReveal'] = {
        id: `${now}-${variant}`,
        variant,
        kind: QUIRK_INFO[variant].kind,
        playerId,
        endsAt,
        isNew,
        found,
        ...(hasDetail ? { detail: clean } : {}),
    };
    const list = (updates['gameState.roundQuirks'] as RoundQuirk[] | undefined) ?? gs.roundQuirks ?? [];
    updates['gameState.roundQuirks'] = [
        ...list,
        { variant, playerId, ...(hasDetail ? { detail: clean } : {}) },
    ];
    pauseFuseUntil(updates, gs, now, endsAt);
    return endsAt;
};

// The crush catches its bomb (again): set up this hold's twist.
// `startAt` is when play really resumes (after a reveal card, if any).
const onCrushCatch = (
    updates: Record<string, unknown>,
    gs: BombGameState,
    crush: BombCrush,
    now: number,
    startAt: number
) => {
    crush.taps = 0;
    delete crush.lastTapAt;
    if (crush.variant === 'crush') {
        crush.tapsNeeded = randInt(CRUSH_TAPS_MIN, CRUSH_TAPS_MAX);
    } else if (crush.variant === 'toxic') {
        crush.receivedAt = startAt;
    } else if (crush.variant === 'cuddler') {
        crush.lockUntil = startAt + randInt(CUDDLE_MIN_MS, CUDDLE_MAX_MS);
        pauseFuseUntil(updates, gs, now, crush.lockUntil);
    }
};

// The stranger bomb runs off: hand it to someone else, with a fresh instruction.
const fleeBombTo = (
    updates: Record<string, unknown>,
    gs: BombGameState,
    activePlayerIds: string[],
    strangerId: string,
    fleeId: string,
    now: number
) => {
    const history = (updates['gameState.passHistory'] as PassEvent[] | undefined) ?? gs.passHistory;
    const chain = (updates['gameState.chainPassed'] as string[] | undefined) ?? gs.chainPassed;
    const holds = (updates['gameState.holdCounts'] as Record<string, number> | undefined) ?? gs.holdCounts ?? {};
    const used = (updates['gameState.usedInstructions'] as string[] | undefined) ?? gs.usedInstructions;
    const newHistory = [
        ...history,
        { from: strangerId, to: fleeId, timestamp: now, instruction: '(fled 🙅)' },
    ].slice(-MAX_PASS_HISTORY);
    const newChain = [...chain, fleeId];
    const newHolds = { ...holds, [fleeId]: (holds[fleeId] ?? 0) + 1 };

    const ctx = buildEligibilityContext(
        { ...gs, passHistory: newHistory, chainPassed: newChain, holdCounts: newHolds },
        fleeId,
        activePlayerIds
    );
    const instruction = getRandomInstruction(used, ctx);
    const texts = (updates['gameState.instructions'] as Record<string, string> | undefined) ?? gs.instructions;
    const ids = (updates['gameState.instructionIds'] as Record<string, string> | undefined) ?? gs.instructionIds;
    const fallbacks = (updates['gameState.instructionFallbacks'] as Record<string, string> | undefined) ?? gs.instructionFallbacks;

    updates['gameState.currentHolderId'] = fleeId;
    updates['gameState.passHistory'] = newHistory;
    updates['gameState.chainPassed'] = newChain;
    updates['gameState.holdCounts'] = newHolds;
    updates['gameState.usedInstructions'] = [...used, instruction.id];
    updates['gameState.instructions'] = { ...texts, [fleeId]: instruction.text };
    updates['gameState.instructionIds'] = { ...ids, [fleeId]: instruction.id };
    updates['gameState.instructionFallbacks'] = { ...fallbacks, [fleeId]: instruction.fallbackText ?? '' };
};

// After a real pass from → to lands: what does the bomb make of it?
const applyArrivalQuirks = (
    updates: Record<string, unknown>,
    gs: BombGameState,
    data: Group,
    activePlayerIds: string[],
    fromId: string,
    toId: string,
    now: number,
    q: BombQuirkState
) => {
    if (!quirksLive(gs)) return;
    const personality = gs.personalityEffect;

    // One of its crushes just let go of it.
    const crush = q.crushes?.[fromId];
    if (crush && toId !== fromId) {
        crush.taps = 0;
        if (crush.variant === 'twofaced' && Math.random() < TWOFACED_CHANCE) {
            updates['gameState.pendingPass'] = {
                from: toId,
                to: fromId,
                arrivesAt: now + SNEAK_MS,
                kind: 'sneak',
            };
        }
        if (crush.variant === 'obsessed' && (crush.returnsLeft ?? OBSESSED_MAX_RETURNS) > 0) {
            crush.returnArmed = true;
        }
    }

    // 💘 A crush is born: the same player catches it for the 3rd time.
    // Each player can become a crush of their own.
    const receipts = gs.passHistory.filter((e) => e.to === toId).length + 1;
    const existing = q.crushes?.[toId];
    if (!existing && receipts >= CRUSH_RECEIPTS) {
        const fresh: BombCrush = { playerId: toId, variant: variantFor('crush', personality) };
        q.crushes = { ...(q.crushes ?? {}), [toId]: fresh };
        const resumeAt = revealQuirk(updates, gs, data, fresh.variant as QuirkVariant, toId, now, { receipts });
        onCrushCatch(updates, gs, fresh, now, resumeAt);
        return;
    }
    if (existing) onCrushCatch(updates, gs, existing, now, now);

    // 🙅 A stranger: someone who hadn't had it, after 4+ passes.
    const isStranger =
        gs.passHistory.length >= STRANGER_PASSES &&
        !gs.chainPassed.includes(toId) &&
        !(q.strangersHit ?? []).includes(toId);
    if (!isStranger) return;

    const variant = variantFor('stranger', personality);
    q.strangersHit = [...(q.strangersHit ?? []), toId];
    const others = activePlayerIds.filter((id) => id !== toId);
    if (others.length > 0 && Math.random() < strangerFleeChance(variant)) {
        const fleeId = others[Math.floor(Math.random() * others.length)];
        fleeBombTo(updates, gs, activePlayerIds, toId, fleeId, now);
        applyGameEvent(updates, gs, toId, { kind: 'bomb-fled', playerId: toId });
        revealQuirk(updates, gs, data, variant, toId, now, { fledTo: fleeId });
        return;
    }
    const remaining = computeRoundRemaining(timerView(gs, updates), now);
    const bite = variant === 'gaslighter' ? randInt(0, GASLIGHT_MAX_BITE_S) : STRANGER_BITE_S;
    const panic = remaining < STRANGER_PANIC_BELOW_S;
    const after = panic ? PANIC_THRESHOLD : Math.max(PANIC_THRESHOLD, remaining - bite);
    revealQuirk(updates, gs, data, variant, toId, now, { bite, ...(panic ? { panic: true } : {}) });
    reanchorTimer(updates, gs, now, after);
};

// Everything a successful pass from → to changes. Shared by a normal tap and
// by a delayed (lazy / sneaky) pass landing later.
export const applyPassSuccess = (
    updates: Record<string, unknown>,
    gameState: BombGameState,
    group: Group,
    fromId: string,
    toId: string,
    now: number,
    opts: { usedFallback?: boolean; boomerang?: boolean; label?: string; rewards?: boolean; heldMs?: number }
) => {
    const isDuel = gameState.phase === 'duel' || gameState.phase === 'duel-intro';
    const personality = isDuel ? null : gameState.personalityEffect;
    const activePlayerIds = group.players
        .filter((p) => !gameState.ghosts.includes(p.id))
        .map((p) => p.id);
    const rewards = opts.rewards !== false;

    const fallbackText = gameState.instructionFallbacks?.[fromId] ?? '';
    const passEvent = {
        from: fromId,
        to: toId,
        timestamp: now,
        instruction: opts.label ?? gameState.instructions[fromId] ?? '',
        ...(opts.boomerang
            ? { boomerang: true }
            : opts.usedFallback && fallbackText
                ? { usedFallback: true, fallback: fallbackText }
                : {}),
    };

    const newCtx = buildEligibilityContext(gameState, toId, activePlayerIds);
    const newInstruction = getRandomInstruction(gameState.usedInstructions, newCtx);
    const newInstructions = {
        ...gameState.instructions,
        [toId]: newInstruction.text,
    };
    const newInstructionIds = {
        ...gameState.instructionIds,
        [toId]: newInstruction.id,
    };
    const newInstructionFallbacks = {
        ...gameState.instructionFallbacks,
        [toId]: newInstruction.fallbackText ?? '',
    };

    let newDuration = gameState.timerDuration;
    let newSpeedMultiplier = gameState.speedMultiplier;
    let newTimerStartedAt = gameState.timerStartedAt;

    // Angry bomb — speeds up each pass. We must carry forward the ACTUAL
    // remaining time (already inflated by the current multiplier) before
    // resetting the clock, not the original full duration — otherwise every
    // pass resets `timerStartedAt` to now while `timerDuration` stays
    // unchanged, which makes `elapsed` snap to ~0 and the countdown appears
    // to refill to nearly full every time someone passes, no matter how
    // high the multiplier has climbed.
    if (personality === 'angry') {
        const elapsedSoFar =
            ((now - gameState.timerStartedAt) / 1000) * gameState.speedMultiplier;
        const trueRemaining = Math.max(0, gameState.timerDuration - elapsedSoFar);
        newSpeedMultiplier = Math.min(gameState.speedMultiplier * 1.3, 4);
        newDuration = trueRemaining;
        newTimerStartedAt = now;
    }

    // Cursed bomb — passing to someone who passed to you costs 5 seconds
    const lastPasser = gameState.passHistory.length > 0
        ? gameState.passHistory[gameState.passHistory.length - 1].from
        : null;
    if (personality === 'cursed' && lastPasser === toId) {
        const elapsed = (now - gameState.timerStartedAt) / 1000;
        const remaining = newDuration - elapsed;
        newDuration = Math.max(0, remaining - 5);
        newTimerStartedAt = now; // reset so downstream calc doesn't double-subtract
    }

    // In the critical stage, every successful pass gives the new holder a
    // fresh five seconds to either pass again or cut a wire.
    if (gameState.phase === 'panic') {
        newDuration = PANIC_THRESHOLD;
        newTimerStartedAt = now;
    }

    const newChainPassed = [...gameState.chainPassed, toId];

    // Lifetime hold-count tracking (used for the m5 "fewest overall" check;
    // also generally useful data to have around).
    const newHoldCounts = {
        ...gameState.holdCounts,
        [toId]: (gameState.holdCounts?.[toId] ?? 0) + 1,
    };

    const newFirstPasserOf = gameState.firstPasserOf?.[toId]
        ? gameState.firstPasserOf
        : { ...gameState.firstPasserOf, [toId]: fromId };

    Object.assign(updates, {
        'gameState.currentHolderId': toId,
        // Capped — passHistory only needs recent entries for the replay
        // screen and any active memory-instruction lookups (which only
        // ever look at the CURRENT round anyway, and this round's data
        // is always well within the last 50 events).
        'gameState.passHistory': [...gameState.passHistory, passEvent].slice(-MAX_PASS_HISTORY),
        'gameState.instructions': newInstructions,
        'gameState.instructionIds': newInstructionIds,
        'gameState.instructionFallbacks': newInstructionFallbacks,

        'gameState.usedInstructions': [
            ...gameState.usedInstructions,
            newInstruction.id,
        ],
        'gameState.chainPassed': newChainPassed,
        'gameState.timerDuration': newDuration,

        'gameState.speedMultiplier': newSpeedMultiplier,
        'gameState.timerStartedAt': newTimerStartedAt,
        'gameState.boomerangUsed': personality === 'boomerang'
            ? { ...gameState.boomerangUsed, [fromId]: true }
            : gameState.boomerangUsed,
        [`gameState.wrongPassCounts.${fromId}`]: 0,
        'gameState.clingy': deleteField(),
        'gameState.holdCounts': newHoldCounts,
        'gameState.firstPasserOf': newFirstPasserOf,
        'gameState.lastPassedTo': { ...gameState.lastPassedTo, [fromId]: toId },
        'gameState.passCounts': {
            ...gameState.passCounts,
            [fromId]: (gameState.passCounts?.[fromId] ?? 0) + 1,

        },
        'gameState.wireChoice': deleteField(),
    });
    // a paused clock re-anchored here must stay frozen where it is
    if (gameState.isPaused && newTimerStartedAt === now && gameState.timerStartedAt !== now) {
        updates['gameState.pausedAt'] = now;
    }

    if (gameState.phase === 'panic') {
        updates['gameState.panicStartedAt'] = now;
        updates['gameState.panicSeq'] = (gameState.panicSeq ?? 0) + 1; // a fresh countdown

        // Any bets placed for THIS holder's cut never got their target
        // event — refund the tickets rather than silently losing them.
        const bets = Object.values(gameState.activeBets ?? {});
        if (bets.length > 0) {
            const refundUpdates: Record<string, unknown> = {};
            for (const bet of bets) {
                const current = gameState.bettingTickets?.[bet.ghostId] ?? 0;
                refundUpdates[`gameState.bettingTickets.${bet.ghostId}`] = current + 1;
            }
            Object.assign(updates, refundUpdates);
            updates['gameState.activeBets'] = {};
        }
    }

    // Quiz Bomb: a completed manual pass is what kicks off the NEXT
    // Fastest Finger interlude for the new holder — the quiz resolution
    // itself no longer triggers this (see fastestFinger.ts's
    // resolveFastestFingerQuestion, 'quiz-round' branch). Folded into
    // this same write rather than a separate round-trip, for the same
    // no-gap reason as the round-start case above.
    if (personality === 'quiz' && gameState.phase === 'playing') {
        const { activeQuiz, usedQuestionId } = buildActiveQuiz(
            gameState.usedQuizQuestions ?? [],
            'quiz-round',
            false
        );
        updates['gameState.activeQuiz'] = activeQuiz;
        updates['gameState.usedQuizQuestions'] = [
            ...(gameState.usedQuizQuestions ?? []),
            usedQuestionId,
        ].slice(-MAX_USED_QUIZ_QUESTIONS);
    }

    if (!rewards) return;

    // How long the passer held it: measured on their own phone when it sent
    // one (immune to clock differences between phones and to pauses), else
    // since the last pass to them / the round start.
    const heldMs = opts.heldMs ?? Math.max(0, now - heldSince(gameState, fromId));

    applyGameEvent(updates, gameState, fromId, {
        kind: 'pass',
        fromId,
        heldMs,
    });

    applyFusePoints(
        updates,
        gameState,
        fromId,
        FUSE_POINTS.SURVIVED_HOLD_AND_PASSED,
        'Survived your hold'
    );

    // 💰 The pot: banked as the pass lands, but only in normal play. If the
    // panic countdown started first (e.g. during a lazy pass), it burned.
    if (!isDuel && gameState.phase === 'playing') {
        const pot = potForHold(heldMs, potCapFor(gameState));
        if (pot > 0) {
            applyFusePoints(updates, gameState, fromId, pot, `💰 Pot banked (${Math.floor(heldMs / 1000)}s hold)`);
        }
    }
};

// Leeway when checking a phone's hold time against the shared timestamps.
const HOLD_CLOCK_SLACK_MS = 10_000;

// How long the holder has had it (since the last pass to them, or the round start).
const heldSince = (gs: BombGameState, holderId: string): number => {
    const lastIn = gs.passHistory[gs.passHistory.length - 1];
    return lastIn && lastIn.to === holderId ? lastIn.timestamp : gs.timerStartedAt;
};

export const passBomb = async (
    group: Group,
    fromId: string,
    toId: string,
    usedFallback: boolean = false,
    // Hold time measured on the holder's phone, counting only while the fuse
    // actually ran. Comparing this phone's clock with the timestamp another
    // phone wrote breaks whenever the two clocks disagree, and would also
    // count quirk cards / pauses as holding.
    clientHeldMs?: number
): Promise<PassResult> => {
    const groupRef = doc(db, 'groups', group.id);
    let result: PassResult = { success: false, reason: 'stale' };

    try {
        await runTransaction(db, async (transaction) => {
            // A retried attempt must not inherit the last attempt's result.
            result = { success: false, reason: 'stale' };

            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const data = snap.data() as Group;
            const gameState = data.gameState as BombGameState;
            const now = Date.now();

            // Stale tap: the bomb already moved on, or the round already ended.
            if (gameState.currentHolderId !== fromId) return;
            if (['exploded', 'replay', 'result', 'penalty'].includes(gameState.phase)) return;
            if (gameState.toxicBoom) return;
            // During panic, passing only opens once the real countdown is running
            // (not during the ghost window or the ghost reveal).
            if (gameState.phase === 'panic' && (!gameState.panicStartedAt || gameState.ghostWindowEndsAt)) return;

            // 🔨 Auction round: in normal play the bomb only moves by auction.
            if (gameState.phase === 'playing' && gameState.personalityEffect === 'auction' && !gameState.duelRound) {
                result = { success: false, reason: 'auction' };
                return;
            }

            // The quirk card is up: everyone is reading, the fuse is paused.
            if (gameState.quirkReveal && now < gameState.quirkReveal.endsAt) {
                result = { success: false, reason: 'quirk-reveal' };
                return;
            }
            // A lazy / sneaky pass is still on its way: nobody can pass it.
            if (gameState.pendingPass) {
                result = { success: false, reason: 'in-transit' };
                return;
            }

            // The phone's own hold time, sanity-capped: never negative, and
            // never more than the hold the shared timestamps show plus some
            // slack for phones whose clocks disagree.
            const phoneHeldMs =
                clientHeldMs !== undefined && Number.isFinite(clientHeldMs)
                    ? Math.min(
                        Math.max(0, clientHeldMs),
                        Math.max(0, now - heldSince(gameState, fromId)) + HOLD_CLOCK_SLACK_MS
                    )
                    : undefined;

            // Personalities never apply in 2-player duels — plain timer only.
            const isDuel = gameState.phase === 'duel' || gameState.phase === 'duel-intro';

            // Guard: holder currently clingy-locked — cannot pass at all
            if (
                gameState.clingy &&
                gameState.clingy.holderId === fromId &&
                now < gameState.clingy.until
            ) {
                result = {
                    success: false,
                    reason: 'clingy-locked',
                    remainingLockMs: gameState.clingy.until - now,
                };
                return;
            }

            if (gameState.wireChoice) return;

            // Validate against the instruction's objective answer, if any
            const instructionId = gameState.instructionIds?.[fromId];
            const instructionDef = instructions.find((i) => i.id === instructionId);
            const skipMemoryEnforcement =
                instructionDef?.category === 'memory' && gameState.strictMemoryMode === false;
            const activePlayerIds = group.players
                .filter((p) => !gameState.ghosts.includes(p.id))
                .map((p) => p.id);
            const ctx = buildEligibilityContext(gameState, fromId, activePlayerIds);
            const boomerang = !isDuel && isBoomerangPass(gameState, fromId, toId);
            const correctTargets = instructionId && !skipMemoryEnforcement && !boomerang
                ? resolveInstructionTargets(instructionId, ctx)
                : null;
            if (correctTargets !== null && !correctTargets.includes(toId)) {
                const prevCount = gameState.wrongPassCounts?.[fromId] ?? 0;
                const newCount = prevCount + 1;
                const penaltySeconds = Math.min(2 * newCount, 10);

                const wrongPassUpdates: Record<string, unknown> = {
                    [`gameState.wrongPassCounts.${fromId}`]: newCount,
                    'gameState.clingy': {
                        holderId: fromId,
                        until: now + penaltySeconds * 1000,
                        penaltySeconds,
                    },
                };


                // wrong-answer branch: replace the updateDoc + return with
                transaction.update(groupRef, wrongPassUpdates);
                result = { success: false, reason: 'wrong-answer', penaltySeconds };
                return;
            }

            // ── A correct pass. The bomb's quirks get a say first. ──────────
            const live = quirksLive(gameState);
            const q = live ? cloneQuirks(gameState) : {};
            const updates: Record<string, unknown> = {};
            const finish = (r: PassResult) => {
                if (live) updates['gameState.bombQuirks'] = cleanQuirks(q);
                transaction.update(groupRef, updates);
                result = r;
            };

            let targetId = toId;
            let label: string | undefined;
            const crush = q.crushes?.[fromId];
            if (live && crush) {
                if (crush.variant === 'crush') {
                    // 💘 2–5 taps (secret) before it lets go.
                    const taps = (crush.taps ?? 0) + 1;
                    if (taps < (crush.tapsNeeded ?? CRUSH_TAPS_MIN)) {
                        crush.taps = taps;
                        return finish({ success: false, reason: 'crush' });
                    }
                } else if (crush.variant === 'toxic') {
                    // ☠️ Leave it alone for 3s, or every tap makes it worse.
                    const calmSince = Math.max(crush.receivedAt ?? 0, crush.lastTapAt ?? 0);
                    if (now - calmSince < TOXIC_CALM_MS) {
                        const taps = (crush.taps ?? 0) + 1;
                        crush.taps = taps;
                        crush.lastTapAt = now;
                        if (taps >= TOXIC_MAX_TAPS) {
                            // Boom, right here — resolvePanicOutcome finishes it.
                            Object.assign(updates, {
                                'gameState.phase': 'panic',
                                'gameState.toxicBoom': true,
                                'gameState.panicStartedAt': now,
                                'gameState.panicSeq': (gameState.panicSeq ?? 0) + 1,
                                'gameState.timerStartedAt': now,
                                'gameState.timerDuration': PANIC_THRESHOLD,
                                'gameState.isPaused': false,
                                'gameState.pausedAt': deleteField(),
                                'gameState.pauseResumeAt': deleteField(),
                                'gameState.ghostWindowEndsAt': deleteField(),
                                'gameState.ghostRevealEndsAt': deleteField(),
                                'gameState.activeBets': {},
                                'gameState.ghostResponded': [],
                            });
                            applyGameEvent(updates, gameState, fromId, {
                                kind: 'toxic-boom',
                                playerId: fromId,
                            });
                            return finish({ success: false, reason: 'toxic-boom' });
                        }
                        // Faster, and a few seconds burnt (so it bites even
                        // when an angry bomb is already at top speed).
                        const view = timerView(gameState, updates);
                        reanchorTimer(
                            updates,
                            gameState,
                            now,
                            Math.max(0, computeRoundRemaining(view, now) - TOXIC_BURN_S),
                            Math.min(view.speedMultiplier * TOXIC_SPEEDUP, 4)
                        );
                        return finish({ success: false, reason: 'toxic' });
                    }
                } else if (crush.variant === 'cuddler') {
                    // 🧸 Stuck in a hug.
                    if (now < (crush.lockUntil ?? 0)) {
                        result = {
                            success: false,
                            reason: 'cuddled',
                            remainingLockMs: (crush.lockUntil ?? 0) - now,
                        };
                        return;
                    }
                } else if (crush.variant === 'rebound' && !crush.reboundUsed) {
                    // 🪃 The crush's first pass bounces straight back.
                    crush.reboundUsed = true;
                    return finish({ success: false, reason: 'rebound' });
                }
            }
            // 🔁 Obsessed: the pass after a crush let go runs back to that crush.
            const armed = live
                ? Object.values(q.crushes ?? {}).find(
                    (c) =>
                        c.variant === 'obsessed' &&
                        c.returnArmed &&
                        c.playerId !== fromId &&
                        activePlayerIds.includes(c.playerId)
                )
                : undefined;
            if (armed) {
                targetId = armed.playerId;
                armed.returnArmed = false;
                armed.returnsLeft = (armed.returnsLeft ?? OBSESSED_MAX_RETURNS) - 1;
                label = '(ran back to its crush 🔁)';
            }

            // 😴 Lazy: an 8s+ hold makes it lazy; a lazy bomb leaves 2s after the tap.
            let woke = false;
            if (live) {
                const heldMs = phoneHeldMs ?? Math.max(0, now - heldSince(gameState, fromId));
                if (q.lazy && heldMs < LAZY_WAKE_MS) {
                    delete q.lazy; // a quick pass wakes it up
                    woke = true;
                } else if (q.lazy || heldMs >= LAZY_HOLD_MS) {
                    const fresh = !q.lazy;
                    const variant = (q.lazy?.variant ?? variantFor('lazy', gameState.personalityEffect)) as QuirkVariant;
                    if (fresh) q.lazy = { variant };
                    const startAt = fresh
                        ? revealQuirk(updates, gameState, data, variant, fromId, now, {
                            heldSec: Math.round(heldMs / 1000),
                        })
                        : now;
                    const pending: PendingPass = {
                        from: fromId,
                        to: targetId,
                        arrivesAt: startAt + LAZY_DELAY_MS,
                        kind: 'lazy',
                        heldMs,
                        ...(usedFallback ? { usedFallback: true } : {}),
                    };
                    if (variant === 'seething') {
                        const view = timerView(gameState, updates);
                        reanchorTimer(
                            updates,
                            gameState,
                            now,
                            computeRoundRemaining(view, now),
                            view.speedMultiplier * SEETHING_SPEED
                        );
                        pending.speedBoost = SEETHING_SPEED;
                    }
                    if (variant === 'sleepy') pauseFuseUntil(updates, gameState, now, pending.arrivesAt);
                    updates['gameState.pendingPass'] = pending;
                    return finish({ success: true, pending: true });
                }
            }

            applyPassSuccess(updates, gameState, group, fromId, targetId, now, {
                usedFallback,
                boomerang,
                label,
                ...(phoneHeldMs !== undefined ? { heldMs: phoneHeldMs } : {}),
            });
            applyArrivalQuirks(updates, gameState, data, activePlayerIds, fromId, targetId, now, q);
            finish({ success: true, ...(woke ? { woke: true } : {}) });
        });
    } catch (e) {
        if (__DEV__) console.warn('[passBomb] transaction failed', e);
    }
    return result;
};

// A lazy pass (or a two-faced sneak back) lands once its time is up. Every
// phone's watcher calls this (host on time, others as backup); the
// transaction makes sure it lands exactly once.
export const completePendingPass = async (group: Group): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const data = snap.data() as Group;
            const gameState = data.gameState as BombGameState;
            const pending = gameState.pendingPass;
            if (!pending) return;
            if (!['playing', 'panic'].includes(gameState.phase)) return; // cleared next round
            const now = Date.now();
            if (now < pending.arrivesAt - CLOCK_TOLERANCE_MS) return;

            const updates: Record<string, unknown> = { 'gameState.pendingPass': deleteField() };
            const activePlayerIds = data.players
                .filter((p) => !gameState.ghosts.includes(p.id))
                .map((p) => p.id);
            if (
                gameState.currentHolderId !== pending.from ||
                !activePlayerIds.includes(pending.to) ||
                gameState.toxicBoom
            ) {
                transaction.update(groupRef, updates); // overtaken by events
                return;
            }

            // Seething: the fuse ran faster only while the pass dragged.
            let base = gameState;
            if (pending.speedBoost && gameState.phase === 'playing') {
                base = {
                    ...gameState,
                    timerDuration: computeRoundRemaining(gameState, now),
                    timerStartedAt: now,
                    speedMultiplier: gameState.speedMultiplier / pending.speedBoost,
                    ...(gameState.isPaused ? { pausedAt: now } : {}),
                };
                if (gameState.isPaused) updates['gameState.pausedAt'] = now;
                updates['gameState.timerDuration'] = base.timerDuration;
                updates['gameState.timerStartedAt'] = now;
                updates['gameState.speedMultiplier'] = base.speedMultiplier;
            }

            const sneak = pending.kind === 'sneak';
            applyPassSuccess(updates, base, { ...group, players: data.players }, pending.from, pending.to, now, {
                usedFallback: pending.usedFallback,
                label: sneak ? '(snuck back 😈)' : undefined,
                rewards: !sneak,
                ...(pending.heldMs !== undefined ? { heldMs: pending.heldMs } : {}),
            });
            if (!sneak && quirksLive(base)) {
                const q = cloneQuirks(base);
                applyArrivalQuirks(updates, base, data, activePlayerIds, pending.from, pending.to, now, q);
                updates['gameState.bombQuirks'] = cleanQuirks(q);
            }
            transaction.update(groupRef, updates);
        });
    } catch (e) {
        if (__DEV__) console.warn('[completePendingPass] transaction failed', e);
    }
};

// Fields every new round (and a force-end) wipes clean.
const quirkRoundResets = (): Record<string, unknown> => ({
    'gameState.auction': deleteField(),
    'gameState.bombQuirks': deleteField(),
    'gameState.pendingPass': deleteField(),
    'gameState.quirkReveal': deleteField(),
    'gameState.toxicBoom': deleteField(),
});



// ── PANIC / TIMER ────────────────────────────────────────────────
export const triggerPanic = async (groupId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);

    // Phase guard + deadline guard: panic only starts from a live round,
    // and only once the timer has really reached the threshold. Safe for
    // any phone to call — early or repeated calls do nothing.
    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(groupRef);
        if (!snap.exists()) return;
        const gameState = snap.data().gameState as BombGameState;
        if (gameState.phase !== 'playing' || gameState.isPaused) return;

        const now = Date.now();
        const elapsed = ((now - gameState.timerStartedAt) / 1000) * gameState.speedMultiplier;
        const remaining = gameState.timerDuration - elapsed;
        if (remaining > PANIC_THRESHOLD + CLOCK_TOLERANCE_MS / 1000) return; // too early

        const anyGhostHasTicket = gameState.ghosts.some(
            (id) => (gameState.bettingTickets?.[id] ?? 0) > 0
        );

        if (!anyGhostHasTicket) {
            transaction.update(groupRef, {
                ...auctionRefundUpdates(gameState),
                'gameState.phase': 'panic',
                'gameState.auction': deleteField(), // 🔨 called off, bids refunded
                'gameState.panicStartedAt': now,
                'gameState.timerStartedAt': now,
                'gameState.timerDuration': PANIC_THRESHOLD,

                'gameState.ghostWindowEndsAt': deleteField(),
                'gameState.ghostRevealEndsAt': deleteField(),
                'gameState.activeBets': {},
                'gameState.ghostResponded': [],
            });
            return;
        }

        transaction.update(groupRef, {
            ...auctionRefundUpdates(gameState),
            'gameState.phase': 'panic',
            'gameState.auction': deleteField(), // 🔨 called off, bids refunded
            'gameState.ghostWindowEndsAt': now + GHOST_WINDOW_MAX_MS,
            'gameState.ghostRevealEndsAt': deleteField(),
            'gameState.activeBets': {},
            'gameState.ghostResponded': [],
            'gameState.panicStartedAt': deleteField(),
        });
    });
};

// Ends the ghost window — early (at the floor) once every eligible ghost
// has responded, otherwise at the full cap. Records when it ended so every
// phone can time the "gone away" pause that follows.
export const endGhostWindow = async (groupId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(groupRef);
        if (!snap.exists()) return;
        const gameState = snap.data().gameState as BombGameState;
        const endsAt = gameState.ghostWindowEndsAt;
        if (gameState.phase !== 'panic' || !endsAt) return; // already ended

        const now = Date.now();
        const eligible = gameState.ghosts.filter(
            (id) => (gameState.bettingTickets?.[id] ?? 0) > 0
        );
        const responded = gameState.ghostResponded ?? [];
        const allResponded = eligible.every((id) => responded.includes(id));
        const earliest = allResponded
            ? endsAt - (GHOST_WINDOW_MAX_MS - GHOST_WINDOW_MIN_MS)
            : endsAt;
        if (now < earliest - CLOCK_TOLERANCE_MS) return; // too early

        const anyoneBet = Object.keys(gameState.activeBets ?? {}).length > 0;

        if (anyoneBet) {
            // Stage 2: reveal the ghosts to everyone, for a fixed time.
            transaction.update(groupRef, {
                'gameState.ghostWindowEndsAt': deleteField(),
                'gameState.ghostRevealEndsAt': now + GHOST_REVEAL_MS,
            });
        } else {
            // Nobody accepted: no reveal, straight into the real countdown.
            transaction.update(groupRef, {
                'gameState.ghostWindowEndsAt': deleteField(),
                'gameState.ghostRevealEndsAt': deleteField(),
                'gameState.panicStartedAt': now,
                'gameState.timerStartedAt': now,
                'gameState.timerDuration': PANIC_THRESHOLD,
            });
        }
    });
};

// Starts the real 5s countdown after the "gone away" pause. Guarded so a
// second call can't restart a countdown that's already running.
export const startPanicCountdown = async (groupId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(groupRef);
        if (!snap.exists()) return;
        const gameState = snap.data().gameState as BombGameState;
        if (gameState.phase !== 'panic') return;
        if (gameState.ghostWindowEndsAt || gameState.panicStartedAt) return;

        const now = Date.now();
        const revealEndsAt = gameState.ghostRevealEndsAt;
        if (revealEndsAt && now < revealEndsAt - CLOCK_TOLERANCE_MS) return;

        transaction.update(groupRef, {
            'gameState.ghostRevealEndsAt': deleteField(),
            'gameState.panicStartedAt': now,
            'gameState.timerStartedAt': now,
            'gameState.timerDuration': PANIC_THRESHOLD,
        });
    });
};


// ── LOCK IN WIRE ─────────────────────────────────────────────────
// Records which wire the holder tapped. Doesn't resolve anything —
// resolvePanicOutcome does that when the countdown ends. A transaction,
// so a late tap can't land on a resolved bomb, a tap racing a pass can't
// leave the new holder with the old holder's wire, and a second tap
// can't overwrite the first.
export type LockInWireResult = {
    locked?: boolean;          // true only when this tap was recorded
    blocked?: boolean;         // clingy-locked
    remainingLockMs?: number;
};

export const lockInWire = async (
    group: Group,
    playerId: string,
    wire: 'red' | 'blue'
): Promise<LockInWireResult> => {
    const groupRef = doc(db, 'groups', group.id);
    let result: LockInWireResult = {};

    try {
        await runTransaction(db, async (transaction) => {
            result = {}; // a retried attempt must not inherit the last one's result

            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const gameState = snap.data().gameState as BombGameState;
            const now = Date.now();

            // Only the current holder, only while the real countdown is running.
            if (gameState.phase !== 'panic') return;
            if (gameState.toxicBoom) return; // too late for wires
            if (gameState.currentHolderId !== playerId) return;
            if (!gameState.panicStartedAt || gameState.ghostWindowEndsAt) return;
            if (gameState.wireChoice) return; // already locked — no take-backs

            if (
                gameState.clingy &&
                gameState.clingy.holderId === playerId &&
                now < gameState.clingy.until
            ) {
                result = { blocked: true, remainingLockMs: gameState.clingy.until - now };
                return;
            }

            transaction.update(groupRef, { 'gameState.wireChoice': wire });
            result = { locked: true };
        });
    } catch (e) {
        if (__DEV__) console.warn('[lockInWire] transaction failed', e);
    }
    return result;
};

// ── RESOLVE PANIC OUTCOME ─────────────────────────────────────────
// Fired once, host-only, when the full 5-second panic countdown runs
// out — regardless of how early (or whether at all) the holder locked
// in a wire via lockInWire(). This is where cutWire's old resolution
// logic now lives: the immune/defused/exploded branching, lives/ghosts
// updates, fuse points, achievement events, AND the betting payout — any
// ghost whose bet correctly guessed the true correct wire wins when the
// holder explodes, kicking off a ghost tournament for however many of
// them won.
export const resolvePanicOutcome = async (group: Group, seenSeq?: number): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    let scoreDefuserId: string | null = null;

    await runTransaction(db, async (transaction) => {
        // A retried attempt must not inherit the last attempt's result.
        scoreDefuserId = null;

        const snap = await transaction.get(groupRef);
        if (!snap.exists()) return;
        const gameState = snap.data().gameState as BombGameState;
        if (gameState.phase !== 'panic') return; // already resolved
        // Countdown must actually be running and actually be over. This also
        // stops a stale call landing just after a pass restarted the 5 seconds.
        if (!gameState.panicStartedAt || gameState.ghostWindowEndsAt) return;
        if (!gameState.panicStartedAt || gameState.ghostWindowEndsAt) return;
        // ☠️ A toxic bomb blew on an impatient tap: no countdown, no wire.
        if (gameState.toxicBoom) {
            // resolve straight away
        } else if (seenSeq !== undefined) {
            // The caller timed the 5s on its own clock. If the bomb has been
            // passed since, that countdown is gone — do nothing.
            if ((gameState.panicSeq ?? 0) !== seenSeq) return;
        } else if (Date.now() < gameState.panicStartedAt + PANIC_THRESHOLD * 1000 - CLOCK_TOLERANCE_MS) {
            return;
        }

        const playerId = gameState.currentHolderId;
        const wire = gameState.wireChoice; // may be undefined — holder never locked one in
        const isImmune = gameState.ghostImmunePlayers.includes(playerId);
        const defused = !isImmune && wire != null && wire === gameState.correctWire;

        const newWireCutters = (gameState.wireCutters ?? []).includes(playerId)
            ? gameState.wireCutters
            : [...(gameState.wireCutters ?? []), playerId];

        if (isImmune) {
            const immuneUpdates: Record<string, unknown> = {
                'gameState.phase': 'exploded',
                'gameState.wireChoice': wire ?? deleteField(),
                'gameState.defused': true,
                'gameState.explodedPlayerId': playerId,
                'gameState.lastWireCutPlayerId': playerId,
                'gameState.clingy': deleteField(),
                'gameState.wireCutters': newWireCutters,
                'gameState.pendingPass': deleteField(),
                'gameState.quirkReveal': deleteField(),
                ...refundActiveBets(gameState),
            };
            // No achievement credit: an immune player is saved whichever
            // wire they cut, so it isn't a real defuse.
            transaction.update(groupRef, immuneUpdates);
            return;
        }

        if (defused) {
            // A correct cut is a normal defuse — an armed vest stays unused.
            const currentLives = gameState.lives[playerId] ?? 0;
            const newLives = currentLives === 1 ? Math.min(currentLives + 1, 3) : currentLives;
            const updates: Record<string, unknown> = {
                'gameState.phase': 'exploded',
                'gameState.wireChoice': wire,
                'gameState.defused': true,
                'gameState.explodedPlayerId': playerId,
                'gameState.lives': { ...gameState.lives, [playerId]: newLives },
                'gameState.lastWireCutPlayerId': playerId,
                'gameState.clingy': deleteField(),
                'gameState.wireCutters': newWireCutters,
                'gameState.pendingPass': deleteField(),
                'gameState.quirkReveal': deleteField(),
                'gameState.activeBets': {}, // defused — every bet loses
            };

            applyFusePoints(updates, gameState, playerId, FUSE_POINTS.WIRE_DEFUSED, 'Wire defused!');
            applyGameEvent(updates, gameState, playerId, { kind: 'defused', playerId });

            transaction.update(groupRef, updates);
            scoreDefuserId = playerId;
            return;
        }

        // Exploded — either the wrong wire was locked in, or none was at all.
        // A Bomb Shield (Kevlar Vest) absorbs the life loss, but it's still an
        // explosion: the cut was wrong, so ghost bets still pay out.
        const shielded = (gameState.roundShields ?? []).includes(playerId);

        const updates: Record<string, unknown> = {
            'gameState.phase': 'exploded',
            'gameState.wireChoice': wire ?? deleteField(),
            'gameState.defused': false,
            'gameState.explodedPlayerId': playerId,
            'gameState.lastWireCutPlayerId': playerId,
            'gameState.clingy': deleteField(),
            'gameState.wireCutters': newWireCutters,
            'gameState.pendingPass': deleteField(),
            'gameState.quirkReveal': deleteField(),
        };

        if (shielded) {
            // Vest took the hit: no life loss and no ghosting.
            updates['gameState.shieldAbsorbedPlayerId'] = playerId;
            applyGameEvent(updates, gameState, playerId, { kind: 'vest-saved', playerId });
            updates['gameState.roundShields'] = (gameState.roundShields ?? []).filter(
                (id) => id !== playerId
            );
            // Only a real wrong cut earns a Barely-Used Shield credit.
            // Running the clock out without cutting doesn't count (anti-farming).
            if (wire != null) {
                updates[`gameState.superShieldCredits.${playerId}`] =
                    (gameState.superShieldCredits?.[playerId] ?? 0) + 1;
            }
        } else {
            const currentLives = gameState.lives[playerId] ?? 0;
            const newLives = Math.max(0, currentLives - 1);
            const eliminated = newLives === 0 && !gameState.ghosts.includes(playerId);

            updates['gameState.lives'] = { ...gameState.lives, [playerId]: newLives };
            updates['gameState.lastLifeLostPlayerId'] = playerId;
            if (eliminated) {
                updates['gameState.ghosts'] = [...gameState.ghosts, playerId];
                updates['gameState.ghostEvents'] = [...(gameState.ghostEvents ?? []), playerId];
                if (!(gameState.everGhosted ?? []).includes(playerId)) {
                    updates['gameState.everGhosted'] = [...(gameState.everGhosted ?? []), playerId];
                }
            }

            // Whoever handed the bomb to the victim gets credit towards the
            // Assassin / Serial Bomber achievements, but only when it actually
            // cost the victim a life.
            const lastPass = gameState.passHistory[gameState.passHistory.length - 1];
            if (lastPass && lastPass.to === playerId && lastPass.from !== playerId) {
                applyGameEvent(updates, gameState, lastPass.from, {
                    kind: 'caused-explosion',
                    passerId: lastPass.from,
                });
            }
        }

        // Betting payout — anyone who guessed the TRUE correct wire wins,
        // regardless of what the holder cut, and whether or not a vest saved them.
        const winningGhostIds = Object.values(gameState.activeBets ?? {})
            .filter((b) => b.guessedWire === gameState.correctWire)
            .map((b) => b.ghostId);

        updates['gameState.activeBets'] = {}; // resolved either way
        if (winningGhostIds.length > 0) {
            updates['gameState.pendingGhostTournament'] = {
                wireCutterId: playerId,
                ghostIds: winningGhostIds,
            };
        }
        transaction.update(groupRef, updates);
    });

    // Outside the transaction: only the call that actually resolved the bomb scores.
    if (scoreDefuserId) {
        await addScore(group.id, scoreDefuserId, ROUND_WIN_SCORE, 'pass-the-bomb');
    }
};

export const startReplay = async (groupId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, { 'gameState.phase': 'replay' });
};

// ── DISPUTES / "THE CALLOUT" ──────────────────────────────────────
const getEligibleVoters = (group: Group, accusedId: string): string[] =>
    group.players.map((p) => p.id).filter((id) => id !== accusedId);

export const toggleDisputeVote = async (
    group: Group,
    passIndex: number,
    voterId: string
): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);

    // A transaction, so two near-simultaneous votes both land instead of
    // the second overwriting the first with a stale disputes array.
    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(groupRef);
        if (!snap.exists()) return;
        const gameState = snap.data().gameState as BombGameState;

        // A penalty is already underway — no second one can start on top of it.
        if (gameState.phase === 'penalty') return;

        const passEvent = gameState.passHistory[passIndex];
        if (!passEvent) return;
        if (voterId === passEvent.from) return;
        if (passEvent.boomerang) return;
        // Duel passes follow no instruction — the game picked the target.
        if (passEvent.instruction === '(Hot potato)' || passEvent.instruction === '(Fastest Finger First)' || passEvent.instruction === '(Auction 🔨)') return;

        const disputes = [...(gameState.disputes ?? [])];
        const existingIndex = disputes.findIndex((d) => d.passIndex === passIndex);

        const dispute: PassDispute =
            existingIndex >= 0
                ? { ...disputes[existingIndex] }
                : {
                    passIndex,
                    accusedId: passEvent.from,
                    voterIds: [],
                    resolved: false,
                    guilty: false,
                };

        if (dispute.resolved) return;

        dispute.voterIds = dispute.voterIds.includes(voterId)
            ? dispute.voterIds.filter((id) => id !== voterId)
            : [...dispute.voterIds, voterId];

        const eligibleVoters = getEligibleVoters(group, dispute.accusedId);
        const majorityNeeded = Math.floor(eligibleVoters.length / 2) + 1;
        const reachedMajority = dispute.voterIds.length >= majorityNeeded;

        if (reachedMajority) {
            dispute.resolved = true;
            dispute.guilty = true;
        }

        const updatedDisputes =
            existingIndex >= 0
                ? disputes.map((d, i) => (i === existingIndex ? dispute : d))
                : [...disputes, dispute];

        if (reachedMajority) {
            const disputeUpdates: Record<string, unknown> = {
                'gameState.disputes': updatedDisputes,
                'gameState.phase': 'penalty',
                'gameState.penaltyPlayerId': dispute.accusedId,
                'gameState.penaltyAccuserIds': dispute.voterIds,
                'gameState.penaltyCorrectWire': pickRandomWire(),
                'gameState.penaltyWireChoice': deleteField(),
                'gameState.penaltyResult': deleteField(),
            };
            applyFusePoints(disputeUpdates, gameState, dispute.accusedId, FUSE_POINTS.CALLOUT_VOTED_OUT, 'Called out!');
            transaction.update(groupRef, disputeUpdates);
        } else {
            transaction.update(groupRef, { 'gameState.disputes': updatedDisputes });
        }
    });
};

export const cutPenaltyWire = async (
    group: Group,
    wire: 'red' | 'blue'
): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    try {
        // A transaction, so two quick taps (or two phones) can't both
        // resolve the penalty and take two lives.
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const gameState = snap.data().gameState as BombGameState;

            if (gameState.phase !== 'penalty') return;
            if (gameState.tbcChallenge) return;   // went to Trial by Combat instead
            if (gameState.penaltyResult) return;  // already cut
            const playerId = gameState.penaltyPlayerId;
            if (!playerId) return;

            const caught = wire !== gameState.penaltyCorrectWire;
            const updates: Record<string, unknown> = {
                'gameState.penaltyWireChoice': wire,
                'gameState.penaltyResult': caught ? 'caught' : 'safe',
            };

            if (caught) {
                const currentLives = gameState.lives[playerId] ?? 0;
                const newLives = Math.max(0, currentLives - 1);
                updates['gameState.lives'] = { ...gameState.lives, [playerId]: newLives };
                updates['gameState.lastLifeLostPlayerId'] = playerId;
                if (newLives === 0 && !gameState.ghosts.includes(playerId)) {
                    updates['gameState.ghosts'] = [...gameState.ghosts, playerId];
                    updates['gameState.ghostEvents'] = [...(gameState.ghostEvents ?? []), playerId];
                    if (!(gameState.everGhosted ?? []).includes(playerId)) {
                        updates['gameState.everGhosted'] = [...(gameState.everGhosted ?? []), playerId];
                    }
                }
            }

            markDisputeOutcome(updates, gameState, playerId, caught ? 'caught' : 'safe');

            transaction.update(groupRef, updates);
        });
    } catch (e) {
        if (__DEV__) console.warn('[cutPenaltyWire] transaction failed', e);
    }
};

export const closePenaltyAndReturnToReplay = async (
    groupId: string
): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, {
        'gameState.phase': 'replay',
    });
};

// ── ROUND SUMMARY HELPER ──────────────────────────────────────────
// Builds a lightweight, permanent record of the round that just ended,
// captured right before passHistory/wireChoice/etc. get cleared for the
// next round. Called from both startNextRound and startDuelRound so the
// final results screen can still show a full history of the game even
// though the heavy per-pass data is gone.
const buildRoundSummary = (gameState: BombGameState) => ({
    roundNumber: gameState.roundNumber,
    explodedPlayerId: gameState.explodedPlayerId ?? '',
    defused: gameState.defused ?? false,
    wireChoice: gameState.wireChoice ?? '',
    correctWire: gameState.correctWire ?? '',
    passCount: gameState.passHistory?.length ?? 0,
    // Duel rounds have no personality (the field is deleted), and Firestore
    // rejects undefined, which used to crash the start of the next duel round.
    personality: gameState.personality ?? (gameState.duelRound ? 'duel' : 'normal'),
});

// ── DUEL START (2 players remaining) ─────────────────────────────
const startDuelRound = async (
    group: Group,
    activePlayers: { id: string }[],
    gameState: BombGameState
): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    const playerIds = activePlayers.map((p) => p.id);
    const startingHolder = pickRandomHolder(playerIds);
    const correctWire = pickRandomWire();

    const newHoldCounts = {
        ...gameState.holdCounts,
        [startingHolder]: (gameState.holdCounts?.[startingHolder] ?? 0) + 1,
    };

    const updatedSummaries = [
        ...(gameState.roundSummaries ?? []),
        buildRoundSummary(gameState),
    ].slice(-MAX_ROUND_SUMMARIES);

    const shieldRefunds: Record<string, unknown> = {};
    for (const id of gameState.shieldArmed ?? []) {
        shieldRefunds[`gameState.shieldItems.${id}`] = (gameState.shieldItems?.[id] ?? 0) + 1;
    }

    await updateDoc(groupRef, {
        'gameState.phase': 'duel-intro',
        'gameState.currentHolderId': startingHolder,
        'gameState.correctWire': correctWire,

        'gameState.passHistory': [],
        'gameState.roundNumber': gameState.roundNumber + 1,
        // Duels never have a personality — plain timer only.
        'gameState.personality': deleteField(),
        'gameState.personalityName': deleteField(),
        'gameState.personalityEmoji': deleteField(),
        'gameState.personalityEffect': deleteField(),
        'gameState.personalityDescription': deleteField(),
        'gameState.ghostImmunePlayers': [],
        'gameState.roundSummaries': updatedSummaries,
        'gameState.chainPassed': [startingHolder],
        'gameState.instructions': {},
        'gameState.instructionIds': {},
        'gameState.usedInstructions': [],
        'gameState.boomerangUsed': {},
        'gameState.speedMultiplier': 1,
        'gameState.defused': false,
        'gameState.wireChoice': deleteField(),
        'gameState.explodedPlayerId': deleteField(),
        'gameState.panicStartedAt': deleteField(),
        'gameState.wrongPassCounts': {},
        'gameState.clingy': deleteField(),
        'gameState.holdCounts': newHoldCounts,
        ...hotPotatoResetFields(),
        'gameState.duelReadyPlayers': [],
        'gameState.disputes': [],
        'gameState.penaltyPlayerId': deleteField(),
        'gameState.penaltyCorrectWire': deleteField(),
        'gameState.penaltyWireChoice': deleteField(),
        'gameState.penaltyResult': deleteField(),
        'gameState.isPaused': false,
        'gameState.pausedAt': deleteField(),
        'gameState.pauseResumeAt': deleteField(),
        'gameState.activeQuiz': deleteField(),
        'gameState.ghostTournament': deleteField(),
        'gameState.pendingGhostTournament': deleteField(),
        'gameState.forceEnded': deleteField(),
        'gameState.activeBets': {},
        'gameState.ghostWindowEndsAt': deleteField(),
        'gameState.ghostResponded': [],
        'gameState.tbcChallenge': deleteField(),
        'gameState.instructionFallbacks': {},
        'gameState.tbcHolderId': deleteField(),
        'gameState.tbcLoserId': deleteField(),
        'gameState.penaltyAccuserIds': deleteField(),
        'gameState.duelFffTimerStartedAt': deleteField(),
        'gameState.duelFffTimerDuration': deleteField(),
        'gameState.duelFffLockedUntil': deleteField(),
        'gameState.duelFffHolderCanPass': deleteField(),
        'gameState.duelFffLockReason': deleteField(),
        'gameState.ghostRevealEndsAt': deleteField(),
        ...shieldRefunds,
        'gameState.shieldArmed': [],
        'gameState.roundShields': [],
        'gameState.shieldAbsorbedPlayerId': deleteField(),
        'gameState.revealerHints': {},
        'gameState.roundDuelShields': gameState.duelShieldArmed ?? [],
        'gameState.duelShieldArmed': [],
        'gameState.duelShieldAbsorbedPlayerId': deleteField(),
        'gameState.roundStartLives': gameState.lives,
        ...quirkRoundResets(),
        'gameState.roundQuirks': [],
        'gameState.auctionLog': [],
        'gameState.duelRound': true,
        // previous round was a duel round too → this is the next one
        'gameState.duelRoundIndex': gameState.duelRound ? (gameState.duelRoundIndex ?? 1) + 1 : 1,
        'gameState.lifeRestored': deleteField(),
    });
};

// A duellist says they've read the rules. Nothing starts here: once every
// duellist is ready, the host starts the duel with startDuel.
export const markDuelReady = async (
    group: Group,
    playerId: string
): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);

    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(groupRef);
        if (!snap.exists()) return;
        const gameState = snap.data().gameState as BombGameState;
        if (gameState.phase !== 'duel-intro') return;
        if ((gameState.duelReadyPlayers ?? []).includes(playerId)) return;

        transaction.update(groupRef, {
            'gameState.duelReadyPlayers': [...(gameState.duelReadyPlayers ?? []), playerId],
        });
    });
};

// Host only. Changing the mode clears everyone's "ready": they agreed to
// the old mode's rules, not these.
export const setDuelMode = async (
    groupId: string,
    mode: 'hot-potato' | 'fastest-finger' | 'hot-seat'
): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(groupRef);
        if (!snap.exists()) return;
        const gameState = snap.data().gameState as BombGameState;
        if (gameState.phase !== 'duel-intro') return;
        if ((gameState.duelMode ?? 'hot-potato') === mode) return;
        transaction.update(groupRef, {
            'gameState.duelMode': mode,
            'gameState.duelReadyPlayers': [],
        });
    });
};

// Host only: starts the duel once every duellist is ready. Hot Potato
// starts inside the transaction; the quiz duels first claim the start for
// this round (duelStartClaimed), so a double tap can't start them twice.
export const startDuel = async (group: Group): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    let mode: 'hot-potato' | 'fastest-finger' | 'hot-seat' | null = null;

    await runTransaction(db, async (transaction) => {
        mode = null; // a retried attempt must not inherit the last one's result
        const snap = await transaction.get(groupRef);
        if (!snap.exists()) return;
        const gameState = snap.data().gameState as BombGameState;
        if (gameState.phase !== 'duel-intro') return;
        const players = (snap.data().players ?? []) as { id: string }[];
        const duellists = players
            .map((p) => p.id)
            .filter((id) => !gameState.ghosts.includes(id));
        const ready = gameState.duelReadyPlayers ?? [];
        if (!duellists.every((id) => ready.includes(id))) return;

        const chosen = gameState.duelMode ?? 'hot-potato';
        if (chosen !== 'hot-potato') {
            if (gameState.duelStartClaimed === gameState.roundNumber) return;
            transaction.update(groupRef, { 'gameState.duelStartClaimed': gameState.roundNumber });
        } else {
            transaction.update(groupRef, {
                'gameState.phase': 'duel',
                ...buildHotPotatoStart({
                    now: Date.now(),
                    players: duellists,
                    holderId: gameState.currentHolderId,
                    context: 'duel',
                }),
            });
        }
        mode = chosen;
    });

    // The quiz duels build their first question in their own start functions.
    // Re-read so they get the latest state (e.g. the used-question list).
    if (mode === 'fastest-finger' || mode === 'hot-seat') {
        const fresh = await getDoc(groupRef);
        if (!fresh.exists()) return;
        const latest = { ...group, ...(fresh.data() as Group), id: group.id };
        if ((latest.gameState as BombGameState).phase !== 'duel-intro') return;
        try {
            if (mode === 'fastest-finger') await startDuelFastestFinger(latest);
            else await startHotSeatDuel(latest);
        } catch (e) {
            // let the host tap Start again
            await updateDoc(groupRef, { 'gameState.duelStartClaimed': deleteField() }).catch(() => {});
            throw e;
        }
    }
};

// ── NEXT ROUND ───────────────────────────────────────────────────
export const startNextRound = async (group: Group): Promise<void> => {
    const gameState = group.gameState as BombGameState;
    if (!(await claimRoundAdvance(group.id, gameState.roundNumber))) return;
    try {
        await advanceRound(group);
    } catch (e) {
        // Without this the claim stays and Next Round silently does nothing.
        await releaseRoundAdvance(group.id, gameState.roundNumber).catch(() => {});
        throw e;
    }
};

const advanceRound = async (staleGroup: Group): Promise<void> => {
    const groupRef = doc(db, 'groups', staleGroup.id);

    // Close out the round first, the final round included: the round-end
    // achievements can award lives (and bring a ghost back), so everything
    // below must be built from the document as it is AFTER that.
    await applyRoundEndEvents(staleGroup.id);
    const freshSnap = await getDoc(groupRef);
    if (!freshSnap.exists()) return;
    const group = { ...(freshSnap.data() as Group), id: staleGroup.id };
    const gameState = group.gameState as BombGameState;

    const activePlayers = group.players.filter(
        (p) => !gameState.ghosts.includes(p.id)
    );

    if (activePlayers.length <= 1) {
        await updateDoc(groupRef, { 'gameState.phase': 'result' });
        return;
    }
    if (activePlayers.length === 2) {
        await startDuelRound(group, activePlayers, gameState);
        return;
    }
    await payGhostStipends(group.id);
    const personality = getRandomPersonality(
        gameState.usedPersonalities,
        activePlayers.length, gameState.timerMode,  // use active players, not total
        gameState.roundNumber + 1
    );
    const duration = getRandomDuration();
    const playerIds = activePlayers.map((p) => p.id);
    // 🔨 Auction rounds start with whoever has the least FP.
    const startingHolder = personality.effect === 'auction'
        ? pickLowestFpHolder(playerIds, gameState.fusePoints ?? {})
        : pickRandomHolder(playerIds);
    const correctWire = pickRandomWire();

    const newHoldCounts = {
        ...gameState.holdCounts,
        [startingHolder]: (gameState.holdCounts?.[startingHolder] ?? 0) + 1,
    };

    const updatedSummaries = [
        ...(gameState.roundSummaries ?? []),
        buildRoundSummary(gameState),
    ].slice(-MAX_ROUND_SUMMARIES);

    const freshCtx: Omit<EligibilityContext, 'holderId'> = {
        passHistoryLength: 0,
        roundNumber: gameState.roundNumber + 1,
        chainPassed: [],
        activePlayerIds: playerIds,
        previousRoundWireCutPlayerId: gameState.lastWireCutPlayerId,
        lastLifeLostPlayerId: gameState.lastLifeLostPlayerId,
        everGhosted: gameState.everGhosted ?? [],
        seatingOrder: gameState.seatingOrder ?? [],
        holdCounts: newHoldCounts,
        firstHolderEver: gameState.firstHolderEver, // carried forward, never reset after round 1
        firstPasserOf: gameState.firstPasserOf ?? {},
        lastPassedTo: gameState.lastPassedTo ?? {},
        wireCutters: gameState.wireCutters ?? [],
        passCounts: gameState.passCounts ?? {},
    };
    const texts: Record<string, string> = {};
    const ids: Record<string, string> = {};
    const fallbackTexts: Record<string, string> = {};

    const used: string[] = [];
    for (const pid of playerIds) {
        const ctx: EligibilityContext = { ...freshCtx, holderId: pid };
        const instruction = getRandomInstruction(used, ctx);
        texts[pid] = instruction.text;
        ids[pid] = instruction.id;
        fallbackTexts[pid] = instruction.fallbackText ?? '';

        used.push(instruction.id);
    }

    const ghostImmunePlayer =
        personality.effect === 'ghost'
            ? playerIds[Math.floor(Math.random() * playerIds.length)]
            : '';

    const duelShieldRefunds: Record<string, unknown> = {};
    for (const id of gameState.duelShieldArmed ?? []) {
        duelShieldRefunds[`gameState.superShieldItems.${id}`] =
            (gameState.superShieldItems?.[id] ?? 0) + 1;
    }

    const updates: Record<string, unknown> = {
        'gameState.phase': 'reveal',
        'gameState.revealEndsAt': Date.now() + REVEAL_DURATION_MS,
        'gameState.currentHolderId': startingHolder,
        'gameState.timerStartedAt': 0,
        'gameState.timerDuration': duration,
        'gameState.correctWire': correctWire,
        'gameState.personality': personality.id,
        'gameState.personalityName': personality.name,
        'gameState.personalityEmoji': personality.emoji,
        'gameState.personalityEffect': personality.effect,
        'gameState.personalityDescription': personality.description,
        'gameState.instructions': texts,
        'gameState.instructionIds': ids,
        'gameState.instructionFallbacks': fallbackTexts,
        'gameState.passHistory': [],
        'gameState.roundNumber': gameState.roundNumber + 1,
        'gameState.usedPersonalities': [
            ...gameState.usedPersonalities,
            personality.id,
        ].slice(-MAX_USED_PERSONALITIES),
        'gameState.roundSummaries': updatedSummaries,
        'gameState.usedInstructions': [],
        'gameState.boomerangUsed': {},
        'gameState.chainPassed': [startingHolder],
        'gameState.ghostImmunePlayers': ghostImmunePlayer ? [ghostImmunePlayer] : [],
        'gameState.speedMultiplier': 1,
        'gameState.defused': false,
        'gameState.activeBets': {},
        'gameState.ghostWindowEndsAt': deleteField(),
        'gameState.ghostResponded': [],
        'gameState.tbcChallenge': deleteField(),
        'gameState.wireChoice': deleteField(),
        'gameState.explodedPlayerId': deleteField(),
        'gameState.panicStartedAt': deleteField(),
        'gameState.previousRoundWireCutPlayerId': gameState.lastWireCutPlayerId ?? deleteField(),
        'gameState.lastWireCutPlayerId': deleteField(),
        'gameState.wrongPassCounts': {},
        'gameState.clingy': deleteField(),
        'gameState.holdCounts': newHoldCounts,
        ...hotPotatoResetFields(),
        'gameState.disputes': [],
        'gameState.penaltyPlayerId': deleteField(),
        'gameState.penaltyCorrectWire': deleteField(),
        'gameState.penaltyWireChoice': deleteField(),
        'gameState.penaltyResult': deleteField(),
        'gameState.isPaused': false,
        'gameState.pausedAt': deleteField(),
        'gameState.pauseResumeAt': deleteField(),
        'gameState.ghostTournament': deleteField(),
        'gameState.pendingGhostTournament': deleteField(),
        'gameState.forceEnded': deleteField(),
        'gameState.tbcHolderId': deleteField(),
        'gameState.tbcLoserId': deleteField(),
        'gameState.penaltyAccuserIds': deleteField(),
        'gameState.duelFffTimerStartedAt': deleteField(),
        'gameState.duelFffTimerDuration': deleteField(),
        'gameState.duelFffLockedUntil': deleteField(),
        'gameState.duelFffHolderCanPass': deleteField(),
        'gameState.duelFffLockReason': deleteField(),
        'gameState.ghostRevealEndsAt': deleteField(),
        'gameState.roundShields': gameState.shieldArmed ?? [],
        'gameState.shieldArmed': [],
        'gameState.shieldAbsorbedPlayerId': deleteField(),
        'gameState.revealerHints': {},
        ...duelShieldRefunds,
        'gameState.duelShieldArmed': [],
        'gameState.roundDuelShields': [],
        'gameState.duelShieldAbsorbedPlayerId': deleteField(),
        'gameState.roundStartLives': gameState.lives,
        ...quirkRoundResets(),
        'gameState.roundQuirks': [],
        'gameState.auctionLog': [],
        'gameState.duelRound': false,
        'gameState.lifeRestored': deleteField(),

    };

    // Quiz Bomb: fold the first question of this round into the same
    // write, same no-gap reasoning as startBombGame.
    if (personality.effect === 'quiz') {
        const { activeQuiz, usedQuestionId } = buildActiveQuiz(
            gameState.usedQuizQuestions ?? [],
            'quiz-round',
            false
        );
        updates['gameState.activeQuiz'] = activeQuiz;
        updates['gameState.usedQuizQuestions'] = [
            ...(gameState.usedQuizQuestions ?? []),
            usedQuestionId,
        ].slice(-MAX_USED_QUIZ_QUESTIONS);
    } else {
        updates['gameState.activeQuiz'] = deleteField();
    }

    await updateDoc(groupRef, updates);
};


// ── END GAME ─────────────────────────────────────────────────────
export const endBombGame = async (group: Group): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    let claimed = false;
    let winnerId: string | undefined;
    let runnerUpId: string | undefined;
    let cashOut: Record<string, { fp: number; points: number }> = {};

    // Settle the last duel round's bets first, so their FP counts in the cash-out.
    await settleBets(group).catch(() => {});

    // Claim the end of the game atomically: only the first call gets through,
    // so a second call can't award the bonuses again.
    await runTransaction(db, async (transaction) => {
        // A retried attempt must not inherit the last attempt's result.
        claimed = false;
        winnerId = undefined;
        runnerUpId = undefined;
        cashOut = {};

        const snap = await transaction.get(groupRef);
        if (!snap.exists()) return;
        const gameState = snap.data().gameState as BombGameState;
        if (gameState.scoresAwarded) return;

        const winner = group.players.find((p) => !gameState.ghosts.includes(p.id));
        winnerId = winner?.id;
        runnerUpId = getRunnerUp(gameState.ghostEvents, gameState.ghosts, winnerId);

        const endUpdates: Record<string, unknown> = {
            'gameState.phase': 'result',
            'gameState.scoresAwarded': true,
        };
        // Firestore rejects undefined, so the runner-up is only written when there is one.
        if (runnerUpId) endUpdates['gameState.runnerUpId'] = runnerUpId;

        // Leftover FP is worth nothing once the game is over, so it's cashed
        // into leaderboard points: FP_PER_POINT FP = 1 point, rounded down.
        for (const p of group.players) {
            const fp = Math.max(0, Math.floor(gameState.fusePoints?.[p.id] ?? 0));
            const points = Math.floor(fp / FP_PER_POINT);
            if (points > 0) cashOut[p.id] = { fp, points };
        }
        endUpdates['gameState.fpCashOut'] = cashOut;
        if (winnerId) {
            applyFusePoints(endUpdates, gameState, winnerId, FUSE_POINTS.GAME_WIN, 'Last one standing!');
        }
        transaction.update(groupRef, endUpdates);
        claimed = true;
    });

    if (!claimed) return;

    // Running leaderboard totals: each award, and the winner-bet payouts that
    // follow, build on the one before instead of a stale snapshot.
    const scores: Record<string, number> = { ...(group.scores ?? {}) };
    const award = async (playerId: string, points: number) => {
        await addScore(group.id, playerId, points, 'pass-the-bomb');
        scores[playerId] = (scores[playerId] ?? 0) + points;
    };
    if (winnerId) await award(winnerId, GAME_WIN_SCORE_BONUS);
    if (runnerUpId) await award(runnerUpId, RUNNER_UP_SCORE_BONUS);
    for (const [id, c] of Object.entries(cashOut)) await award(id, c.points);
    await settleWinnerBets(group, winnerId, scores);
};

// ── TIMER PAUSE / RESUME (calm bomb) ─────────────────────────────
// The resume time is decided at the moment of pausing and stored, so any
// phone can resume the bomb if the host disappears mid-pause.
export const pauseTimer = async (groupId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(groupRef);
        if (!snap.exists()) return;
        const gameState = snap.data().gameState as BombGameState;
        if (gameState.phase !== 'playing') return;
        if (gameState.personalityEffect !== 'calm' || gameState.isPaused) return;

        const now = Date.now();
        const elapsed = ((now - gameState.timerStartedAt) / 1000) * gameState.speedMultiplier;
        // Too close to panic — pausing now would just stall the threshold.
        if (gameState.timerDuration - elapsed <= PANIC_THRESHOLD) return;

        const resumeDelay =
            CALM_RESUME_MIN_MS + Math.random() * (CALM_RESUME_MAX_MS - CALM_RESUME_MIN_MS);
        transaction.update(groupRef, {
            'gameState.isPaused': true,
            'gameState.pausedAt': now,
            'gameState.pauseResumeAt': now + resumeDelay,
        });
    });
};

// Reads everything fresh, so a stale or repeated call can't shift the
// timer twice. Safe for any phone to call.
export const resumeTimer = async (groupId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(groupRef);
        if (!snap.exists()) return;
        const gameState = snap.data().gameState as BombGameState;
        if (!gameState.isPaused || !gameState.pausedAt) return; // already resumed

        const now = Date.now();
        if (gameState.pauseResumeAt && now < gameState.pauseResumeAt - CLOCK_TOLERANCE_MS) return;

        transaction.update(groupRef, {
            'gameState.isPaused': false,
            'gameState.pausedAt': deleteField(),
            'gameState.pauseResumeAt': deleteField(),
            'gameState.timerStartedAt': gameState.timerStartedAt + (now - gameState.pausedAt),
        });
    });
};

// Called when the accused, sitting in the penalty phase, chooses Trial
// by Combat and picks one specific accuser to challenge. Only sets up
// the pairing and spends the ticket — starting the actual duel engine
// is a separate call (see note below), kept apart deliberately so this
// function has zero dependency on duelFastestFinger.ts's internals.
export const invokeTrialByCombat = async (
    group: Group,
    opponentId: string
): Promise<{ success: boolean; reason?: string }> => {
    const groupRef = doc(db, 'groups', group.id);
    const freshSnap = await getDoc(groupRef);
    if (!freshSnap.exists()) return { success: false, reason: 'not-found' };
    const gameState = freshSnap.data().gameState as BombGameState;

    const accusedId = gameState.penaltyPlayerId;
    if (!accusedId) return { success: false, reason: 'no-penalty-active' };
    if (!(gameState.penaltyAccuserIds ?? []).includes(opponentId)) {
        return { success: false, reason: 'not-an-accuser' };
    }

    const currentTickets = gameState.tbcTickets?.[accusedId] ?? 0;
    if (currentTickets <= 0) {
        return { success: false, reason: 'no-tickets' };
    }

    await updateDoc(groupRef, {
        [`gameState.tbcTickets.${accusedId}`]: currentTickets - 1,
        'gameState.tbcChallenge': { accusedId, opponentId },
    });

    return { success: true };
};

export const placeBet = async (
    group: Group,
    ghostId: string,
    guessedWire: 'red' | 'blue'
): Promise<{ success: boolean; reason?: string }> => {
    const groupRef = doc(db, 'groups', group.id);
    let result: { success: boolean; reason?: string } = { success: false, reason: 'not-found' };

    try {
        // A transaction, so a bet can never land after endGhostWindow has
        // already decided "nobody bet" — it either counts, or it's rejected
        // and the ticket is untouched.
        await runTransaction(db, async (transaction) => {
            result = { success: false, reason: 'not-found' }; // fresh on every retry

            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const gameState = snap.data().gameState as BombGameState;

            if (
                gameState.phase !== 'panic' ||
                !gameState.ghostWindowEndsAt ||
                Date.now() >= gameState.ghostWindowEndsAt
            ) {
                result = { success: false, reason: 'window-closed' };
                return;
            }
            if (!gameState.ghosts.includes(ghostId)) {
                result = { success: false, reason: 'not-a-ghost' };
                return;
            }
            const currentTickets = gameState.bettingTickets?.[ghostId] ?? 0;
            if (currentTickets <= 0) {
                result = { success: false, reason: 'no-tickets' };
                return;
            }
            const responded = gameState.ghostResponded ?? [];
            if (gameState.activeBets?.[ghostId] || responded.includes(ghostId)) {
                result = { success: false, reason: 'already-bet' };
                return;
            }

            const bet: WireBet = {
                ghostId,
                guessedWire,
                targetPlayerId: gameState.currentHolderId,
                placedAt: Date.now(),
                resolved: false,
            };

            transaction.update(groupRef, {
                [`gameState.bettingTickets.${ghostId}`]: currentTickets - 1,
                [`gameState.activeBets.${ghostId}`]: bet,
                'gameState.ghostResponded': [...responded, ghostId],
            });
            result = { success: true };
        });
    } catch (e) {
        if (__DEV__) console.warn('[placeBet] transaction failed', e);
        result = { success: false, reason: 'error' };
    }
    return result;
};

export const declineBet = async (
    group: Group,
    ghostId: string
): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const gameState = snap.data().gameState as BombGameState;

            if (
                gameState.phase !== 'panic' ||
                !gameState.ghostWindowEndsAt ||
                Date.now() >= gameState.ghostWindowEndsAt
            ) return;
            const responded = gameState.ghostResponded ?? [];
            if (responded.includes(ghostId) || gameState.activeBets?.[ghostId]) return;

            transaction.update(groupRef, {
                'gameState.ghostResponded': [...responded, ghostId],
            });
        });
    } catch (e) {
        // The window will simply run to its cap; nothing else depends on this.
        if (__DEV__) console.warn('[declineBet] transaction failed', e);
    }
};

export const endPersonalityReveal = async (groupId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(groupRef);
        if (!snap.exists()) return;
        const gameState = snap.data().gameState as BombGameState;
        if (gameState.phase !== 'reveal') return; // already started
        const now = Date.now();
        if (gameState.revealEndsAt && now < gameState.revealEndsAt - CLOCK_TOLERANCE_MS) return;

        transaction.update(groupRef, {
            'gameState.phase': 'playing',
            'gameState.revealEndsAt': deleteField(),
            'gameState.timerStartedAt': now, // the real countdown starts HERE, not before
        });
    });
};

// ── FORCE END ROUND (host emergency control) ─────────────────────
// ── FORCE END ROUND (host emergency control) ─────────────────────
// Skips straight to the replay with no lives lost or gained. A transaction,
// so live bets are refunded from fresh data, and a round that has already
// resolved (exploded/replay/result) can't be force-ended on top of it.
export const forceEndRound = async (group: Group): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const gameState = snap.data().gameState as BombGameState;

            // Only a round that's still live can be force-ended.
            if (!['reveal', 'playing', 'panic'].includes(gameState.phase)) return;

            // A force-ended round never resolved, so active vests go back in pockets.
            const shieldRefunds: Record<string, unknown> = {};
            for (const id of gameState.roundShields ?? []) {
                shieldRefunds[`gameState.shieldItems.${id}`] =
                    (gameState.shieldItems?.[id] ?? 0) + 1;
            }

            transaction.update(groupRef, {
                ...auctionRefundUpdates(gameState), // 🔨 a live auction's bids go back
                'gameState.phase': 'replay',
                'gameState.forceEnded': true,
                ...quirkRoundResets(),
                'gameState.wireChoice': deleteField(),
                'gameState.defused': deleteField(),
                'gameState.explodedPlayerId': deleteField(),
                'gameState.panicStartedAt': deleteField(),
                'gameState.revealEndsAt': deleteField(),
                'gameState.clingy': deleteField(),
                'gameState.isPaused': false,
                'gameState.pausedAt': deleteField(),
                'gameState.pauseResumeAt': deleteField(),
                'gameState.penaltyPlayerId': deleteField(),
                'gameState.penaltyCorrectWire': deleteField(),
                'gameState.penaltyWireChoice': deleteField(),
                'gameState.penaltyResult': deleteField(),
                // Refunds live bets and clears the ghost window + reveal.
                ...refundActiveBets(gameState),
                ...shieldRefunds,
                'gameState.roundShields': [],
            });
        });
    } catch (e) {
        if (__DEV__) console.warn('[forceEndRound] transaction failed', e);
    }
};

// ── LOCAL COUNTDOWN HELPERS ──────────────────────────────────────
// Every phone computes the timer from shared timestamps instead of
// waiting for the host to sync it. A calm-bomb pause freezes the clock
// at pausedAt.
export const computeRoundRemaining = (gs: BombGameState, now = Date.now()): number => {
    if (!gs.timerStartedAt) return gs.timerDuration; // still in the reveal
    const effectiveNow = gs.isPaused && gs.pausedAt ? gs.pausedAt : now;
    const elapsed = ((effectiveNow - gs.timerStartedAt) / 1000) * gs.speedMultiplier;
    return Math.max(0, gs.timerDuration - elapsed);
};

// ── AWAY PLAYERS ─────────────────────────────────────────────────
// When a player drops out the host can end the live round (forceEndRound)
// and everyone waits on the replay screen. The host can also choose to
// carry on without them; `lastSeen` is each player's last check-in, so the
// choice lapses as soon as they check in again.
export const continueWithoutAwayTimer = async (
    group: Group,
    requesterId: string,
    lastSeen: Record<string, number>
): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    try {
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(groupRef);
            if (!snap.exists()) return;
            const data = snap.data();
            if (data.hostId !== requesterId) return;
            if ((data.gameState as { mode?: string })?.mode === 'pass') return;
            const updates: Record<string, unknown> = {};
            for (const [id, ms] of Object.entries(lastSeen)) {
                updates[`gameState.awayIgnored.${id}`] = ms;
            }
            if (Object.keys(updates).length > 0) tx.update(groupRef, updates);
        });
    } catch (e) {
        if (__DEV__) console.warn('[continueWithoutAwayTimer] failed', e);
    }
};

// ── RESTORE A DUEL LIFE (honour system) ──────────────────────────
// A duelist whose connection dropped can't answer, so the duel clock may
// blow them up. After talking it over, one trusted player can give the
// life back: the host, or a spectator if the host is duelling, or the
// other duelist when nobody else is playing.

// The two players who started this duel (they had lives when it began).
export const duelistsOf = (gs: BombGameState): string[] =>
    Object.entries(gs.roundStartLives ?? {})
        .filter(([, lives]) => (lives ?? 0) > 0)
        .map(([id]) => id);

// The duel life the exploded player lost, if any (null = nothing to restore).
export const restorableDuelLife = (gs: BombGameState): string | null => {
    if (!gs.duelRound) return null;
    if (gs.phase !== 'exploded' && gs.phase !== 'replay') return null;
    if (gs.lifeRestored?.round === gs.roundNumber) return null;
    const victim = gs.explodedPlayerId;
    if (!victim) return null;
    const before = gs.roundStartLives?.[victim] ?? 0;
    return (gs.lives?.[victim] ?? 0) < before ? victim : null;
};

export const canRestoreDuelLife = (
    gs: BombGameState,
    players: { id: string }[],
    hostId: string,
    requesterId: string
): boolean => {
    const victim = restorableDuelLife(gs);
    if (!victim || requesterId === victim) return false;
    const duelists = duelistsOf(gs);
    if (!duelists.includes(hostId)) return requesterId === hostId;
    const spectators = players.map((p) => p.id).filter((id) => !duelists.includes(id));
    if (spectators.length > 0) return spectators.includes(requesterId);
    return duelists.includes(requesterId); // just the two of them: the opponent decides
};

export const restoreDuelLife = async (group: Group, requesterId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    try {
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(groupRef);
            if (!snap.exists()) return;
            const data = snap.data() as Group;
            const gs = data.gameState as BombGameState;
            if (!canRestoreDuelLife(gs, data.players, data.hostId, requesterId)) return;
            const victim = restorableDuelLife(gs)!;
            const lives = gs.roundStartLives?.[victim] ?? 1;

            const updates: Record<string, unknown> = {
                [`gameState.lives.${victim}`]: lives,
                'gameState.lifeRestored': {
                    playerId: victim,
                    byPlayerId: requesterId,
                    round: gs.roundNumber,
                },
            };
            // If that life had made them a ghost, bring them back.
            if (gs.ghosts.includes(victim)) {
                updates['gameState.ghosts'] = gs.ghosts.filter((id) => id !== victim);
                const events = [...(gs.ghostEvents ?? [])];
                const last = events.lastIndexOf(victim);
                if (last >= 0) events.splice(last, 1);
                updates['gameState.ghostEvents'] = events;
            }
            tx.update(groupRef, updates);
        });
    } catch (e) {
        if (__DEV__) console.warn('[restoreDuelLife] failed', e);
    }
};
