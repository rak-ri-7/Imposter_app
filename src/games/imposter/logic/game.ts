import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../../shared/firebase/config";
import { Group, ImposterGameState, ImposterSettings } from "../../../shared/types";
import { addScore, returnToMenu } from "../../../shared/firebase/groups";
import { pickRandomWordEntry, getHint } from '../data/words';

const pickImposters = (playerIds: string[], count: number): string[] => {
  const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
};

// const pickRandomWord = (): string => {
//   const allWords = Object.values(words).flat();
//   return allWords[Math.floor(Math.random() * allWords.length)];
// };


export const startGame = async (
  group: Group,
  settings: ImposterSettings
): Promise<void> => {
  const groupRef = doc(db, 'groups', group.id);
  const entry = pickRandomWordEntry([]);
  const imposterIds = pickImposters(
    group.players.map((p) => p.id),
    settings.imposterCount
  );

  const gameState: ImposterGameState = {
    word: entry.word,
    category: entry.category,
    imposterIds,
    votes: {},
    currentTurn: 0,
    settings,
    votingRound: 1,
    eliminatedPlayers: [],
    hintUsed: false,
  };


  await updateDoc(groupRef, {
    status: "reveal",
    gameState,
  });
};

export const beginDescribeRound = async (groupId: string): Promise<void> => {
  const groupRef = doc(db, 'groups', groupId);
  await updateDoc(groupRef, {
    status: 'describe',
    'gameState.currentTurn': 0,
    'gameState.hintUsed': false,
  });
};

export const nextTurn = async (
  groupId: string,
  nextTurn: number
): Promise<void> => {
  const groupRef = doc(db, 'groups', groupId);
  await updateDoc(groupRef, {
    'gameState.currentTurn': nextTurn,
    'gameState.hintUsed': false,
    status: 'describe',
  });
};

export const useHint = async (
  groupId: string,
  word: string,
  category: string,
  hint?: string
): Promise<string> => {
  const groupRef = doc(db, 'groups', groupId);
  const hintText = getHint({ word, category, hint });
  await updateDoc(groupRef, {
    'gameState.hintUsed': true,
    'gameState.currentHint': hintText,
  });
  return hintText;
};

export const startVoting = async (groupId: string): Promise<void> => {
  const groupRef = doc(db, 'groups', groupId);
  await updateDoc(groupRef, {
    status: 'vote',
    'gameState.votes': {},
  });
};

export const submitVote = async (
  groupId: string,
  voterId: string,
  suspectId: string
): Promise<void> => {
  const groupRef = doc(db, 'groups', groupId);
  await updateDoc(groupRef, {
    [`gameState.votes.${voterId}`]: suspectId,
  });
}


export const calculateMostVoted = (
  votes: Record<string, string>,
  eligiblePlayerIds: string[]
): string => {
  const voteCounts: Record<string, number> = {};
  Object.values(votes).forEach((id) => {
    if (eligiblePlayerIds.includes(id)) {
      voteCounts[id] = (voteCounts[id] || 0) + 1;
    }
  });
  return Object.entries(voteCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
};

export const eliminatePlayer = async (
  groupId: string,
  playerId: string,
  currentEliminated: string[],
  nextVotingRound: number,
  totalImposterCount: number
): Promise<void> => {
  const groupRef = doc(db, 'groups', groupId);
  const newEliminated = [...currentEliminated, playerId];

  if (nextVotingRound > totalImposterCount) {
    await updateDoc(groupRef, {
      'gameState.eliminatedPlayers': newEliminated,
      status: 'result',
    });
  } else {
    await updateDoc(groupRef, {
      'gameState.eliminatedPlayers': newEliminated,
      'gameState.votingRound': nextVotingRound,
      'gameState.votes': {},
      status: 'vote',
    });
  }
};

export const endGame = async (groupId: string): Promise<void> => {
  const groupRef = doc(db, 'groups', groupId);
  await updateDoc(groupRef, { status: 'result' });
};



export const imposterGuess = async (
  groupId: string,
  guess: string,
  actualWord: string
): Promise<boolean> => {
  const correct =
    guess.trim().toLowerCase() === actualWord.trim().toLowerCase();
  const groupRef = doc(db, 'groups', groupId);
  await updateDoc(groupRef, {
    status: 'result',
    'gameState.imposterGuess': guess,
    'gameState.imposterGuessCorrect': correct,
  });
  return correct;
};



const POINTS = {
  IMPOSTER_CAUGHT_PLAYER: 2,
  IMPOSTER_ESCAPED: 3,
  IMPOSTER_GUESSED_RIGHT: 2,
};

// Imposter — src/games/imposter/logic/game.ts
export const awardPointsAndReturnToMenu = async (
  group: Group
): Promise<void> => {

  const gameState = group.gameState as ImposterGameState;
  const { imposterIds, eliminatedPlayers, settings, imposterGuessCorrect } =
    gameState;

  const caughtImposters = imposterIds.filter((id) =>
    eliminatedPlayers.includes(id)
  );
  const allCaught = caughtImposters.length === settings.imposterCount;

  const POINTS = {
    PLAYER_WIN: 1,
    IMPOSTER_ESCAPE: 1,
    IMPOSTER_GUESS: 1,
  };

  if (allCaught) {
    for (const player of group.players) {
      if (!imposterIds.includes(player.id)) {
        await addScore(group.id, player.id, POINTS.PLAYER_WIN, group.scores);
      }
    }
    if (imposterGuessCorrect) {
      for (const imposterId of imposterIds) {
        await addScore(group.id, imposterId, POINTS.IMPOSTER_GUESS, group.scores);
      }
    }
  } else {
    for (const imposterId of imposterIds) {
      if (!eliminatedPlayers.includes(imposterId)) {
        await addScore(group.id, imposterId, POINTS.IMPOSTER_ESCAPE, group.scores);
      }
    }
  }

  await returnToMenu(group.id, {
    currentPlayers: group.players,
    benchedPlayers: group.benchedPlayers ?? [],
  });
};

export const resetGameKeepingGroup = async (
  groupId: string
): Promise<void> => {
  const groupRef = doc(db, 'groups', groupId);
  await updateDoc(groupRef, {
    status: 'lobby',
    gameState: {
      word: '',
      category: '',
      imposterIds: [],
      votes: {},
      currentTurn: 0,
      settings: { imposterCount: 1, hintsEnabled: true },
      votingRound: 1,
      eliminatedPlayers: [],
      hintUsed: false,
    },
  });
};
