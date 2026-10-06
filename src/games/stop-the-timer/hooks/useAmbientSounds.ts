// src/games/timer/hooks/useAmbientSounds.ts
import { useEffect, useRef } from 'react';
import { playSound, stopSound } from '../../../shared/audio/sounds';

type AmbientSound = 'heartbeat' | 'clocktick';

type Params = {
    enabled: boolean;
    active: boolean; // phase === 'running' && !hasStopped
};

const AMBIENT_SOUNDS: AmbientSound[] = ['heartbeat', 'clocktick'];
const MIN_GAP_MS = 1800;
const MAX_GAP_MS = 3500;

export const useAmbientSounds = ({ enabled, active }: Params) => {
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const currentSoundRef = useRef<AmbientSound | null>(null);

    useEffect(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        if (!enabled || !active) {
            // Stop whatever's currently playing the moment the round ends.
            if (currentSoundRef.current) {
                stopSound(currentSoundRef.current);
                currentSoundRef.current = null;
            }
            return;
        }

        let cancelled = false;

        const scheduleNext = () => {
            const delay = MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS);
            timeoutRef.current = setTimeout(() => {
                if (cancelled) return;
                const sound = AMBIENT_SOUNDS[Math.floor(Math.random() * AMBIENT_SOUNDS.length)];
                currentSoundRef.current = sound;
                playSound(sound);
                scheduleNext();
            }, delay);
        };

        scheduleNext();

        return () => {
            cancelled = true;
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (currentSoundRef.current) {
                stopSound(currentSoundRef.current);
                currentSoundRef.current = null;
            }
        };
    }, [enabled, active]);
};