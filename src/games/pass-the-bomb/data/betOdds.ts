import type { BetMarket } from '../../../shared/types';

// ── TUNING — everything adjustable lives here ─────────────────────────────
// ASSUMPTION: the share of rounds that end in an explosion. Only the round
// bets use it (first-ghost odds don't depend on it). Tune from real play.
export const BOOM_RATE = 0.55;

export const MULT_FLOOR = 1.1;    // no bet pays less than this
export const NO_BET_ABOVE = 0.9;  // an outcome this likely is basically decided: no betting on it
export const MIN_STAKE = 5;
export const BET_CHARGES_PER_TICKET = 3; // one Betting Ticket pays for this many match bets
export const SELF_LOSE_CAP = 1.25; // ceiling when you bet on YOURSELF to lose a life / be the first ghost

// LIMITS GROW WITH THE NUMBER OF PLAYERS STILL IN. More players means longer
// odds, so bigger wins are fair — and as players drop out the limits shrink
// again, which keeps late bets small. Each has a floor so a 3-player game
// still has sensible limits.
export const CAP_PER_PLAYER = 2;      // top multiplier = 2 x players ...
export const MIN_MULT_CAP = 5;        // ... never below this
export const PROFIT_PER_PLAYER = 20;  // most FP one bet can win = 20 x players
export const STAKE_PER_PLAYER = 8;    // biggest stake = 8 x players ...
export const MIN_MAX_STAKE = 25;      // ... never below this

export const BET_SCORE_RATE = 0.1;  // share of a bet's PROFIT that also counts toward leaderboard points
export const BET_SCORE_CAP = 10;    // most leaderboard points betting can earn a player in one game

// GAME-WINNER BET: pays leaderboard points only (FP can't be spent once the
// game is over). Your FP stake stays locked until the game ends.
export const WINNER_FLATTEN = 0.3;      // share of an "even field" blended into the odds: lives can come back
export const WINNER_BET_SCORE_CAP = 12; // most leaderboard points one winner bet can pay (its own cap)

// Bets that stay open across rounds instead of covering just the next one.
export const isGameLongMarket = (market: BetMarket): boolean =>
    market === 'first-ghost' || market === 'next-ghost' || market === 'game-winner';

export const multiplierCap = (players: number): number =>
    Math.max(MIN_MULT_CAP, CAP_PER_PLAYER * players);
export const maxProfit = (players: number): number => PROFIT_PER_PLAYER * players;
export const maxStakeLimit = (players: number): number =>
    Math.max(MIN_MAX_STAKE, STAKE_PER_PLAYER * players);

// ── ODDS ──────────────────────────────────────────────────────────────────
// Payout = fair odds (1 ÷ chance) kept between a floor and a cap, always
// rounded DOWN to 0.1 so rounding can never favour the bettor.
export const multiplierFor = (chance: number, cap: number = MIN_MULT_CAP): number | null =>
    chance > NO_BET_ABOVE
        ? null
        : Math.floor(Math.min(cap, Math.max(MULT_FLOOR, 1 / chance)) * 10 + 1e-9) / 10;
const ghostMemo = new Map<string, number[]>();

// Chance that each player is the FIRST to run out of lives. Every life lost
// hits a random active player, so this depends only on everyone's lives.
export const firstGhostChances = (lives: number[]): number[] => {
    const key = lives.join(',');
    const cached = ghostMemo.get(key);
    if (cached) return cached;

    const n = lives.length;
    const result = new Array<number>(n).fill(0);
    for (let j = 0; j < n; j++) {
        if (lives[j] <= 1) {
            result[j] += 1 / n;
        } else {
            const next = lives.slice();
            next[j] -= 1;
            const sub = firstGhostChances(next);
            for (let i = 0; i < n; i++) result[i] += sub[i] / n;
        }
    }
    ghostMemo.set(key, result);
    return result;
};


const winnerMemo = new Map<string, number[]>();

// Chance that each player wins the whole game, from everyone's lives. Two
// players left is the final duel, treated as 50/50. In this model lives only
// ever go down, which is why the odds are flattened a little (WINNER_FLATTEN).
export const winnerChances = (lives: number[]): number[] => {
    const key = lives.join(',');
    const cached = winnerMemo.get(key);
    if (cached) return cached;

    const active = lives.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
    const result = new Array<number>(lives.length).fill(0);
    if (active.length === 1) {
        result[active[0]] = 1;
    } else if (active.length === 2) {
        result[active[0]] = 0.5;
        result[active[1]] = 0.5;
    } else {
        for (const j of active) {
            const next = lives.slice();
            next[j] -= 1;
            const sub = winnerChances(next);
            for (let i = 0; i < lives.length; i++) result[i] += sub[i] / active.length;
        }
    }
    winnerMemo.set(key, result);
    return result;
};

// ── MARKETS ───────────────────────────────────────────────────────────────
export type BetOptionView = {
    pick: string;
    chance: number;
    multiplier: number | null; // null = closed (practically decided)
};

export type BetMarketView = {
    market: BetMarket;
    options: BetOptionView[];
    closedReason?: string;
};

