// 🃏💰 Clash Hold'em: Firestore side. Every move runs the pure engine
// (engine.ts) inside a transaction guarded by phase + hand + seq, so a
// double tap or two phones acting at once can't apply anything twice.
import { doc, runTransaction, Transaction } from 'firebase/firestore';
import { db } from '../../../shared/firebase/config';
import { returnToMenu, scoreFields } from '../../../shared/firebase/groups';
import type { Group, HoldemGameState, HoldemMode } from '../../../shared/types';
import type { ClashDeckId } from '../../card-clash/data/types';
import * as E from './engine';

export const CHOOSE_MS = 12000;   // 🎩 dealer's choice
export const TURN_MS = 20000;     // a betting turn
export const SHOWDOWN_MS = 9000;  // showdown result (plus a little per sudden-death stat)
export const FOLDWIN_MS = 4500;   // everyone folded: short beat

export const isHoldemState = (gs: unknown): gs is HoldemGameState =>
    !!gs && (gs as { game?: string }).game === 'clash-holdem';

// Firestore refuses undefined values anywhere in a document.
const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const read = async (tx: Transaction, groupId: string) => {
    const groupRef = doc(db, 'groups', groupId);
    const snap = await tx.get(groupRef);
    if (!snap.exists()) return null;
    const data = snap.data() as Group;
    if (!isHoldemState(data.gameState)) return null;
    return { groupRef, data, gs: data.gameState };
};

export const showdownMs = (gs: HoldemGameState): number =>
    gs.last?.noShowdown ? FOLDWIN_MS : SHOWDOWN_MS + 1500 * (gs.last?.suddenDeath?.length ?? 0);

// ── Start ────────────────────────────────────────────────────────────
export const startHoldem = async (
    group: Group,
    deck: ClashDeckId,
    hands: number,
    modeSetting: HoldemGameState['modeSetting']
): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const groupRef = doc(db, 'groups', group.id);
        const snap = await tx.get(groupRef);
        if (!snap.exists()) return;
        const data = snap.data() as Group;
        if (isHoldemState(data.gameState) && data.gameState.phase !== 'over') return; // already running
        if (data.players.length < 2) return;
        const gs = E.newGame(data.players.map((p) => p.id), deck, hands, modeSetting);
        tx.update(groupRef, { gameState: clean(gs), status: 'playing' });
    });
};

// ── 🎩 Dealer's choice ───────────────────────────────────────────────
export const chooseHoldemMode = async (
    groupId: string,
    playerId: string,
    hand: number,
    mode: HoldemMode | 'auto'
): Promise<void> => {
    try {
        await runTransaction(db, async (tx) => {
            const cur = await read(tx, groupId);
            if (!cur) return;
            const { gs, groupRef } = cur;
            if (gs.phase !== 'choosing' || gs.hand !== hand) return;
            if (mode !== 'auto' && gs.dealerId !== playerId) return;
            tx.update(groupRef, { gameState: clean(E.chooseMode(gs, mode === 'auto' ? 'draw' : mode)) });
        });
    } catch (e) {
        if (__DEV__) console.warn('[chooseHoldemMode] transaction failed', e);
    }
};

// ── A betting action ('auto' = out of time: check if free, else fold) ──
export const holdemAct = async (
    groupId: string,
    playerId: string,
    seq: number,
    action: E.BetAction,
    raiseTo?: number
): Promise<{ success: boolean; reason?: string }> => {
    let result: { success: boolean; reason?: string } = { success: false, reason: 'stale' };
    try {
        await runTransaction(db, async (tx) => {
            result = { success: false, reason: 'stale' };
            const cur = await read(tx, groupId);
            if (!cur) return;
            const { gs, groupRef } = cur;
            if (gs.phase !== 'betting' || gs.seq !== seq || !gs.toAct) return;
            if (action !== 'auto' && gs.toAct !== playerId) return;
            const r = E.act(gs, gs.toAct, action, Math.random, raiseTo);
            if (!r.ok) {
                result = { success: false, reason: r.reason };
                return;
            }
            tx.update(groupRef, { gameState: clean(r.gs) });
            result = { success: true };
        });
    } catch (e) {
        if (__DEV__) console.warn('[holdemAct] transaction failed', e);
    }
    return result;
};

// ── After the showdown: the next hand, or the end ────────────────────
export const holdemNextHand = async (groupId: string, hand: number): Promise<void> => {
    try {
        await runTransaction(db, async (tx) => {
            const cur = await read(tx, groupId);
            if (!cur) return;
            const { gs, data, groupRef } = cur;
            if (gs.phase !== 'showdown' || gs.hand !== hand) return;
            const next = E.nextHand(gs, data.players.map((p) => p.id));
            tx.update(groupRef, { gameState: clean(next) });
        });
    } catch (e) {
        if (__DEV__) console.warn('[holdemNextHand] transaction failed', e);
    }
};

// Host: stop now (chips stay where they are; a hand in progress is void
// and its chips go back to whoever put them in).
export const endHoldemEarly = async (groupId: string): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const cur = await read(tx, groupId);
        if (!cur || cur.gs.phase === 'over') return;
        const gs = cur.gs;
        const chips = { ...gs.chips };
        if (gs.phase !== 'showdown') for (const [id, n] of Object.entries(gs.committed ?? {})) chips[id] = (chips[id] ?? 0) + n;
        tx.update(cur.groupRef, {
            gameState: clean({ ...gs, chips, committed: {}, streetBet: {}, phase: 'over', endedEarly: true, seq: gs.seq + 1 }),
        });
    });
};

// ── Leaderboard points, once, then back to the menu ────────────────────
export const finishHoldem = async (group: Group): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const cur = await read(tx, group.id);
        if (!cur) return;
        const { gs, data, groupRef } = cur;
        if (gs.pointsAwarded) return;
        const updates: Record<string, unknown> = { 'gameState.pointsAwarded': true };
        if (gs.phase === 'over' && E.handsPlayed(gs) >= 1) {
            for (const s of E.holdemStandings(gs, data.players)) {
                if (s.points > 0) Object.assign(updates, scoreFields('clash-holdem', s.playerId, s.points));
            }
        }
        tx.update(groupRef, updates);
    });
    await returnToMenu(group.id);
};
