import { doc, updateDoc, deleteField, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '../../../shared/firebase/config';
import { Group, BombGameState, ActiveQuiz } from '../../../shared/types';
import { getRandomQuestion, generateQuizInstance } from '../data/quizQuestions';

const DUEL_FFF_IDLE_TIMEOUT_MS = 8000; // silent-skip window
const DUEL_FFF_LOCK_MS = 3000;         // holder lock duration on failure
const DUEL_FFF_HIDDEN_TIMER_MIN = 25;  // seconds — never shown to players
const DUEL_FFF_HIDDEN_TIMER_MAX = 45;
const MAX_PASS_HISTORY = 50;

const getRandomHiddenDuration = () =>
    Math.floor(
        Math.random() * (DUEL_FFF_HIDDEN_TIMER_MAX - DUEL_FFF_HIDDEN_TIMER_MIN + 1)
    ) + DUEL_FFF_HIDDEN_TIMER_MIN;

const rollNextQuestion = (usedQuizQuestions: string[]) => {
    const question = getRandomQuestion(usedQuizQuestions);
    const instance = generateQuizInstance(question);
    const activeQuiz: ActiveQuiz = {
        question: instance,
        startedAt: Date.now(),
        durationMs: DUEL_FFF_IDLE_TIMEOUT_MS,
        answers: {},
        resolved: false,
        mode: 'duel-fff',
        chainNext: true,
    };
    return { activeQuiz, usedQuestionId: question.id };
};

export type DuelFffDecision = 'too-slow' | 'holder-correct' | 'holder-wrong';

// ── START (first question of the duel) ────────────────────────────
export const startDuelFastestFinger = async (group: Group): Promise<void> => {
    console.log('[startDuelFastestFinger] called');
    const groupRef = doc(db, 'groups', group.id);
    const gameState = group.gameState as BombGameState;
    const { activeQuiz, usedQuestionId } = rollNextQuestion(
        gameState.usedQuizQuestions ?? []
    );

    try {
        await updateDoc(groupRef, {
            'gameState.phase': 'duel',
            'gameState.duelFffTimerStartedAt': Date.now(),
            'gameState.duelFffTimerDuration': getRandomHiddenDuration(),
            'gameState.activeQuiz': activeQuiz,
            'gameState.usedQuizQuestions': [
                ...(gameState.usedQuizQuestions ?? []),
                usedQuestionId,
            ],
            'gameState.duelFffLockedUntil': deleteField(),
            'gameState.duelFffHolderCanPass': deleteField(),
            'gameState.duelFffLockReason': deleteField(),
        }); console.log('[startDuelFastestFinger] write succeeded');

    } catch (e) {
        console.log('[startDuelFastestFinger] WRITE FAILED:', e);
    }


};

export const decideDuelFastestFinger = (
    activeQuiz: ActiveQuiz,
    holderId: string,
    nonHolderId: string
): DuelFffDecision | null => {
    const holderAns = activeQuiz.answers?.[holderId];
    const nonHolderAns = activeQuiz.answers?.[nonHolderId];
    const isCorrect = (ans?: { optionIndex: number }) =>
        !!ans && !!activeQuiz.question?.options[ans.optionIndex]?.correct;

    if (
        nonHolderAns &&
        isCorrect(nonHolderAns) &&
        (!holderAns || nonHolderAns.timestamp <= holderAns.timestamp)
    ) {
        return 'too-slow';
    }
    if (holderAns) return isCorrect(holderAns) ? 'holder-correct' : 'holder-wrong';
    return null;
};

// ── EVALUATE (host-only) ──────────────────────────────────────────
// Called once when the host's own snapshot shows a decisive answer — not on
// a timer. Idempotent: if another call already resolved the question, this
// one reads `resolved` and writes nothing.
export const evaluateDuelFastestFinger = async (
    group: Group,
    holderId: string,
    nonHolderId: string
): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const gameState = snap.data().gameState as BombGameState;
            const activeQuiz = gameState.activeQuiz;
            if (!activeQuiz || !activeQuiz.question || activeQuiz.resolved) return;
            if (gameState.duelFffHolderCanPass || gameState.duelFffLockedUntil) return;

            const decision = decideDuelFastestFinger(activeQuiz, holderId, nonHolderId);
            if (!decision) return;

            if (decision === 'holder-correct') {
                transaction.update(groupRef, {
                    'gameState.duelFffHolderCanPass': true,
                    'gameState.activeQuiz.resolved': true,
                });
            } else {
                transaction.update(groupRef, {
                    'gameState.duelFffLockedUntil': Date.now() + DUEL_FFF_LOCK_MS,
                    'gameState.duelFffLockReason':
                        decision === 'too-slow' ? 'too-slow' : 'wrong',
                    'gameState.activeQuiz.resolved': true,
                });
            }
        });
    } catch {
        // transient contention — the host's screen retries shortly
    }
};

