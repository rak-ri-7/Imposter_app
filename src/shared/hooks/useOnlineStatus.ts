// src/shared/hooks/useOnlineStatus.ts
// Who in the group is here right now, for the lobby and the players list.
// Uses the same check-ins as the in-game presence (usePresence), so it only
// runs while `active` (the screen is on top): a game screen above it does
// its own check-ins.
import { useEffect, useState } from 'react';
import { AWAY_AFTER_MS, LEAVE_GRACE_MS } from '../firebase/presence';
import { getServerNow } from '../firebase/time';
import { usePresence } from './usePresence';

export type OnlineStatus = 'here' | 'away' | 'offline' | 'unknown';

// Gone this long and they're "offline", not just "away".
const OFFLINE_AFTER_MS = 60_000;

export const statusLabel: Record<OnlineStatus, string> = {
    here: 'Here',
    away: 'Away',
    offline: 'Offline',
    unknown: '',
};
export const statusColor: Record<OnlineStatus, string> = {
    here: '#4CC38A',
    away: '#E8B04B',
    offline: '#6B7078',
    unknown: 'transparent',
};

export const useOnlineStatus = (
    groupId: string,
    playerId: string,
    ids: string[],
    active: boolean
): Record<string, OnlineStatus> => {
    const presence = usePresence(active ? groupId : undefined, playerId, active ? ids : []);
    // Re-check every few seconds (check-ins don't re-render by themselves).
    const [, setTick] = useState(0);
    useEffect(() => {
        if (!active) return;
        const t = setInterval(() => setTick((n) => n + 1), 3000);
        return () => clearInterval(t);
    }, [active]);

    const entries = presence.getEntries();
    const now = getServerNow();
    const out: Record<string, OnlineStatus> = {};
    for (const id of ids) {
        if (id === playerId) {
            out[id] = presence.meOffline ? 'offline' : 'here';
            continue;
        }
        const e = entries[id];
        if (!e) {
            out[id] = 'unknown'; // hasn't checked in yet (or an older app version)
            continue;
        }
        const quiet = now - e.lastSeen;
        if (quiet > OFFLINE_AFTER_MS) out[id] = 'offline';
        else if (quiet > AWAY_AFTER_MS || (e.leftAt !== null && now - e.leftAt > LEAVE_GRACE_MS)) out[id] = 'away';
        else out[id] = 'here';
    }
    return out;
};
