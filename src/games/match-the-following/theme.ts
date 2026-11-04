// ✏️ Match the Following look: a school exam paper. Ruled sheet, red margin
// line, blue-ink handwriting for the headings, and every player's lines
// drawn in their own pen colour.
import { Platform } from 'react-native';

export const MF = {
    paper: '#FBF8EF',
    paperDeep: '#F3EEDC',
    rule: '#D6E4F2',
    margin: '#E58A8A',
    ink: '#1F3A8A',          // blue pen
    pencil: '#3D3D3D',
    muted: '#6E6A5E',
    faint: '#A39E8E',
    card: '#FFFFFF',
    cardLine: '#E3DCC6',
    right: '#1E8A4C',
    wrong: '#C0392B',
    gold: '#E0A100',
    stamp: '#C0392B',
};

// Pen colours, one per seat. No reds or greens: those mean wrong / right.
export const PENS = ['#1F5FBF', '#7B3FB0', '#D9771A', '#0F7F95', '#C2307A', '#7A5230', '#2C3E8F', '#8A6D0B', '#4A5A6A', '#9C2F9C'];
export const penOf = (seats: string[], id: string): string => PENS[Math.max(0, seats.indexOf(id)) % PENS.length];

// Handwriting for headings (a plain font for answers keeps them readable).
export const HAND = Platform.select({ ios: 'Noteworthy', android: 'casual', default: undefined });
