import { doc, updateDoc, deleteField, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '../../../shared/firebase/config';
import { Group, BombGameState, PassDispute, WireBet } from '../../../shared/types';
import { addScore, returnToMenu } from '../../../shared/firebase/groups';
import {
    getRandomInstruction,
    getRandomPersonality,
    resolveInstructionTargets,
    EligibilityContext,
    instructions,
} from '../data/content';
import { assignMissions } from '../data/missions';
import { applyMissionEvent, applyRoundEndMissions } from './missionEngine';
import { startFastestFingerQuestion, buildActiveQuiz } from './Fastestfinger';
import { FUSE_POINTS, applyFusePoints, MAX_POINT_EVENTS, ROUND_WIN_SCORE, GAME_WIN_SCORE_BONUS } from './bombHelpers';
import { settleWinnerBets } from './betEngine';
import { payGhostStipends } from './ghostEconomy';

const BOMB_MIN_DURATION = 20;
const BOMB_MAX_DURATION = 90;
const PANIC_THRESHOLD = 5;
const DUEL_START_SECONDS = 4;
const DUEL_SHRINK_FACTOR = 0.87; // ~13% faster each successful pass
const DUEL_MIN_SECONDS = 1.5;
const GHOST_WINDOW_MAX_MS = 5000;
const GHOST_WINDOW_MIN_MS = 3000;

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

const getRandomDuration = () =>
    Math.floor(Math.random() * (BOMB_MAX_DURATION - BOMB_MIN_DURATION + 1)) +
    BOMB_MIN_DURATION;

const pickRandomHolder = (playerIds: string[]): string =>
    playerIds[Math.floor(Math.random() * playerIds.length)];

const pickRandomWire = (): 'red' | 'blue' =>
    Math.floor(Math.random() * 2) === 0 ? 'red' : 'blue';

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

        if (!gameState.ghosts.includes(playerId)) {
            result = { success: false, reason: 'not-a-ghost' };
            return;
        }

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


// ── START GAME ───────────────────────────────────────────────────
export const startBombGame = async (
    group: Group,
    timerMode: 'on' | 'off' | 'mixed',
    seatingOrder: string[],
    strictMemoryMode: boolean = true
): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    const playerIds = group.players.map((p) => p.id);
    const personality = getRandomPersonality([], group.players.length);
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
        timerRemaining: duration,
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
        reason: 'wrong-answer' | 'clingy-locked';
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
    const gameState = group.gameState as BombGameState;
    const now = Date.now();

    // Guard: holder currently clingy-locked — cannot pass at all
    if (
        gameState.clingy &&
        gameState.clingy.holderId === fromId &&
        now < gameState.clingy.until
    ) {
        return {
            success: false,
            reason: 'clingy-locked',
            remainingLockMs: gameState.clingy.until - now,
        };
    }

    // Validate against the instruction's objective answer, if any
    const instructionId = gameState.instructionIds?.[fromId];
    const instructionDef = instructions.find((i) => i.id === instructionId);
    const skipMemoryEnforcement =
        instructionDef?.category === 'memory' && gameState.strictMemoryMode === false;
    const activePlayerIds = group.players
        .filter((p) => !gameState.ghosts.includes(p.id))
        .map((p) => p.id);
    const ctx = buildEligibilityContext(gameState, fromId, activePlayerIds);
    const correctTargets = instructionId && !skipMemoryEnforcement
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

        await updateDoc(groupRef, wrongPassUpdates);
        return { success: false, reason: 'wrong-answer', penaltySeconds };
    }

    // CORRECT / unenforced pass — proceed as normal.
    const fallbackText = gameState.instructionFallbacks?.[fromId] ?? '';
    const passEvent = {
        from: fromId,
        to: toId,
        timestamp: now,
        instruction: gameState.instructions[fromId] ?? '',
        ...(usedFallback && fallbackText
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
    if (gameState.personalityEffect === 'angry') {
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
    if (gameState.personalityEffect === 'cursed' && lastPasser === toId) {
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
        'gameState.timerRemaining': newDuration,
        'gameState.speedMultiplier': newSpeedMultiplier,
        'gameState.timerStartedAt': newTimerStartedAt,
        'gameState.boomerangUsed': gameState.personalityEffect === 'boomerang'
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
    if (gameState.personalityEffect === 'quiz' && gameState.phase === 'playing') {
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


    await updateDoc(groupRef, updates);
    return { success: true };
};

// ── DUEL PASS ────────────────────────────────────────────────────
export const duelPass = async (
    group: Group,
    fromId: string,
    toId: string
): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    const gameState = group.gameState as BombGameState;
    const now = Date.now();

    const passEvent = {
        from: fromId,
        to: toId,
        timestamp: now,
        instruction: '',
    };

    const newHoldSeconds = Math.max(
        DUEL_MIN_SECONDS,
        (gameState.duelHoldSeconds ?? DUEL_START_SECONDS) * DUEL_SHRINK_FACTOR
    );

    const newHoldCounts = {
        ...gameState.holdCounts,
        [toId]: (gameState.holdCounts?.[toId] ?? 0) + 1,
    };

    await updateDoc(groupRef, {
        'gameState.currentHolderId': toId,
        'gameState.passHistory': [...gameState.passHistory, passEvent].slice(-MAX_PASS_HISTORY),
        'gameState.chainPassed': [...gameState.chainPassed, toId],
        'gameState.duelHoldSeconds': newHoldSeconds,
        'gameState.duelHoldStartedAt': now,
        'gameState.holdCounts': newHoldCounts,
    });
};

// ── PANIC / TIMER ────────────────────────────────────────────────
export const triggerPanic = async (groupId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    const now = Date.now();

    const freshSnap = await getDoc(groupRef);
    if (!freshSnap.exists()) return;
    const gameState = freshSnap.data().gameState as BombGameState;

    const anyGhostHasTicket = gameState.ghosts.some(
        (id) => (gameState.bettingTickets?.[id] ?? 0) > 0
    );

    if (!anyGhostHasTicket) {
        // Nobody who could possibly bet exists yet — skip the ghost
        // window entirely and go straight into the real countdown,
        // exactly as if the mechanic didn't exist this round.
        await updateDoc(groupRef, {
            'gameState.phase': 'panic',
            'gameState.panicStartedAt': now,
            'gameState.timerStartedAt': now,
            'gameState.timerDuration': PANIC_THRESHOLD,
            'gameState.timerRemaining': PANIC_THRESHOLD,
            'gameState.ghostWindowEndsAt': deleteField(),
            'gameState.activeBets': {},
            'gameState.ghostResponded': [],
        });
        return;
    }

    await updateDoc(groupRef, {
        'gameState.phase': 'panic',
        'gameState.ghostWindowEndsAt': now + GHOST_WINDOW_MAX_MS,
        'gameState.activeBets': {},
        'gameState.ghostResponded': [],
        'gameState.panicStartedAt': deleteField(),
    });
};

export const endGhostWindow = async (groupId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, {
        'gameState.ghostWindowEndsAt': deleteField(),
    });
};

// Called once (host-only) when the ghost window naturally elapses.
export const startPanicCountdown = async (groupId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    const now = Date.now();
    await updateDoc(groupRef, {
        'gameState.ghostWindowEndsAt': deleteField(),
        'gameState.panicStartedAt': now,
        'gameState.timerStartedAt': now,
        'gameState.timerDuration': PANIC_THRESHOLD,
        'gameState.timerRemaining': PANIC_THRESHOLD,
    });
};

export const syncBombTimer = async (
    groupId: string,
    remaining: number
): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, { 'gameState.timerRemaining': remaining });
};

