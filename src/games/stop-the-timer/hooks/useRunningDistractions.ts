// src/games/timer/hooks/useRunningDistractions.ts
import { useEffect, useRef, useState } from 'react';
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

// Heavier vibration pattern to substitute for sound until audio lib is wired in.
const JUMPSCARE_VIBRATION_PATTERN = [0, 80, 40, 80, 40, 200];

export const useRunningDistractions = ({
    enabled,
    active,
    timerStartedAt,
    answer,
}: Params) => {
    const [current, setCurrent] = useState<ActiveDistraction | null>(null);
    const scheduledRef = useRef(false);
    const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

    useEffect(() => {
        scheduledRef.current = false;
        timeouts.current.forEach(clearTimeout);
        timeouts.current = [];
        setCurrent(null);
    }, [timerStartedAt]);

    useEffect(() => {
        if (!enabled || !active || scheduledRef.current) return;

        const { eligible, startMs, endMs } = getRunningDistractionBaseWindow(answer);
        if (!eligible) return;

        scheduledRef.current = true;

        if (Math.random() > RUNNING_PHASE_FIRE_PROBABILITY) return;

        // Pick the distraction first so we know its duration, then shrink the
        // window so the effect fully finishes before the safe gap begins.
        const distraction = generateRunningDistraction(Date.now());
        const adjustedEnd = endMs - distraction.durationMs;
        if (adjustedEnd <= startMs) return; // not enough room for this effect to fully play out

        const elapsedSoFar = Date.now() - timerStartedAt;
        const fireAt = startMs + Math.random() * (adjustedEnd - startMs);
        const delay = Math.max(0, fireAt - elapsedSoFar);
        if (delay <= 0 && elapsedSoFar > adjustedEnd) return;

        const fireTimeout = setTimeout(() => {
            setCurrent(distraction);

            if (distraction.type === 'jumpscare') {
                Vibration.vibrate(JUMPSCARE_VIBRATION_PATTERN);
                playSound('jumpscare');
            }

            const clearTimeoutId = setTimeout(() => {
                setCurrent(null);
            }, distraction.durationMs);
            timeouts.current.push(clearTimeoutId);
        }, delay);

        timeouts.current.push(fireTimeout);

        return () => {
            timeouts.current.forEach(clearTimeout);
        };
    }, [enabled, active, answer, timerStartedAt]);

    return { current };
};