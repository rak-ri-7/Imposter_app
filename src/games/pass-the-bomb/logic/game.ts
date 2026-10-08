import { doc, updateDoc, deleteField, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '../../../shared/firebase/config';
import { Group, BombGameState, PassDispute, WireBet } from '../../../shared/types';
import {
    getRandomInstruction,
    getRandomPersonality,
    resolveInstructionTargets,
    EligibilityContext,
    instructions,
} from '../data/content';
import { assignMissions } from '../data/missions';
import { applyMissionEvent, applyRoundEndMissions } from './missionEngine';
import { buildActiveQuiz } from './Fastestfinger';
import { FUSE_POINTS, applyFusePoints, ROUND_WIN_SCORE, GAME_WIN_SCORE_BONUS, RUNNER_UP_SCORE_BONUS } from './bombHelpers';
import { settleWinnerBets } from './betEngine';
import { payGhostStipends } from './ghostEconomy';
import { isBoomerangPass } from './boomerang';
import { getRunnerUp } from './placings';
import { addScore } from '../../../shared/firebase/groups';
import { buildHotPotatoStart, hotPotatoResetFields } from './hotPotatoDuel';



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
    WIRE_REVEALER: 25,
    BOMB_SHIELD: 40,
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
        if (gameState.roundAdvanceClaimed === roundNumber) return;
        transaction.update(groupRef, { 'gameState.roundAdvanceClaimed': roundNumber });
        claimed = true;
    });
    return claimed;
};



