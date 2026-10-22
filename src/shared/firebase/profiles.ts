// 🌍 All-time points. Each phone keeps one record, profiles/{uid}, for the
// player signed in on it: their total and per-game points across every
// session, an optional real name, their latest username, and everyone
// they've shared a session with (their "circle").
//
// Points get here by syncing, not at award time: whenever this phone sees
// its group update, it compares the group's points for this player with
// what it has already counted for that group (`synced`) and adds only the
// difference. Nothing is counted twice, a phone that was closed while points
// were awarded catches up later, and every phone only ever writes its own
// record.
//
// The All-time board merges records that share a real name (one person on
// two phones, or under different usernames); without a real name, a record
// shows under its latest username.
import {
    collection,
    doc,
    documentId,
    getDoc,
    getDocs,
    query,
    runTransaction,
    setDoc,
    where,
} from 'firebase/firestore';
import { db } from './config';
import type { GameType, Group } from '../types';

type GamePoints = Partial<Record<GameType, number>>;

export type Profile = {
    uid: string;
    realName?: string;
    nameKey?: string; // realName, normalised: how records are merged
    lastName?: string;
    total: number;
    games: GamePoints;
    synced: Record<string, { total: number; games: GamePoints }>; // groupId -> already counted
    circle: Record<string, boolean>;
    updatedAt: number;
};

export const nameKeyOf = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();

const profileRef = (uid: string) => doc(db, 'profiles', uid);

const emptyProfile = (uid: string): Profile => ({
    uid,
    total: 0,
    games: {},
    synced: {},
    circle: {},
    updatedAt: 0,
});

// The profile after counting this group's points, or null if nothing changed.
export const nextProfile = (prev: Profile | null, group: Group, uid: string): Profile | null => {
    const p: Profile = prev
        ? { ...emptyProfile(uid), ...prev, games: { ...(prev.games ?? {}) }, synced: { ...(prev.synced ?? {}) }, circle: { ...(prev.circle ?? {}) } }
        : emptyProfile(uid);
    let changed = !prev;

    const before = p.synced[group.id] ?? { total: 0, games: {} };
    const nowTotal = group.scores?.[uid] ?? 0;
    const nowGames: GamePoints = {};
    for (const [game, byPlayer] of Object.entries(group.gameScores ?? {})) {
        const v = byPlayer?.[uid];
        if (v) nowGames[game as GameType] = v;
    }
    const delta = nowTotal - before.total;
    if (delta > 0) p.total += delta;
    for (const [game, v] of Object.entries(nowGames)) {
        const d = (v ?? 0) - (before.games[game as GameType] ?? 0);
        if (d > 0) p.games[game as GameType] = (p.games[game as GameType] ?? 0) + d;
    }
    const gamesChanged = JSON.stringify(nowGames) !== JSON.stringify(before.games ?? {});
    if (delta !== 0 || gamesChanged) {
        // A drop (scores reset) just moves the baseline down: nothing is taken away.
        p.synced[group.id] = { total: nowTotal, games: nowGames };
        changed = true;
    }

    for (const pl of group.players) {
        if (pl.id !== uid && !p.circle[pl.id]) {
            p.circle[pl.id] = true;
            changed = true;
        }
    }
    const myName = group.players.find((pl) => pl.id === uid)?.name;
    if (myName && myName !== p.lastName) {
        p.lastName = myName;
        changed = true;
    }
    if (!changed) return null;
    p.updatedAt = Date.now();
    return p;
};

export const syncAllTime = async (group: Group, uid: string): Promise<void> => {
    if (!uid || !group?.id) return;
    try {
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(profileRef(uid));
            const next = nextProfile(snap.exists() ? (snap.data() as Profile) : null, group, uid);
            if (next) tx.set(profileRef(uid), next);
        });
    } catch (e) {
        if (__DEV__) console.warn('[profiles] sync failed (check the Firestore rule for /profiles)', e);
    }
};

export const getProfile = async (uid: string): Promise<Profile | null> => {
    const snap = await getDoc(profileRef(uid));
    return snap.exists() ? (snap.data() as Profile) : null;
};

// Empty name clears it (back to showing the latest username).
export const setRealName = async (uid: string, name: string): Promise<void> => {
    const clean = name.trim().replace(/\s+/g, ' ').slice(0, 30);
    await setDoc(
        profileRef(uid),
        clean ? { uid, realName: clean, nameKey: nameKeyOf(clean) } : { uid, realName: '', nameKey: '' },
        { merge: true }
    );
};

// ── The All-time board ───────────────────────────────────────────────
export type AllTimeRow = {
    key: string;
    name: string;
    total: number;
    games: GamePoints;
    isMe: boolean;
    phones: number;
};

// Records sharing a real name become one row; the rest stand alone.
export const mergeProfiles = (profiles: Profile[], myUid: string): AllTimeRow[] => {
    const rows = new Map<string, AllTimeRow>();
    const seen = new Set<string>();
    for (const p of profiles) {
        if (!p?.uid || seen.has(p.uid)) continue;
        seen.add(p.uid);
        const key = p.nameKey ? `name:${p.nameKey}` : `uid:${p.uid}`;
        const row = rows.get(key) ?? {
            key,
            name: p.realName || p.lastName || 'Player',
            total: 0,
            games: {},
            isMe: false,
            phones: 0,
        };
        row.total += p.total ?? 0;
        for (const [g, v] of Object.entries(p.games ?? {})) {
            row.games[g as GameType] = (row.games[g as GameType] ?? 0) + (v ?? 0);
        }
        row.phones += 1;
        if (p.uid === myUid) row.isMe = true;
        rows.set(key, row);
    }
    return [...rows.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
};

const chunks = <T,>(arr: T[], n: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
};

// Me + everyone I've played with, plus any other phones using the same
// real names (so a second phone of someone in my circle still merges in).
export const loadAllTime = async (myUid: string): Promise<AllTimeRow[]> => {
    const col = collection(db, 'profiles');
    const me = await getProfile(myUid);
    const ids = [myUid, ...Object.keys(me?.circle ?? {})];
    const found: Profile[] = [];
    for (const part of chunks(ids, 30)) {
        const snap = await getDocs(query(col, where(documentId(), 'in', part)));
        snap.forEach((d) => found.push(d.data() as Profile));
    }
    const keys = [...new Set(found.map((p) => p.nameKey).filter((k): k is string => !!k))];
    for (const part of chunks(keys, 30)) {
        const snap = await getDocs(query(col, where('nameKey', 'in', part)));
        snap.forEach((d) => found.push(d.data() as Profile));
    }
    return mergeProfiles(found, myUid);
};
