import {
    doc,
    updateDoc,
    deleteField,
    getDoc,
    runTransaction,
} from 'firebase/firestore';
import { db } from '../../../shared/firebase/config';
import { Group, BombGameState, ActiveQuiz } from '../../../shared/types';
import { getRandomQuestion, generateQuizInstance } from '../data/quizQuestions';
// import { applyLifeGain, ROUND_WIN_SCORE } from './bombHelpers';
import { addScore } from '../../../shared/firebase/groups';

const QUESTION_DURATION_MS = 8000;

export const buildActiveQuiz = (
    usedQuizQuestions: string[],
    mode: ActiveQuiz['mode'],
    chainNext: boolean
): { activeQuiz: ActiveQuiz; usedQuestionId: string } => {
    const question = getRandomQuestion(usedQuizQuestions);
    const instance = generateQuizInstance(question);
    return {
        activeQuiz: {
            question: instance,
            startedAt: Date.now(),
            durationMs: QUESTION_DURATION_MS,
            answers: {},
            resolved: false,
            mode,
            chainNext,
        },
        usedQuestionId: question.id,
    };
};

// ── START A QUESTION (first one of a round) ──────────────────────────
export const startFastestFingerQuestion = async (
    group: Group,
    mode: ActiveQuiz['mode'],
    chainNext: boolean
): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    const gameState = group.gameState as BombGameState;
    const { activeQuiz, usedQuestionId } = buildActiveQuiz(
        gameState.usedQuizQuestions ?? [],
        mode,
        chainNext
    );

    await updateDoc(groupRef, {
        'gameState.activeQuiz': activeQuiz,
        'gameState.usedQuizQuestions': [
            ...(gameState.usedQuizQuestions ?? []),
            usedQuestionId,
        ],
    });
};

// ── SUBMIT AN ANSWER ────────────────────────────────────────────────
// Transaction, not a plain dot-notation update: the earlier version did a
// fresh read then a separate write, which narrowed the race with the host
// deleting `activeQuiz` mid-resolution but didn't close it — if the host's
// delete lands in between our read and our write, the write still
// recreates a broken `activeQuiz` shell containing only `{ answers: {...} }`.
// A transaction re-reads and re-checks atomically at commit time and
// retries automatically on conflict, which actually closes the gap.
export const submitQuizAnswer = async (
    group: Group,
    playerId: string,
    optionIndex: number
): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);

    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(groupRef);
        if (!snap.exists()) return;
        const gameState = snap.data().gameState as BombGameState;
        const activeQuiz = gameState.activeQuiz;

        if (!activeQuiz || !activeQuiz.question || activeQuiz.resolved) return;
        if (activeQuiz.answers[playerId]) return; // already answered

        const updatedQuiz: ActiveQuiz = {
            ...activeQuiz,
            answers: {
                ...activeQuiz.answers,
                [playerId]: { optionIndex, timestamp: Date.now() },
            },
        };

        transaction.update(groupRef, { 'gameState.activeQuiz': updatedQuiz });
    });
};

// ── RESOLUTION TREE (pure function, unchanged from before) ───────────
type Outcome =
    | { type: 'loser'; loserId: string }
    | { type: 'awaiting-choice'; chooserId: string; choosablePlayerIds: string[] }
    | { type: 'no-change' };

const resolveOutcome = (
    activeQuiz: ActiveQuiz,
    activePlayerIds: string[],
    holderId: string
): Outcome => {
    const correct: { id: string; ts: number }[] = [];
    const wrong: { id: string; ts: number }[] = [];

    for (const pid of activePlayerIds) {
        const answer = activeQuiz.answers[pid];
        if (!answer) continue;
        const option = activeQuiz.question.options[answer.optionIndex];
        if (option?.correct) {
            correct.push({ id: pid, ts: answer.timestamp });
        } else {
            wrong.push({ id: pid, ts: answer.timestamp });
        }
    }

    const silent = activePlayerIds.filter((id) => !activeQuiz.answers[id]);

    if (wrong.length === 1) {
        return { type: 'loser', loserId: wrong[0].id };
    }

    if (wrong.length >= 2) {
        if (wrong.some((w) => w.id === holderId)) {
            return { type: 'no-change' };
        }
        return {
            type: 'awaiting-choice',
            chooserId: holderId,
            choosablePlayerIds: wrong.map((w) => w.id),
        };
    }

    if (correct.length >= 2) {
        const slowest = [...correct].sort((a, b) => a.ts - b.ts).pop()!;
        return { type: 'loser', loserId: slowest.id };
    }

    if (correct.length === 1) {
        return {
            type: 'awaiting-choice',
            chooserId: correct[0].id,
            choosablePlayerIds: silent,
        };
    }

    return { type: 'no-change' };
};

