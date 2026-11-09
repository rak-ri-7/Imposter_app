// src/shared/haptics.ts
// 📳 Phone buzzes, one small set used across the app so they feel the same
// everywhere:
//   tap()     – light: ordinary taps (pick a tile, choose a player)
//   press()   – medium: commit moments (lock in, buzz in, pass the bomb)
//   heavy()   – a thump (a podium step landing, a door bursting open)
//   success() – the triple "yes!" (right answer, winning)
//   error()   – the "no" buzz (wrong answer, the bomb going off)
// They follow the player's Sounds switch: muting sounds also stops buzzes.
// Never throws (some phones, and the web preview, have no vibration).
import * as Haptics from 'expo-haptics';
import { isMuted } from './audio/sounds';

const safe = (fn: () => Promise<unknown>) => {
    if (isMuted()) return;
    try {
        fn().catch(() => {});
    } catch {
        // no haptics on this device
    }
};

export const tap = () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
export const press = () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
export const heavy = () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
export const success = () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
export const error = () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));

export const haptics = { tap, press, heavy, success, error };
