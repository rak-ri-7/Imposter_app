import { doc, updateDoc, deleteField, runTransaction } from 'firebase/firestore';
import { db } from '../../../shared/firebase/config';
import { Group, BombGameState, ActiveQuiz } from '../../../shared/types';
import { getRandomQuestion, generateQuizInstance } from '../data/quizQuestions';
import { applyLifeGain, ROUND_WIN_SCORE } from './bombHelpers';

const INTRO_MS = 4000; // contenders card before the first question
const BETWEEN_MS = 2500; // "X is out!" beat between questions
const QUESTION_WINDOW_MS = 8000; // same post-first-answer window as the other quiz modes
const MAX_USED_QUIZ_QUESTIONS = 40;

const buildQuestion = (usedQuizQuestions: string[]) => {
    const question = getRandomQuestion(usedQuizQuestions);
    const instance = generateQuizInstance(question);
    const activeQuiz: ActiveQuiz = {
        question: instance,
        startedAt: Date.now(),
        durationMs: QUESTION_WINDOW_MS,
        answers: {},
        resolved: false,
        mode: 'ghost-tournament',
        chainNext: false,
    };
    return { activeQuiz, usedQuestionId: question.id };
};

// Who goes out this question? Exactly one player, worst performance first:
//   1. anyone who didn't answer (random among them if several)
//   2. otherwise the slowest WRONG answer
//   3. otherwise (everyone correct) the slowest correct answer
// Always eliminates someone, so the tournament can never stall.
const pickLoser = (quiz: ActiveQuiz, poolIds: string[]): string | null => {
    if (poolIds.length === 0) return null;

    const entries = poolIds.map((id) => {
        const answer = quiz.answers[id];
        if (!answer) return { id, tier: 2, ts: 0 };
        const correct = !!quiz.question.options[answer.optionIndex]?.correct;
        return { id, tier: correct ? 0 : 1, ts: answer.timestamp };
    });

    const worstTier = Math.max(...entries.map((e) => e.tier));
    const worst = entries.filter((e) => e.tier === worstTier);

    if (worstTier === 2) {
        return worst[Math.floor(Math.random() * worst.length)].id;
    }
    return worst.sort((a, b) => b.ts - a.ts)[0].id; // latest answer = slowest
};

// Host taps the button on the explosion screen: turns the pending
// contenders (written by resolvePanicOutcome) into a live tournament.
export const beginGhostTournament = async (groupId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const gameState = snap.data().gameState as BombGameState;
            const pending = gameState.pendingGhostTournament;
            if (!pending || gameState.ghostTournament) return;

            const contenderIds = Array.from(
                new Set([pending.wireCutterId, ...pending.ghostIds])
            );

            if (contenderIds.length < 2) {
                transaction.update(groupRef, {
                    'gameState.phase': 'replay',
                    'gameState.pendingGhostTournament': deleteField(),
                });
                return;
            }

            transaction.update(groupRef, {
                'gameState.phase': 'ghost-tournament',
                'gameState.ghostTournament': {
                    stage: 'intro',
                    wireCutterId: pending.wireCutterId,
                    contenderIds,
                    poolIds: contenderIds,
                    eliminatedIds: [],
                    nextStageAt: Date.now() + INTRO_MS,
                },
                'gameState.pendingGhostTournament': deleteField(),
                'gameState.activeQuiz': deleteField(),
            });
        });
    } catch {
        // transient contention — the host can just tap again
    }
};

// TEMPORARY test hook (remove before release): runs a dry-run tournament
// with every player, host as the "defender". debug: true means the result
// applies no lives and no score.
export const debugStartGhostTournament = async (group: Group): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    const everyone = group.players.map((p) => p.id);
    if (everyone.length < 2) return;

    const wireCutterId = group.hostId;
    const contenderIds = [wireCutterId, ...everyone.filter((id) => id !== wireCutterId)];

    await updateDoc(groupRef, {
        'gameState.phase': 'ghost-tournament',
        'gameState.ghostTournament': {
            stage: 'intro',
            wireCutterId,
            contenderIds,
            poolIds: contenderIds,
            eliminatedIds: [],
            nextStageAt: Date.now() + INTRO_MS,
            debug: true,
        },
        'gameState.activeQuiz': deleteField(),
    });
};