export type BetContext = {
    bettorId: string;
    activePlayerIds: string[];
    lives: Record<string, number>;
    everGhosted: string[];
};

const makeOption = (pick: string, chance: number, selfLose: boolean, cap: number): BetOptionView => {
    const base = multiplierFor(chance, cap);
    // Betting on yourself to lose is allowed, but it pays next to nothing —
    // far less than the life you'd have to throw away to collect.
    const multiplier = base === null ? null : selfLose ? Math.min(base, SELF_LOSE_CAP) : base;
    return { pick, chance, multiplier };
};

export const buildMarkets = (ctx: BetContext): BetMarketView[] => {
    const active = ctx.activePlayerIds.filter((id) => (ctx.lives[id] ?? 0) > 0);
    const n = active.length;
    const cap = multiplierCap(n);
    const roundClosed = n < 3 ? 'The final duel is next' : undefined;

    const boomOrDefuse: BetMarketView = {
        market: 'boom-or-defuse',
        closedReason: roundClosed,
        options: [
            makeOption('boom', BOOM_RATE, false, cap),
            makeOption('defuse', 1 - BOOM_RATE, false, cap),
        ],
    };

    const roundVictim: BetMarketView = {
        market: 'round-victim',
        closedReason: roundClosed,
        options: [
            ...active.map((id) => makeOption(id, BOOM_RATE / Math.max(n, 1), id === ctx.bettorId, cap)),
            makeOption('nobody', 1 - BOOM_RATE, false, cap),
        ],
    };

    const ghostChances = n > 0 ? firstGhostChances(active.map((id) => ctx.lives[id])) : [];
    const firstGhost: BetMarketView = {
        market: 'first-ghost',
        closedReason: ctx.everGhosted.length > 0 ? 'There is already a ghost' : undefined,
        options: active.map((id, i) => makeOption(id, ghostChances[i], id === ctx.bettorId, cap)),
    };

    // Once the first ghost exists, "first ghost" closes and this takes over:
    // who is the NEXT player to run out of lives? Same odds, same lives.
    const nextGhost: BetMarketView = {
        market: 'next-ghost',
        closedReason:
            ctx.everGhosted.length === 0
                ? 'No ghost yet — bet on the first ghost instead'
                : n < 3
                    ? 'The final duel is next'
                    : undefined,
        options: active.map((id, i) => makeOption(id, ghostChances[i], id === ctx.bettorId, cap)),
    };

    const winnerRaw = n > 0 ? winnerChances(active.map((id) => ctx.lives[id])) : [];
    const gameWinner: BetMarketView = {
        market: 'game-winner',
        closedReason: n < 2 ? 'The game is over' : undefined,
        options: active.map((id, i) =>
            makeOption(id, (1 - WINNER_FLATTEN) * winnerRaw[i] + WINNER_FLATTEN / n, false, cap)
        ),
    };

    return [boomOrDefuse, roundVictim, firstGhost, nextGhost, gameWinner];
}
// Largest stake allowed: the table limit, what the player can afford, and
// the most FP a single bet may win at this multiplier.
// Largest stake allowed: the limit for this many players, what the player
// can afford, and the most FP a single bet may win at this multiplier.
export const maxStakeFor = (multiplier: number, fp: number, players: number): number =>
    Math.max(
        0,
        Math.min(
            maxStakeLimit(players),
            Math.floor(maxProfit(players) / Math.max(multiplier - 1, 0.1)),
            Math.floor(fp)
        )
    );
// ── SETTLING ──────────────────────────────────────────────────────────────
export type BetOutcome = {
    explodedPlayerId?: string; // set whenever the round resolved (defuse or boom)
    defused?: boolean;
    firstGhostId?: string;
    gameWinnerId?: string;
};

// The winning pick for a market, or null if the outcome isn't known.
export const winningPick = (market: BetMarket, outcome: BetOutcome): string | null => {
    switch (market) {
        case 'boom-or-defuse':
            return outcome.explodedPlayerId === undefined ? null : outcome.defused ? 'defuse' : 'boom';
        case 'round-victim':
            return outcome.explodedPlayerId === undefined
                ? null
                : outcome.defused
                    ? 'nobody'
                    : outcome.explodedPlayerId;
        case 'first-ghost':
            return outcome.firstGhostId ?? null;
        case 'game-winner':
            return outcome.gameWinnerId ?? null;
        default:
            return null;
    }
};

export const payoutFor = (stake: number, multiplier: number): number =>
    Math.floor(stake * multiplier + 1e-9);

// Leaderboard points from a win: a share of the PROFIT, within the
// per-game cap.
export const scoreFor = (profit: number, earnedSoFar: number): number =>
    Math.max(0, Math.min(Math.floor(profit * BET_SCORE_RATE + 1e-9), BET_SCORE_CAP - earnedSoFar));

// Leaderboard points from a correct game-winner bet: the same share of PROFIT
// as other bets, but with its own cap so it doesn't use up the ordinary one.
export const winnerBetPoints = (profit: number): number =>
    Math.max(0, Math.min(Math.floor(profit * BET_SCORE_RATE + 1e-9), WINNER_BET_SCORE_CAP));