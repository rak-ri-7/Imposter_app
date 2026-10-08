import { useEffect } from 'react';
import { Group } from '../types';
import { sendHostHeartbeat, claimHostIfStale } from '../firebase/groups';

const HEARTBEAT_MS = 5000;
const HOST_STALE_MS = 30000;      // how long the host can be silent before a takeover
const SUCCESSOR_STEP_MS = 5000;   // extra wait for each player further down the line
const CHECK_MS = 2000;
const RETRY_MS = 3000;

// Host: keep a heartbeat going. Everyone else: watch it, and take over if
// it stops. The first player in join order (other than the host) tries
// first; if they're gone too, the next one tries a little later.
export const useHostFailover = (group: Group | null, playerId: string) => {
    const groupId = group?.id;
    const hostId = group?.hostId;
    const isHost = !!group && hostId === playerId;
    const heartbeat = group?.hostHeartbeatAt;
    const myRank = group
        ? group.players.filter((p) => p.id !== hostId).findIndex((p) => p.id === playerId)
        : -1;

    // Host: heartbeat.
    useEffect(() => {
        if (!groupId || !isHost) return;
        sendHostHeartbeat(groupId, playerId);
        const interval = setInterval(() => sendHostHeartbeat(groupId, playerId), HEARTBEAT_MS);
        return () => clearInterval(interval);
    }, [groupId, isHost, playerId]);

    // Everyone else: watch for a silent host.
    useEffect(() => {
        if (!groupId || isHost || myRank < 0 || !heartbeat) return;
        const staleAfter = HOST_STALE_MS + myRank * SUCCESSOR_STEP_MS;
        let lastAttempt = 0;
        const check = () => {
            const now = Date.now();
            if (now - heartbeat < staleAfter || now - lastAttempt < RETRY_MS) return;
            lastAttempt = now;
            claimHostIfStale(groupId, playerId, HOST_STALE_MS);
        };
        const interval = setInterval(check, CHECK_MS);
        return () => clearInterval(interval);
    }, [groupId, isHost, myRank, heartbeat, playerId]);
};