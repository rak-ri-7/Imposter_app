// Clash Cards look: a 90s trading-card binder. Night-purple table, thick
// foil-framed cards with a name banner, an art window and a parchment
// stat box. Each deck has its own frame colour.
import { Platform } from 'react-native';

export const CC = {
    bg: '#1A1033',         // the table
    bgDeep: '#0F0920',
    panel: '#2A1B4D',
    line: '#4A3577',
    text: '#FFF6DF',
    textMuted: '#B9A9D9',
    gold: '#F5C542',
    goldDeep: '#A87A12',
    goldLight: '#FFE9A3',
    parchment: '#F6EBCB',
    parchmentLine: '#D9C99E',
    ink: '#2B1D0E',
    inkMuted: '#7A6648',
    win: '#46D17F',
    lose: '#FF6B6B',
    wild: '#C68BFF',
    // the card back
    backA: '#7A1022',
    backB: '#B5172F',
    backTrim: '#F5C542',
};

// Frame foil per deck: [edge, shine, edge].
export const FRAME: Record<'countries' | 'animals', { foil: [string, string, string]; band: string }> = {
    countries: { foil: ['#0E3A8A', '#5DB7F2', '#0E3A8A'], band: '#123F8F' },
    animals: { foil: ['#14532D', '#6CCB6F', '#14532D'], band: '#17602F' },
};

// Printed rarity (from the card's stats): just the gem in the footer.
// "Gold" on the table always means the ★ gold wrapper, never this.
// ★ The gold wrapper: frame foil + body band.
export const GOLD_FRAME = {
    foil: ['#7A4E00', '#FFE27A', '#B8860B', '#FFF3B0', '#7A4E00'],
    band: '#6E4A0C',
    back: '#FFD54A',
};

export const RARITY = {
    gold: { gem: '#E0457B', name: 'Rare' },
    silver: { gem: '#D9E2EC', name: 'Uncommon' },
    bronze: { gem: '#D08A4E', name: 'Common' },
};

// Heavy serif for card names, like the old printed cards.
export const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });
