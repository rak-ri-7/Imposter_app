import { Timestamp } from 'firebase/firestore';

export type Player = {
    id: string;
    name: string;
    isHost: boolean;
    isReady: boolean;
};

export type GameType = 'imposter' | 'stop-the-timer' | 'pass-the-bomb';

export type ImposterSettings = {
    imposterCount: number;
    hintsEnabled: boolean;
};

export type GameStatus =
    | 'menu' //imposter game
    | 'lobby'
    | 'reveal'
    | 'describe'
    | 'vote'
    | 'result'
    | 'question' //stop-the-timer game 
    | 'countdown'
    | 'running';

export type Team = {
    id: string;
    name: string;
    playerIds: string[];
    color: string;
};

export type Group = {
    id: string;
    code: string;
    hostId: string;
    players: Player[];
    scores: Record<string, number>;
    currentGame: GameType | 'menu';
    status: GameStatus;
    gameState: ImposterGameState | TimerGameState | BombGameState;
    createdAt?: number;
    teams?: Team[];
    teamsEnabled?: boolean;
    benchedPlayers?: Player[];
    hostHeartbeatAt?: number
};

export type ImposterGameState = {
    word: string;
    category: string;
    imposterIds: string[];
    votes: Record<string, string>;
    currentTurn: number;
    imposterGuess?: string;
    imposterGuessCorrect?: boolean;
    settings: ImposterSettings;
    votingRound: number;
    eliminatedPlayers: string[];
    hintUsed: boolean;
    currentHint?: string;
};

export type TimerGameState = {
    question: string;
    answer: number;
    difficulty: 'easy' | 'medium' | 'hard';
    phase: 'lobby' | 'question' | 'countdown' | 'running' | 'result' | 'penalty';
    timerStartedAt: Timestamp | number | null
    stops: Record<string, number>;
    roundNumber: number;
    distractionsEnabled: boolean;
    finalStops: Record<string, number>;


};

export const emptyImposterState: ImposterGameState = {
    word: '',
    category: '',
    imposterIds: [],
    votes: {},
    currentTurn: 0,
    settings: {
        imposterCount: 1,
        hintsEnabled: true,
    },
    votingRound: 1,
    eliminatedPlayers: [],
    hintUsed: false,
};

export const emptyTimerState: TimerGameState = {
    question: '',
    answer: 0,
    difficulty: 'easy',
    phase: 'lobby',
    timerStartedAt: 0,
    stops: {},
    roundNumber: 0,
    distractionsEnabled: false,
    finalStops: {}

}

//Bomb game

export type BetMarket = 'boom-or-defuse' | 'round-victim' | 'first-ghost' | 'game-winner' | 'next-ghost';

export type MatchBet = {
    id: string;
    bettorId: string;
    market: BetMarket;
    pick: string;          // 'boom' | 'defuse' | 'nobody' | a player id
    stake: number;
    multiplier: number;    // locked when the bet was placed
    forRound?: number;     // round markets: the round this bet covers
    status: 'open' | 'won' | 'lost' | 'void';
    payout?: number;       // FP returned on a win (stake × multiplier)
    scorePoints?: number;  // leaderboard points awarded on a win
    placedAt: number;
    settledRound?: number
    afterEvent?: number;
};

export type BombTimerMode = 'on' | 'off' | 'mixed';

export type PassEvent = {
    from: string;
    to: string;
    timestamp: number;
    instruction: string;
    boomerang?: boolean
    usedFallback?: boolean;
    fallback?: string; // the fallback text at the time, kept because it gets overwritten on the player's next hold

};

export type BombMission = {
    id: string;
    text: string;
    tier: 'easy' | 'medium' | 'hard';
    type: 'auto' | 'vote'; // 'vote' = confirmed by a group vote
    conditionType: string;
    conditionValue?: number;
    targetId?: string;
    targetName?: string;
    isLifeMission: boolean;
    completed: boolean;
    progress?: number;
    progressSet?: string[];
    roundFlag?: boolean; // avoid-target missions: this round is spoiled
    rewardText?: string; // what it paid; shown in the toast and the reveal
};

export type PlayerMissions = {
    mission1: BombMission;
    mission2: BombMission;
    lifeMission?: BombMission; // unlocked by completing a normal mission
};

export type MissionClaim = {
    claimerId: string;
    missionKey: 'mission1' | 'mission2';
    text: string;
    yesIds: string[];
    noIds: string[];
    startedAt: number;
};

export type ClingyLock = {
    holderId: string;
    until: number;        // timestamp — holder locked until this
    penaltySeconds: number;
};

export type PointEvent = {
    id: string;
    playerId: string;
    amount: number;
    reason: string;
    timestamp: number;
};

