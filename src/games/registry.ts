import type { GameType } from '../shared/types';

export type GameMode = 'online' | 'pass-the-phone';

// What kind of game it is: drives the filter chips in the game menu.
export type GameKind = 'teams' | 'deception' | 'quiz' | 'cards' | 'party';
export const KIND_LABEL: Record<GameKind, string> = {
    teams: '👥 Teams',
    deception: '🕵️ Deception',
    quiz: '🧠 Quiz',
    cards: '🃏 Cards',
    party: '🎉 Party',
};

export type GameDefinition = {
    id: GameType;
    name: string;
    emoji: string;
    description: string;
    minPlayers: number;
    maxPlayers?: number;             // none = no upper limit
    bestFor: [number, number];       // the player count it's most fun at
    minutes: [number, number];       // a typical game, start to finish
    kind: GameKind;
    tags: string[];                  // a couple of extra words for the card
    isNew?: boolean;                 // shows a NEW badge
    // Uses the session's teams (👥 Play as Teams): required, or an option.
    teamPlay?: { need: 'required' | 'optional'; note: string };
    hook: string;                    // one line: how you win (top of the game's lobby)
    howTo: string[];                 // 3-5 short steps, shown before starting
    available?: boolean;
    modes: GameMode[];
};

// Games for the "👥 Teams" filter: team games and ones with a team mode.
export const usesTeams = (g: GameDefinition) => g.kind === 'teams' || !!g.teamPlay;

export const fitFor = (g: GameDefinition, players: number): 'short' | 'over' | 'best' | 'ok' =>
    players < g.minPlayers ? 'short' : g.maxPlayers && players > g.maxPlayers ? 'over' : players >= g.bestFor[0] && players <= g.bestFor[1] ? 'best' : 'ok';
export const playersLabel = (g: GameDefinition) => (g.maxPlayers ? `${g.minPlayers}–${g.maxPlayers}` : `${g.minPlayers}+`);
export const minutesLabel = (g: GameDefinition) => (g.minutes[0] === g.minutes[1] ? `${g.minutes[0]} min` : `${g.minutes[0]}–${g.minutes[1]} min`);

