import { Timestamp } from 'firebase/firestore';
import type { QuizCategory } from '../quiz'

export type Player = {
    id: string;
    name: string;
    isHost: boolean;
    isReady: boolean;
};

export type GameType = 'imposter' | 'stop-the-timer' | 'pass-the-bomb' | 'quiz-board' | 'card-clash';

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
    // The same points split by game (session leaderboard slides).
    gameScores?: Partial<Record<GameType, Record<string, number>>>;
    currentGame: GameType | 'menu';
    status: GameStatus;
    gameState: ImposterGameState | TimerGameState | BombGameState | PassGameState | QuizBoardGameState | ClashGameState;
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
export type ClashPhase = 'calling' | 'answering' | 'reveal' | 'defending' | 'over';
export type ClashCall = {
    stage: 'clash' | 'defence';
    statKey: string;
    by: string;                      // the caller (clash) or defender (defence)
    wildcard?: boolean;
    auto?: boolean;
    waitingFor: string[];            // players who still need to tap CLASH!
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
    // Stats each player has called and can't call again until they've
    // called all 10 (then they all unlock). Not used on a gold card.
    scratched?: Record<string, Record<string, boolean>>;
    called?: ClashCall;              // set during 'answering'
    ready?: Record<string, boolean>; // playerId -> tapped CLASH!
    streak?: { playerId: string; count: number }; // calls in a row by one player
    passedCall?: { round: number; from: string; to: string; pool: string[] }; // 🎁 the latest pass
    outRound?: Record<string, number>; // playerId -> the round they ran out of cards
    last?: ClashResult;
    gold?: Record<string, boolean>;  // ★ card id -> true
    defence?: ClashDefence;          // set from the losing clash until the defence is called
    endedEarly?: boolean;
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
