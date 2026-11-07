import {
    collection,
    doc,
    setDoc,
    updateDoc,
    onSnapshot,
    deleteDoc,
    getDocs,
    query,
    where,
    runTransaction,
    increment,
    Timestamp,
    DocumentReference
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { db, auth } from './config';
import { BombGroupProfile, GameType, Group, Player, emptyImposterState, Team } from '../types';
import { getDoc } from 'firebase/firestore';

// ── Group codes ──────────────────────────────────────────────────────
// Six characters, leaving out the ones people misread (0/O, 1/I/L).
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const generateGroupCode = (): string =>
    Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

// A group nobody has touched for a day is finished. Its code can be reused,
// and it's deleted when someone next looks that code up. `expireAt` also
// lets a Firestore TTL policy (on groups.expireAt) clear old groups out.
export const GROUP_STALE_MS = 24 * 60 * 60 * 1000;
const GROUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const lastActive = (g: Partial<Group>): number => Math.max(g.lastActiveAt ?? 0, g.createdAt ?? 0, g.hostHeartbeatAt ?? 0);
// No timestamps at all (made by an older version of the app): age unknown,
// so it's never treated as finished.
const isStale = (g: Partial<Group>, now: number): boolean => lastActive(g) > 0 && now - lastActive(g) > GROUP_STALE_MS;
export const freshness = () => ({ lastActiveAt: Date.now(), expireAt: Timestamp.fromMillis(Date.now() + GROUP_TTL_MS) });

// The group currently using this code (most recently active), clearing out
// finished groups that still carry it.
const findByCode = async (code: string): Promise<{ ref: DocumentReference; group: Group } | null> => {
    const snap = await getDocs(query(collection(db, 'groups'), where('code', '==', code)));
    const now = Date.now();
    const live: { ref: DocumentReference; group: Group }[] = [];
    for (const d of snap.docs) {
        const group = { ...(d.data() as Group), id: d.id };
        if (isStale(group, now)) deleteDoc(d.ref).catch(() => {});
        else live.push({ ref: d.ref, group });
    }
    live.sort((a, b) => lastActive(b.group) - lastActive(a.group));
    return live[0] ?? null;
};

// Someone opened the group: it's still in use (so its code isn't recycled).
export const touchGroup = async (groupId: string): Promise<void> => {
    try {
        await updateDoc(doc(db, 'groups', groupId), freshness());
    } catch {
        // not important: the next open tries again
    }
};

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Leaving or being removed: take them off the players, the bench and the
// teams; hand host to the next player if it was the host. Read and written
// in one transaction, so a player joining at the same moment isn't lost.
const dropFromGroup = async (groupId: string, playerId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(groupRef);
        if (!snap.exists()) return;
        const g = snap.data() as Group;
        let players = g.players.filter((p) => p.id !== playerId);
        let benched = (g.benchedPlayers ?? []).filter((p) => p.id !== playerId);
        if (players.length === 0 && benched.length > 0) {
            players = benched;
            benched = [];
        }
        if (players.length === 0) {
            tx.delete(groupRef);
            return;
        }
        const hostId = g.hostId === playerId || !players.some((p) => p.id === g.hostId) ? players[0].id : g.hostId;
        tx.update(groupRef, {
            players: players.map((p) => ({ ...p, isHost: p.id === hostId })),
            benchedPlayers: benched,
            hostId,
            ...(g.teams ? { teams: g.teams.map((t) => ({ ...t, playerIds: t.playerIds.filter((id) => id !== playerId) })) } : {}),
            ...freshness(),
        });
    });
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
    playerName: string,
    avatar?: string
): Promise<{ group: Group; playerId: string }> => {
    const user = await getCurrentUser();
    // A code no other live group is using.
    let groupCode = generateGroupCode();
    for (let i = 0; i < 8 && (await findByCode(groupCode)); i++) groupCode = generateGroupCode();
    const groupRef = doc(collection(db, 'groups'));

    const player: Player = {
        id: user.uid,
        name: playerName,
        isHost: true,
        isReady: false,
        ...(avatar ? { avatar } : {}),
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
        createdAt: Date.now(),
    };

    await setDoc(groupRef, { ...group, ...freshness() });
    return { group, playerId: user.uid };
};