export const SHOP_PRICES = {
    BETTING_TICKET: 30,
    TBC_TICKET: 40, // your call on pricing — placeholder
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

        transaction.update(groupRef, {
            [`gameState.fusePoints.${playerId}`]: fp - ITEM_PRICES.WIRE_REVEALER,
            [`gameState.revealerPurchases.${playerId}`]: bought + 1,
            [`gameState.revealerItems.${playerId}`]: owned,
        });
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
        transaction.update(groupRef, {
            [`gameState.fusePoints.${playerId}`]: fp - ITEM_PRICES.BOMB_SHIELD,
            [`gameState.shieldItems.${playerId}`]: (gameState.shieldItems?.[playerId] ?? 0) + 1,
        });
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

    const missionMap = assignMissions(group.players);

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
        missions: missionMap,
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
        freeTbcClaimed: {}

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
    | { success: true }
    | {
        success: false;
        reason: 'wrong-answer' | 'clingy-locked' | 'stale';
        penaltySeconds?: number;
        remainingLockMs?: number;
    };

export const passBomb = async (
    group: Group,
    fromId: string,
    toId: string,
    usedFallback: boolean = false
): Promise<PassResult> => {
    const groupRef = doc(db, 'groups', group.id);
    let result: PassResult = { success: false, reason: 'stale' };

    try {
        await runTransaction(db, async (transaction) => {
            // A retried attempt must not inherit the last attempt's result.
            result = { success: false, reason: 'stale' };

            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const gameState = snap.data().gameState as BombGameState;
            const now = Date.now();

            // Stale tap: the bomb already moved on, or the round already ended.
            if (gameState.currentHolderId !== fromId) return;
            if (['exploded', 'replay', 'result', 'penalty'].includes(gameState.phase)) return;
            // During panic, passing only opens once the real countdown is running
            // (not during the ghost window or the ghost reveal).
            if (gameState.phase === 'panic' && (!gameState.panicStartedAt || gameState.ghostWindowEndsAt)) return;

            // Personalities never apply in 2-player duels — plain timer only.
            const isDuel = gameState.phase === 'duel' || gameState.phase === 'duel-intro';
            const personality = isDuel ? null : gameState.personalityEffect;

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
                applyFusePoints(wrongPassUpdates, gameState, fromId, FUSE_POINTS.CLINGY_WRONG_PASS, 'Wrong pass!');

                // wrong-answer branch: replace the updateDoc + return with
                transaction.update(groupRef, wrongPassUpdates);
                result = { success: false, reason: 'wrong-answer', penaltySeconds };
                return;
            }

            // CORRECT / unenforced pass — proceed as normal.
            const fallbackText = gameState.instructionFallbacks?.[fromId] ?? '';
            const passEvent = {
                from: fromId,
                to: toId,
                timestamp: now,
                instruction: gameState.instructions[fromId] ?? '',
                ...(boomerang
                    ? { boomerang: true }
                    : usedFallback && fallbackText
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



            const updates: Record<string, unknown> = {
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
            };

            if (gameState.phase === 'panic') {
                updates['gameState.panicStartedAt'] = now;

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

            applyMissionEvent(updates, gameState, group.players, fromId, {
                kind: 'pass',
                fromId,
                toId,
                activePlayerIds,
                duringPanic: gameState.phase === 'panic',
            });
            applyMissionEvent(updates, gameState, group.players, fromId, {
                kind: 'survived-hold',
                playerId: fromId,
            });

            applyFusePoints(
                updates,
                gameState,
                fromId,
                FUSE_POINTS.SURVIVED_HOLD_AND_PASSED,
                'Survived your hold'
            );


            transaction.update(groupRef, updates);
            result = { success: true };
        });
    } catch (e) {
        if (__DEV__) console.warn('[passBomb] transaction failed', e);
    }
    return result;
};





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
                'gameState.phase': 'panic',
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
            'gameState.phase': 'panic',
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
// updates, fuse points, mission events, AND the betting payout — any
// ghost whose bet correctly guessed the true correct wire wins when the
// holder explodes, kicking off a ghost tournament for however many of
// them won.
export const resolvePanicOutcome = async (group: Group): Promise<void> => {
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
        if (Date.now() < gameState.panicStartedAt + PANIC_THRESHOLD * 1000 - CLOCK_TOLERANCE_MS) return;

        const playerId = gameState.currentHolderId;
        const wire = gameState.wireChoice; // may be undefined — holder never locked one in
        const isImmune = gameState.ghostImmunePlayers.includes(playerId);
        const defused = !isImmune && wire != null && wire === gameState.correctWire;

        const newWireCutters = (gameState.wireCutters ?? []).includes(playerId)
            ? gameState.wireCutters
            : [...(gameState.wireCutters ?? []), playerId];

        if (isImmune) {
            transaction.update(groupRef, {
                'gameState.phase': 'exploded',
                'gameState.wireChoice': wire ?? deleteField(),
                'gameState.defused': true,
                'gameState.explodedPlayerId': playerId,
                'gameState.lastWireCutPlayerId': playerId,
                'gameState.clingy': deleteField(),
                'gameState.wireCutters': newWireCutters,
                // Void — nothing could be won against an immune holder, so the
                // tickets go back, same as when a pass or force-end cancels the cut.
                ...refundActiveBets(gameState),
            });
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
                'gameState.activeBets': {}, // defused — every bet loses
            };

            applyFusePoints(updates, gameState, playerId, FUSE_POINTS.WIRE_DEFUSED, 'Wire defused!');
            applyMissionEvent(updates, gameState, group.players, playerId, { kind: 'defused', playerId });
            applyMissionEvent(updates, gameState, group.players, playerId, { kind: 'survived-hold', playerId });

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
        };

        if (shielded) {
            updates['gameState.shieldAbsorbedPlayerId'] = playerId;
            updates['gameState.roundShields'] = (gameState.roundShields ?? []).filter(
                (id) => id !== playerId
            );
            // Lives, ghosts and the wrong-wire FP penalty are all skipped —
            // the vest took the hit.
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
            applyFusePoints(updates, gameState, playerId, FUSE_POINTS.WIRE_EXPLODED_SELF, 'Wrong wire!');

            // Whoever handed the bomb to the victim earns credit for "assassin"
            // missions — only when it actually cost them something.
            const lastPass = gameState.passHistory[gameState.passHistory.length - 1];
            if (lastPass && lastPass.to === playerId && lastPass.from !== playerId) {
                applyMissionEvent(updates, gameState, group.players, lastPass.from, {
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
        await addScore(group.id, scoreDefuserId, ROUND_WIN_SCORE, group.scores);
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
    correctWire: gameState.correctWire,
    passCount: gameState.passHistory.length,
    personality: gameState.personality,
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
    });
};

export const markDuelReady = async (
    group: Group,
    playerId: string
): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);

    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(groupRef);
        if (!snap.exists()) return;
        const gameState = snap.data().gameState as BombGameState;

        if ((gameState.duelReadyPlayers ?? []).includes(playerId)) return;

        const newReady = [...(gameState.duelReadyPlayers ?? []), playerId];
        const activePlayerIds = group.players
            .filter((p) => !gameState.ghosts.includes(p.id))
            .map((p) => p.id);

        const bothReady = activePlayerIds.every((id) => newReady.includes(id));


        if (bothReady && (gameState.duelMode === 'fastest-finger' || gameState.duelMode === 'hot-seat')) {
            transaction.update(groupRef, {
                'gameState.duelReadyPlayers': newReady,
            });
        } else if (bothReady) {
            transaction.update(groupRef, {
                'gameState.duelReadyPlayers': newReady,
                'gameState.phase': 'duel',
                ...buildHotPotatoStart(Date.now()),
            })
        }
    });
};

