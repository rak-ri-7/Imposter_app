// src/games/timer/hooks/useDistractions.ts (question phase)
import { useEffect, useRef, useState } from 'react';
import {
    ActiveDistraction,
    QUESTION_DISTRACTION_MIN_GAP_MS,
    QUESTION_DISTRACTION_MAX_GAP_MS,
    pickQuestionDistractionCount,
    generateQuestionDistraction,
} from '../logic/distractions';

type Params = {
    enabled: boolean;
    active: boolean;
    roundKey: string | number;
};

export const useDistractions = ({ enabled, active, roundKey }: Params) => {
    const [current, setCurrent] = useState<ActiveDistraction | null>(null);
    const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

    useEffect(() => {
        timeouts.current.forEach(clearTimeout);
        timeouts.current = [];
        setCurrent(null);

        if (!enabled || !active) return;

        const count = pickQuestionDistractionCount();
        if (count === 0) return;

        let cumulativeDelay = 0;

        for (let i = 0; i < count; i++) {
            const gap =
                QUESTION_DISTRACTION_MIN_GAP_MS +
                Math.random() * (QUESTION_DISTRACTION_MAX_GAP_MS - QUESTION_DISTRACTION_MIN_GAP_MS);
            cumulativeDelay += gap;
            const scheduledDelay = cumulativeDelay;

            const fireTimeout = setTimeout(() => {
                const distraction = generateQuestionDistraction(Date.now() + i);
                setCurrent(distraction);

                const clearTimeoutId = setTimeout(() => {
                    setCurrent(null);
                }, distraction.durationMs);
                timeouts.current.push(clearTimeoutId);
            }, scheduledDelay);

            timeouts.current.push(fireTimeout);
            // account for this effect's own duration before scheduling the next gap
            cumulativeDelay += 1200;
        }

        return () => {
            timeouts.current.forEach(clearTimeout);
        };
    }, [enabled, active, roundKey]);

    return { current };
};