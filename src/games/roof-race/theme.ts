// 🏛️ Race Before the Roof Falls look: "Obsidian & Brass". Near-black stone,
// ivory text, dull brass kept for what matters (buttons, the treasure),
// parchment for the explorers' clue pages. Team Sun is sunset amber, Team
// Moon is silver-blue. (In the code the two sides are still called
// 'tiger' and 'cobra'; only their names and colours live here.)
import { Platform } from 'react-native';
import type { RrfTeamId } from '../../shared/types';

export const RR = {
    bg: '#0E0F11',
    bgDeep: '#08090A',
    panel: '#17191C',
    panelHi: '#202327',
    line: '#2D3137',
    sand: '#ECE7DD',
    sandMuted: '#A9A49A',
    sandDim: '#6F6B64',
    gold: '#C9A45C',
    goldDeep: '#B08E4C',
    goldInk: '#121110',
    danger: '#D2553F',
    dangerDeep: '#3A1712',
    good: '#6DB38B',
    // the explorers' pages
    parchment: '#E9E2D0',
    parchmentDeep: '#DDD4BE',
    parchmentLine: '#CFC5AE',
    ink: '#23201B',
    inkMuted: '#6A6254',
    torch: '#F6EBCB',
    torchLine: '#C9A45C',
};

export const TEAM: Record<RrfTeamId, { name: string; emoji: string; color: string; deep: string }> = {
    tiger: { name: 'Team Sun', emoji: '☀️', color: '#E09A4F', deep: '#24180F' },
    cobra: { name: 'Team Moon', emoji: '🌙', color: '#A9B8D0', deep: '#151B24' },
};

// Carved-stone headings (no custom font in the app: a serif reads as "old").
export const CARVED = Platform.select({ ios: 'Georgia', android: 'serif', default: undefined });

// "Team Tiger (Team A)": the game's name for the side, and the session team playing it.
export const sideLabel = (gs: { sides?: Record<RrfTeamId, { name: string }> }, id: RrfTeamId): string => {
    const own = gs.sides?.[id]?.name;
    return own && own !== TEAM[id].name ? `${TEAM[id].name} (${own})` : TEAM[id].name;
};

export const clock = (ms: number): string => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
