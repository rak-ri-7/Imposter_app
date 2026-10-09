// ── GHOST CHALLENGE (tournament) ──────────────────────────────────
// Triggered when the holder cuts the wrong wire and one or more ghosts
// bet on the right one. The wire-cutter defends; the winning ghosts
// challenge. Last one standing wins the life — nobody loses a life in
// here: a ghost who wins comes back; the wire-cutter who wins gets back
// the life the bomb took.
//
// Two ways to play it, chosen by the challenging ghosts on the intro card
// (majority wins; a tie or no votes is a coin flip):
//   • 'quiz'       — everyone answers the same question at once; the worst
//                    answer is out each round.
//   • 'hot-potato' — one fuse at a time, passed in a fixed order shuffled
//                    fresh every fuse (see hotPotatoDuel.ts); whoever's
//                    holding it when it blows is out.

import { doc, updateDoc, deleteField, runTransaction, increment } from 'firebase/firestore';
import { db } from '../../../shared/firebase/config';
import { Group, BombGameState, ActiveQuiz } from '../../../shared/types';
import { getRandomQuestion, generateQuizInstance } from '../data/quizQuestions';
import { applyLifeGain, ROUND_WIN_SCORE } from './bombHelpers';
import { buildHotPotatoStart, hotPotatoResetFields } from './hotPotatoDuel';

export type TournamentMode = 'quiz' | 'hot-potato';

const VOTE_WINDOW_MS = 12000; // intro card + mode vote, at most
const INTRO_MIN_MS = 3500;    // even if everyone votes instantly, time to read the card
const BETWEEN_MS = 2500;      // "X is out!" beat between quiz questions
const QUESTION_WINDOW_MS = 8000; // same post-first-answer window as the other quiz modes
const MAX_USED_QUIZ_QUESTIONS = 40;
// Nobody has answered for this long → resolve anyway (pickLoser picks a
// random non-answerer), so a quiz round can never hang forever.
export const QUESTION_HARD_CAP_MS = 45000;

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

// The challengers are everyone except the wire-cutter.
export const tournamentChallengers = (t: {
    contenderIds: string[];
    wireCutterId: string;
}): string[] => t.contenderIds.filter((id) => id !== t.wireCutterId);

// Majority of the challengers' votes; a tie or no votes is a coin flip.
const decideMode = (votes: Record<string, TournamentMode>): TournamentMode => {
    const counts = { quiz: 0, 'hot-potato': 0 };
    for (const v of Object.values(votes)) counts[v] += 1;
    if (counts.quiz > counts['hot-potato']) return 'quiz';
    if (counts['hot-potato'] > counts.quiz) return 'hot-potato';
    return Math.random() < 0.5 ? 'quiz' : 'hot-potato';
};

const introFields = (now: number) => ({
    stage: 'intro',
    modeVotes: {},
    introMinUntil: now + INTRO_MIN_MS,
    nextStageAt: now + VOTE_WINDOW_MS,
});

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
                    ...introFields(Date.now()),
                    wireCutterId: pending.wireCutterId,
                    contenderIds,
                    poolIds: contenderIds,
                    eliminatedIds: [],
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
            ...introFields(Date.now()),
            wireCutterId,
            contenderIds,
            poolIds: contenderIds,
            eliminatedIds: [],
            debug: true,
        },
        'gameState.activeQuiz': deleteField(),
    });
};

// A challenger picks (or changes) their vote on the intro card.
export const voteTournamentMode = async (
    groupId: string,
    playerId: string,
    mode: TournamentMode
): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const gameState = snap.data().gameState as BombGameState;
            const t = gameState.ghostTournament;
            if (gameState.phase !== 'ghost-tournament' || !t || t.stage !== 'intro') return;
            if (!tournamentChallengers(t).includes(playerId)) return; // cutter / spectators don't vote

            transaction.update(groupRef, {
                [`gameState.ghostTournament.modeVotes.${playerId}`]: mode,
            });
        });
    } catch {
        // the player can just tap again
    }
};

// Moves the tournament on:
//   intro   → once every challenger has voted (after the minimum read time),
//             or when the vote window runs out — locks in the mode.
//   between → once the "X is out!" beat is over.
// Starts a quiz question or a fresh hot potato fuse depending on the mode.
// Guarded and idempotent — the host calls it on time and any other phone
// may call it as a backup.
export const advanceTournamentStage = async (groupId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const gameState = snap.data().gameState as BombGameState;
            const t = gameState.ghostTournament;
            if (gameState.phase !== 'ghost-tournament' || !t) return;
            const now = Date.now();

            let mode: TournamentMode;
            if (t.stage === 'intro') {
                const votes = (t.modeVotes ?? {}) as Record<string, TournamentMode>;
                const allVoted = tournamentChallengers(t).every((id) => !!votes[id]);
                if (now < (t.introMinUntil ?? 0)) return;
                if (!allVoted && t.nextStageAt && now < t.nextStageAt) return;
                mode = decideMode(votes);
            } else if (t.stage === 'between') {
                if (t.nextStageAt && now < t.nextStageAt) return;
                mode = (t.mode ?? 'quiz') as TournamentMode;
            } else {
                return;
            }

            // Firestore rejects undefined and nested deleteField(), so the
            // stage-only keys are stripped out rather than blanked.
            const {
                nextStageAt: _n,
                lastEliminatedId: _l,
                introMinUntil: _i,
                lastDudId: _d,
                lastDudLine: _dl,
                ...rest
            } = t;

            if (mode === 'hot-potato') {
                transaction.update(groupRef, {
                    'gameState.ghostTournament': { ...rest, mode, stage: 'fuse' },
                    'gameState.activeQuiz': deleteField(),
                    ...buildHotPotatoStart({
                        now,
                        players: t.poolIds, // shuffled into a fresh pass order
                        context: 'tournament',
                    }),
                });
                return;
            }

            const { activeQuiz, usedQuestionId } = buildQuestion(
                gameState.usedQuizQuestions ?? []
            );
            transaction.update(groupRef, {
                'gameState.ghostTournament': { ...rest, mode, stage: 'question' },
                'gameState.activeQuiz': activeQuiz,
                'gameState.usedQuizQuestions': [
                    ...(gameState.usedQuizQuestions ?? []),
                    usedQuestionId,
                ].slice(-MAX_USED_QUIZ_QUESTIONS),
            });
        });
    } catch {
        // transient contention — the next tick retries
    }
};

// Quiz mode: eliminates one player for the question identified by
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
            const gameState = snap.data().gameState as BombGameState;
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
                    updates[`scores.${winnerId}`] = increment(ROUND_WIN_SCORE);
                }
            }

            transaction.update(groupRef, updates);
        });
    } catch {
        // transient contention — the next tick retries
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
        ...hotPotatoResetFields(),
    });
};