export const setDuelMode = async (
    groupId: string,
    mode: 'hot-potato' | 'fastest-finger' | 'hot-seat'
): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, { 'gameState.duelMode': mode });
};

// ── NEXT ROUND ───────────────────────────────────────────────────
export const startNextRound = async (group: Group): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    const gameState = group.gameState as BombGameState;

    if (!(await claimRoundAdvance(group.id, gameState.roundNumber))) return;

    const activePlayers = group.players.filter(
        (p) => !gameState.ghosts.includes(p.id)
    );

    if (activePlayers.length <= 1) {
        await updateDoc(groupRef, { 'gameState.phase': 'result' });
        return;
    }
    await applyRoundEndMissions(group);
    if (activePlayers.length === 2) {
        await startDuelRound(group, activePlayers, gameState);
        return;
    }
    await payGhostStipends(group.id);
    const personality = getRandomPersonality(
        gameState.usedPersonalities,
        activePlayers.length, gameState.timerMode  // use active players, not total
    );
    const duration = getRandomDuration();
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

    // Claim the end of the game atomically: only the first call gets through,
    // so a second call can't award the bonuses again.
    await runTransaction(db, async (transaction) => {
        // A retried attempt must not inherit the last attempt's result.
        claimed = false;
        winnerId = undefined;
        runnerUpId = undefined;

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
        await addScore(group.id, playerId, points, scores);
        scores[playerId] = (scores[playerId] ?? 0) + points;
    };
    if (winnerId) await award(winnerId, GAME_WIN_SCORE_BONUS);
    if (runnerUpId) await award(runnerUpId, RUNNER_UP_SCORE_BONUS);
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

// ── LIAR HINT ────────────────────────────────────────────────────
export const getLiarHint = (correctWire: 'red' | 'blue'): string => {
    const isLying = Math.random() < 0.7;
    const hintWire = isLying
        ? correctWire === 'red' ? 'blue' : 'red'
        : correctWire;

    const hints = {
        red: [
            'I heard red wires are usually safe...',
            'Someone said cut the red one',
            'Red means stop — stop the timer!',
            'The red wire looks harmless',
        ],
        blue: [
            'Blue is the color of safety, right?',
            'Cut the blue one, trust me',
            'Blue wires never explode',
            'The blue wire is definitely safe',
        ],
    };

    const hintList = hints[hintWire];
    return hintList[Math.floor(Math.random() * hintList.length)];
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
                'gameState.phase': 'replay',
                'gameState.forceEnded': true,
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

export const computePanicRemaining = (gs: BombGameState, now = Date.now()): number =>
    gs.panicStartedAt
        ? Math.max(0, PANIC_THRESHOLD - (now - gs.panicStartedAt) / 1000)
        : PANIC_THRESHOLD;

