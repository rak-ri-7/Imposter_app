// src/games/quiz-board/theme.ts
// 90s TV quiz look: royal-blue tiles on a black frame, gold prize values,
// chunky condensed capitals with a hard drop shadow. System fonts only, so
// nothing new has to be installed; swap FONTS for a custom font later.
import { Platform, TextStyle } from 'react-native';

export const QB = {
    bg: '#04082B',          // studio dark
    frame: '#000000',       // gaps between tiles
    tile: '#1029A8',        // board blue
    tileLight: '#4A64E8',   // bevel highlight
    tileDark: '#06135C',    // bevel shadow
    tileUsed: '#0A0F33',
    panel: '#0C1A6E',
    gold: '#FFC93C',
    goldDark: '#B8860B',
    white: '#FFFFFF',
    dim: '#9AA6E6',
    red: '#E63946',
    redDark: '#8E1B24',
    green: '#2BD576',
    shadow: '#000000',
    ink: '#1A1300',         // dark text on gold
};

export const FONTS = {
    // headline caps: category names, prompts, titles
    display: Platform.select({
        ios: 'Futura-CondensedExtraBold',
        android: 'sans-serif-condensed',
        default: undefined,
    }),
    // money, timers
    digits: Platform.select({
        ios: 'Courier-Bold',
        android: 'monospace',
        default: undefined,
    }),
};

// Hard 90s drop shadow (no blur).
export const tvShadow: TextStyle = {
    textShadowColor: QB.shadow,
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0.1,
};

// `shadow` false for dark text on light (gold) backgrounds: a black drop
// shadow behind dark letters reads as doubled, blurry text.
export const displayText = (size: number, color = QB.white, shadow = true): TextStyle => ({
    fontFamily: FONTS.display,
    fontWeight: 'bold',
    fontSize: size,
    color,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    ...(shadow ? tvShadow : {}),
});

export const digitText = (size: number, color = QB.gold): TextStyle => ({
    fontFamily: FONTS.digits,
    fontWeight: 'bold',
    fontSize: size,
    color,
    ...tvShadow,
});

// Raised-tile bevel: light top/left edges, dark bottom/right.
export const bevel = {
    borderWidth: 3,
    borderTopColor: QB.tileLight,
    borderLeftColor: QB.tileLight,
    borderBottomColor: QB.tileDark,
    borderRightColor: QB.tileDark,
};