// ── LOCK IN WIRE ─────────────────────────────────────────────────
// Deliberately does NOT resolve explode/defuse — that's
// resolvePanicOutcome()'s job, fired once by the host when the full
// 5-second countdown runs out. This only records which wire the holder
// tapped, and guards against the two things that could make that tap
// invalid: the clingy lock, and tapping twice.
export type LockInWireResult = {
    blocked?: boolean;
    remainingLockMs?: number;
};

export const lockInWire = async (
    group: Group,
    playerId: string,
    wire: 'red' | 'blue'
): Promise<LockInWireResult> => {
    const groupRef = doc(db, 'groups', group.id);

    // Fresh read — same reasoning as the old cutWire always had: avoid
    // acting on a stale clingy/wireChoice snapshot from a slightly
    // out-of-date local gameState.
    const freshSnap = await getDoc(groupRef);
    if (!freshSnap.exists()) return {};
    const freshGameState = freshSnap.data().gameState as BombGameState;
    const now = Date.now();

    // Guard: holder currently clingy-locked — cannot lock in a wire
    // either, same as they can't pass.
    if (
        freshGameState.clingy &&
        freshGameState.clingy.holderId === playerId &&
        now < freshGameState.clingy.until
    ) {
        return { blocked: true, remainingLockMs: freshGameState.clingy.until - now };
    }

    // Guard: already locked in — a second tap (even the same wire) is a
    // no-op, so a slow network round-trip after the first tap can't
    // silently overwrite an already-locked choice.
    if (freshGameState.wireChoice) return {};

    await updateDoc(groupRef, { 'gameState.wireChoice': wire });
    return {};
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
    const freshSnap = await getDoc(groupRef);
    if (!freshSnap.exists()) return;
    const gameState = freshSnap.data().gameState as BombGameState;
    if (gameState.phase !== 'panic') return; // already resolved, e.g. a pass happened instead

    const playerId = gameState.currentHolderId;
    const wire = gameState.wireChoice; // may be undefined — holder never locked one in
    const isImmune = gameState.ghostImmunePlayers.includes(playerId);
    const defused = !isImmune && wire != null && wire === gameState.correctWire;

    const newWireCutters = (gameState.wireCutters ?? []).includes(playerId)
        ? gameState.wireCutters
        : [...(gameState.wireCutters ?? []), playerId];

    if (isImmune) {
        await updateDoc(groupRef, {
            'gameState.phase': 'exploded',
            'gameState.wireChoice': wire ?? deleteField(),
            'gameState.defused': true,
            'gameState.explodedPlayerId': playerId,
            'gameState.lastWireCutPlayerId': playerId,
            'gameState.clingy': deleteField(),
            'gameState.wireCutters': newWireCutters,
            'gameState.activeBets': {}, // void — nothing to win against an immune holder
        });
        return;
    }

    if (defused) {
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
            'gameState.activeBets': {}, // defused — every bet loses, nothing further to resolve
        };

        applyFusePoints(updates, gameState, playerId, FUSE_POINTS.WIRE_DEFUSED, 'Wire defused!');

        applyMissionEvent(updates, gameState, group.players, playerId, { kind: 'defused', playerId });
        applyMissionEvent(updates, gameState, group.players, playerId, { kind: 'survived-hold', playerId });

        await updateDoc(groupRef, updates);
        await addScore(group.id, playerId, ROUND_WIN_SCORE, group.scores);
        return;
    }

    // Exploded — either the wrong wire was locked in, or none was at all.
    const currentLives = gameState.lives[playerId] ?? 0;
    const newLives = Math.max(0, currentLives - 1);
    const newGhosts =
        newLives === 0 && !gameState.ghosts.includes(playerId)
            ? [...gameState.ghosts, playerId]
            : gameState.ghosts;
    const newEverGhosted =
        newLives === 0 && !(gameState.everGhosted ?? []).includes(playerId)
            ? [...(gameState.everGhosted ?? []), playerId]
            : gameState.everGhosted ?? [];

    const updates: Record<string, unknown> = {
        'gameState.phase': 'exploded',
        'gameState.wireChoice': wire ?? deleteField(),
        'gameState.defused': false,
        'gameState.explodedPlayerId': playerId,
        'gameState.lives': { ...gameState.lives, [playerId]: newLives },
        'gameState.ghosts': newGhosts,
        'gameState.everGhosted': newEverGhosted,
        'gameState.ghostEvents':
            newLives === 0 && !gameState.ghosts.includes(playerId)
                ? [...(gameState.ghostEvents ?? []), playerId]
                : gameState.ghostEvents ?? [],
        'gameState.lastWireCutPlayerId': playerId,
        'gameState.lastLifeLostPlayerId': playerId,
        'gameState.clingy': deleteField(),
        'gameState.wireCutters': newWireCutters,
    };
    applyFusePoints(updates, gameState, playerId, FUSE_POINTS.WIRE_EXPLODED_SELF, 'Wrong wire!');

    // Whoever handed the bomb to the victim earns credit for "assassin" missions.
    const lastPass = gameState.passHistory[gameState.passHistory.length - 1];
    if (lastPass && lastPass.to === playerId && lastPass.from !== playerId) {
        applyMissionEvent(updates, gameState, group.players, lastPass.from, {
            kind: 'caused-explosion',
            passerId: lastPass.from,
        });
    }

    // Betting payout — anyone who guessed the TRUE correct wire wins,
    // regardless of what the holder actually cut.
    const bets = Object.values(gameState.activeBets ?? {});
    const winningGhostIds = bets
        .filter((b) => b.guessedWire === gameState.correctWire)
        .map((b) => b.ghostId);

    updates['gameState.activeBets'] = {}; // clear regardless — resolved either way

    if (winningGhostIds.length > 0) {
        updates['gameState.pendingGhostTournament'] = {
            wireCutterId: playerId,
            ghostIds: winningGhostIds,
        };
    }
    await updateDoc(groupRef, updates);
};

