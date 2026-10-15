import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../../../../shared/firebase/config';
import { Group, PassGameState, PassTicketKind } from '../../../../shared/types';
import { sideOf, walletOf, StoreResult, shopperSide, withReceipt } from './passGame';
import { TICKETS, ticketsAllowed, canHaunt, isRoundTicket } from './passPerks';

// ── LUCKY CENTRE: buy a ticket ────────────────────────────────────────
// Same shopping rules as the Kiosk: alive, not holding the bomb. Solo play
// only, one ticket at a time. Tickets go on your public receipts.
export const buyLuckyTicket = async (
    group: Group,
    playerId: string,
    kind: PassTicketKind
): Promise<StoreResult> => {
    const groupRef = doc(db, 'groups', group.id);
    let result: StoreResult = 'error';
    try {
        await runTransaction(db, async (tx) => {
            result = 'not-allowed';
            if (!(kind in TICKETS)) return; // unknown ticket — refuse cleanly
            const snap = await tx.get(groupRef);
            if (!snap.exists()) return;
            const gs = snap.data().gameState as PassGameState | undefined;
            if (gs?.mode !== 'pass' || !ticketsAllowed(gs)) return;
            const side = shopperSide(gs, playerId);
            if (!side) return;
            if (gs.tickets?.[side]) return; // one at a time
            // Round tickets only between rounds — they cover the next round.
            if (isRoundTicket(kind) && gs.phase !== 'pass-exploded') return;

            const def = TICKETS[kind];
            const funds = walletOf(gs, side);
            if (funds < def.price) {
                result = 'insufficient';
                return;
            }
            tx.update(groupRef, {
                [`gameState.wallet.${side}`]: funds - def.price,
                [`gameState.tickets.${side}`]: { kind, progress: 0, round: gs.round },
                [`gameState.receipts.${side}`]: withReceipt(gs, side, {
                    item: 'ticket',
                    ticketKind: kind,
                    byPlayerId: playerId,
                    round: gs.round,
                }),
            });
            result = 'ok';
        });
    } catch (e) {
        if (__DEV__) console.warn('[buyLuckyTicket] failed', e);
        result = 'error';
    }
    return result;
};

// ── GHOSTS: haunt the current holder ──────────────────────────────────
// First ghost to tap gets this turn. Lasts until the bomb moves on.
export const hauntHolder = async (group: Group, playerId: string): Promise<boolean> => {
    const groupRef = doc(db, 'groups', group.id);
    let ok = false;
    try {
        await runTransaction(db, async (tx) => {
            ok = false;
            const snap = await tx.get(groupRef);
            if (!snap.exists()) return;
            const gs = snap.data().gameState as PassGameState | undefined;
            if (gs?.mode !== 'pass') return;
            const side = sideOf(gs, playerId);
            if (!canHaunt(gs, side)) return;

            tx.update(groupRef, {
                'gameState.haunt': { ghostId: side, stint: gs.stint ?? 0, byPlayerId: playerId },
            });
            ok = true;
        });
    } catch (e) {
        if (__DEV__) console.warn('[hauntHolder] failed', e);
    }
    return ok;
};