// ── IDLE SKIP (host-only) ─────────────────────────────────────────
// Nobody produced a deciding answer in time. `expectedStartedAt` names the
// question the host was looking at: if a newer question is already up (for
// example the holder just passed), this does nothing instead of throwing the
// fresh question away.
export const skipIdleDuelQuestion = async (
    group: Group,
    expectedStartedAt: number
): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const gameState = snap.data().gameState as BombGameState;
            const activeQuiz = gameState.activeQuiz;
            if (!activeQuiz || activeQuiz.resolved) return;
            if (activeQuiz.startedAt !== expectedStartedAt) return;
            if (gameState.duelFffHolderCanPass || gameState.duelFffLockedUntil) return;

            const { activeQuiz: nextQuiz, usedQuestionId } = rollNextQuestion(
                gameState.usedQuizQuestions ?? []
            );
            nextQuiz.mode = activeQuiz.mode; // keep a Trial by Combat question tagged as one
            transaction.update(groupRef, {
                'gameState.activeQuiz': nextQuiz,
                'gameState.usedQuizQuestions': [
                    ...(gameState.usedQuizQuestions ?? []),
                    usedQuestionId,
                ],
            });
        });
    } catch {
        // transient contention — the host's screen retries shortly
    }
};
;

// ── LOCK EXPIRY (host-only) ───────────────────────────────────────
// A transaction, so several quick calls roll exactly one question: the
// first clears the lock, the rest see no lock and stop.
export const continueDuelFastestFinger = async (group: Group): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const gameState = snap.data().gameState as BombGameState;

            if (!gameState.duelFffLockedUntil) return;
            if (Date.now() < gameState.duelFffLockedUntil) return;

            const { activeQuiz, usedQuestionId } = rollNextQuestion(
                gameState.usedQuizQuestions ?? []
            );
            activeQuiz.mode = gameState.activeQuiz?.mode ?? activeQuiz.mode;
            transaction.update(groupRef, {
                'gameState.activeQuiz': activeQuiz,
                'gameState.usedQuizQuestions': [
                    ...(gameState.usedQuizQuestions ?? []),
                    usedQuestionId,
                ],
                'gameState.duelFffLockedUntil': deleteField(),
                'gameState.duelFffLockReason': deleteField(),
                'gameState.duelFffHolderCanPass': deleteField(),
            });
        });
    } catch {
        // transient contention — the host's screen retries shortly
    }
};


// ── MANUAL PASS — holder taps "Pass" after answering correctly ────────
// A transaction: the check and the write happen together, so a second tap
// (or a laggy double-tap) finds `duelFffHolderCanPass` already cleared and
// does nothing, instead of rolling a second question over the first.
export const duelFffManualPass = async (
    group: Group,
    holderId: string,
    opponentId: string
): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const gameState = snap.data().gameState as BombGameState;

            if (!gameState.duelFffHolderCanPass) return; // only valid when allowed
            if (gameState.currentHolderId !== holderId) return; // stale-tap guard

            const passEvent = {
                from: holderId,
                to: opponentId,
                timestamp: Date.now(),
                instruction: '(Fastest Finger First)',
            };

            const { activeQuiz: nextQuiz, usedQuestionId } = rollNextQuestion(
                gameState.usedQuizQuestions ?? []
            );

            transaction.update(groupRef, {
                'gameState.currentHolderId': opponentId,
                'gameState.passHistory': [...gameState.passHistory, passEvent].slice(-MAX_PASS_HISTORY),
                'gameState.chainPassed': [...gameState.chainPassed, opponentId],
                'gameState.holdCounts': {
                    ...gameState.holdCounts,
                    [opponentId]: (gameState.holdCounts?.[opponentId] ?? 0) + 1,
                },
                'gameState.activeQuiz': nextQuiz,
                'gameState.usedQuizQuestions': [
                    ...(gameState.usedQuizQuestions ?? []),
                    usedQuestionId,
                ],
                'gameState.duelFffHolderCanPass': deleteField(),
                'gameState.duelFffLockedUntil': deleteField(),
                'gameState.duelFffLockReason': deleteField(),
            });
        });
    } catch {
        // the holder can simply tap again
    }
};;

// ── Hidden-timer hint tiers — unchanged from before ────────────────────
export const getDuelFffHint = (fractionRemaining: number): string => {
    if (fractionRemaining > 0.7) return '😌 The bomb feels calm...';
    if (fractionRemaining > 0.45) return '😐 The bomb is getting restless...';
    if (fractionRemaining > 0.25) return '😬 The bomb is getting impatient!';
    if (fractionRemaining > 0.1) return '🥵 The bomb is heating up fast!';
    return '🔥 THE BOMB IS ABOUT TO BLOW!';
};

