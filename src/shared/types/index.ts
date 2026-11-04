import { Timestamp } from 'firebase/firestore';
import type { QuizCategory } from '../quiz'

export type Player = {
    id: string;
    name: string;
    isHost: boolean;
    isReady: boolean;
};

export type GameType = 'imposter' | 'stop-the-timer' | 'pass-the-bomb' | 'quiz-board' | 'card-clash' | 'clash-holdem' | 'court-of-thieves' | 'match-the-following';

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

// 💣 Pass the Bomb: what a group told us about itself before playing
// (timer mode), so it only gets instructions that make sense for them.
export type BombCrowd = 'friends' | 'family' | 'couples' | 'colleagues' | 'justmet';
export type BombSpice = 'wholesome' | 'cheeky' | 'savage';
export type BombTasteId =
    | 'cricket' | 'football' | 'bollywood' | 'south' | 'hollywood' | 'kpop' | 'anime'
    | 'gaming' | 'biggboss' | 'pets' | 'fitness' | 'food' | 'politics' | 'festivals'
    | 'music' | 'horror';
export type BombGroupProfile = {
    crowd: BombCrowd;
    spice: BombSpice;
    tastes: BombTasteId[];   // empty = skipped → broad default topics
    realNames?: boolean;     // false = app names are nicknames → skip name-letter instructions
    setAt?: number;
};

export type Group = {
    id: string;
    code: string;
    hostId: string;
    players: Player[];
    scores: Record<string, number>;
    // The same points split by game (session leaderboard slides).
    gameScores?: Partial<Record<GameType, Record<string, number>>>;
    currentGame: GameType | 'menu';
    status: GameStatus;
    gameState: ImposterGameState | TimerGameState | BombGameState | PassGameState | QuizBoardGameState | ClashGameState | HoldemGameState | CotGameState | MtfGameState;
    createdAt?: number;
    teams?: Team[];
    teamsEnabled?: boolean;
    benchedPlayers?: Player[];
    hostHeartbeatAt?: number
    // Quiz Board: question ids this group has already played, newest last,
    // so later boards prefer fresh questions. Survives between games.
    quizSeenIds?: string[];
    // Quiz Board: code version each phone last opened it with (see
    // QB_CLIENT_VERSION), so the lobby can flag phones that need a reload.
    quizClientVersions?: Record<string, number>;
    // Pass the Bomb: quirk combos this group has ever discovered.
    bombCollection?: Record<string, { foundAt: number; foundBy: string }>;
    // Pass the Bomb: achievements this group has ever unlocked.
    achievementCollection?: Record<string, { foundAt: number; foundBy: string }>;
    bombLobby?: { mode: 'timer' | 'pass' | null; passBudget: number; passAsTeams: boolean; hiddenPasses?: boolean; } | null;
    // Pass the Bomb: the group's setup answers, remembered between games.
    bombProfile?: BombGroupProfile;
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
    // Players the host chose to continue without while they were offline:
    // playerId -> their last check-in at that moment (see usePresence).
    awayIgnored?: Record<string, number>;
};

