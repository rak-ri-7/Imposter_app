// src/shared/audio/sounds.ts
import { createAudioPlayer, AudioPlayer, setAudioModeAsync } from 'expo-audio';

const soundSources = {
    jumpscare: require('./piano_jumpscare.wav'),
    heartbeat: require('./heartbeat.mp3'),
    clocktick: require('./clocktick.mp3'),
} as const;

type SoundName = keyof typeof soundSources;

const players: Partial<Record<SoundName, AudioPlayer>> = {};

export const preloadSounds = async () => {
    // Ensures playback works even when the phone's hardware silent switch is
    // on — physical devices mute app audio by default without this; the
    // emulator has no such switch, which is why it worked there but not on
    // a real phone.
    try {
        await setAudioModeAsync({
            playsInSilentMode: true,
        });
    } catch (e) {
        console.warn('failed to set audio mode', e);
    }

    (Object.keys(soundSources) as SoundName[]).forEach((name) => {
        if (!players[name]) {
            try {
                players[name] = createAudioPlayer(soundSources[name]);
            } catch (e) {
                console.warn(`failed to load sound: ${name}`, e);
            }
        }
    });


};

export const playSound = (name: SoundName) => {
    const player = players[name];
    if (!player) {
        console.warn(`sound not loaded: ${name}`);
        return;
    }
    player.seekTo(0);
    player.play();
};

// New — lets a caller explicitly stop a specific sound early.
export const stopSound = (name: SoundName) => {
    const player = players[name];
    if (!player) return;
    try {
        player.pause();
        player.seekTo(0);
    } catch (e) {
        // no-op if already stopped
    }
};

export const stopAllSounds = () => {
    (Object.keys(players) as SoundName[]).forEach((name) => stopSound(name));
};