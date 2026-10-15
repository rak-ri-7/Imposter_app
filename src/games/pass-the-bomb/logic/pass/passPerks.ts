import type { PassGameState, PassTicketKind } from '../../../../shared/types';

// ── PASS MODE PERKS ──────────────────────────────────────────────────
// Pure rules for the Lucky Centre (self-bets) and ghost haunting/revival.
// No Firestore here — passGame.ts calls these inside its own transactions,
// and passPerkActions.ts holds the buy/haunt actions. Keeping this file
// free of passGame imports avoids a require cycle.

// ── LUCKY CENTRE ─────────────────────────────────────────────────────
// Solo play only. Buy one ticket at a time on your OWN performance — never
// on anyone else's. Win and it pays out; bust and the price is gone.
export const LUCKY = { name: 'Lucky Centre', icon: '🍀' } as const;

export const TICKETS: Record<
    PassTicketKind,
    { emoji: string; name: string; desc: string; price: number; payout: number; goal?: number }
> = {
    'double-clean': {
        emoji: '✌️',
        name: 'Double Clean',
        desc: 'Your next 2 answers are right first try',
        price: 5,
        payout: 15,
        goal: 2,
    },
    'triple-clean': {
        emoji: '🎯',
        name: 'Triple Clean',
        desc: 'Your next 3 answers are right first try',
        price: 5,
        payout: 25,
        goal: 3,
    },
    'clean-sheet': {
        emoji: '🧼',
        name: 'Clean Sheet',
        desc: 'Next round: answer at least once, and never get one wrong',
        price: 6,
        payout: 18,
    },
    survivor: {
        emoji: '🛟',
        name: 'Survivor',
        desc: "Next round: the bomb doesn't go off on you",
        price: 5,
        payout: 8,
    },
};

// Round tickets cover a whole round, so they can only be bought between
// rounds — never mid-round when the outcome is already clear.
export const isRoundTicket = (kind: PassTicketKind): boolean =>
    kind === 'clean-sheet' || kind === 'survivor';

export const ticketsAllowed = (gs: PassGameState): boolean => !gs.teamMode;

export type TicketNewsItem = NonNullable<PassGameState['ticketNews']>['items'][number];
type NewsItem = TicketNewsItem;

// Settles one side's ticket and records the result for everyone to see.
const resolve = (
    gs: PassGameState,
    sideId: string,
    won: boolean,
    news: NewsItem[]
): PassGameState => {
    const t = gs.tickets?.[sideId];
    if (!t) return gs;
    const payout = won ? TICKETS[t.kind].payout : 0;
    const { [sideId]: _done, ...restTickets } = gs.tickets ?? {};
    news.push({ sideId, kind: t.kind, won, payout });
    return {
        ...gs,
        tickets: restTickets,
        wallet: won
            ? { ...(gs.wallet ?? {}), [sideId]: (gs.wallet?.[sideId] ?? 0) + payout }
            : gs.wallet,
    };
};

// Ticket results are collected into one `news` array across a whole
// transaction, then published ONCE at the end — so an answer that both pays
// out a ticket AND ends the round reports both, instead of one overwriting
// the other. `roundEnd` marks news from the transaction that ended the round,
// which is what the explosion screen lists.
export const publishTicketNews = (gs: PassGameState, news: NewsItem[]): PassGameState =>
    news.length === 0
        ? gs
        : {
            ...gs,
            ticketNews: {
                id: (gs.ticketNews?.id ?? 0) + 1,
                round: gs.round,
                roundEnd: gs.phase === 'pass-exploded',
                items: news,
            },
        };

// After the holding side answers. 'first-try' = right with no wrong answers
// on this question; 'correct' = right after a miss; 'wrong' = a miss.
export const settleTicketOnAnswer = (
    gs: PassGameState,
    sideId: string,
    outcome: 'first-try' | 'correct' | 'wrong',
    news: NewsItem[]
): PassGameState => {
    const t = gs.tickets?.[sideId];
    if (!t) return gs;
    const def = TICKETS[t.kind];

    if (outcome === 'wrong') {
        if (t.kind === 'survivor') return gs; // only the explosion matters
        return resolve(gs, sideId, false, news);
    }
    if (t.kind === 'clean-sheet' && outcome === 'first-try') {
        return { ...gs, tickets: { ...(gs.tickets ?? {}), [sideId]: { ...t, progress: t.progress + 1 } } };
    }
    if (def.goal && outcome === 'first-try') {
        const progress = t.progress + 1;
        if (progress >= def.goal) return resolve(gs, sideId, true, news);
        return { ...gs, tickets: { ...(gs.tickets ?? {}), [sideId]: { ...t, progress } } };
    }
    return gs;
};

