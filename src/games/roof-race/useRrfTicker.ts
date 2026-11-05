// 🏛️ Race Before the Roof Falls: keeps the game moving on its own. Works out
// when the next timed thing is due (a door running out, the rope window
// closing, a hold completing…) and calls `rrfTick` then. The host's phone
// goes first; every other phone is a backup a few seconds later, and the
// transaction re-checks the server clock, so nothing happens early.
import { useEffect } from 'react';
import type { Group, RrfGameState } from '../../shared/types';
import { getServerNow, resyncServerTimeOffset, syncServerTimeOffset } from '../../shared/firebase/time';
import { nextDue } from './logic/engine';
import { rrfTick } from './logic/game';

const BACKUP_GRACE_MS = 3000;
const RETRY_MS = 1500;
const CHECK_MS = 200;

export const useRrfTicker = (group: Group | null, gs: RrfGameState | null, isHost: boolean) => {
    const groupId = group?.id;
    const present = group?.players.map((p) => p.id) ?? [];
    const due = gs && gs.phase !== 'over' ? nextDue(gs, present) : Infinity;

    useEffect(() => {
        if (groupId) syncServerTimeOffset(groupId);
    }, [groupId]);
    // Re-measure the clock at the start of each expedition (rate-limited).
    useEffect(() => {
        if (groupId && gs?.phase === 'intro') resyncServerTimeOffset(groupId);
    }, [groupId, gs?.expedition]);

    useEffect(() => {
        if (!groupId || !Number.isFinite(due)) return;
        const grace = isHost ? 0 : BACKUP_GRACE_MS;
        let lastTry = 0;
        const t = setInterval(() => {
            if (getServerNow() < due + grace || Date.now() - lastTry < RETRY_MS) return;
            lastTry = Date.now();
            rrfTick(groupId, grace);
        }, CHECK_MS);
        return () => clearInterval(t);
    }, [groupId, due, isHost]);
};
