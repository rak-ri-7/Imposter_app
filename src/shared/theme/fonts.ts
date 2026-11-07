// src/shared/theme/fonts.ts
// 🔤 The app's display font: Fredoka (rounded, chunky; SIL Open Font License,
// see assets/fonts/Fredoka-OFL.txt). Used for titles, game names and big
// buttons on the main screens. Body text stays on the phone's own font.
//
// The files are loaded once at start-up in App.tsx (FONT_FILES). Spread
// `display` / `displaySemi` into a style; they also reset fontWeight,
// because on Android a bold weight on a custom font falls back to the
// system font.
import type { TextStyle } from 'react-native';

export const FONT = {
    display: 'Fredoka-Bold',
    displaySemi: 'Fredoka-SemiBold',
} as const;

export const FONT_FILES = {
    [FONT.display]: require('../../../assets/fonts/Fredoka-Bold.ttf'),
    [FONT.displaySemi]: require('../../../assets/fonts/Fredoka-SemiBold.ttf'),
};

export const display: TextStyle = { fontFamily: FONT.display, fontWeight: 'normal' };
export const displaySemi: TextStyle = { fontFamily: FONT.displaySemi, fontWeight: 'normal' };
