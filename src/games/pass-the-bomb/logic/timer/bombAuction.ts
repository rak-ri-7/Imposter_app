// ── 🔨 THE AUCTION BOMB ─────────────────────────────────────────────
// No instructions. The holder taps Pass, and every other living player
// gets a few seconds to bid FP. Everyone opens on 1 FP (broke players
// too, on credit). You can MATCH the highest bid or RAISE one above it.
// FP is taken AS you bid (so it can't be spent elsewhere meanwhile) and
// the holder gets exactly what was taken. When time is up the LOWEST bid
// gets the bomb; if several share it, the fuse pauses while the bomb
// "rolls the die" between them. The fuse keeps running; if the panic
// countdown starts first, it's called off and every bid is refunded.
import { doc, runTransaction, deleteField } from 'firebase/firestore';
import { db } from '../../../../shared/firebase/config';
import { Group, BombGameState, BombAuction, AuctionRecord } from '../../../../shared/types';
import { applyFusePoints, auctionRefundUpdates } from './bombHelpers';
import { applyPassSuccess, pauseFuseUntil } from './game';

export const AUCTION_MS_FIRST = 12000;   // the game's first auction: time to read
export const AUCTION_MS = 8000;          // every later auction
export const AUCTION_START_BID = 1;      // everyone's opening bid
export const AUCTION_ROLL_MS = 3500;     // 🎲 tie roll: fuse paused this long
export const AUCTION_LABEL = '(Auction 🔨)'; // pass-history label (no callouts)

export const isAuctionRound = (gs: Pick<BombGameState, 'personalityEffect' | 'duelRound'>): boolean =>
    gs.personalityEffect === 'auction' && !gs.duelRound;

export const highestBid = (bids: Record<string, number>): number =>
    Math.max(0, ...Object.values(bids));

export type BidKind = 'match' | 'raise';
export type BidInfo =
    | { ok: true; bid: number; cost: number }
    | { ok: false; bid: number; cost: number; reason: 'not-bidding' | 'already-top' | 'already-matched' | 'cant-afford' };

// FP a bidder has already put in.
export const paidIn = (auction: BombAuction, pid: string): number => auction.paid?.[pid] ?? 0;

// What a match / raise by `pid` would be, or why they can't. `fp` is their
// FP right now (what they've already bid has been taken out of it); they
// pay only the difference from what they've already put in.
export const bidInfo = (
    auction: BombAuction,
    pid: string,
    fp: number,
    kind: BidKind
): BidInfo => {
    const bids = auction.bids;
    const top = highestBid(bids);
    const mine = bids[pid];
    const bid = kind === 'match' ? top : top + 1;
    const cost = Math.max(0, bid - paidIn(auction, pid));
    if (mine === undefined) return { ok: false, bid, cost, reason: 'not-bidding' };
    if (kind === 'match' && mine >= top) return { ok: false, bid, cost, reason: 'already-matched' };
    if (kind === 'raise') {
        const atTop = Object.values(bids).filter((b) => b === top).length;
        if (mine === top && atTop === 1) return { ok: false, bid, cost, reason: 'already-top' };
    }
    if (fp < cost) return { ok: false, bid, cost, reason: 'cant-afford' };
    return { ok: true, bid, cost };
};

// The pot: FP actually collected so far.
export const auctionPot = (auction: BombAuction): number =>
    Object.values(auction.paid ?? {}).reduce((s, n) => s + n, 0);

// Stuck below the top: can't even afford to match (shown to everyone as 🚫).
export const cantMove = (auction: BombAuction, pid: string, fp: number): boolean => {
    const top = highestBid(auction.bids);
    const mine = auction.bids[pid];
    return mine !== undefined && mine < top && fp < top - paidIn(auction, pid);
};

const livingIds = (data: Group, gs: BombGameState) =>
    data.players.filter((p) => !gs.ghosts.includes(p.id)).map((p) => p.id);

// ── The holder taps Pass ─────────────────────────────────────────────
export const startAuction = async (
    group: Group,
    holderId: string,
    clientHeldMs?: number
): Promise<{ success: boolean; reason?: string }> => {
    const groupRef = doc(db, 'groups', group.id);
    let result: { success: boolean; reason?: string } = { success: false, reason: 'stale' };
    try {
        await runTransaction(db, async (tx) => {
            result = { success: false, reason: 'stale' };
            const snap = await tx.get(groupRef);
            if (!snap.exists()) return;
            const data = snap.data() as Group;
            const gs = data.gameState as BombGameState;
            if (gs.phase !== 'playing' || !isAuctionRound(gs)) return;
            if (gs.currentHolderId !== holderId) return;
            if (gs.auction) {
                result = { success: false, reason: 'running' };
                return;
            }
            if (gs.isPaused) {
                result = { success: false, reason: 'paused' }; // the 🎲 roll is still showing
                return;
            }
            const now = Date.now();
            const updates: Record<string, unknown> = {};
            const bids: Record<string, number> = {};
            const paid: Record<string, number> = {};
            for (const id of livingIds(data, gs)) {
                if (id === holderId) continue;
                // Everyone opens on 1; it's taken now (a broke player's is on credit).
                const fp = Math.floor(gs.fusePoints?.[id] ?? 0);
                const take = Math.max(0, Math.min(AUCTION_START_BID, fp));
                bids[id] = AUCTION_START_BID;
                paid[id] = take;
                if (take > 0) updates[`gameState.fusePoints.${id}`] = (gs.fusePoints?.[id] ?? 0) - take;
            }
            if (Object.keys(bids).length === 0) return;
            const first = (gs.auctionCount ?? 0) === 0;
            const auction: BombAuction = {
                id: `${now}-${holderId}`,
                holderId,
                startedAt: now,
                durationMs: first ? AUCTION_MS_FIRST : AUCTION_MS,
                bids,
                paid,
                ...(first ? { first: true } : {}),
                ...(clientHeldMs !== undefined && Number.isFinite(clientHeldMs)
                    ? { heldMs: Math.min(Math.max(0, clientHeldMs), 120_000) }
                    : {}),
            };
            tx.update(groupRef, {
                ...updates,
                'gameState.auction': auction,
                'gameState.auctionCount': (gs.auctionCount ?? 0) + 1,
            });
            result = { success: true };
        });
    } catch (e) {
        if (__DEV__) console.warn('[startAuction] transaction failed', e);
    }
    return result;
};

