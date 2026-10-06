import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../../../shared/firebase/config';
import { addScore } from '../../../shared/firebase/groups';
import { Group, BombGameState, MatchBet, BetMarket } from '../../../shared/types';
import {
    buildMarkets,
    maxStakeFor,
    winningPick,
    payoutFor,
    scoreFor,
    MIN_STAKE,
    BET_CHARGES_PER_TICKET,
    winnerBetPoints,
    isGameLongMarket
} from '../data/betOdds';
import { applyFusePoints } from './bombHelpers';

type PlaceResult = { success: boolean; reason?: string; multiplier?: number };

// Keeps every open bet and only the most recent settled ones, so the game
// document doesn't grow without limit.
const trimBets = (bets: MatchBet[]): MatchBet[] => [
    ...bets.filter((b) => b.status !== 'open').slice(-40),
    ...bets.filter((b) => b.status === 'open'),
];

// ── PLACE A BET ───────────────────────────────────────────────────────────
// Only between rounds. The multiplier is worked out HERE from the live game
// state and locked into the bet — the client never supplies it. The stake is
// taken out of the bettor's FP straight away (held until the bet settles).
export const placeMatchBet = async (
    groupId: string,
    bettorId: string,
    market: BetMarket,
    pick: string,
    stake: number
): Promise<PlaceResult> => {
    const groupRef = doc(db, 'groups', groupId);
    let result: PlaceResult = { success: false, reason: 'error' };

    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(groupRef);
            if (!snap.exists()) {
                result = { success: false, reason: 'not-found' };
                return;
            }
            const data = snap.data();
            const gameState = data.gameState as BombGameState;
            const players = (data.players ?? []) as { id: string }[];

            if (gameState.phase !== 'replay') {
                result = { success: false, reason: 'between-rounds-only' };
                return;
            }
            if (!players.some((p) => p.id === bettorId)) {
                result = { success: false, reason: 'not-in-game' };
                return;
            }

            const activeIds = players
                .map((p) => p.id)
                .filter((id) => !gameState.ghosts.includes(id));
            const view = buildMarkets({
                bettorId,
                activePlayerIds: activeIds,
                lives: gameState.lives,
                everGhosted: gameState.everGhosted ?? [],
            }).find((m) => m.market === market);

            if (!view || view.closedReason) {
                result = { success: false, reason: 'market-closed' };
                return;
            }
            const option = view.options.find((o) => o.pick === pick);
            if (!option || option.multiplier === null) {
                result = { success: false, reason: 'option-unavailable' };
                return;
            }

            // A Betting Ticket pays for BET_CHARGES_PER_TICKET match bets. The first
            // bet turns a ticket into that many "charges"; the rest use them up.
            const tickets = gameState.bettingTickets?.[bettorId] ?? 0;
            const charges = gameState.betCharges?.[bettorId] ?? 0;
            if (charges <= 0 && tickets <= 0) {
                result = { success: false, reason: 'no-ticket' };
                return;
            }

            const fp = gameState.fusePoints?.[bettorId] ?? 0;
            if (!Number.isInteger(stake) || stake < MIN_STAKE) {
                result = { success: false, reason: 'stake-too-low' };
                return;
            }
            if (stake > fp) {
                result = { success: false, reason: 'not-enough-fp' };
                return;
            }
            if (stake > maxStakeFor(option.multiplier, fp, activeIds.length)) {
                result = { success: false, reason: 'stake-too-high' };
                return;
            }

            // One open bet per market (round markets: per round).
            const forRound = isGameLongMarket(market) ? undefined : gameState.roundNumber + 1;
            const bets = gameState.matchBets ?? [];
            const already = bets.some(
                (b) =>
                    b.bettorId === bettorId &&
                    b.market === market &&
                    b.status === 'open' &&
                    b.forRound === forRound
            );
            if (already) {
                result = { success: false, reason: 'already-bet' };
                return;
            }

            // Firestore rejects undefined, so forRound is only set when it exists.
            const bet: MatchBet = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                bettorId,
                market,
                pick,
                stake,
                multiplier: option.multiplier,
                status: 'open',
                placedAt: Date.now(),
            };
            if (forRound !== undefined) bet.forRound = forRound;

            // "Next ghost" bets only count ghostings that happen AFTER this moment.
            if (market === 'next-ghost') bet.afterEvent = (gameState.ghostEvents ?? []).length;

            const updates: Record<string, unknown> = {};
            applyFusePoints(updates, gameState, bettorId, -stake, 'Bet placed');
            if (charges > 0) {
                updates[`gameState.betCharges.${bettorId}`] = charges - 1;
            } else {
                updates[`gameState.bettingTickets.${bettorId}`] = tickets - 1;
                updates[`gameState.betCharges.${bettorId}`] = BET_CHARGES_PER_TICKET - 1;
            }
            updates['gameState.matchBets'] = trimBets([...bets, bet]);
            transaction.update(groupRef, updates);
            result = { success: true, multiplier: option.multiplier };
        });
    } catch {
        result = { success: false, reason: 'error' };
    }
    return result;
};

