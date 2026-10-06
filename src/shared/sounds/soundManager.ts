import { createAudioPlayer, AudioPlayer, setAudioModeAsync } from 'expo-audio';

export type SoundKey =
    | 'reveal-1' | 'reveal-2'
    | 'explosion-tier1' | 'explosion-tier2' | 'explosion-tier3'
    | 'defuse' | 'defuse-yes'
    | 'panic-start1' | 'panic-start2'
    | 'ghost-presence1' | 'ghost-presence2'
    | 'ghost-bet-placed' | 'tbc-start' | 'wire-lock-in';

const SOUND_SOURCES: Record<SoundKey, number> = {
    'reveal-1': require('../../../assets/sounds/reveal-1.mp3'),
    'reveal-2': require('../../../assets/sounds/reveal-2.mp3'),
    'explosion-tier1': require('../../../assets/sounds/explosion-tier1.mp3'),
    'explosion-tier2': require('../../../assets/sounds/explosion-tier2.mp3'),
    'explosion-tier3': require('../../../assets/sounds/explosion-tier3.mp3'),
    'defuse': require('../../../assets/sounds/defuse.mp3'),
    'defuse-yes': require('../../../assets/sounds/defuse-yes.mp3'),
    'panic-start1': require('../../../assets/sounds/panic-start1.mp3'),
    'panic-start2': require('../../../assets/sounds/panic-start2.mp3'),
    'ghost-presence1': require('../../../assets/sounds/ghost-presence1.mp3'),
    'ghost-presence2': require('../../../assets/sounds/ghost-presence2.mp3'),
    'ghost-bet-placed': require('../../../assets/sounds/ghost-bet-placed.mp3'),
    'tbc-start': require('../../../assets/sounds/tbc-start.mp3'),
    'wire-lock-in': require('../../../assets/sounds/wire-lock-in.mp3'),
};

const players: Partial<Record<SoundKey, AudioPlayer>> = {};
let preloaded = false;

export const preloadSounds = async (): Promise<void> => {
    if (preloaded) return;
    preloaded = true;

    try {
        await setAudioModeAsync({ playsInSilentMode: true });
    } catch (err) {
        console.warn('Failed to set audio mode:', err);
    }

    for (const key of Object.keys(SOUND_SOURCES) as SoundKey[]) {
        try {
            players[key] = createAudioPlayer(SOUND_SOURCES[key]);
        } catch (err) {
            console.warn(`Failed to preload sound "${key}":`, err);
        }
    }
};

export const playSound = (key: SoundKey): void => {
    const player = players[key];
    if (!player) return;
    try {
        player.seekTo(0);
        player.play();
    } catch (err) {
        console.warn(`Failed to play sound "${key}":`, err);
    }
};

// Cuts a sound off and rewinds it. Safe to call when it isn't playing.
export const stopSound = (key: SoundKey): void => {
    const player = players[key];
    if (!player) return;
    try {
        player.pause();
        player.seekTo(0);
    } catch (err) {
        console.warn(`Failed to stop sound "${key}":`, err);
    }
};

export const unloadSounds = (): void => {
    for (const key of Object.keys(players) as SoundKey[]) {
        players[key as SoundKey]?.remove();
        delete players[key as SoundKey];
    }
    preloaded = false;
};

// One shared identity for every personality reveal — picked randomly
// between the two each time so it doesn't feel robotically identical
// round after round, without needing nine separate clips.
export const pickRevealSound = (): SoundKey => {
    const options: SoundKey[] = ['reveal-1', 'reveal-2'];
    return options[Math.floor(Math.random() * options.length)];
};

export const pickPanicStartSound = (): SoundKey => {
    const options: SoundKey[] = ['panic-start1', 'panic-start2'];
    return options[Math.floor(Math.random() * options.length)];
};

export const pickGhostPresenceSound = (): SoundKey => {
    const options: SoundKey[] = ['ghost-presence1', 'ghost-presence2'];
    return options[Math.floor(Math.random() * options.length)];
};

const DEFUSE_YES_CHANCE = 0.125;

export const pickDefuseSound = (): SoundKey => {
    return Math.random() < DEFUSE_YES_CHANCE ? 'defuse-yes' : 'defuse';
};
// Explosion intensity scales with how far into the game this round is —
// early explosions feel low-stakes and silly, later ones feel like they
// actually matter. Thresholds are a starting guess; tune freely once you
// can feel the actual pacing of a real game.
export const explosionSoundForRound = (roundNumber: number): SoundKey => {
    if (roundNumber <= 2) return 'explosion-tier1';
    if (roundNumber <= 4) return 'explosion-tier2';
    return 'explosion-tier3';
};