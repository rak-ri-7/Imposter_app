import { useEffect, useRef, useState } from 'react';
import { PlayerMissions } from '../../../shared/types';
import { playSound } from '../../../shared/sounds/soundManager';

const KEYS = ['mission1', 'mission2', 'lifeMission'] as const;

const signature = (m?: { completed: boolean; progress?: number; progressSet?: string[] }) =>
    m ? `${m.completed ? 1 : 0}|${m.progress ?? 0}|${m.progressSet?.length ?? 0}` : '-';

// Watches the player's own missions and reports every change: a flash for
// any update, a one-line toast for completions and unlocks.
export const useMissionAlerts = (missions: PlayerMissions | undefined) => {
    const previousRef = useRef<PlayerMissions | undefined>(undefined);
    const startedRef = useRef(false);
    const [unseen, setUnseen] = useState(false);
    const [flashKey, setFlashKey] = useState(0);
    const [toast, setToast] = useState<string | null>(null);

    useEffect(() => {
        const previous = previousRef.current;
        previousRef.current = missions;

        // The first run only records a baseline, so rejoining mid-game
        // doesn't flash for things that already happened.
        if (!startedRef.current) {
            startedRef.current = true;
            return;
        }
        if (!missions) return;

        const messages: string[] = [];
        let changed = false;
        let completedNow = false;

        if (!previous) {
            changed = true;
            messages.push('🎯 Your secret missions are ready');
        } else {
            for (const key of KEYS) {
                const before = previous[key];
                const after = missions[key];
                if (signature(before) === signature(after)) continue;
                changed = true;
                if (after?.completed && !before?.completed) {
                    completedNow = true;
                    messages.push(`🎯 Mission complete — ${after.rewardText ?? 'reward earned'}`);
                }
                if (key === 'lifeMission' && after && !before) {
                    messages.push('🔓 Life mission unlocked');
                }
            }
        }

        if (!changed) return;
        setUnseen(true);
        setFlashKey((k) => k + 1);
        if (completedNow) playSound('ghost-bet-placed');
        if (messages.length > 0) setToast(messages.join('  ·  '));
    }, [missions]);

    useEffect(() => {
        if (!toast) return;
        const timeout = setTimeout(() => setToast(null), 3800);
        return () => clearTimeout(timeout);
    }, [toast]);

    return { unseen, flashKey, toast, markSeen: () => setUnseen(false) };
};