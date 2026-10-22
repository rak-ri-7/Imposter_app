import { useEffect, useRef, useState } from 'react';
import { listenToGroup } from '../firebase/groups';
import { auth } from '../firebase/config';
import { syncAllTime } from '../firebase/profiles';
import { Group } from '../types';

// The group doc, live. Also keeps this phone's 🌍 All-time record up to date
// (see firebase/profiles.ts): a sync runs shortly after this player's points,
// per-game points or the player list change.
export const useGroup = (groupId: string) => {
    const [group, setGroup] = useState<Group | null>(null);
    const [loading, setLoading] = useState(true);
    const lastSig = useRef('');
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!groupId) return;

        const unsubscribe = listenToGroup(groupId, (updatedGroup) => {
            setGroup(updatedGroup);
            setLoading(false);

            const uid = auth.currentUser?.uid;
            if (!uid) return;
            const sig = JSON.stringify([
                updatedGroup.scores?.[uid] ?? 0,
                Object.entries(updatedGroup.gameScores ?? {}).map(([g, s]) => [g, s?.[uid] ?? 0]),
                updatedGroup.players.map((p) => p.id + p.name),
            ]);
            if (sig === lastSig.current) return;
            lastSig.current = sig;
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => syncAllTime(updatedGroup, uid), 1500);
        });

        return () => {
            unsubscribe();
            if (timer.current) clearTimeout(timer.current);
        };
    }, [groupId]);

    return { group, loading };
};