// ── SETTLE (host calls this from the replay screen) ───────────────────────
// Safe to call as often as you like: a bet only ever settles once. A round
// bet settles in the replay of the round it covered; a first-ghost bet
// settles in the first replay after a ghost exists. A round bet that can't
// be judged (the round was force-ended, or it's from an earlier round) is
// refunded.
export const settleBets = async (group: Group): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    const awards: { playerId: string; points: number }[] = [];

    try {
        await runTransaction(db, async (transaction) => {
            awards.length = 0; // a retried attempt starts clean

            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const gameState = snap.data().gameState as BombGameState;
            const bets = gameState.matchBets ?? [];
            if (gameState.phase !== 'replay' || !bets.some((b) => b.status === 'open')) return;

            const outcome = {
                explodedPlayerId: gameState.explodedPlayerId,
                defused: gameState.defused,
                firstGhostId: (gameState.everGhosted ?? [])[0],
            };
            const updates: Record<string, unknown> = {};
            const earned = { ...(gameState.betScoreEarned ?? {}) };
            const chargeRefunds: Record<string, number> = {};
            const settledRound = gameState.roundNumber;
            let changed = false;

            const settled = bets.map((bet): MatchBet => {
                if (bet.status !== 'open') return bet;
                if (bet.market === 'game-winner') return bet; // settles when the game ends

                let verdict: 'won' | 'lost' | 'void' | 'wait';
                if (bet.market === 'first-ghost') {
                    const winner = winningPick('first-ghost', outcome);
                    verdict = winner === null ? 'wait' : winner === bet.pick ? 'won' : 'lost';
                } else if (bet.market === 'next-ghost') {
                    // the first ghosting after the bet was placed
                    const next = (gameState.ghostEvents ?? [])[bet.afterEvent ?? 0];
                    verdict = next === undefined ? 'wait' : next === bet.pick ? 'won' : 'lost';
                }
                else {
                    const forRound = bet.forRound ?? 0;
                    if (forRound > gameState.roundNumber) verdict = 'wait';
                    else if (forRound < gameState.roundNumber) verdict = 'void';
                    else {
                        const winner = winningPick(bet.market, outcome);
                        verdict = winner === null ? 'void' : winner === bet.pick ? 'won' : 'lost';
                    }
                }

                if (verdict === 'wait') return bet;
                changed = true;

                if (verdict === 'void') {
                    applyFusePoints(updates, gameState, bet.bettorId, bet.stake, 'Bet refunded');
                    // a voided bet doesn't count against the ticket either
                    chargeRefunds[bet.bettorId] = (chargeRefunds[bet.bettorId] ?? 0) + 1;
                    return { ...bet, status: 'void', settledRound };
                }
                if (verdict === 'lost') return { ...bet, status: 'lost', settledRound };

                const payout = payoutFor(bet.stake, bet.multiplier);
                applyFusePoints(updates, gameState, bet.bettorId, payout, 'Bet won!');
                const points = scoreFor(payout - bet.stake, earned[bet.bettorId] ?? 0);
                earned[bet.bettorId] = (earned[bet.bettorId] ?? 0) + points;
                if (points > 0) awards.push({ playerId: bet.bettorId, points });
                return { ...bet, status: 'won', payout, scorePoints: points, settledRound };
            });

            if (!changed) return;
            for (const [id, n] of Object.entries(chargeRefunds)) {
                updates[`gameState.betCharges.${id}`] = (gameState.betCharges?.[id] ?? 0) + n;
            }
            updates['gameState.matchBets'] = trimBets(settled);
            updates['gameState.betScoreEarned'] = earned;
            transaction.update(groupRef, updates);
        });
    } catch {
        return; // nothing was written, so nothing is awarded
    }

    // Leaderboard points go through the same addScore the rest of the game
    // uses. Each call gets the running totals, so several winners in one
    // settlement can't overwrite each other.
    const scores: Record<string, number> = { ...(group.scores ?? {}) };
    for (const award of awards) {
        try {
            await addScore(group.id, award.playerId, award.points, scores);
            scores[award.playerId] = (scores[award.playerId] ?? 0) + award.points;
        } catch {
            // the FP side is already saved; a missed leaderboard bonus is not worth failing over
        }
    }
};

// ── SETTLE GAME-WINNER BETS (host, when the game ends) ───────────────────
// Called from endBombGame once the winner is known. Pays leaderboard points
// only: the FP stake was held from the moment of the bet, so a wrong guess
// costs that FP and nothing else — no points are ever taken away. Pass the
// running leaderboard totals so the winner's own game-win bonus isn't
// overwritten by a stale snapshot.
export const settleWinnerBets = async (
    group: Group,
    winnerId: string | undefined,
    runningScores?: Record<string, number>
): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    const awards: { playerId: string; points: number }[] = [];

    try {
        await runTransaction(db, async (transaction) => {
            awards.length = 0; // a retried attempt starts clean

            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const gameState = snap.data().gameState as BombGameState;
            const bets = gameState.matchBets ?? [];
            if (gameState.phase !== 'result') return;
            if (!bets.some((b) => b.status === 'open')) return;

            const settled = bets.map((bet): MatchBet => {
                if (bet.status !== 'open') return bet;
                // The game is over: anything still waiting on a future event can
                // never settle, so it is closed out rather than left hanging.
                if (bet.market !== 'game-winner') return { ...bet, status: 'void' };
                if (!winnerId) return { ...bet, status: 'void' };
                if (bet.pick !== winnerId) return { ...bet, status: 'lost' };

                const payout = payoutFor(bet.stake, bet.multiplier);
                const points = winnerBetPoints(payout - bet.stake);
                if (points > 0) awards.push({ playerId: bet.bettorId, points });
                return { ...bet, status: 'won', payout, scorePoints: points };
            });

            transaction.update(groupRef, { 'gameState.matchBets': trimBets(settled) });
        });
    } catch {
        return; // nothing was written, so nothing is awarded
    }

    const scores: Record<string, number> = { ...(runningScores ?? group.scores ?? {}) };
    for (const award of awards) {
        try {
            await addScore(group.id, award.playerId, award.points, scores);
            scores[award.playerId] = (scores[award.playerId] ?? 0) + award.points;
        } catch {
            // a missed leaderboard bonus is not worth failing the end of the game over
        }
    }
};