// ── COMMIT A DECIDED LOSER ────────────────────────────────────────────
// Single writer, single write: moves the bomb (a harmless no-op if the
// "loser" is actually the current holder, for the "no-change" outcome)
// and, in the SAME update, either clears activeQuiz or rolls straight
// into the next question. Collapsing what used to be two separate
// round-trips (delete, then re-fetch-and-write) into one atomic write
// removes the gap where BombFlowScreen would flicker to BombPlayScreen
// between chained questions.
const commitLoser = async (
    group: Group,
    gameState: BombGameState,
    loserId: string,
    chainNext: boolean,
    mode: ActiveQuiz['mode']
): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    const holderId = gameState.currentHolderId;

    // Uniform across every mode (main game, duel, TBC): the bomb never
    // auto-transfers. The quiz just closes and hands control back to the
    // current holder, who must perform a real manual pass — `loserId` is
    // only a SUGGESTION (shown as instruction text), never enforced, so
    // any pass the holder makes succeeds; a bad-faith mismatch is only
    // ever caught later via the existing dispute/callout flow.
    const targetName =
        loserId !== holderId
            ? group.players.find((p) => p.id === loserId)?.name ?? 'someone'
            : null;

    const suggestionText = targetName
        ? `Pass to ${targetName} (Fastest Finger First result)`
        : 'Choose who receives the bomb'; // loserId === holderId (the "no-change" case)

    await updateDoc(groupRef, {
        'gameState.activeQuiz': deleteField(),
        'gameState.fffAwaitingManualPass': true,
        [`gameState.instructions.${holderId}`]: suggestionText,
        [`gameState.instructionIds.${holderId}`]: deleteField(),
    });
};

// ── RESOLVE THE CURRENT QUESTION (host-only, called from the screen) ──
export const resolveFastestFingerQuestion = async (group: Group): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);

    const freshSnap = await getDoc(groupRef);
    if (!freshSnap.exists()) return;
    const gameState = freshSnap.data().gameState as BombGameState;
    const activeQuiz = gameState.activeQuiz;
    if (!activeQuiz || activeQuiz.resolved) return;

    const activePlayerIds = group.players
        .filter((p) => !gameState.ghosts.includes(p.id))
        .map((p) => p.id);

    const outcome = resolveOutcome(
        activeQuiz,
        activePlayerIds,
        gameState.currentHolderId
    );

    if (outcome.type === 'awaiting-choice') {
        await updateDoc(groupRef, {
            'gameState.activeQuiz.resolved': true,
            'gameState.activeQuiz.awaitingChoice': {
                chooserId: outcome.chooserId,
                choosablePlayerIds: outcome.choosablePlayerIds,
            },
        });
        return;
    }

    const loserId =
        outcome.type === 'loser' ? outcome.loserId : gameState.currentHolderId;

    await commitLoser(group, gameState, loserId, activeQuiz.chainNext, activeQuiz.mode);
};

// ── CHOOSER TAPS A NAME (the "awaiting choice" branches) ─────────────
export const chooseFastestFingerLoser = async (
    group: Group,
    chosenPlayerId: string
): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    const freshSnap = await getDoc(groupRef);
    if (!freshSnap.exists()) return;
    const gameState = freshSnap.data().gameState as BombGameState;
    const activeQuiz = gameState.activeQuiz;
    if (!activeQuiz?.awaitingChoice) return;
    if (!activeQuiz.awaitingChoice.choosablePlayerIds.includes(chosenPlayerId)) return;

    await commitLoser(
        group,
        gameState,
        chosenPlayerId,
        activeQuiz.chainNext,
        activeQuiz.mode
    );
};

export const startGhostTournament = async (
    group: Group,
    wireCutterId: string,
    winningGhostIds: string[]
): Promise<void> => {
    if (winningGhostIds.length === 0) return; // nobody won a bet — no tournament

    const groupRef = doc(db, 'groups', group.id);
    const gameState = group.gameState as BombGameState;
    const poolIds = [wireCutterId, ...winningGhostIds];

    const question = getRandomQuestion(gameState.usedQuizQuestions ?? []);
    const instance = generateQuizInstance(question);
    const activeQuiz: ActiveQuiz = {
        question: instance,
        startedAt: Date.now(),
        durationMs: 8000, // same breathing-room timing as the duel/TBC fix
        answers: {},
        resolved: false,
        mode: 'ghost-tournament',
        chainNext: true,
    };

    await updateDoc(groupRef, {
        'gameState.ghostTournament': {
            poolIds,
            eliminatedIds: [],
            wireCutterId,
        },
        'gameState.activeQuiz': activeQuiz,
        'gameState.usedQuizQuestions': [
            ...(gameState.usedQuizQuestions ?? []),
            question.id,
        ],
    });
};

