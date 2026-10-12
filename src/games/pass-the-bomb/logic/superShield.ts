// ── BARELY-USED SHIELD (duel shield) ──────────────────────────────
// The upgraded Second-Hand Shield. Works only in the final duel (Hot
// Potato, Fastest Finger, Hot Seat). Armed between duel rounds, hidden.
// If the bomb goes off on you that round, you keep your life — but the
// round still counts as your opponent's (they score).
//
// Earned, not just bought: each time a Second-Hand Shield saves you from a
// genuine WRONG CUT in the main game, you get one credit (letting the clock
// run out with no wire saves your life but earns nothing — otherwise you
// could unlock it just by sitting on the bomb). Each Barely-Used Shield you
// buy spends a credit. At most SUPER_SHIELD_MAX_PER_GAME per player per game.

import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../../../shared/firebase/config';
import { Group, BombGameState } from '../../../shared/types';
import { applyMissionEvent } from './missionEngine';


export const SUPER_SHIELD_PRICE = 60;
export const SUPER_SHIELD_MAX_PER_GAME = 2;

// Called inside a duel explosion transaction. If the victim has a
// Barely-Used Shield active this round, it's used up and the caller must
// skip the life loss. Returns true when the shield held.
export const applySuperShield = (
    updates: Record<string, unknown>,
    gs: BombGameState,
    victim: string
): boolean => {
    const active = gs.roundDuelShields ?? [];
    if (!active.includes(victim)) return false;
    updates['gameState.roundDuelShields'] = active.filter((id) => id !== victim);
    updates['gameState.duelShieldAbsorbedPlayerId'] = victim;
    return true;
};

type Result = { success: boolean; reason?: string };

export const purchaseSuperShield = async (group: Group, playerId: string): Promise<Result> => {
    const groupRef = doc(db, 'groups', group.id);
    let result: Result = { success: false };

    await runTransaction(db, async (transaction) => {
        result = { success: false, reason: 'not-found' };
        const snap = await transaction.get(groupRef);
        if (!snap.exists()) return;
        const gs = snap.data().gameState as BombGameState;

        const credits = gs.superShieldCredits?.[playerId] ?? 0;
        const bought = gs.superShieldBought?.[playerId] ?? 0;
        const fp = gs.fusePoints?.[playerId] ?? 0;

        if (credits <= 0) {
            result = { success: false, reason: 'locked' };
            return;
        }
        if (bought >= SUPER_SHIELD_MAX_PER_GAME) {
            result = { success: false, reason: 'sold-out' };
            return;
        }
        if (fp < SUPER_SHIELD_PRICE) {
            result = { success: false, reason: 'insufficient-fp' };
            return;
        }

        const updates: Record<string, unknown> = {
            [`gameState.fusePoints.${playerId}`]: fp - SUPER_SHIELD_PRICE,
            [`gameState.superShieldCredits.${playerId}`]: credits - 1,
            [`gameState.superShieldBought.${playerId}`]: bought + 1,
            [`gameState.superShieldItems.${playerId}`]:
                (gs.superShieldItems?.[playerId] ?? 0) + 1,
        };

        const gsAfter = { ...gs, fusePoints: { ...gs.fusePoints, [playerId]: fp - SUPER_SHIELD_PRICE } };
        applyMissionEvent(updates, gsAfter, group.players, playerId, { kind: 'bought-item', playerId });

        transaction.update(groupRef, updates);
        result = { success: true };
    });
    return result;
};

// Arm for the NEXT duel round. Only between rounds, only when the next
// round is a duel (exactly 2 players left), only one at a time.
export const armSuperShield = async (group: Group, playerId: string): Promise<Result> => {
    const groupRef = doc(db, 'groups', group.id);
    let result: Result = { success: false };

    await runTransaction(db, async (transaction) => {
        result = { success: false, reason: 'not-allowed' };
        const snap = await transaction.get(groupRef);
        if (!snap.exists()) return;
        const gs = snap.data().gameState as BombGameState;

        if (gs.phase !== 'replay') return;
        if (gs.ghosts.includes(playerId)) return;
        const active = group.players.filter((p) => !gs.ghosts.includes(p.id));
        if (active.length !== 2) {
            result = { success: false, reason: 'not-a-duel' };
            return;
        }
        if ((gs.duelShieldArmed ?? []).includes(playerId)) {
            result = { success: false, reason: 'already-armed' };
            return;
        }
        const owned = gs.superShieldItems?.[playerId] ?? 0;
        if (owned <= 0) {
            result = { success: false, reason: 'none-owned' };
            return;
        }

        transaction.update(groupRef, {
            [`gameState.superShieldItems.${playerId}`]: owned - 1,
            'gameState.duelShieldArmed': [...(gs.duelShieldArmed ?? []), playerId],
        });
        result = { success: true };
    });
    return result;
};