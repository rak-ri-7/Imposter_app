import { doc, updateDoc, deleteField, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '../../../shared/firebase/config';
import { Group, BombGameState, ActiveQuiz } from '../../../shared/types';
import { getRandomQuestion, generateSingleCorrectInstance } from '../data/quizQuestions';

const HOT_SEAT_LOCK_DURATIONS_MS = [3000, 5000, 8000]; // indexed by wrongCount - 1
const HOT_SEAT_HIDDEN_TIMER_MIN = 25; // reuses the same hidden-timer feel as FFF duel
const HOT_SEAT_HIDDEN_TIMER_MAX = 45;
const MAX_PASS_HISTORY = 50;

const getRandomHiddenDuration = () =>
    Math.floor(
        Math.random() * (HOT_SEAT_HIDDEN_TIMER_MAX - HOT_SEAT_HIDDEN_TIMER_MIN + 1)
    ) + HOT_SEAT_HIDDEN_TIMER_MIN;

const MAX_QUESTION_ATTEMPTS = 25;

// Hot Seat shows exactly one right answer and three wrong ones. Some
// questions can't supply that (a pool that's too small, or more than one
// right answer), so those are skipped rather than shown short-handed.
const isUsableForHotSeat = (instance: ActiveQuiz['question']): boolean => {
    const options = instance.options ?? [];
    const correct = options.filter((o) => o.correct).length;
    return options.length >= 4 && correct === 1 && options.length - correct >= 3;
};

const buildFreshQuestion = (
    usedQuizQuestions: string[]
): { activeQuiz: ActiveQuiz; usedQuestionId: string } => {
    const make = (question: { id: string }, instance: ActiveQuiz['question']) => ({
        activeQuiz: {
            question: instance,
            startedAt: Date.now(),
            durationMs: 0, // unused by this mode — no per-question timeout, only the hidden overall risk clock
            answers: {},
            resolved: false,
            mode: 'hot-seat' as const,
            chainNext: false,
            hotSeatEliminatedOptions: [],
        },
        usedQuestionId: question.id,
    });

    const rejected: string[] = [];
    let fallback: { question: { id: string }; instance: ActiveQuiz['question'] } | null = null;

    for (let attempt = 0; attempt < MAX_QUESTION_ATTEMPTS; attempt++) {
        const question = getRandomQuestion([...usedQuizQuestions, ...rejected]);
        let instance: ActiveQuiz['question'];
        try {
            instance = generateSingleCorrectInstance(question);
        } catch (err) {
            if (__DEV__) console.warn(`[HotSeat] skipped ${question.id}: generator threw`, err);
            rejected.push(question.id); // its pools couldn't build a question at all
            continue;
        }
        if (isUsableForHotSeat(instance)) return make(question, instance);
        if (__DEV__) console.warn(`[HotSeat] skipped ${question.id}: can't build 1 right + 3 wrong`);
        rejected.push(question.id);
        fallback = fallback ?? { question, instance };
    }

    // Nothing clean turned up — better a slightly short question than a stalled duel.
    if (fallback) return make(fallback.question, fallback.instance);
    const question = getRandomQuestion(usedQuizQuestions);
    return make(question, generateSingleCorrectInstance(question));
};
// ── START (first question of the duel) ────────────────────────────
export const startHotSeatDuel = async (group: Group): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    const gameState = group.gameState as BombGameState;
    const { activeQuiz, usedQuestionId } = buildFreshQuestion(gameState.usedQuizQuestions ?? []);

    await updateDoc(groupRef, {
        'gameState.phase': 'duel',
        'gameState.duelFffTimerStartedAt': Date.now(),
        'gameState.duelFffTimerDuration': getRandomHiddenDuration(),
        'gameState.activeQuiz': activeQuiz,
        'gameState.usedQuizQuestions': [
            ...(gameState.usedQuizQuestions ?? []),
            usedQuestionId,
        ],
        'gameState.hotSeatWrongCount': 0,
        'gameState.hotSeatLockedUntil': deleteField(),
    });
};

