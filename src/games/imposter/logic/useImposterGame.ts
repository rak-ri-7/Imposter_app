import { useState } from 'react';
import { Alert } from 'react-native';
import { Group, ImposterGameState, ImposterSettings } from '../../../shared/types';
import {
    startGame,
    beginDescribeRound,
    nextTurn,
    startVoting,
    submitVote,
    calculateMostVoted,
    eliminatePlayer,
    endGame,
    awardPointsAndReturnToMenu,
    useHint,
} from './game';

export const useImposterGame = (group: Group | null, playerId: string) => {
    const [loading, setLoading] = useState(false);
    const [hint, setHint] = useState<string | null>(null);

    const gameState = group?.gameState as ImposterGameState | undefined;
    const isHost = group?.hostId === playerId;
    const isImposter = gameState?.imposterIds?.includes(playerId) ?? false;
    const myPlayer = group?.players.find((p) => p.id === playerId);
    const activePlayers = group?.players.filter(
        (p) => !gameState?.eliminatedPlayers?.includes(p.id)
    ) ?? [];
    const currentPlayer = activePlayers[gameState?.currentTurn ?? 0];
    const isMyTurn = currentPlayer?.id === playerId;
    const totalPlayers = group?.players.length ?? 0;
    const activePlayerCount = activePlayers.length;
    const allVoted = gameState
        ? Object.keys(gameState.votes).length === activePlayerCount
        : false;
    const imposterCount = gameState?.settings?.imposterCount ?? 1;
    const hintsEnabled = gameState?.settings?.hintsEnabled ?? true;
    const hintUsed = gameState?.hintUsed ?? false;
    const votingRound = gameState?.votingRound ?? 1;

    const handleStartGame = async (settings: ImposterSettings) => {
        if (!group || !isHost) return;
        setLoading(true);
        try {
            await startGame(group, settings);
        } finally {
            setLoading(false);
        }
    };

    const handleBeginDescribe = async () => {
        if (!group || !isHost) return;
        setLoading(true);
        try {
            await beginDescribeRound(group.id);
        } finally {
            setLoading(false);
        }
    };

    const handleNextTurn = async () => {
        if (!group || !isHost) return;
        const next = (gameState?.currentTurn ?? 0) + 1;
        setLoading(true);
        try {
            if (next >= activePlayerCount) {
                await startVoting(group.id);
            } else {
                await nextTurn(group.id, next);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleVote = async (suspectId: string) => {
        if (!group || !playerId) return;
        setLoading(true);
        try {
            await submitVote(group.id, playerId, suspectId);
        } finally {
            setLoading(false);
        }
    };

    const handleEliminate = async () => {
        if (!group || !isHost || !gameState) return;
        setLoading(true);
        try {
            const eligibleIds = activePlayers
                .filter((p) => !gameState.eliminatedPlayers.includes(p.id))
                .map((p) => p.id);
            const mostVotedId = calculateMostVoted(gameState.votes, eligibleIds);
            if (!mostVotedId) {
                Alert.alert('No votes submitted yet!');
                return;
            }
            await eliminatePlayer(
                group.id,
                mostVotedId,
                gameState.eliminatedPlayers,
                votingRound + 1,
                imposterCount
            );
        } finally {
            setLoading(false);
        }
    };

    const handleUseHint = async () => {
        if (!group || !gameState || hintUsed) return;
        setLoading(true);
        try {
            const hintText = await useHint(
                group.id,
                gameState.word,
                gameState.category,
                gameState.word
            );
            setHint(hintText);
        } finally {
            setLoading(false);
        }
    };

    // const handleEndGame = async () => {
    //     if (!group) return;
    //     setLoading(true);
    //     try {
    //         const mostVoted = calculateResult(group.gameState);
    //         if (!mostVoted) {
    //             Alert.alert('No votes submitted yet!');
    //             return;
    //         }
    //         await endGame(group.id);
    //     } finally {
    //         setLoading(false);
    //     }
    // };
    const handleReturnToMenu = async () => {
        if (!group || !isHost) return;
        setLoading(true);
        try {
            await awardPointsAndReturnToMenu(group);
        } finally {
            setLoading(false);
        }
    };

    return {
        isHost,
        isImposter,
        myPlayer,
        currentPlayer,
        isMyTurn,
        allVoted,
        loading,
        activePlayers,
        imposterCount,
        hintsEnabled,
        hintUsed,
        hint,
        votingRound,
        handleStartGame,
        handleBeginDescribe,
        handleNextTurn,
        handleVote,
        handleEliminate,
        handleUseHint,
        handleReturnToMenu,
    };
};