// src/games/timer/hooks/useRunningDistractions.ts
import { useEffect, useState } from 'react';
import { Vibration } from 'react-native';
import {
    ActiveDistraction,
    RUNNING_PHASE_FIRE_PROBABILITY,
    getRunningDistractionBaseWindow,
    generateRunningDistraction,
} from '../logic/distractions';
import { playSound } from '../../../shared/audio/sounds';

type Params = {
    enabled: boolean;
    active: boolean;
    timerStartedAt: number;
    answer: number;
};

const JUMPSCARE_VIBRATION_PATTERN = [0, 80, 40, 80, 40, 200];

export const useRunningDistractions = ({
    enabled,
    active,
    timerStartedAt,
    answer,
}: Params) => {
    const [current, setCurrent] = useState<ActiveDistraction | null>(null);

    // One effect owns the whole lifecycle for a round. Every timeout it creates
    // is local to this run, and cleanup always clears them AND hides any
    // visible distraction — so nothing can get stuck on screen.
    useEffect(() => {
        if (!enabled || !active) return;

        const { eligible, startMs, endMs } = getRunningDistractionBaseWindow(answer);
        if (!eligible) return;
        if (Math.random() > RUNNING_PHASE_FIRE_PROBABILITY) return;

        // Pick the distraction first so its duration shrinks the window and the
        // effect fully finishes before the safe gap.
        const distraction = generateRunningDistraction(Date.now());
        const adjustedEnd = endMs - distraction.durationMs;

        // Never schedule into the past: sample only from the part of the
        // window that hasn't elapsed yet (matters on late mount / remount).
        const elapsed = Date.now() - timerStartedAt;
        const earliest = Math.max(startMs, elapsed);
        if (adjustedEnd <= earliest) return;

        const fireAt = earliest + Math.random() * (adjustedEnd - earliest);
        const timeouts: ReturnType<typeof setTimeout>[] = [];

        timeouts.push(
            setTimeout(() => {
                setCurrent(distraction);

                if (distraction.type === 'jumpscare') {
                    Vibration.vibrate(JUMPSCARE_VIBRATION_PATTERN);
                    try {
                        Promise.resolve(playSound('jumpscare')).catch(() => { });
                    } catch {
                        // audio failure must never break the round
                    }
                }

                timeouts.push(setTimeout(() => setCurrent(null), distraction.durationMs));
            }, fireAt - elapsed),
        );

        return () => {
            timeouts.forEach(clearTimeout);
            Vibration.cancel();
            setCurrent(null);
        };
    }, [enabled, active, answer, timerStartedAt]);

    return { current };
};