export const joinGroup = async (
    groupCode: string,
    playerName: string,
    avatar?: string
): Promise<{ group: Group; playerId: string }> => {
    const user = await getCurrentUser();
    const found = await findByCode(groupCode.trim().toUpperCase());
    if (!found) throw new Error('No group with that code. Check the letters and try again.');
    const name = playerName.trim();

    let joined: Group = found.group;
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(found.ref);
        if (!snap.exists()) throw new Error('That group has just closed. Ask for a new code.');
        const g = { ...(snap.data() as Group), id: found.ref.id };
        joined = g;
        const everyone = [...g.players, ...(g.benchedPlayers ?? [])];
        if (everyone.some((p) => p.id === user.uid)) return; // already in: just come back
        const clash = everyone.find((p) => sameName(p.name, name));
        if (clash) throw new Error(`Someone in this group is already called ${clash.name}. Add an initial or a nickname.`);
        // Someone already has this avatar: join without one (a steady stand-in
        // shows instead) and pick another in the lobby.
        const free = avatar && !everyone.some((p) => p.avatar === avatar);
        const player: Player = { id: user.uid, name, isHost: false, isReady: false, ...(free ? { avatar } : {}) };
        tx.update(found.ref, {
            players: [...g.players, player],
            // Coming back after leaving keeps the points already earned.
            [`scores.${user.uid}`]: g.scores?.[user.uid] ?? 0,
            ...freshness(),
        });
    });
    return { group: joined, playerId: user.uid };
};

// 🎨 Change the game-menu theme for the whole group (any member can).
export const setGroupTheme = (groupId: string, themeId: string) =>
    updateDoc(doc(db, 'groups', groupId), { menuTheme: themeId });

// Change the name you go by in this group. Returns a problem to show, or
// null when it's saved.
export const setPlayerName = async (groupId: string, playerId: string, raw: string): Promise<string | null> => {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (!name) return 'Type a name first.';
    const ref = doc(db, 'groups', groupId);
    return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) return 'This group has closed.';
        const g = snap.data() as Group;
        const everyone = [...g.players, ...(g.benchedPlayers ?? [])];
        const clash = everyone.find((p) => p.id !== playerId && sameName(p.name, name));
        if (clash) return `Someone here is already called ${clash.name}. Try an initial or a nickname.`;
        const swap = (list: Player[]) => list.map((p) => (p.id === playerId ? { ...p, name } : p));
        const update: Record<string, unknown> = { players: swap(g.players) };
        if (g.benchedPlayers?.some((p) => p.id === playerId)) update.benchedPlayers = swap(g.benchedPlayers);
        tx.update(ref, update);
        return null;
    });
};

// Change your avatar from the lobby. Refused (returns false) if someone else
// took it first.
export const setPlayerAvatar = async (groupId: string, playerId: string, avatar: string): Promise<boolean> => {
    const ref = doc(db, 'groups', groupId);
    return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) return false;
        const g = snap.data() as Group;
        const everyone = [...g.players, ...(g.benchedPlayers ?? [])];
        if (everyone.some((p) => p.id !== playerId && p.avatar === avatar)) return false;
        const swap = (list: Player[]) => list.map((p) => (p.id === playerId ? { ...p, avatar } : p));
        const update: Record<string, unknown> = { players: swap(g.players) };
        if (g.benchedPlayers?.some((p) => p.id === playerId)) update.benchedPlayers = swap(g.benchedPlayers);
        tx.update(ref, update);
        return true;
    });
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
    _isHost?: boolean,
    _players?: Player[]
): Promise<void> => {
    // (The extra arguments are ignored: the group is re-read inside a transaction.)
    await dropFromGroup(groupId, playerId);
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
    _currentPlayers?: Player[],
    _currentHostId?: string
): Promise<void> => {
    await dropFromGroup(groupId, playerIdToRemove);
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
            ...freshness(),
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
        ...freshness(),
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
            transaction.update(groupRef, { hostHeartbeatAt: Date.now(), ...freshness() });
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
// 💣 Remember the group's Pass the Bomb setup answers.
export const setBombProfile = async (groupId: string, profile: BombGroupProfile): Promise<void> => {
    await updateDoc(doc(db, 'groups', groupId), { bombProfile: { ...profile, setAt: Date.now() } });
};

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