// ── EXPLODE (timer ran out) ─────────────────────────────────────
export const explodeBomb = async (group: Group): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    const gameState = group.gameState as BombGameState;
    const holderId = gameState.currentHolderId;
    const isImmune = gameState.ghostImmunePlayers.includes(holderId);

    if (isImmune) {
        await updateDoc(groupRef, {
            'gameState.phase': 'exploded',
            'gameState.defused': false,
            'gameState.explodedPlayerId': holderId,
            'gameState.wireChoice': deleteField(),
            'gameState.clingy': deleteField(),
        });
        return;
    }

    const currentLives = gameState.lives[holderId] ?? 0;
    const newLives = Math.max(0, currentLives - 1);
    const newLivesMap = { ...gameState.lives, [holderId]: newLives };
    const newGhosts = newLives === 0
        ? [...gameState.ghosts, holderId]
        : gameState.ghosts;
    const newEverGhosted =
        newLives === 0 && !(gameState.everGhosted ?? []).includes(holderId)
            ? [...(gameState.everGhosted ?? []), holderId]
            : gameState.everGhosted ?? [];

    await updateDoc(groupRef, {
        'gameState.phase': 'exploded',
        'gameState.defused': false,
        'gameState.explodedPlayerId': holderId,
        'gameState.wireChoice': deleteField(),
        'gameState.lives': newLivesMap,
        'gameState.ghosts': newGhosts,
        'gameState.everGhosted': newEverGhosted,
        'gameState.lastLifeLostPlayerId': holderId,
        'gameState.clingy': deleteField(),
        'gameState.ghostEvents':
            newLives === 0 && !gameState.ghosts.includes(holderId)
                ? [...(gameState.ghostEvents ?? []), holderId]
                : gameState.ghostEvents ?? [],
    });
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
    const gameState = group.gameState as BombGameState;
    const passEvent = gameState.passHistory[passIndex];
    if (!passEvent) return;
    if (voterId === passEvent.from) return;

    const disputes = [...(gameState.disputes ?? [])];
    const existingIndex = disputes.findIndex((d) => d.passIndex === passIndex);

    let dispute: PassDispute =
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

    const alreadyVoted = dispute.voterIds.includes(voterId);
    dispute.voterIds = alreadyVoted
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

        await updateDoc(groupRef, disputeUpdates);
    } else {
        await updateDoc(groupRef, {
            'gameState.disputes': updatedDisputes,
        });
    }
};