// ── A bidder taps Match or Raise ─────────────────────────────────────
// Accepted until the auction is settled (no clock check here, so phones
// whose clocks disagree can't lose a bid to the difference).
export const placeBid = async (
    group: Group,
    playerId: string,
    kind: BidKind
): Promise<{ success: boolean; reason?: string; bid?: number }> => {
    const groupRef = doc(db, 'groups', group.id);
    let result: { success: boolean; reason?: string; bid?: number } = { success: false, reason: 'stale' };
    try {
        await runTransaction(db, async (tx) => {
            result = { success: false, reason: 'stale' };
            const snap = await tx.get(groupRef);
            if (!snap.exists()) return;
            const gs = (snap.data() as Group).gameState as BombGameState;
            const auction = gs.auction;
            if (!auction || gs.phase !== 'playing') return;
            const info = bidInfo(auction, playerId, gs.fusePoints?.[playerId] ?? 0, kind);
            if (!info.ok) {
                result = { success: false, reason: info.reason, bid: info.bid };
                return;
            }
            // Pay the difference now.
            tx.update(groupRef, {
                [`gameState.auction.bids.${playerId}`]: info.bid,
                [`gameState.auction.paid.${playerId}`]: paidIn(auction, playerId) + info.cost,
                [`gameState.fusePoints.${playerId}`]: (gs.fusePoints?.[playerId] ?? 0) - info.cost,
            });
            result = { success: true, bid: info.bid };
        });
    } catch (e) {
        if (__DEV__) console.warn('[placeBid] transaction failed', e);
    }
    return result;
};

// ── Time's up ────────────────────────────────────────────────────────
// Every phone's watcher calls this (host on time, others as backup); the
// auction id makes sure it settles exactly once.
export const settleAuction = async (group: Group, auctionId: string): Promise<void> => {
    const groupRef = doc(db, 'groups', group.id);
    try {
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(groupRef);
            if (!snap.exists()) return;
            const data = snap.data() as Group;
            const gs = data.gameState as BombGameState;
            const auction = gs.auction;
            if (!auction || auction.id !== auctionId) return;

            const updates: Record<string, unknown> = { 'gameState.auction': deleteField() };
            const living = livingIds(data, gs);
            const bidders = Object.keys(auction.bids).filter((id) => living.includes(id) && id !== auction.holderId);
            if (
                gs.phase !== 'playing' ||
                gs.currentHolderId !== auction.holderId ||
                !living.includes(auction.holderId) ||
                bidders.length === 0
            ) {
                // Overtaken by events: called off, every bid goes back.
                tx.update(groupRef, { ...updates, ...auctionRefundUpdates(gs) });
                return;
            }

            // Lowest bid takes the bomb; if several share it, the bomb picks.
            const low = Math.min(...bidders.map((id) => auction.bids[id]));
            const lowest = bidders.filter((id) => auction.bids[id] === low);
            const loserId = lowest[Math.floor(Math.random() * lowest.length)];

            // Bids were paid as they were made: the holder gets exactly that.
            const bids: Record<string, number> = {};
            const paid: Record<string, number> = {};
            for (const id of bidders) {
                bids[id] = auction.bids[id];
                paid[id] = paidIn(auction, id);
            }
            const pot = auctionPot(auction);
            if (pot > 0) applyFusePoints(updates, gs, auction.holderId, pot, `🔨 Auction pot`);

            const now = Date.now();
            applyPassSuccess(updates, gs, { ...group, players: data.players }, auction.holderId, loserId, now, {
                label: AUCTION_LABEL,
                ...(auction.heldMs !== undefined ? { heldMs: auction.heldMs } : {}),
            });

            // 🎲 A tie: hold the fuse while every phone shows the roll.
            const tied = lowest.length > 1;
            if (tied) pauseFuseUntil(updates, gs, now, now + AUCTION_ROLL_MS);

            const record: AuctionRecord = {
                holderId: auction.holderId,
                loserId,
                bids,
                paid,
                pot,
                ...(tied ? { tied: lowest } : {}),
            };
            updates['gameState.auctionLog'] = [...(gs.auctionLog ?? []), record].slice(-30);
            tx.update(groupRef, updates);
        });
    } catch (e) {
        if (__DEV__) console.warn('[settleAuction] transaction failed', e);
    }
};