export type TimerGameState = {
    question: string;
    answer: number;
    difficulty: 'easy' | 'medium' | 'hard';
    phase: 'lobby' | 'question' | 'running' | 'result' | 'penalty';
    timerStartedAt: Timestamp | number | null
    // Server-written start of the pre-timer countdown, so every device counts
    // down against the same instant.
    countdownStartedAt?: Timestamp | number | null
    // Last round whose points were already added to scores (idempotency guard).
    pointsAwardedRound?: number;
    // A round the host voided because a player dropped out: no points.
    voidedRound?: { round: number; awayIds: string[] };
    // Players the host chose to continue without while they were offline:
    // playerId -> their last check-in at that moment (see usePresence).
    awayIgnored?: Record<string, number>;
    // Values are server Timestamps while the round runs.
    stops: Record<string, Timestamp | number>;
    roundNumber: number;
    distractionsEnabled: boolean;
    finalStops: Record<string, number | null>;
    recentTemplates?: string[];


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

//Bomb game

export type BetMarket = 'boom-or-defuse' | 'round-victim' | 'first-ghost' | 'game-winner' | 'next-ghost' | 'duel-loser';

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

// ── Bomb quirks (see games/pass-the-bomb/logic/timer/bombQuirks.ts) ──
export type BombCrush = {
    playerId: string;
    variant: string;
    tapsNeeded?: number;   // crush: taps to let go this hold (secret)
    taps?: number;         // crush / toxic: taps so far this hold
    receivedAt?: number;   // toxic: when its crush last caught it
    lastTapAt?: number;    // toxic: last impatient tap
    lockUntil?: number;    // cuddler: no passing until then
    returnArmed?: boolean; // obsessed: next pass goes back to the crush
    returnsLeft?: number;  // obsessed
    reboundUsed?: boolean; // rebound
};
export type BombQuirkState = {
    crushes?: Record<string, BombCrush>; // playerId -> its crush on them (several allowed)
    lazy?: { variant: string };
    strangersHit?: string[];   // stranger: each player only once a round
};
export type PendingPass = {
    from: string;
    to: string;
    arrivesAt: number;
    kind: 'lazy' | 'sneak';
    usedFallback?: boolean;
    speedBoost?: number;       // seething: fuse speed multiplier while it drags
    heldMs?: number;           // how long the passer held it (for achievements)
};
// 🔨 Auction Bomb: the holder tapped Pass, everyone else is bidding.
export type BombAuction = {
    id: string;                     // one auction (guards the settle)
    holderId: string;
    startedAt: number;              // holder's clock: replay/ordering only
    durationMs: number;             // phones time it from when they see it
    bids: Record<string, number>;   // every living non-holder's current bid
    paid?: Record<string, number>;  // FP already taken from each bidder (held till it settles)
    heldMs?: number;                // the holder's hold before tapping (achievements)
    first?: boolean;                // the game's first auction (longer, with a hint)
};
// 🧾 One Alley purchase (timer mode). Public: anyone can check the receipts.
export type AlleyItem = 'betting-ticket' | 'tbc-ticket' | 'wire-revealer' | 'bomb-shield' | 'super-shield' | 'life';
export type AlleyReceipt = {
    playerId: string;
    item: AlleyItem;
    price: number;   // FP paid (0 = a free first ticket)
    round: number;
    at: number;
};
export type AuctionRecord = {
    holderId: string;
    loserId: string;
    bids: Record<string, number>;   // final bids
    paid?: Record<string, number>;  // what each actually paid (broke bidders pay what they have)
    pot: number;
    tied?: string[];                // shared the lowest bid: the bomb picked at random (🎲)
};
export type QuirkDetail = {
    fledTo?: string;
    bite?: number;
    panic?: boolean;
    receipts?: number;
    heldSec?: number;
};
export type QuirkReveal = {
    id: string;
    variant: string;
    kind: 'crush' | 'stranger' | 'lazy';
    playerId: string;          // who it happened to
    endsAt: number;
    isNew: boolean;            // first time this group ever found it
    found: number;             // collection size after this
    detail?: QuirkDetail;
};
export type AchievementRecord = {
    earned: Record<string, number>;   // achievement id -> round it was earned
    p: {                              // progress counters
        hh?: number; hhRound?: number;  // hot hands this round
        lastDefuse?: number; defuses?: number;
        booms?: number;
        safe?: number;                  // rounds in a row without losing a life
    };
};
export type AchievementUnlock = {
    id: string;
    playerId: string;
    achievement: string;
    round: number;
    gotLife?: boolean;                // life achievements: false = converted to FP
};
export type RoundQuirk = { variant: string; playerId: string; detail?: QuirkDetail };

export type BombGameState = {
    // The group's setup answers, copied in when the game started.
    profile?: BombGroupProfile;
    // Players the host chose to continue without while they were offline:
    // playerId -> their last check-in at that moment (see usePresence).
    awayIgnored?: Record<string, number>;
    // True while the current round is the 2-player final duel.
    duelRound?: boolean;
    // A duel life given back after a connection drop (honour system).
    lifeRestored?: { playerId: string; byPlayerId: string; round: number };
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
    roundAdvanceClaimedAt?: number;   // when; an old claim is stale (the advance failed)
    roundEndEventsRound?: number;     // round whose end-of-round achievements were already applied
    duelStartClaimed?: number;        // round whose quiz duel the host is already starting
    duelRoundIndex?: number;          // 1 = first round of the final duel, 2 = second…
    bombQuirks?: BombQuirkState;      // quirks the bomb picked up this round
    pendingPass?: PendingPass;        // a lazy / sneaky pass still on its way
    quirkReveal?: QuirkReveal;        // the mid-game card (fuse paused till endsAt)
    roundQuirks?: RoundQuirk[];       // everything it turned into this round (replay)
    toxicBoom?: boolean;              // toxic bomb blew on an impatient tap
    auction?: BombAuction;            // 🔨 a live auction
    auctionLog?: AuctionRecord[];     // 🔨 this round's settled auctions (replay)
    alleyReceipts?: AlleyReceipt[];   // 🧾 every Alley purchase this game (public)
    auctionCount?: number;            // 🔨 auctions so far this game
    achievements?: Record<string, AchievementRecord>; // per player, this game
    achFeed?: AchievementUnlock[];    // latest unlocks (toasts on every phone)
    // Game end: every player's leftover FP turned into leaderboard points.
    fpCashOut?: Record<string, { fp: number; points: number }>;
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
    hpContext?: 'duel' | 'tournament';
    hpPlayers?: string[];      // the fixed pass order
    hpHolderId?: string;
    hpPassMin?: number;
    hpPassMax?: number;
    hpDudPlayerId?: string;
    lastDudId?: string;
    hpDudLine?: number;
    superShieldCredits?: Record<string, number>;
    superShieldBought?: Record<string, number>;
    superShieldItems?: Record<string, number>;
    duelShieldArmed?: string[];
    roundDuelShields?: string[];
    duelShieldAbsorbedPlayerId?: string;
    roundStartLives?: Record<string, number>;
    panicSeq?: number;

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
    stage: 'intro' | 'question' | 'fuse' | 'between' | 'result';
    mode?: 'quiz' | 'hot-potato';
    modeVotes?: Record<string, 'quiz' | 'hot-potato'>;
    introMinUntil?: number;
    wireCutterId: string;
    contenderIds: string[];
    poolIds: string[];
    eliminatedIds: string[];
    nextStageAt?: number;
    lastEliminatedId?: string;
    winnerId?: string;
    debug?: boolean;
    lastDudLine?: number;
    lastDudId?: string;
};

export type PassDispute = {
    passIndex: number;
    accusedId: string; // the player who made this pass (event.from)
    voterIds: string[]; // players who've tapped "Call It Out" on this pass
    resolved: boolean;
    guilty: boolean;
    outcome?: 'caught' | 'safe' | 'tbc-won' | 'tbc-lost';
    tbcOpponentId?: string;
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
    // Mirrors QuizInstance from shared/quiz. Duplicated here
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

export type PassQuestion = {
    questionId: string;
    prompt: string;
    options: { text: string; correct: boolean }[];
};

export type PassTurn = {
    seq: number;
    targetId: string | null;   // a side id
    question: PassQuestion;
    wrongPicks: number[];
    removed?: number[];   // options knocked out by 50/50
    muffled?: boolean;
    // Category Card: dealt with this turn (1 in 3). Pending until the holder picks or declines.
    card?: { offered: QuizCategory[]; status: 'pending' | 'picked' | 'declined'; pick?: QuizCategory };
    // This side's question was sent in a category picked by the passer.
    sentCategory?: { category: QuizCategory; bySideId: string };
};

// A side is one player in solo play, or one team in team play.
export type PassSide = {
    id: string;          // player id (solo) or team id (teams)
    name: string;
    memberIds: string[];
    color?: string;      // teams only
};

export type PassReceipt = {
    item: 'pass' | 'fiftyFifty' | 'swap' | 'gloves' | 'audit' | 'ticket';
    byPlayerId: string;
    round: number;
    targetId?: string;   // who a bought pass / an audit was aimed at
    ticketKind?: PassTicketKind
};

export type PassGameState = {
    mode: 'pass';
    teamMode: boolean;
    // Players the host chose to continue without while they were offline:
    // playerId -> their last check-in at that moment. Expires on its own
    // once they check in again, so a later drop-out pauses the game again.
    awayIgnored?: Record<string, number>;
    phase: 'pass-playing' | 'pass-exploded' | 'pass-result';
    budget: number;                                 // starting passes per side
    sides: PassSide[];
    sideIds: string[];
    holderId: string;                               // a side id
    stacks: Record<string, number>;                 // passes left this round, per side
    lives: Record<string, number>;                  // per side
    ghosts: string[];                               // side ids
    eliminationOrder: string[];
    round: number;
    turn: PassTurn;
    usedQuestionIds: string[];
    stats: Record<string, { passes: number; wrong: number }>
    callout: { seq: number; voterIds: string[]; againstIds?: string[] };
    lastCalloutDropped?: { seq: number };
    lastPass?: { from: string; to: string; seq: number; byPlayerId: string };
    lastExplosion?: { sideId: string; eliminated: boolean; round: number; reason?: 'left' | 'skipped'; clutch?: string[] /* sides that survived on <= 2 passes */ };
    lastCallout?: { sideId: string; seq: number; targetKept?: boolean };
    winnerId?: string | null;
    wallet?: Record<string, number>;          // per side (team wallet in team play)
    streak?: Record<string, number>;          // first-try answers in a row
    passesBought?: Record<string, number>;    // drives the rising pass price
    items?: Record<string, { fiftyFifty?: number; swap?: number }>;
    lastEarn?: { sideId: string; amount: number; streak: number; seq: number };
    lastSwap?: { sideId: string; seq: number };
    hiddenPasses?: boolean;
    glovesTurns?: Record<string, number>;
    receipts?: Record<string, PassReceipt[]>;
    stint?: number;                                  // counts turns holding the bomb
    tickets?: Record<string, PassTicket>;
    ticketNews?: {
        id: number;
        round: number;
        roundEnd: boolean;   // came from the tap that ended the round
        items: { sideId: string; kind: PassTicketKind; won: boolean; payout: number }[];
    };
    haunt?: { ghostId: string; stint: number; byPlayerId: string } | null;
    stash?: Record<string, number>;
    revived?: string[];
    lastRevival?: { sideId: string; id: number; round: number };
};

export type PassTicketKind = 'double-clean' | 'triple-clean' | 'clean-sheet' | 'survivor';
export type PassTicket = { kind: PassTicketKind; progress: number; round: number };

// ── QUIZ BOARD ────────────────────────────────────────────────────
// 'options': everyone taps one of 4 options, scored automatically.
// 'buzzer':  players buzz in and answer out loud; the host judges.
export type QuizBoardMode = 'options' | 'buzzer';
// 'quick' = 4 categories × 5 rows (₹1,000–₹5,000);
// 'full'  = 5 categories × 6 rows (₹1,000–₹6,000).
export type QuizBoardSize = 'quick' | 'full';

export type QuizBoardPhase =
    | 'board'     // picker chooses a tile
    | 'golden-wager' // a golden tile was picked: the picker places a bet
    | 'question'  // timer running: buzz in / tap an option
    | 'locking'   // short silent pause before the answer is revealed
    | 'judging'   // buzzer mode: answer shown, host picks who was right
    | 'result'    // round scored; Review / correct / void still possible
    | 'final';    // board finished

export type QuizBoardTile = {
    category: QuizCategory;
    level: number;          // row on this board, 1 = cheapest
    value: number;          // rupees
    questionId: string;
    used: boolean;
    golden?: boolean;       // hidden until picked: the picker bets on it
};

// The question on screen right now. Its answer is in the document but no
// screen shows it before the reveal.
export type QuizBoardCurrent = {
    tileIndex: number;
    questionId: string;
    prompt: string;
    options: { text: string; correct: boolean }[];
    answer: string;
    value?: number;         // what this question is worth (doubled / the bet)
    double?: boolean;       // picked during Double Money
    golden?: { playerId: string; wager?: number }; // only this player answers
    goldenPassedBy?: string; // picker passed the golden tile: it plays as normal
    alsoAccepted?: string[]; // other right answers (shown in buzzer mode)
};

export type QuizBoardRound = {
    tileIndex: number;
    questionId: string;
    value: number;
    answer: string;
    mode: QuizBoardMode;
    winnerId: string | null;          // null = nobody right
    deltas: Record<string, number>;   // what this round did to each player's money
    buzzOrder: string[];              // buzzer mode
    picks?: Record<string, number>;   // options mode: player -> option index
    forceEnded?: boolean;
    pickerBefore?: string;            // who picked this tile
    golden?: boolean;                 // value = the picker's bet
    double?: boolean;                 // played during Double Money
    reviewBy?: string[];              // players who tapped Review
    reviewSeen?: boolean;             // host dismissed / handled the review
    changed?: boolean;                // host corrected the call
    voided?: boolean;
};

// ── 🃏 CLASH CARDS ─────────────────────────────────────────────────
// Top-Trumps style: everyone plays their top card, the caller picks a stat,
// the highest value takes every card in the clash. Last one standing wins.
// ★ Gold cards: one per player at the deal. A gold card that loses to a
// normal card gets a Gold Defence: a rematch on a stat its owner picks.
// After every call there's an 'answering' beat: the stat is announced, each
// other player sees their own number and taps CLASH! when ready, then the
// reveal.
export type ClashPhase =
    | 'calling'
    | 'answering'
    | 'reveal'
    | 'defending'
    | 'fold-decide'                  // 🏳️ the decider accepts the fold or calls the bluff
    | 'fold-pick'                    // 🏳️ bluff called: the folder picks the side clash's stat
    | 'fold-result'                  // 🏳️ the side clash, shown
    | 'over';
export type ClashCall = {
    stage: 'clash' | 'defence';
    statKey: string;
    by: string;                      // the caller (clash) or defender (defence)
    wildcard?: boolean;
    auto?: boolean;
    waitingFor: string[];            // players who still need to tap CLASH!
    counterBy?: string;              // 🔄 who counter-called (statKey is theirs now)
    counterFrom?: string;            // 🔄 the stat they swapped out
};
// 🏳️ A fold in progress. The folded card stays on top of the folder's pile
// (left out of the main clash) until it's settled.
export type ClashFold = {
    round: number;
    folderId: string;
    card: string;                    // the folded card (folder's top card)
    deciderId?: string;              // caller (2 players) or the main clash's winner
    deciderCard?: string;            // the decider's card for a side clash
    deciderOnTop?: boolean;          // true = that card is still the decider's top card (no main clash)
    statKey?: string;                // bluff called: the folder's stat
    auto?: boolean;
    accepted?: boolean;
    result?: {
        winnerId: string;
        folderNext: string;          // the folder's second card
        values: Record<string, number>;
        tied?: boolean;
        out?: string[];
    };
};
export type ClashResult = {
    round: number;
    callerId: string;
    statKey: string;
    wildcard?: boolean;              // a 🃏 backup stat
    auto?: boolean;                  // the caller ran out of time
    plays: Record<string, string>;   // playerId -> card id played
    winnerId: string;
    tied?: string[];                 // shared the top value: the 🎲 roll picked winnerId
    out?: string[];                  // knocked out by this clash
    stage?: 'clash' | 'defence';     // missing = 'clash'
    gold?: string[];                 // gold card ids among plays (before any change)
    goldTie?: boolean;               // a gold card won a tie at the top
    defenceNext?: boolean;           // a gold card lost: Gold Defence next, no cards moved yet
    pot?: Record<string, string>;    // defence: every card at stake (the first clash's plays)
    firstStatKey?: string;           // defence: the stat the first clash was called on
    goldTo?: string;                 // defence: the challenger's card took the gold
    counterBy?: string;              // 🔄 this clash's stat was a counter-call
    counterFrom?: string;            // 🔄 the stat it replaced
    penaltyCard?: string;            // 🔄 the counter-caller lost: this extra card went to the winner
    folderId?: string;               // 🏳️ sat this clash out (folded)
};
export type ClashDefence = {
    defenderId: string;
    challengerId: string;
    goldCard: string;
    challengerCard: string;
    firstStatKey: string;
    firstValues: Record<string, number>; // playerId -> value on the first stat
    pot: Record<string, string>;     // playerId -> card id, everything at stake
};
export type ClashGameState = {
    game: 'card-clash';
    deck: 'countries' | 'animals';
    phase: ClashPhase;
    round: number;
    piles: Record<string, string[]>; // playerId -> card ids, top card first
    callerId: string;
    startedWith: number;             // cards dealt to each player
    wildcardUsed?: Record<string, boolean>;
    skipsUsed?: Record<string, number>;  // playerId -> clash they used ⏭️ Skip in
    hintsUsed?: Record<string, number>;  // playerId -> clash they used 🔍 Hint in
    // Stats already called: nobody can call them again. Waves: all 10, then
    // a random 5 reopen, then the other 5, then the game ends (most cards
    // wins). A gold card ignores this.
    scratched?: Record<string, boolean>;
    statWave?: 1 | 2 | 3;            // missing = 1
    statReserve?: string[];          // the 5 held back for wave 3
    statsOut?: boolean;              // the last stat is called: this clash ends the game
    lengthMode?: 'capped' | 'unlimited'; // missing = 'capped' (the 10 → 5 → 5 waves)
    endAtRound?: number;             // 🏁 host called time: the game ends after this clash
    called?: ClashCall;              // set during 'answering'
    ready?: Record<string, boolean>; // playerId -> tapped CLASH!
    streak?: { playerId: string; count: number }; // calls in a row by one player
    passedCall?: { round: number; from: string; to: string; pool: string[] }; // 🎁 the latest pass
    outRound?: Record<string, number>; // playerId -> the round they ran out of cards
    last?: ClashResult;
    gold?: Record<string, boolean>;  // ★ card id -> true
    defence?: ClashDefence;          // set from the losing clash until the defence is called
    counterPenalty?: string;         // 🔄 counter-caller who must pay a card if they don't win (during a defence)
    fold?: ClashFold;
    foldsUsed?: Record<string, boolean>;
    countersUsed?: Record<string, boolean>;
    endedEarly?: boolean;
    pointsAwarded?: boolean;
};

// ── 🃏💰 CLASH HOLD'EM ──────────────────────────────────────────────
// Poker with Clash cards: one hidden card each, stats revealed in three
// streets (flop, turn, river) with betting between; best card on the final
// stats takes the pot. See games/clash-holdem/logic/engine.ts.
export type HoldemMode = 'draw' | 'scratch';
export type HoldemStreet = 'preflop' | 'flop' | 'turn' | 'river';
export type HoldemPhase = 'choosing' | 'betting' | 'showdown' | 'over';
export type HoldemAction = 'check' | 'call' | 'bet' | 'raise' | 'fold' | 'ante' | 'blind' | 'all-in';
export type HoldemLogEntry = { pid: string; action: HoldemAction; amount: number; street: HoldemStreet };
export type HoldemPot = { amount: number; eligible: string[]; winners: string[] };
export type HoldemHandResult = {
    hand: number;
    mode: HoldemMode;
    stats: string[];                              // the final stats
    cards: Record<string, string>;                // shown at showdown (players still in)
    crowns?: Record<string, number>;              // draw mode: stats won
    suddenDeath?: string[];                       // tie-break stats flipped, in order
    pots: HoldemPot[];
    noShowdown?: boolean;                         // everyone else folded
    winnerIds: string[];                          // won the main pot
    gains: Record<string, number>;                // chips won this hand (gross)
};
export type HoldemGameState = {
    game: 'clash-holdem';
    deck: 'countries' | 'animals';
    phase: HoldemPhase;
    modeSetting: 'choice' | 'draw' | 'scratch';
    mode?: HoldemMode;
    hand: number;
    handsTotal: number;
    seats: string[];                              // seating order
    dealerId: string;
    chips: Record<string, number>;
    inHand: string[];                             // dealt in this hand
    folded: Record<string, boolean>;
    cards: Record<string, string>;                // playerId -> card id (this hand)
    street: HoldemStreet;
    stats: string[];                              // the live stats
    usedStats: string[];                          // every stat shown this hand
    sdOrder: string[];                            // sudden-death order (fixed at the deal)
    committed: Record<string, number>;            // chips in the pot this hand, per player
    streetBet: Record<string, number>;            // chips in on this street
    currentBet: number;
    lastRaise: number;                            // the last full bet/raise size (the minimum next raise)
    acted: Record<string, boolean>;               // acted since the last full raise (only they can't re-raise)
    sbId?: string;                                // small blind this hand
    bbId?: string;                                // big blind this hand
    toAct?: string;
    seq: number;                                  // bumps on every change of turn/phase
    log: HoldemLogEntry[];                        // this hand
    lastStreetChange?: { street: HoldemStreet; removed?: string; added?: string };
    last?: HoldemHandResult;
    outHand?: Record<string, number>;             // playerId -> hand they went bust in
    outStack?: Record<string, number>;            // playerId -> chips they started that hand with (ties)
    endedEarly?: boolean;                         // host ended it (a hand in progress was called off)
    pointsAwarded?: boolean;
};

export type QuizBoardGameState = {
    game: 'quiz-board';
    mode: QuizBoardMode;
    boardSize?: QuizBoardSize;        // missing = 'full' (games started before sizes)
    phase: QuizBoardPhase;
    categories: QuizCategory[];
    tiles: QuizBoardTile[];           // row-major: level 1 row first
    pickerId: string;
    current?: QuizBoardCurrent | null;
    windowMs: number;                 // question timer length
    endsAt?: number | null;           // server-clock ms when the timer runs out
    isPaused?: boolean;
    // 'host' = paused by the host's button; 'away' = paused automatically
    // because a player dropped out (and resumed automatically when back).
    pauseReason?: 'host' | 'away' | null;
    pausedRemainingMs?: number | null;
    // Players the host chose to continue without while they were offline:
    // playerId -> their last check-in at that moment (see usePresence).
    awayIgnored?: Record<string, number>;
    lockEndsAt?: number | null;
    // Firestore's own time at the last timer write, and what the writing
    // phone believed the time was. The gap is that phone's clock error,
    // which every phone takes off endsAt / lockEndsAt (see deadlineOf).
    clockAt?: Timestamp | null;
    clockWriterNow?: number | null;
    clockFor?: number | null;         // the endsAt / lockEndsAt that stamp belongs to
    forceEnded?: boolean;
    buzzes: Record<string, Timestamp | number | null>;  // player -> server time
    picks: Record<string, { option: number; at: Timestamp | number | null }>;
    money: Record<string, number>;    // this game's rupees per player
    rounds: QuizBoardRound[];
    pointsAwarded?: boolean;
};


// ── ⚖️ COURT OF THIEVES ─────────────────────────────────────────────
// Hidden roles + a blackout heist + secret deals. Every purse holds real
// and fake (counterfeit) rupees; only real rupees count at the end. The
// Thief's payday is fake. See games/court-of-thieves/logic/engine.ts.
export type CotRole = 'thief' | 'police' | 'judge' | 'advocate' | 'citizen';
export type CotMoney = { real: number; fake: number };
export type CotPhase = 'roles' | 'outage' | 'lights' | 'deals' | 'arrest' | 'trial' | 'verdict' | 'roundEnd' | 'over';
// Where the Thief is: 'home' (their own seat) or a player's id (at that bag).
export type CotSpot = string;
export type CotHeistAction =
    | { k: 'move'; from: CotSpot; to: CotSpot; mode: 'walk' | 'tiptoe'; at: number; until: number }
    | { k: 'take'; bag: string; amount: number; at: number; until: number }
    | { k: 'plant'; bag: string; amount: number; at: number; until: number };
export type CotOfferKind = 'hush' | 'demand' | 'reveal';
export type CotOfferStatus = 'open' | 'now' | 'later' | 'refused' | 'failed';
export type CotMsg = {
    id: string;
    from: string;                     // playerId
    at: number;
    tpl: string;                      // template id (logic/templates.ts)
    amount?: number;
    about?: string;                   // a player the message names
    offer?: { kind: CotOfferKind; status: CotOfferStatus };
};
export type CotThread = {
    id: string;
    a: string;                        // started it
    b: string;                        // received it
    to: string;                       // how A addressed B: a role ('thief'…), 'witness', or 'player'
    bKnowsA?: boolean;                // B has learned who A is
    aKnowsB?: boolean;                // A has learned who B is (true when addressed by name)
    msgs: CotMsg[];
};
export type CotPromise = { from: string; to: string; amount: number; why: string };
export type CotSpeaker = { id: string; as: 'police' | 'advocate' | 'accused' };
export type CotTrial = {
    accused: string;
    policeId: string;
    judgeId: string;                  // the Judge, or the Advocate standing in if the Judge is on trial
    speakers: CotSpeaker[];           // in order; the accused always speaks last
    turn: number;
};
export type CotPayout = { id: string; amount: number; why: string };   // + gained, − lost
export type CotRoundResult = {
    round: number;
    thiefId: string;
    caught: boolean;                  // red-handed
    seen: boolean;                    // the thief was visible in the early-lights window
    witnessIds: string[];
    stolen: Record<string, number>;   // victim -> rupees taken (net, after the round)
    planted: Record<string, CotMoney>;// target -> money planted
    loot: CotMoney;                   // what reached the Thief's purse
    before: Record<string, number>;   // balances shown before the outage
    after: Record<string, number>;    // balances shown at lights-on (then after the round)
    notes: string[];
    // the court (stage 2)
    policeId?: string;
    accused?: string | null;          // null = no arrest
    judgeId?: string;
    guilty?: boolean;
    convicted?: boolean;              // the real Thief, found guilty
    payouts?: CotPayout[];
};
export type CotGameState = {
    game: 'court-of-thieves';
    phase: CotPhase;
    round: number;
    roundsTotal: number;
    dealMs: number;
    seats: string[];                  // seating order round the room (also the colour order)
    roles: Record<string, CotRole>;   // this round
    purse: Record<string, CotMoney>;
    phaseEndsAt?: number;             // server-clock ms when a timed phase ends
    // the outage
    outageAt?: number;                // lights go out (server ms)
    lightsAt?: number;                // lights come back
    flashes?: number[];               // ⚡ lightning (server ms)
    witnessIds?: string[];            // early lights, 3 s before lightsAt
    heist?: CotHeistAction[];
    // the deal phase
    threads?: CotThread[];
    lastSentAt?: Record<string, number>;
    promises?: CotPromise[];          // "pay on acquittal"
    supporters?: Record<string, boolean>; // took money from the Thief this round
    thiefPaid?: Record<string, CotMoney>;  // what each one got from the Thief (paid now)
    // the court
    picks?: Record<string, string>;   // everyone's secret suspect ('none' = nobody); only the Police's arrests
    trial?: CotTrial;
    roundStartPurse?: Record<string, CotMoney>; // before this round's payday (to undo an abandoned round)
    last?: CotRoundResult;
    history?: CotRoundResult[];
    seq: number;
    endedEarly?: boolean;
    pointsAwarded?: boolean;
};


// ── ✏️ MATCH THE FOLLOWING ───────────────────────────────────────────
// Everyone answers a situation (typed, max 50 characters, or a preset),
// then each phone draws lines between names and answers, like the school
// exam section. See games/match-the-following/logic/engine.ts.
export type MtfPhase = 'answer' | 'match' | 'reveal' | 'roundEnd' | 'over';
export type MtfSpice = 1 | 2;               // a question's level: wholesome · cheeky
export type MtfDeck = 'wholesome' | 'cheeky' | 'tricky'; // the host's pick (cheeky includes wholesome; tricky = only the dilemmas)
export type MtfAnswer = { text: string; preset?: boolean; at: number };
export type MtfRoundResult = {
    round: number;
    questionId: string;
    prompt: string;
    answers: Record<string, MtfAnswer | null>;      // null = no answer in time
    correct: Record<string, number>;                // viewer -> correct lines this round
    lines: Record<string, number>;                  // viewer -> lines they had to draw
    fooled: Record<string, number>;                 // author -> people who matched them wrong
    readBy: Record<string, number>;                 // author -> people who matched them right
    revealOrder: string[];                          // authors, in the order their answers are revealed
};
export type MtfGameState = {
    game: 'match-the-following';
    phase: MtfPhase;
    round: number;
    roundsTotal: number;
    deck: MtfDeck;
    seats: string[];                                // the players, in colour order
    questionId: string;
    prompt: string;
    presets: string[];
    usedQuestionIds: string[];
    answers: Record<string, MtfAnswer>;
    targets: Record<string, string[]>;              // viewer -> whose names are on their board
    order: Record<string, string[]>;                // viewer -> the answer column's order (author ids)
    lines: Record<string, Record<string, string>>;  // viewer -> name -> answer (author id)
    locked: Record<string, boolean>;
    boardRev?: Record<string, number>;              // viewer -> the newest board save applied (older saves are ignored)
    phaseEndsAt?: number;                           // server-clock ms
    revealAt?: number;                              // the reveal's start (steps are timed from it)
    revealStepMs?: number;                          // each answer's reveal (shorter in big groups)
    score: Record<string, number>;                  // this game's points
    fooledTotal: Record<string, number>;
    readByTotal: Record<string, number>;
    seenTotal: Record<string, number>;              // how many boards each author appeared on
    last?: MtfRoundResult;
    history?: MtfRoundResult[];
    seq: number;
    endedEarly?: boolean;
    pointsAwarded?: boolean;
};