export const cutPenaltyWire = async (
    group: Group,
    wire: 'red' | 'blue'
): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    const gameState = group.gameState as BombGameState;
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
        if (newLives === 0 && !gameState.ghosts.includes(playerId)) {
            updates['gameState.ghostEvents'] = [...(gameState.ghostEvents ?? []), playerId];
            updates['gameState.ghosts'] = [...gameState.ghosts, playerId];
            updates['gameState.everGhosted'] =
                !(gameState.everGhosted ?? []).includes(playerId)
                    ? [...(gameState.everGhosted ?? []), playerId]
                    : gameState.everGhosted ?? [];
            updates['gameState.lastLifeLostPlayerId'] = playerId;
        }
    }

    await updateDoc(groupRef, updates);
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
    const personality = getRandomPersonality(gameState.usedPersonalities);

    const newHoldCounts = {
        ...gameState.holdCounts,
        [startingHolder]: (gameState.holdCounts?.[startingHolder] ?? 0) + 1,
    };

    const updatedSummaries = [
        ...(gameState.roundSummaries ?? []),
        buildRoundSummary(gameState),
    ].slice(-MAX_ROUND_SUMMARIES);

    await updateDoc(groupRef, {
        'gameState.phase': 'duel-intro',
        'gameState.currentHolderId': startingHolder,
        'gameState.correctWire': correctWire,
        'gameState.personality': personality.id,
        'gameState.personalityName': personality.name,
        'gameState.personalityEmoji': personality.emoji,
        'gameState.personalityEffect': personality.effect,
        'gameState.personalityDescription': personality.description,
        'gameState.passHistory': [],
        'gameState.roundNumber': gameState.roundNumber + 1,
        'gameState.usedPersonalities': [
            ...gameState.usedPersonalities,
            personality.id,
        ].slice(-MAX_USED_PERSONALITIES),
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
        'gameState.duelHoldSeconds': DUEL_START_SECONDS,
        'gameState.duelHoldStartedAt': deleteField(),
        'gameState.duelReadyPlayers': [],
        'gameState.disputes': [],
        'gameState.penaltyPlayerId': deleteField(),
        'gameState.penaltyCorrectWire': deleteField(),
        'gameState.penaltyWireChoice': deleteField(),
        'gameState.penaltyResult': deleteField(),
        'gameState.isPaused': false,
        'gameState.pausedAt': deleteField(),
        'gameState.activeQuiz': deleteField(),
        'gameState.ghostTournament': deleteField(),
        'gameState.pendingGhostTournament': deleteField(),
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
                'gameState.duelHoldStartedAt': Date.now(),
            });
        } else {
            transaction.update(groupRef, {
                'gameState.duelReadyPlayers': newReady,
            });
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
        activePlayers.length  // use active players, not total
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
        'gameState.timerRemaining': duration,
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
        'gameState.wireChoice': deleteField(),
        'gameState.explodedPlayerId': deleteField(),
        'gameState.panicStartedAt': deleteField(),
        'gameState.previousRoundWireCutPlayerId': gameState.lastWireCutPlayerId ?? deleteField(),
        'gameState.lastWireCutPlayerId': deleteField(),
        'gameState.wrongPassCounts': {},
        'gameState.clingy': deleteField(),
        'gameState.holdCounts': newHoldCounts,
        'gameState.duelHoldSeconds': deleteField(),
        'gameState.duelHoldStartedAt': deleteField(),
        'gameState.disputes': [],
        'gameState.penaltyPlayerId': deleteField(),
        'gameState.penaltyCorrectWire': deleteField(),
        'gameState.penaltyWireChoice': deleteField(),
        'gameState.penaltyResult': deleteField(),
        'gameState.isPaused': false,
        'gameState.pausedAt': deleteField(),
        'gameState.ghostTournament': deleteField(),
        'gameState.pendingGhostTournament': deleteField(),
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
    const gameState = group.gameState as BombGameState;
    const groupRef = doc(db, 'groups', group.id);

    const activePlayers = group.players.filter((p) => !gameState.ghosts.includes(p.id));
    const winner = activePlayers[0];

    const endUpdates: Record<string, unknown> = { 'gameState.phase': 'result' };
    if (winner) {
        applyFusePoints(endUpdates, gameState, winner.id, FUSE_POINTS.GAME_WIN, 'Last one standing!');
    }
    await updateDoc(groupRef, endUpdates);

    if (winner) {
        // Keep running leaderboard totals: the winner-bet payouts that follow must
        // include this game-win bonus, not overwrite it from a stale snapshot.
        const scores: Record<string, number> = { ...(group.scores ?? {}) };
        await addScore(group.id, winner.id, GAME_WIN_SCORE_BONUS, scores);
        scores[winner.id] = (scores[winner.id] ?? 0) + GAME_WIN_SCORE_BONUS;
        await settleWinnerBets(group, winner.id, scores);
    } else {
        await settleWinnerBets(group, undefined);
    }
};