// A cheating conviction voids any ticket the holder had.
export const settleTicketOnCallout = (
    gs: PassGameState,
    sideId: string,
    news: NewsItem[]
): PassGameState => (gs.tickets?.[sideId] ? resolve(gs, sideId, false, news) : gs);

// The round ends when the bomb goes off on `victim`.
//   • Clean Sheet / Survivor: everyone but the victim wins.
//   • Double / Triple Clean: the victim busts; anyone else's ticket carries on.
export const settleTicketsOnRoundEnd = (
    gs: PassGameState,
    victim: string,
    news: NewsItem[]
): PassGameState => {
    let next = gs;
    for (const [sideId, t] of Object.entries(gs.tickets ?? {})) {
        if (sideId === victim) {
            next = resolve(next, sideId, false, news);
        } else if (t.kind === 'survivor') {
            next = resolve(next, sideId, true, news);
        } else if (t.kind === 'clean-sheet' && t.progress > 0) {
            next = resolve(next, sideId, true, news);
        }
        // Clean Sheet with no answers yet carries over; Double/Triple carry on.
    }
    return next;
};

// ── GHOST HAUNTING & REVIVAL ─────────────────────────────────────────
// A knocked-out side can haunt the holder for one turn holding the bomb
// (first ghost to tap gets it). Every wrong answer the haunted holder makes
// "drops" a pass into the ghost's stash instead of vanishing. A full stash
// brings the ghost back with 1 life — once per game. Haunting stops when
// only 2 sides are left, so the final duel stays clean.
export const HAUNT_MIN_ALIVE = 3;
export const EARN_COMEBACK = 5; // Pass Marks for coming back from the dead

export const reviveTarget = (gs: PassGameState): number => Math.max(4, Math.ceil(gs.budget / 4));
export const stashOf = (gs: PassGameState, sideId?: string): number =>
    sideId ? gs.stash?.[sideId] ?? 0 : 0;

const aliveIds = (gs: PassGameState): string[] =>
    gs.sideIds.filter((id) => !gs.ghosts.includes(id));

// The haunt on the current turn holding the bomb, if any.
export const activeHaunt = (gs: PassGameState) =>
    gs.haunt && gs.haunt.stint === (gs.stint ?? 0) ? gs.haunt : null;

export const canHaunt = (gs: PassGameState, ghostSideId?: string): boolean =>
    !!ghostSideId &&
    gs.phase === 'pass-playing' &&
    gs.ghosts.includes(ghostSideId) &&
    !(gs.revived ?? []).includes(ghostSideId) &&
    aliveIds(gs).length >= HAUNT_MIN_ALIVE &&
    !activeHaunt(gs);

// Call after a wrong answer by the holder. Feeds the haunting ghost's stash
// and brings them back once it's full.
export const catchFumble = (gs: PassGameState): PassGameState => {
    const haunt = activeHaunt(gs);
    // Hush Gloves: a silent fumble leaves nothing for a ghost to catch —
    // otherwise the stash would quietly count the fumbles the gloves hide.
    if (!haunt || gs.turn?.muffled) return gs;
    if (!haunt) return gs;
    const ghost = haunt.ghostId;
    const stash = stashOf(gs, ghost) + 1;
    if (stash < reviveTarget(gs)) {
        return { ...gs, stash: { ...(gs.stash ?? {}), [ghost]: stash } };
    }
    return revive(gs, ghost, stash);
};

// Back from the dead: 1 life, and the stash becomes their pile of passes
// for the rest of this round (topped up like everyone's from next round).
const revive = (gs: PassGameState, ghost: string, stash: number): PassGameState => {
    const ghosts = gs.ghosts.filter((id) => id !== ghost);
    return {
        ...gs,
        ghosts,
        lives: { ...gs.lives, [ghost]: 1 },
        stacks: { ...gs.stacks, [ghost]: stash },
        eliminationOrder: gs.eliminationOrder.filter((id) => id !== ghost),
        revived: [...(gs.revived ?? []), ghost],
        stash: { ...(gs.stash ?? {}), [ghost]: 0 },
        wallet: { ...(gs.wallet ?? {}), [ghost]: (gs.wallet?.[ghost] ?? 0) + EARN_COMEBACK },
        haunt: null,
        lastRevival: { sideId: ghost, id: (gs.lastRevival?.id ?? 0) + 1, round: gs.round },
    };
};