import type { GameType } from '../shared/types';

export type GameMode = 'online' | 'pass-the-phone';

export type GameDefinition = {
    id: GameType;
    name: string;
    emoji: string;
    description: string;
    minPlayers: number;
    available?: boolean;
    modes: GameMode[];
};

export const games: GameDefinition[] = [
    {
        id: 'roof-race',
        name: 'Race Before the Roof Falls',
        emoji: '🏛️',
        description: 'Two teams, three doors, one crumbling ruin',
        minPlayers: 4,
        available: true,
        modes: ['online'],
    },
    {
        id: 'match-the-following',
        name: 'Match the Following',
        emoji: '✏️',
        description: 'Draw lines between friends and what they’d do',
        minPlayers: 3,
        available: true,
        modes: ['online'],
    },
    {
        id: 'court-of-thieves',
        name: 'Court of Thieves',
        emoji: '⚖️',
        description: 'Rob the room in a blackout, then cut deals',
        minPlayers: 4,
        available: true,
        modes: ['online'],
    },
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
        id: 'clash-holdem',
        name: "Clash Hold'em",
        emoji: '💰',
        description: 'Bet on your card, stats revealed one by one',
        minPlayers: 2,
        available: true,
        modes: ['online'],
    },
];