// ── TIMER PAUSE / RESUME (calm bomb) ─────────────────────────────
export const pauseTimer = async (groupId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, {
        'gameState.isPaused': true,
        'gameState.pausedAt': Date.now(),
    });
};

export const resumeTimer = async (
    groupId: string,
    pausedAt: number,
    timerStartedAt: number,
    timerDuration: number
): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    const pauseDuration = Date.now() - pausedAt;
    const newTimerStartedAt = timerStartedAt + pauseDuration;
    await updateDoc(groupRef, {
        'gameState.isPaused': false,
        'gameState.pausedAt': deleteField(),
        'gameState.timerStartedAt': newTimerStartedAt,
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
    const freshSnap = await getDoc(groupRef);
    if (!freshSnap.exists()) return { success: false, reason: 'not-found' };
    const gameState = freshSnap.data().gameState as BombGameState;

    if (!gameState.ghostWindowEndsAt || Date.now() >= gameState.ghostWindowEndsAt) {
        return { success: false, reason: 'window-closed' };
    }

    const currentTickets = gameState.bettingTickets?.[ghostId] ?? 0;
    if (currentTickets <= 0) {
        return { success: false, reason: 'no-tickets' };
    }
    if (gameState.activeBets?.[ghostId]) {
        return { success: false, reason: 'already-bet' };
    }

    const bet: WireBet = {
        ghostId,
        guessedWire,
        targetPlayerId: gameState.currentHolderId,
        placedAt: Date.now(),
        resolved: false,
    };

    await updateDoc(groupRef, {
        [`gameState.bettingTickets.${ghostId}`]: currentTickets - 1,
        [`gameState.activeBets.${ghostId}`]: bet,
        'gameState.ghostResponded': [...(gameState.ghostResponded ?? []), ghostId],
    });
    return { success: true };
};

export const declineBet = async (
    group: Group,
    ghostId: string
): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    const freshSnap = await getDoc(groupRef);
    if (!freshSnap.exists()) return;
    const gameState = freshSnap.data().gameState as BombGameState;

    if (!gameState.ghostWindowEndsAt || Date.now() >= gameState.ghostWindowEndsAt) return;
    const responded = gameState.ghostResponded ?? [];
    if (responded.includes(ghostId)) return;

    await updateDoc(groupRef, {
        'gameState.ghostResponded': [...responded, ghostId],
    });
};

export const endPersonalityReveal = async (groupId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    const now = Date.now();
    await updateDoc(groupRef, {
        'gameState.phase': 'playing',
        'gameState.revealEndsAt': deleteField(),
        'gameState.timerStartedAt': now, // the real countdown starts HERE, not before
    });
};

// ── FORCE END ROUND (host emergency control) ─────────────────────
export const forceEndRound = async (group: Group): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    await updateDoc(groupRef, {
        'gameState.phase': 'replay',
        'gameState.forceEnded': true,
        'gameState.wireChoice': deleteField(),
        'gameState.defused': deleteField(),
        'gameState.explodedPlayerId': deleteField(),
        'gameState.panicStartedAt': deleteField(),
        'gameState.clingy': deleteField(),
        'gameState.penaltyPlayerId': deleteField(),
        'gameState.penaltyCorrectWire': deleteField(),
        'gameState.penaltyWireChoice': deleteField(),
        'gameState.penaltyResult': deleteField(),
    });
};