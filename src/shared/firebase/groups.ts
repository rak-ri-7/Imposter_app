import {
    collection,
    doc,
    setDoc,
    updateDoc,
    onSnapshot,
    arrayUnion,
    deleteDoc,
    getDocs,
    query,
    where,
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { db, auth } from './config';
import { Group, Player, emptyImposterState, Team } from '../types';
import { getDoc } from 'firebase/firestore';

const generateGroupCode = (): string => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
};

export const getCurrentUser = async () => {
    if (auth.currentUser) return auth.currentUser;
    const result = await signInAnonymously(auth);
    return result.user;
};

export const checkGroupExists = async (groupId: string): Promise<boolean> => {
    try {
        const groupRef = doc(db, 'groups', groupId);
        const snap = await getDoc(groupRef);
        return snap.exists();
    } catch {
        return false;
    }
};

export const createGroup = async (
    playerName: string
): Promise<{ group: Group; playerId: string }> => {
    const user = await getCurrentUser();
    const groupCode = generateGroupCode();
    const groupRef = doc(collection(db, 'groups'));

    const player: Player = {
        id: user.uid,
        name: playerName,
        isHost: true,
        isReady: false,
    };

    const group: Group = {
        id: groupRef.id,
        code: groupCode,
        hostId: user.uid,
        players: [player],
        scores: { [user.uid]: 0 },
        currentGame: 'menu',
        status: 'menu',
        gameState: emptyImposterState,
    };

    await setDoc(groupRef, group);
    return { group, playerId: user.uid };
};

export const joinGroup = async (
    groupCode: string,
    playerName: string
): Promise<{ group: Group; playerId: string }> => {
    const user = await getCurrentUser();

    const groupsRef = collection(db, 'groups');
    const q = query(groupsRef, where('code', '==', groupCode.toUpperCase()));
    const snapshot = await getDocs(q);

    if (snapshot.empty) throw new Error('Group not found');

    const groupDoc = snapshot.docs[0];
    const group = groupDoc.data() as Group;

    const existingPlayer = group.players.find((p) => p.id === user.uid);
    if (existingPlayer) {
        return { group: { ...group, id: groupDoc.id }, playerId: user.uid };
    }

    const player: Player = {
        id: user.uid,
        name: playerName,
        isHost: false,
        isReady: false,
    };

    await updateDoc(groupDoc.ref, {
        players: arrayUnion(player),
        [`scores.${user.uid}`]: 0,
    });

    return { group: { ...group, id: groupDoc.id }, playerId: user.uid };
};

export const listenToGroup = (
    groupId: string,
    callback: (group: Group) => void,
    onError?: (error: Error) => void
): (() => void) => {
    const groupRef = doc(db, 'groups', groupId);
    return onSnapshot(
        groupRef,
        (snap) => {
            if (snap.exists()) {
                callback({ id: snap.id, ...snap.data({ serverTimestamps: 'none' }) } as Group);
            }
        },
        (error) => {
            console.error('Group listener error:', error);
            onError?.(error);
        }
    );
};

export const leaveGroup = async (
    groupId: string,
    playerId: string,
    isHost: boolean,
    players: Player[]
): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    const remaining = players.filter((p) => p.id !== playerId);

    if (remaining.length === 0) {
        await deleteDoc(groupRef);
        return;
    }

    if (isHost) {
        remaining[0].isHost = true;
        await updateDoc(groupRef, {
            players: remaining,
            hostId: remaining[0].id,
        });
    } else {
        await updateDoc(groupRef, { players: remaining });
    }
};

export const addScore = async (
    groupId: string,
    playerId: string,
    points: number,
    currentScores: Record<string, number>
): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    const newScore = (currentScores[playerId] || 0) + points;
    await updateDoc(groupRef, {
        [`scores.${playerId}`]: newScore,
    });
};

export const removePlayer = async (
    groupId: string,
    playerIdToRemove: string,
    currentPlayers: Player[],
    currentHostId: string
): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    const remaining = currentPlayers.filter((p) => p.id !== playerIdToRemove);

    if (remaining.length === 0) {
        await deleteDoc(groupRef);
        return;
    }

    if (currentHostId === playerIdToRemove) {
        // Host removing themselves shouldn't normally route through here
        // (they'd use Leave instead), but handle it safely just in case.
        remaining[0].isHost = true;
        await updateDoc(groupRef, {
            players: remaining,
            hostId: remaining[0].id,
        });
    } else {
        await updateDoc(groupRef, { players: remaining });
    }
};

// Lets the host bench certain players out of the next game while keeping
// them in the group/leaderboard. Benched players are stored separately so
// they aren't lost — see returnToMenu below for how they get restored.
export const setActivePlayersForGame = async (
    groupId: string,
    allPlayers: Player[],
    selectedIds: string[]
): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    const active = allPlayers.filter((p) => selectedIds.includes(p.id));
    const benched = allPlayers.filter((p) => !selectedIds.includes(p.id));
    await updateDoc(groupRef, {
        players: active,
        benchedPlayers: benched,
    });
};


export const returnToMenu = async (
    groupId: string,
    restoreOptions?: { currentPlayers: Player[]; benchedPlayers: Player[] }
): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    const updates: Record<string, unknown> = {
        currentGame: 'menu',
        status: 'menu',
        gameState: emptyImposterState,
    };

    if (restoreOptions && restoreOptions.benchedPlayers.length > 0) {
        updates.players = [...restoreOptions.currentPlayers, ...restoreOptions.benchedPlayers];
        updates.benchedPlayers = [];
    }

    await updateDoc(groupRef, updates);
};

export const startSelectedGame = async (
    groupId: string,
    game: 'imposter' | 'stop-the-timer' | 'pass-the-bomb'
): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, {
        currentGame: game,
        status: 'lobby',
    });
};

export const saveTeams = async (
    groupId: string,
    teams: Team[]
): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, {
        teams,
        teamsEnabled: true,
    });
};

export const dissolveTeams = async (groupId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, {
        teams: [],
        teamsEnabled: false,
    });
};