export type BombGameState = {
    phase:
    | 'lobby'
    | 'reveal'
    | 'playing'
    | 'panic'
    | 'exploded'
    | 'replay'
    | 'result'
    | 'duel-intro'
    | 'duel'
    | 'penalty'
    | 'ghost-tournament'
    currentHolderId: string;
    timerMode: BombTimerMode;
    timerStartedAt: number;
    timerDuration: number;

    correctWire: 'red' | 'blue';
    personality: string;
    personalityName: string;
    personalityEmoji: string;
    personalityEffect: string;
    personalityDescription: string;
    instructions: Record<string, string>;
    instructionIds: Record<string, string>;
    instructionFallbacks: Record<string, string>;
    missions: Record<string, PlayerMissions>;
    passHistory: PassEvent[];
    lives: Record<string, number>;
    ghosts: string[];
    everGhosted: string[];
    roundNumber: number;
    usedPersonalities: string[];
    usedInstructions: string[];
    boomerangUsed: Record<string, boolean>;
    chainPassed: string[];
    ghostImmunePlayers: string[];
    panicStartedAt?: number;
    ghostWindowEndsAt?: number;
    explodedPlayerId?: string;
    wireChoice?: 'red' | 'blue';
    defused?: boolean;
    speedMultiplier: number;
    pausedAt?: number;
    isPaused?: boolean;
    disputes: PassDispute[];
    penaltyPlayerId?: string;
    penaltyCorrectWire?: 'red' | 'blue';
    penaltyWireChoice?: 'red' | 'blue' | null;
    penaltyResult?: 'safe' | 'caught' | null;
    fffAwaitingManualPass?: boolean;
    duelMode?: 'hot-potato' | 'fastest-finger' | 'hot-seat';
    duelFffLockedUntil?: number;      // holder locked (2s) after losing an exchange
    duelFffTimerStartedAt?: number;   // hidden — never rendered as a number
    duelFffTimerDuration?: number;    // hidden — total duration before explosion risk
    duelFffHolderCanPass?: boolean;
    duelFffLockReason?: 'wrong' | 'too-slow';
    //for memory based instructions
    firstHolderEver?: string;
    firstPasserOf?: Record<string, string>; // receiverId -> the very first player who ever passed to them
    lastPassedTo?: Record<string, string>; // passerId -> most recent receiver from them
    wireCutters?: string[]; // set of players who have ever cut ANY wire, right or wrong
    passCounts?: Record<string, number>; // lifetime count of passes INITIATED by each player
    strictMemoryMode?: boolean; // default true; host can toggle in lobby
    fusePoints: Record<string, number>;
    duelChips: Record<string, number>;
    pointEvents: PointEvent[];
    bettingTickets: Record<string, number>; // playerId -> count
    tbcTickets: Record<string, number>;      // playerId -> count (beyond the free starting one)
    freeBettingClaimed?: Record<string, boolean>; // playerId -> has used their one free betting ticket
    freeTbcClaimed?: Record<string, boolean>;     // playerId -> has used their one free TBC ticket
    activeBets?: Record<string, WireBet>;    // keyed by the wire-cut event it's attached to
    penaltyAccuserIds?: string[];
    tbcChallenge?: {
        accusedId: string;
        opponentId: string;
    };
    tbcHolderId?: string;
    tbcLoserId?: string;
    ghostTournament?: GhostTournamentState;
    pendingGhostTournament?: { wireCutterId: string; ghostIds: string[] };
    ghostResponded?: string[]; // ghostIds who've made ANY decision (bet or decline) this window
    hotSeatWrongCount?: number;   // 0–3, resets fresh each time a new holder's turn starts
    hotSeatLockedUntil?: number;  // separate from duelFffLockedUntil — escalating duration, not a fixed 3s
    revealEndsAt?: number;
    missionClaim?: MissionClaim;
    matchBets?: MatchBet[];
    betScoreEarned?: Record<string, number>;
    betCharges?: Record<string, number>
    ghostEvents?: string[];
    lifePurchases?: Record<string, number>;
    lifeBoughtRound?: Record<string, number>;
    stipendPaidForRound?: number;
    runnerUpId?: string;
    scoresAwarded?: boolean;
    pauseResumeAt?: number;
    roundAdvanceClaimed?: number
    ghostRevealEndsAt?: number;
    revealerItems?: Record<string, number[]>;   // per player: accuracy of each owned revealer, best first
    revealerPurchases?: Record<string, number>; // per player: how many bought (drives the decay)
    revealerHints?: Record<string, { wire: 'red' | 'blue'; accuracy: number }>; // used this round
    shieldItems?: Record<string, number>;       // per player: unarmed shields owned
    shieldArmed?: string[];                     // armed for the NEXT round
    roundShields?: string[];                    // active in THIS round
    shieldAbsorbedPlayerId?: string;            // set when a shield saved someone this round
    hpTimerStartedAt?: number;
    hpTimerDuration?: number;
    hpSpeed?: number;
    hpMood?: 'neutral' | 'angry' | 'lazy' | 'bored';
    hpMoodLockUntil?: number;
    hpHolds?: number[];
    hpHoldStartedAt?: number;
    hpPassMode?: 'each' | 'total';
    hpPassBudget?: number;
    hpPassCounts?: Record<string, number>;
    hpTotalPasses?: number;
    hpLazy?: { from: string; to: string; arrivesAt: number };
    hpNap?: { from: number; until: number };





    // Seating / directional passes
    seatingOrder: string[];

    // Clingy lock (wrong-pass penalty)
    wrongPassCounts: Record<string, number>;
    clingy?: ClingyLock;

    // Memory-question history tracking
    lastWireCutPlayerId?: string;
    previousRoundWireCutPlayerId?: string;
    lastLifeLostPlayerId?: string;
    holdCounts: Record<string, number>;

    // Final duel (2 players remaining)

    duelReadyPlayers?: string[];

    // Host force-end
    forceEnded?: boolean;

    activeQuiz?: ActiveQuiz;
    usedQuizQuestions: string[]; //lifetime, across the whole game



    roundSummaries: {
        roundNumber: number;
        explodedPlayerId: string;
        defused: boolean;
        wireChoice?: string;
        correctWire: string;
        passCount: number;
        personality: string;
    }[];

};

