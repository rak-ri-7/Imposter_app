import type { GameType } from '../shared/types';

export type GameMode = 'online' | 'pass-the-phone';

export type GameDefinition = {
    id: GameType | 'most-likely-to' | 'two-truths-lie';
    name: string;
    emoji: string;
    description: string;
    minPlayers: number;
    available?: boolean;
    modes: GameMode[];
};

export const games: GameDefinition[] = [
    {
        id: 'imposter',
        name: 'Imposter',
        emoji: '🕵️',
        description: 'Find who doesn\'t know the word',
        minPlayers: 2,
        available: true,
        modes: ['online', 'pass-the-phone'],
    },
    {
        id: 'stop-the-timer',
        name: 'Stop the Timer',
        emoji: '⏱️',
        description: 'Stop closest to the answer',
        minPlayers: 2,
        available: true,
        modes: ['online'],
    },

    {
        id: 'pass-the-bomb' as const,
        name: 'Pass the Bomb',
        emoji: '💣',
        description: 'Social deduction under pressure',
        minPlayers: 2,
        available: true,
        modes: ['online'],
    },
    {
        id: 'quiz-board',
        name: 'Quiz Board',
        emoji: '📺',
        description: 'Pick a tile, win the rupees',
        minPlayers: 2,
        available: true,
        modes: ['online'],
    },
    {
        id: 'card-clash',
        name: 'Clash Cards',
        emoji: '🃏',
        description: 'Call a stat, highest card wins',
        minPlayers: 2,
        available: true,
        modes: ['online'],
    },
    {
        id: 'most-likely-to',
        name: 'Most Likely To',
        emoji: '👥',
        description: 'Vote who fits the prompt',
        minPlayers: 3,
        available: false,
        modes: ['online', 'pass-the-phone'],
    },
    {
        id: 'two-truths-lie',
        name: 'Two Truths a Lie',
        emoji: '😏',
        description: 'Spot the made-up fact',
        minPlayers: 3,
        available: false,
        modes: ['online', 'pass-the-phone'],
    },
];