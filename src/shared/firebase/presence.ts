// src/shared/firebase/presence.ts
// "Who's still here?" Each phone checks in every few seconds with a small
// document of its own at groups/{groupId}/presence/{playerId}. They live
// outside the group document so check-ins never collide with game writes.
//
// Two ways a player becomes "away":
//   • they leave the app → their phone says so straight away (leftAt), and
//     after a short grace everyone pauses;
//   • their network dies → no goodbye is possible, so they're away once
//     their check-ins stop for AWAY_AFTER_MS.
import {
    collection,
    doc,
    onSnapshot,
    serverTimestamp,
    setDoc,
} from 'firebase/firestore';
import { db } from './config';

export const PRESENCE_EVERY_MS = 4000;  // how often a phone checks in
export const AWAY_AFTER_MS = 10000;     // no check-in this long = away
export const LEAVE_GRACE_MS = 3000;     // left the app this long = away

export type PresenceEntry = {
    lastSeen: number;        // last check-in (server clock, ms)
    leftAt: number | null;   // set when they left the app, cleared on return
};

// A normal check-in (clears any "left the app" mark), or with
// `leaving` true, the goodbye sent as the app goes to the background.
export const sendPresence = (
    groupId: string,
    playerId: string,
    leaving = false
): Promise<void> =>
    setDoc(
        doc(db, 'groups', groupId, 'presence', playerId),
        { lastSeen: serverTimestamp(), leftAt: leaving ? serverTimestamp() : null },
        { merge: true }
    );

const toMs = (ts: unknown): number | null =>
    ts && typeof (ts as { toMillis?: unknown }).toMillis === 'function'
        ? (ts as { toMillis: () => number }).toMillis()
        : null;

let warnedListener = false; // log once per app session, not every game

export const listenToPresence = (
    groupId: string,
    callback: (entries: Record<string, PresenceEntry>) => void
): (() => void) =>
    onSnapshot(
        collection(db, 'groups', groupId, 'presence'),
        (snap) => {
            const entries: Record<string, PresenceEntry> = {};
            snap.forEach((d) => {
                const data = d.data({ serverTimestamps: 'estimate' });
                const lastSeen = toMs(data.lastSeen);
                if (lastSeen) entries[d.id] = { lastSeen, leftAt: toMs(data.leftAt) };
            });
            callback(entries);
        },
        (error) => {
            // e.g. Firestore rules don't allow the presence path yet. Nobody
            // will ever look "away", so the game just never pauses.
            if (__DEV__ && !warnedListener) {
                warnedListener = true;
                console.log(`[presence] listener blocked (${error.code}): games won't pause for drop-outs until the presence rule is added.`);
            }
        }
    );
