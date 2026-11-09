// src/shared/audio/sounds.ts
import { createAudioPlayer, AudioPlayer, setAudioModeAsync } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 🔇 The player's "Sounds" switch (in the game menu's profile panel),
// remembered on this phone.
const MUTE_KEY = 'soundsMuted';
let muted = false;
AsyncStorage.getItem(MUTE_KEY)
    .then((v) => {
        muted = v === '1';
    })
    .catch(() => {});
export const isMuted = () => muted;
export const setMuted = (on: boolean) => {
    muted = on;
    if (on) (Object.keys(players) as SoundName[]).forEach((n) => stopSound(n));
    AsyncStorage.setItem(MUTE_KEY, on ? '1' : '0').catch(() => {});
};

const soundSources = {
    jumpscare: require('./piano_jumpscare.wav'),
    heartbeat: require('./heartbeat.mp3'),
    clocktick: require('./clocktick.mp3'),
    // 🏆 The winner podium (made for this app in code, see WinnerPodium).
    podiumRoll: require('./podium_roll.wav'),
    podiumDrum: require('./podium_drum.wav'),
    podiumPop: require('./podium_pop.wav'),
    podiumFanfare: require('./podium_fanfare.wav'),
    // 🎬 The "now playing" intro when a game begins (see GameIntro).
    gameStart: require('./game_start.wav'),
} as const;

export type SoundName = keyof typeof soundSources;

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
    if (muted) return;
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

