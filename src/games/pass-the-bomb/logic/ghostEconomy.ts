import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../../../shared/firebase/config';
import { BombGameState } from '../../../shared/types';
import { applyFusePoints, applyLifeGain } from './bombHelpers';

// ── TUNING ────────────────────────────────────────────────────────────────
export const GHOST_STIPEND_FP = 3;          // FP a ghost receives for each round it sits out (placeholder)
export const GHOST_DEBT_FORGIVEN = true;    // a ghost's negative FP is wiped the first time the stipend lands
export const LIFE_BASE_PRICE = 100;         // price of the first life you buy...
export const LIFE_PRICE_STEP = 50;          // ...and how much each later purchase adds (100, 150, 200...)
export const LIFE_PURCHASE_GHOSTS_ONLY = false; // false: anyone below 3 lives can buy one
const MAX_LIVES = 3;

export const lifePrice = (purchasesSoFar: number): number =>
    LIFE_BASE_PRICE + LIFE_PRICE_STEP * purchasesSoFar;

// ── GHOST STIPEND ─────────────────────────────────────────────────────────
// Host calls this as the next round starts. Every ghost is about to sit that
// round out, so each gets the stipend. A transaction with a per-round stamp,
// so calling it twice can't pay twice. (Not paid before the final duel — the
// game is ending and FP is worthless by then.)
export const payGhostStipends = async (groupId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const gameState = snap.data().gameState as BombGameState;
            if (gameState.ghosts.length === 0) return;
            if (gameState.stipendPaidForRound === gameState.roundNumber) return;

            const updates: Record<string, unknown> = {
                'gameState.stipendPaidForRound': gameState.roundNumber,
            };
            for (const id of gameState.ghosts) {
                const fp = gameState.fusePoints?.[id] ?? 0;
                const debt = GHOST_DEBT_FORGIVEN && fp < 0 ? -fp : 0;
                applyFusePoints(updates, gameState, id, GHOST_STIPEND_FP + debt, 'Ghost stipend');
            }
            transaction.update(groupRef, updates);
        });
    } catch {
        // transient contention — a missed stipend is not worth failing a round start over
    }
};

// ── BUY A LIFE ────────────────────────────────────────────────────────────
// Between rounds only, one per player per break, price rising with each
// purchase. A ghost comes back with one life at the start of the next round;
// a living player just gains one (up to 3).
export type BuyLifeResult = { success: boolean; reason?: string; price?: number };

export const buyLife = async (groupId: string, playerId: string): Promise<BuyLifeResult> => {
    const groupRef = doc(db, 'groups', groupId);
    let result: BuyLifeResult = { success: false, reason: 'error' };

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
            if (!players.some((p) => p.id === playerId)) {
                result = { success: false, reason: 'not-in-game' };
                return;
            }
            const activeCount = players.filter((p) => !gameState.ghosts.includes(p.id)).length;
            if (activeCount <= 1) {
                result = { success: false, reason: 'game-over' }; // a winner already stands
                return;
            }
            const isGhost = gameState.ghosts.includes(playerId);
            if (LIFE_PURCHASE_GHOSTS_ONLY && !isGhost) {
                result = { success: false, reason: 'ghosts-only' };
                return;
            }
            if ((gameState.lives[playerId] ?? 0) >= MAX_LIVES) {
                result = { success: false, reason: 'full-lives' };
                return;
            }
            if (gameState.lifeBoughtRound?.[playerId] === gameState.roundNumber) {
                result = { success: false, reason: 'one-per-break' };
                return;
            }

            const purchases = gameState.lifePurchases?.[playerId] ?? 0;
            const price = lifePrice(purchases);
            if ((gameState.fusePoints?.[playerId] ?? 0) < price) {
                result = { success: false, reason: 'not-enough-fp', price };
                return;
            }

            const updates: Record<string, unknown> = {};
            applyFusePoints(updates, gameState, playerId, -price, 'Bought a life');
            applyLifeGain(updates, gameState, playerId);
            updates[`gameState.lifePurchases.${playerId}`] = purchases + 1;
            updates[`gameState.lifeBoughtRound.${playerId}`] = gameState.roundNumber;
            transaction.update(groupRef, updates);
            result = { success: true, price };
        });
    } catch {
        result = { success: false, reason: 'error' };
    }
    return result;
};