export type WireBet = {
    ghostId: string;
    guessedWire: 'red' | 'blue';
    targetPlayerId: string; // whoever is about to cut
    placedAt: number;
    resolved: boolean;
    won?: boolean;
};

export type GhostTournamentState = {
    stage: 'intro' | 'question' | 'between' | 'result';
    wireCutterId: string;
    contenderIds: string[];
    poolIds: string[];
    eliminatedIds: string[];
    nextStageAt?: number;
    lastEliminatedId?: string;
    winnerId?: string;
    debug?: boolean;
};

export const emptyBombState: BombGameState = {
    phase: 'lobby',
    currentHolderId: '',
    timerMode: 'on',
    timerStartedAt: 0,
    timerDuration: 30,
    correctWire: 'red',
    personality: 'normal',
    personalityName: 'STANDARD BOMB',
    personalityEmoji: '💣',
    personalityEffect: 'normal',
    personalityDescription: '',
    instructions: {},
    instructionIds: {},
    missions: {},
    passHistory: [],
    lives: {},
    ghosts: [],
    everGhosted: [],
    roundNumber: 1,
    usedPersonalities: [],
    usedInstructions: [],
    boomerangUsed: {},
    chainPassed: [],
    ghostImmunePlayers: [],
    speedMultiplier: 1,
    seatingOrder: [],
    wrongPassCounts: {},
    holdCounts: {},
    disputes: [],
    usedQuizQuestions: [],
    instructionFallbacks: {},
    roundSummaries: [],
    strictMemoryMode: true,
    fusePoints: {},
    duelChips: {},
    pointEvents: [],
    bettingTickets: {},
    tbcTickets: {},
    freeBettingClaimed: {},
    freeTbcClaimed: {},

};

export type PassDispute = {
    passIndex: number;
    accusedId: string; // the player who made this pass (event.from)
    voterIds: string[]; // players who've tapped "Call It Out" on this pass
    resolved: boolean;
    guilty: boolean;
};

export type QuizAnswer = {
    optionIndex: number;
    timestamp: number;
};

// The live state of an in-progress Fastest Finger question. This sits
// ALONGSIDE the normal `phase: 'playing'` state rather than being its own
// phase — the main tick/panic/explode timer keeps running underneath it
// unmodified, and the instant panic fires, BombFlowScreen's phase-based
// routing automatically swaps away from the quiz screen with zero extra
// "cancel the quiz" code needed.
export type ActiveQuiz = {
    // Mirrors QuizInstance from logic/quizQuestions.ts. Duplicated here
    // (rather than imported) since shared/types shouldn't depend on a
    // per-game logic file — keep the two in sync by hand if that file's
    // shape changes.
    question: {
        questionId: string;
        prompt: string;
        options: { text: string; correct: boolean }[];
    };
    startedAt: number;
    durationMs: number; // fixed 5000
    answers: Record<string, QuizAnswer>; // playerId -> their tap
    resolved: boolean;

    // Set once resolved, only when the outcome needs a human pick rather
    // than being fully automatic (the "2+ wrong, holder not among them"
    // and "1 correct, rest silent" branches of the resolution tree).
    awaitingChoice?: {
        chooserId: string;
        choosablePlayerIds: string[];
    };

    hotSeatEliminatedOptions?: number[]; // indices removed from the pool so far this turn
    // Lets the same engine serve normal Quiz Bomb rounds (chains to
    // another question), duels, and Trial by Combat (single-shot) without
    // three different code paths.
    mode: 'quiz-round' | 'duel' | 'duel-fff' | 'trial-by-combat' | 'ghost-tournament' | 'hot-seat';
    chainNext: boolean;
};