export const games: GameDefinition[] = [
    {
        id: 'roof-race',
        name: 'Race Before the Roof Falls!',
        emoji: '🏛️',
        description: 'Two teams, three doors, one crumbling ruin',
        hook: 'Race your team through three doors to the treasure. Only the key-holder sees the lock, so talk fast.',
        minPlayers: 4,
        maxPlayers: 10,
        bestFor: [6, 10],
        minutes: [5, 25],
        kind: 'teams',
        tags: ['Puzzles', 'Shouting'],
        isNew: true,
        teamPlay: { need: 'required', note: 'Needs exactly 2 teams of 2–5 (set up with 👥 Play as Teams). Anyone not on a team watches.' },
        howTo: [
            'Two teams (set them up with 👥 Teams first) race through the same crumbling ruin: three doors, then the treasure.',
            'At each door one player holds the 🔑 key and sees the lock. Everyone else has clues but can’t see it. Talk fast!',
            'Open quickly to earn 💎 gems. A wrong push costs gems, and two mistakes bring the roof down.',
            'Spend gems on a 🌋 tremor to shake the other team’s lock.',
            'Reach the vault and the whole team holds the chest together. Most gems plus treasure wins.',
        ],
        available: true,
        modes: ['online'],
    },
    {
        id: 'match-the-following',
        name: 'Match the Following',
        emoji: '✏️',
        description: 'Draw lines between friends and what they’d do',
        hook: 'Everyone answers the same situation. Then match each friend to what they wrote.',
        minPlayers: 3,
        bestFor: [4, 8],
        minutes: [10, 15],
        kind: 'party',
        tags: ['Know your friends'],
        isNew: true,
        howTo: [
            'Everyone gets the same situation, like “Your boss calls you on a Sunday. You…”, and writes what they’d do.',
            'Then match the following: draw a line from every name to the answer you think they wrote.',
            'The reveal shows each answer, who everyone matched it to, and who really wrote it.',
            'A point for every right line. Pick Wholesome, Cheeky or Tricky questions.',
        ],
        available: true,
        modes: ['online', 'pass-the-phone'],
    },
    {
        id: 'court-of-thieves',
        name: 'Court of Thieves',
        emoji: '⚖️',
        description: 'Rob the room in a blackout, then cut deals',
        hook: 'One secret Thief robs the room in the dark. Catch them, or get away with it.',
        minPlayers: 4,
        bestFor: [5, 8],
        minutes: [20, 30],
        kind: 'deception',
        tags: ['Roles', 'Bluffing'],
        howTo: [
            'Everyone gets a secret role: 🧤 Thief, 🚓 Police, ⚖️ Judge, 💼 Advocate, or 🙂 Citizen.',
            'The lights go out. Only the Thief moves: stealing cash and planting it to frame others. Witnesses may glimpse them.',
            'Then make deals by message: hush money, demands, tips.',
            'The Police arrest a suspect, there’s a short trial, and the Judge rules.',
            'After the last round, most real money wins. The Thief’s counterfeit cash doesn’t count.',
        ],
        available: true,
        modes: ['online'],
    },
    {
        id: 'imposter',
        name: 'Are You the Imposter?',
        emoji: '🕵️',
        description: 'Find who doesn\'t know the word',
        hook: 'Everyone knows the word except one. Find the imposter before they blend in.',
        minPlayers: 2,
        bestFor: [5, 10],
        minutes: [5, 10],
        kind: 'deception',
        tags: ['Words', 'One phone OK'],
        howTo: [
            'Everyone gets the same secret word, except the imposter, who doesn’t.',
            'Take turns giving a clue about the word without saying it. The imposter has to bluff.',
            'Everyone votes for who they think the imposter is.',
            'Catch them and you win. Can also be played passing one phone around.',
        ],
        available: true,
        modes: ['online', 'pass-the-phone'],
    },
    {
        id: 'stop-the-timer',
        name: 'Stop the Timer',
        emoji: '⏱️',
        description: 'Stop closest to the answer',
        hook: 'Work out the answer, then stop a hidden timer on it. Closest wins.',
        minPlayers: 2,
        bestFor: [2, 6],
        minutes: [5, 10],
        kind: 'quiz',
        tags: ['Quick', 'Mental maths'],
        teamPlay: { need: 'optional', note: 'Play as teams: everyone stops their own timer, and the team closest on average wins the round.' },
        howTo: [
            'A question appears. Work out the answer in your head.',
            'A hidden timer starts counting. Stop it when you think it has reached the answer.',
            'Closest to the answer wins the round. Watch out for distractions!',
        ],
        available: true,
        modes: ['online', 'pass-the-phone'],
    },

    {
        id: 'pass-the-bomb' as const,
        name: 'That Old Bomb Story',
        emoji: '💣',
        description: 'Social deduction under pressure',
        hook: 'Get the bomb out of your hands before it goes off.',
        minPlayers: 2,
        bestFor: [4, 10],
        minutes: [15, 20],
        kind: 'party',
        tags: ['Chaos', 'Hot potato'],
        teamPlay: { need: 'optional', note: 'Pass mode can be played as teams: the whole team sees each question and anyone can answer.' },
        howTo: [
            'A bomb is ticking and it’s in someone’s hands. Pass it on before it blows!',
            'Timer mode: secret instructions say who you may pass to, with panic wires, ghosts and chaos along the way.',
            'Pass mode: no clock. Answer a question to pass, and run out of passes and it blows.',
            'Whoever is holding it when it explodes loses the round.',
        ],
        available: true,
        modes: ['online'],
    },
    {
        id: 'quiz-board',
        name: 'Quiz Board',
        emoji: '📺',
        description: 'Pick a tile, win the rupees',
        hook: 'Pick a tile, answer first, win the rupees. Wrong answers cost you.',
        minPlayers: 2,
        bestFor: [3, 6],
        minutes: [15, 20],
        kind: 'quiz',
        tags: ['Trivia', 'Buzzer'],
        teamPlay: { need: 'optional', note: 'Play as teams: one answer per team (the first teammate to tap or buzz answers for everyone), and money goes into a team pot.' },
        howTo: [
            'Pick a tile from the board. Everyone gets the question.',
            'Options mode: tap one of 4 answers. Buzzer mode: buzz in and answer out loud, and the host marks it.',
            'Fastest right answer wins the tile’s rupees. Every wrong answer loses them, so don’t guess blindly.',
            'Whoever wins picks the next tile. Most rupees at the end wins.',
        ],
        available: true,
        modes: ['online', 'pass-the-phone'],
    },
    {
        id: 'card-clash',
        name: 'Card Stats Callout!',
        emoji: '🃏',
        description: 'Call a stat, highest card wins',
        hook: 'Call your card’s best stat. Highest number takes every card.',
        minPlayers: 2,
        bestFor: [2, 4],
        minutes: [10, 20],
        kind: 'cards',
        tags: ['Trivia', 'Countries & animals'],
        howTo: [
            'Everyone gets a pile of cards (countries or animals). You only see your own top card.',
            'The caller picks one stat and calls CLASH! Then all the cards flip.',
            'Highest number wins every card in the clash, and the winner calls next.',
            'Run out of cards and you’re out. Last one standing wins.',
        ],
        available: true,
        modes: ['online'],
    },
    {
        id: 'clash-holdem',
        name: "Holdem Deck",
        emoji: '💰',
        description: 'Bet on your card, stats revealed one by one',
        hook: 'Poker with stat cards: bet on your one card as the stats are revealed.',
        minPlayers: 2,
        bestFor: [3, 6],
        minutes: [15, 25],
        kind: 'cards',
        tags: ['Betting', 'Bluffing'],
        howTo: [
            'Poker-style betting with stat cards. You see only your own card.',
            'Bet before any stat is shown, then again as stats are revealed one by one.',
            'Your card shows where it ranks on each live stat, so you know when to push and when to fold.',
            'Everyone else folds? You win without showing. Most chips after the last hand wins.',
        ],
        available: true,
        modes: ['online'],
    },
];