// ── SUBMIT AN ANSWER — holder only, one at a time ──────────────────
export type HotSeatAnswerResult =
    | { outcome: 'correct' }
    | { outcome: 'wrong'; lockMs: number }
    | { outcome: 'ignored' };

export const submitHotSeatAnswer = async (
    group: Group,
    playerId: string,
    optionIndex: number
): Promise<HotSeatAnswerResult> => {
    const groupRef = doc(db, 'groups', group.id);
    let result: HotSeatAnswerResult = { outcome: 'ignored' };
    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const gameState = snap.data().gameState as BombGameState;
            const activeQuiz = gameState.activeQuiz;

            if (!activeQuiz || activeQuiz.mode !== 'hot-seat') return;
            if (gameState.currentHolderId !== playerId) return; // not your turn
            if (gameState.hotSeatLockedUntil && Date.now() < gameState.hotSeatLockedUntil) return;
            if (gameState.duelFffHolderCanPass) return; // already answered correctly, waiting to pass
            const eliminated = activeQuiz.hotSeatEliminatedOptions ?? [];
            if (eliminated.includes(optionIndex)) return; // stale tap on an already-eliminated option

            const isCorrect = !!activeQuiz.question.options[optionIndex]?.correct;

            if (isCorrect) {
                transaction.update(groupRef, {
                    'gameState.duelFffHolderCanPass': true,
                    'gameState.hotSeatLockedUntil': deleteField(),
                });
                result = { outcome: 'correct' };
                return;
            }

            const newWrongCount = (gameState.hotSeatWrongCount ?? 0) + 1;
            const lockMs = HOT_SEAT_LOCK_DURATIONS_MS[
                Math.min(newWrongCount - 1, HOT_SEAT_LOCK_DURATIONS_MS.length - 1)
            ];

            transaction.update(groupRef, {
                'gameState.hotSeatWrongCount': newWrongCount,
                'gameState.hotSeatLockedUntil': Date.now() + lockMs,
                'gameState.activeQuiz.hotSeatEliminatedOptions': [...eliminated, optionIndex],
            });
            result = { outcome: 'wrong', lockMs };
        });
    } catch {
        // same reasoning
    }


    return result;
};

// ── LOCK EXPIRY — host-only, just clears the lock; same question,
// same narrowed option pool, nothing to roll. ───────────────────────
export const continueHotSeatDuel = async (groupId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    const freshSnap = await getDoc(groupRef);
    if (!freshSnap.exists()) return;
    const gameState = freshSnap.data().gameState as BombGameState;

    if (!gameState.hotSeatLockedUntil) return;
    if (Date.now() < gameState.hotSeatLockedUntil) return;

    await updateDoc(groupRef, {
        'gameState.hotSeatLockedUntil': deleteField(),
    });
};

// ── MANUAL PASS — holder taps "Pass" after answering correctly ──────
// A genuine duel pass — unlike TBC, this DOES touch currentHolderId/
// passHistory/chainPassed/holdCounts, because this really is the main
// duel's bomb changing hands, not a side-duel running underneath it.
export const hotSeatManualPass = async (
    group: Group,
    holderId: string,
    opponentId: string
): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    const freshSnap = await getDoc(groupRef);
    if (!freshSnap.exists()) return;
    const gameState = freshSnap.data().gameState as BombGameState;

    if (!gameState.duelFffHolderCanPass) return;
    if (gameState.currentHolderId !== holderId) return;

    const passEvent = {
        from: holderId,
        to: opponentId,
        timestamp: Date.now(),
        instruction: '(Hot Seat)',
    };

    const { activeQuiz: nextQuiz, usedQuestionId } = buildFreshQuestion(
        gameState.usedQuizQuestions ?? []
    );

    await updateDoc(groupRef, {
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
        'gameState.hotSeatWrongCount': 0,
        'gameState.hotSeatLockedUntil': deleteField(),
        'gameState.duelFffHolderCanPass': deleteField(),
    });
};