// ── START (first question of a TBC duel) ──────────────────────────────
export const startTrialByCombat = async (group: Group): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    const gameState = group.gameState as BombGameState;
    const challenge = gameState.tbcChallenge;
    if (!challenge) return;

    const question = getRandomQuestion(gameState.usedQuizQuestions ?? []);
    const instance = generateQuizInstance(question);
    const activeQuiz: ActiveQuiz = {
        question: instance,
        startedAt: Date.now(),
        durationMs: DUEL_FFF_IDLE_TIMEOUT_MS,
        answers: {},
        resolved: false,
        mode: 'trial-by-combat',
        chainNext: true,
    };

    await updateDoc(groupRef, {
        // Deliberately NOT touching gameState.phase — it stays 'penalty',
        // the main game is unaffected and still visible to everyone else.
        'gameState.tbcHolderId': challenge.accusedId,
        'gameState.duelFffTimerStartedAt': Date.now(),
        'gameState.duelFffTimerDuration': getRandomHiddenDuration(),
        'gameState.activeQuiz': activeQuiz,
        'gameState.usedQuizQuestions': [
            ...(gameState.usedQuizQuestions ?? []),
            question.id,
        ],
        'gameState.duelFffLockedUntil': deleteField(),
        'gameState.duelFffHolderCanPass': deleteField(),
        'gameState.duelFffLockReason': deleteField(),
    });
};

// ── MANUAL PASS (Trial by Combat) ─────────────────────────────────────
// Same atomic guard as duelFffManualPass, but only moves tbcHolderId —
// never currentHolderId/chainPassed/passHistory/holdCounts, which belong to
// the main game.
export const tbcManualPass = async (
    group: Group,
    fromId: string,
    toId: string
): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const gameState = snap.data().gameState as BombGameState;

            if (!gameState.duelFffHolderCanPass) return;
            if (gameState.tbcHolderId !== fromId) return; // stale-tap guard

            const { activeQuiz: nextQuiz, usedQuestionId } = rollNextQuestion(
                gameState.usedQuizQuestions ?? []
            );
            nextQuiz.mode = 'trial-by-combat';

            transaction.update(groupRef, {
                'gameState.tbcHolderId': toId,
                'gameState.activeQuiz': nextQuiz,
                'gameState.usedQuizQuestions': [
                    ...(gameState.usedQuizQuestions ?? []),
                    usedQuestionId,
                ],
                'gameState.duelFffHolderCanPass': deleteField(),
                'gameState.duelFffLockedUntil': deleteField(),
                'gameState.duelFffLockReason': deleteField(),
            });
        });
    } catch {
        // the holder can simply tap again
    }
};;

// ── TIMEOUT — hidden timer ran out, whoever's holding the TBC risk
// loses. This is TBC's equivalent of explodeBomb(), but it must NOT
// call the real explodeBomb() — that operates on currentHolderId/the
// main game's phase, neither of which this side-duel should touch. ────
export const resolveTbcTimeout = async (group: Group): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    const freshSnap = await getDoc(groupRef);
    if (!freshSnap.exists()) return;
    const gameState = freshSnap.data().gameState as BombGameState;

    const loserId = gameState.tbcHolderId;
    if (!loserId) return;
    if (gameState.tbcLoserId) return; // already resolved, don't double-apply

    const currentLives = gameState.lives[loserId] ?? 0;
    const newLives = Math.max(0, currentLives - 1);
    const newLivesMap = { ...gameState.lives, [loserId]: newLives };
    const newGhosts =
        newLives === 0 && !gameState.ghosts.includes(loserId)
            ? [...gameState.ghosts, loserId]
            : gameState.ghosts;
    const newEverGhosted =
        newLives === 0 && !(gameState.everGhosted ?? []).includes(loserId)
            ? [...(gameState.everGhosted ?? []), loserId]
            : gameState.everGhosted ?? [];

    await updateDoc(groupRef, {
        'gameState.tbcLoserId': loserId,
        'gameState.lives': newLivesMap,
        'gameState.ghosts': newGhosts,
        'gameState.everGhosted': newEverGhosted,
        'gameState.ghostEvents':
            newLives === 0 && !gameState.ghosts.includes(loserId)
                ? [...(gameState.ghostEvents ?? []), loserId]
                : gameState.ghostEvents ?? [],
        'gameState.lastLifeLostPlayerId': loserId,
        'gameState.activeQuiz': deleteField(),
        'gameState.duelFffTimerStartedAt': deleteField(),
        'gameState.duelFffTimerDuration': deleteField(),
        'gameState.duelFffLockedUntil': deleteField(),
        'gameState.duelFffHolderCanPass': deleteField(),
        'gameState.duelFffLockReason': deleteField(),
    });
};

// ── CLEANUP — host taps "Back to Replay" from the TBC result screen ───
export const closeTrialByCombat = async (groupId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, {
        'gameState.phase': 'replay',
        'gameState.tbcChallenge': deleteField(),
        'gameState.tbcHolderId': deleteField(),
        'gameState.tbcLoserId': deleteField(),
        'gameState.penaltyPlayerId': deleteField(),
        'gameState.penaltyAccuserIds': deleteField(),
        'gameState.penaltyCorrectWire': deleteField(),
        'gameState.penaltyWireChoice': deleteField(),
        'gameState.penaltyResult': deleteField(),
    });
};