// Host-driven: moves 'intro' or 'between' on to the next question once
// its timer has passed. Idempotent — safe to call repeatedly.
export const advanceTournamentStage = async (groupId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const gameState = snap.data().gameState as BombGameState;
            const t = gameState.ghostTournament;
            if (!t || (t.stage !== 'intro' && t.stage !== 'between')) return;
            if (t.nextStageAt && Date.now() < t.nextStageAt) return;

            // Firestore rejects undefined and nested deleteField(), so the
            // stage-only keys are stripped out rather than blanked.
            const { nextStageAt: _n, lastEliminatedId: _l, ...rest } = t;
            const { activeQuiz, usedQuestionId } = buildQuestion(
                gameState.usedQuizQuestions ?? []
            );

            transaction.update(groupRef, {
                'gameState.ghostTournament': { ...rest, stage: 'question' },
                'gameState.activeQuiz': activeQuiz,
                'gameState.usedQuizQuestions': [
                    ...(gameState.usedQuizQuestions ?? []),
                    usedQuestionId,
                ].slice(-MAX_USED_QUIZ_QUESTIONS),
            });
        });
    } catch {
        // transient contention — the host's next tick retries
    }
};

// Host-driven: eliminates one player for the question identified by
// expectedStartedAt. The transaction re-checks the stage and the question,
// so a double call can never eliminate two people.
export const resolveTournamentQuestion = async (
    groupId: string,
    expectedStartedAt: number
): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const data = snap.data();
            const gameState = data.gameState as BombGameState;
            const t = gameState.ghostTournament;
            const quiz = gameState.activeQuiz;
            if (!t || t.stage !== 'question') return;
            if (!quiz || quiz.startedAt !== expectedStartedAt) return;

            const loserId = pickLoser(quiz, t.poolIds);
            if (!loserId) return;

            const poolIds = t.poolIds.filter((id) => id !== loserId);
            const eliminatedIds = [...t.eliminatedIds, loserId];

            if (poolIds.length > 1) {
                transaction.update(groupRef, {
                    'gameState.ghostTournament': {
                        ...t,
                        stage: 'between',
                        poolIds,
                        eliminatedIds,
                        lastEliminatedId: loserId,
                        nextStageAt: Date.now() + BETWEEN_MS,
                    },
                    'gameState.activeQuiz': deleteField(),
                });
                return;
            }

            // One left — that's the winner.
            const winnerId = poolIds[0];
            const updates: Record<string, unknown> = {
                'gameState.ghostTournament': {
                    ...t,
                    stage: 'result',
                    poolIds,
                    eliminatedIds,
                    lastEliminatedId: loserId,
                    winnerId,
                },
                'gameState.activeQuiz': deleteField(),
            };

            if (!t.debug) {
                // Whoever wins gets the disputed life: a ghost comes back
                // with one; the wire-cutter gets back the life the bomb took
                // (and un-ghosts if it was their last).
                applyLifeGain(updates, gameState, winnerId);
                if (winnerId !== t.wireCutterId) {
                    const current = (data.scores ?? {})[winnerId] ?? 0;
                    updates[`scores.${winnerId}`] = current + ROUND_WIN_SCORE;
                }
            }

            transaction.update(groupRef, updates);
        });
    } catch {
        // transient contention — the host's next tick retries
    }
};

// Host taps Continue on the result card.
export const closeGhostTournament = async (groupId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, {
        'gameState.phase': 'replay',
        'gameState.ghostTournament': deleteField(),
        'gameState.pendingGhostTournament': deleteField(),
        'gameState.activeQuiz': deleteField(),
    });
};