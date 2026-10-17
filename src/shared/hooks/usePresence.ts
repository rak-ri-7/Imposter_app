// src/shared/hooks/usePresence.ts
// Keeps this phone checked in, and works out who among `watchIds` has gone
// quiet. Used to pause a game until everyone is back.
//
// Check-ins arrive every few seconds from every phone, so they're kept in a
// ref: the screen only re-renders when someone actually goes away or comes
// back, not on every check-in.
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
    AWAY_AFTER_MS,
    LEAVE_GRACE_MS,
    PRESENCE_EVERY_MS,
    PresenceEntry,
    listenToPresence,
    sendPresence,
} from '../firebase/presence';
import { getServerNow, isTimeSynced, syncServerTimeOffset } from '../firebase/time';

export type PresenceState = {
    awayIds: string[];                 // watched players who've gone quiet
    lastSeen: Record<string, number>;  // playerId -> last check-in (server ms)
    meOffline: boolean;                // this phone can't reach the server
    // Latest check-ins, read at the moment of asking (no re-render needed).
    getEntries: () => Record<string, PresenceEntry>;
};

// Stricter than "away": one missed check-in plus a margin, or left the
// app. Used during a duel, where a few seconds offline can cost a life.
export const DROPPED_AFTER_MS = PRESENCE_EVERY_MS + 2000;
export const seemsDropped = (e: PresenceEntry | undefined, now: number): boolean =>
    !!e && (e.leftAt !== null || now - e.lastSeen > DROPPED_AFTER_MS);

export const computeAway = (
    watchIds: string[],
    playerId: string,
    entries: Record<string, PresenceEntry>,
    now: number,
    ignored?: Record<string, number>
): string[] =>
    watchIds.filter((id) => {
        if (id === playerId) return false;
        const e = entries[id];
        // Never checked in (older app version, or rules block presence):
        // unknown, not away, so it can't freeze the game.
        if (!e) return false;
        const leftApp = e.leftAt !== null && now - e.leftAt > LEAVE_GRACE_MS;
        const silent = now - e.lastSeen > AWAY_AFTER_MS;
        if (!leftApp && !silent) return false;
        const skippedAt = ignored?.[id];
        return !(skippedAt !== undefined && skippedAt >= e.lastSeen);
    });

// While check-ins are being rejected, try again this often.
const PRESENCE_RETRY_BLOCKED_MS = 60_000;
// Log the "rules block presence" hint once per app session, not every beat.
let warnedBlocked = false;

export const usePresence = (
    groupId: string | undefined,
    playerId: string,
    // Players whose absence should pause the game. Empty = don't watch anyone.
    watchIds: string[],
    // playerId -> their last check-in when the host chose to continue
    // without them. Expires by itself once they check in again.
    ignored?: Record<string, number>
): PresenceState => {
    const entriesRef = useRef<Record<string, PresenceEntry>>({});
    const lastAckRef = useRef(Date.now());
    // Has a check-in from this phone ever been accepted? Until one has, we
    // can't tell "offline" from "presence not working", so never claim offline.
    const everAckedRef = useRef(false);
    // Check-ins rejected (usually Firestore rules): stop sending every few
    // seconds, retry now and then in case the rules get fixed.
    const blockedUntilRef = useRef(0);
    const [result, setResult] = useState<{ awayIds: string[]; meOffline: boolean }>({
        awayIds: [],
        meOffline: false,
    });

    // Latest inputs for the 1-second checker.
    const inputs = useRef({ watchIds, ignored });
    inputs.current = { watchIds, ignored };

    // ── check in ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!groupId) return;
        if (!isTimeSynced()) syncServerTimeOffset(groupId);

        const beat = () => {
            if (Date.now() < blockedUntilRef.current) return;
            sendPresence(groupId, playerId)
                // Resolves only once the server has the write. With no
                // connection it neither resolves nor fails, it just waits;
                // that silence is how we know this phone is offline.
                .then(() => {
                    lastAckRef.current = Date.now();
                    everAckedRef.current = true;
                    blockedUntilRef.current = 0;
                })
                // A rejection is the server answering, so we ARE online.
                // Usually the Firestore rules don't allow the presence path:
                // pausing can't work, but the game must carry on normally.
                .catch((e) => {
                    lastAckRef.current = Date.now();
                    blockedUntilRef.current = Date.now() + PRESENCE_RETRY_BLOCKED_MS;
                    if (__DEV__ && !warnedBlocked) {
                        warnedBlocked = true;
                        console.log(
                            `[presence] check-ins rejected (${e?.code ?? e}): allow groups/{groupId}/presence/{playerId} in Firestore rules. Games won't pause for drop-outs until then.`
                        );
                    }
                });
        };
        beat();
        const interval = setInterval(beat, PRESENCE_EVERY_MS);

        // Leaving the app: say goodbye at once so the others pause quickly.
        // Coming back: check in at once (which clears the goodbye), and don't
        // call ourselves offline just because timers were asleep meanwhile.
        const sub = AppState.addEventListener('change', (s) => {
            if (s === 'background') {
                sendPresence(groupId, playerId, true).catch(() => {});
            } else if (s === 'active') {
                lastAckRef.current = Date.now();
                beat();
            }
        });
        return () => {
            clearInterval(interval);
            sub.remove();
        };
    }, [groupId, playerId]);

    // ── listen ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!groupId) return;
        return listenToPresence(groupId, (m) => {
            entriesRef.current = m;
        });
    }, [groupId]);

    // ── decide who's away, once a second; re-render only on change ───
    const watchKey = watchIds.join(',');
    const ignoredKey = JSON.stringify(ignored ?? {});
    useEffect(() => {
        const check = () => {
            const { watchIds: ids, ignored: ign } = inputs.current;
            const meOffline =
                ids.length > 0 &&
                everAckedRef.current &&
                Date.now() >= blockedUntilRef.current && // not while check-ins are paused
                Date.now() - lastAckRef.current > AWAY_AFTER_MS;
            const awayIds = meOffline
                ? []
                : computeAway(ids, playerId, entriesRef.current, getServerNow(), ign);
            setResult((prev) =>
                prev.meOffline === meOffline && prev.awayIds.join(',') === awayIds.join(',')
                    ? prev
                    : { awayIds, meOffline }
            );
        };
        check();
        if (watchIds.length === 0) return;
        const t = setInterval(check, 1000);
        return () => clearInterval(t);
    }, [watchKey, ignoredKey, playerId]);

    const lastSeen: Record<string, number> = {};
    for (const [id, e] of Object.entries(entriesRef.current)) lastSeen[id] = e.lastSeen;
    return { ...result, lastSeen, getEntries: () => entriesRef.current };
};
