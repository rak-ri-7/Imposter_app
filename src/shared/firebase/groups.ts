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
    runTransaction,
    increment
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { db, auth } from './config';
import { GameType, Group, Player, emptyImposterState, Team } from '../types';
import { getDoc } from 'firebase/firestore';

const generateGroupCode = (): string => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
};

export const getCurrentUser = async () => {
    // Wait for the saved sign-in to load first; otherwise a fresh app start
    // would sign in as a brand-new player before the old one is restored.
    await auth.authStateReady();
    if (auth.currentUser) return auth.currentUser;
    const result = await signInAnonymously(auth);
    return result.user;
};

// 'unknown' = couldn't reach the server (offline, flaky network). Callers
// must not treat that as "the group is gone".
export const checkGroupExists = async (
    groupId: string
): Promise<'exists' | 'missing' | 'unknown'> => {
    try {
        await getCurrentUser();
        const groupRef = doc(db, 'groups', groupId);
        const snap = await getDoc(groupRef);
        return snap.exists() ? 'exists' : 'missing';
    } catch {
        return 'unknown';
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
// Leaderboard points as update fields: the session total plus that game's
// share (for the per-game slides). Every award goes through here.
export const scoreFields = (game: GameType, playerId: string, points: number): Record<string, unknown> => ({
    [`scores.${playerId}`]: increment(points),
    [`gameScores.${game}.${playerId}`]: increment(points),
});

export const addScore = async (
    groupId: string,
    playerId: string,
    points: number,
    game: GameType
): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, scoreFields(game, playerId, points));
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
    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(groupRef);
        if (!snap.exists()) return;
        const g = snap.data() as Group;

        const updates: Record<string, unknown> = {
            currentGame: 'menu',
            status: 'menu',
            gameState: emptyImposterState,
        };

        // Bring benched players back. Callers may pass the lists explicitly
        // (older games do); otherwise use what's stored on the group, so no
        // game can forget to restore them.
        const current = restoreOptions?.currentPlayers ?? g.players ?? [];
        const benched = restoreOptions?.benchedPlayers ?? g.benchedPlayers ?? [];
        if (benched.length > 0) {
            const ids = new Set(current.map((p) => p.id));
            updates.players = [...current, ...benched.filter((p) => !ids.has(p.id))];
            updates.benchedPlayers = [];
        }

        transaction.update(groupRef, updates);
    });
};
export const startSelectedGame = async (
    groupId: string,
    game: GameType
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

// Host's phone calls this every few seconds while a game is open.
// Guarded so a phone that has just lost host can't keep the old
// heartbeat alive for the new host.
export const sendHostHeartbeat = async (groupId: string, playerId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            if ((snap.data() as Group).hostId !== playerId) return;
            transaction.update(groupRef, { hostHeartbeatAt: Date.now() });
        });
    } catch {
        // next heartbeat retries
    }
};

// Takes over as host only if the current host's heartbeat is still stale
// when re-checked inside the transaction — so two phones can't both win,
// and a host that's actually alive can't be replaced.
export const claimHostIfStale = async (
    groupId: string,
    playerId: string,
    staleMs: number
): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const g = snap.data() as Group;
            if (g.hostId === playerId) return;
            if (!g.players.some((p) => p.id === playerId)) return;
            if (!g.hostHeartbeatAt || Date.now() - g.hostHeartbeatAt < staleMs) return;
            transaction.update(groupRef, { hostId: playerId, hostHeartbeatAt: Date.now() });
        });
    } catch {
        // contention — the watcher retries
    }
};

// The host's lobby choices for Pass the Bomb, shared so every player can
// read the rules for the mode being set up. null clears it.
export const setBombLobby = async (
    groupId: string,
    settings: { mode: 'timer' | 'pass' | null; passBudget: number; passAsTeams: boolean; hiddenPasses?: boolean } | null
): Promise<void> => {
    try {
        await updateDoc(doc(db, 'groups', groupId), { bombLobby: settings });
    } catch {
        // cosmetic only — the next change re-sends it
    }
};