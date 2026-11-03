// 🃏💰 Clash Hold'em: the rules, as pure functions on the game state.
//
// A hand: the two seats left of the dealer post the blinds (10/20; with two
// players the dealer is the small blind) and everyone gets one hidden card.
// In Dealer's choice the dealer then picks the mode (after seeing their
// card, before any stat is shown). Pre-flop betting is on the card alone:
//   🎴 Draw:    flop shows 3 stats; turn and river each REPLACE one with a
//               new stat. Showdown: each of the 3 stats crowns its highest
//               number (ties share); most crowns wins.
//   ✂️ Scratch: flop shows 3 stats; turn and river each STRIKE one. Showdown:
//               highest number on the last stat wins.
// A tie at showdown flips sudden-death stats (unused this hand) until one
// player is ahead; if they run out, the pot is split. Betting is no-limit,
// as in Texas Hold'em: the smallest bet is the big blind, a raise is at
// least the previous bet/raise, anyone can go all-in; a short all-in doesn't
// let players who already acted re-raise. Side pots as usual. Everything here is deterministic given `rng`, so it's tested
// without Firestore (logic/game.ts wraps it in transactions).
import type {
    HoldemAction,
    HoldemGameState,
    HoldemHandResult,
    HoldemMode,
    HoldemPot,
    HoldemStreet,
} from '../../../shared/types';
import { DECKS, DECK_CARDS, cardById } from '../../card-clash/data/decks';
import type { ClashDeckId } from '../../card-clash/data/types';

export const START_CHIPS = 2000;
export const SMALL_BLIND = 10;
export const BIG_BLIND = 20;
export const HAND_OPTIONS = [5, 10, 15] as const;
export const DEFAULT_HANDS = 10;

export type Rng = () => number;

const shuffle = <T,>(arr: T[], rng: Rng): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};
const pickIndex = (n: number, rng: Rng) => Math.floor(rng() * n);

export const potTotal = (gs: HoldemGameState): number =>
    Object.values(gs.committed ?? {}).reduce((a, b) => a + b, 0);

// Still in the hand (dealt, not folded).
export const live = (gs: HoldemGameState): string[] => gs.inHand.filter((id) => !gs.folded[id]);
// Live and with chips behind (not all-in): can still bet.
export const canBet = (gs: HoldemGameState): string[] => live(gs).filter((id) => (gs.chips[id] ?? 0) > 0);

// Seats after `from`, in order, wrapping round (excluding `from`).
const after = (seats: string[], from: string): string[] => {
    const i = seats.indexOf(from);
    return [...seats.slice(i + 1), ...seats.slice(0, Math.max(0, i))];
};

// ── A new game ──────────────────────────────────────────────────────
export const newGame = (
    players: string[],
    deck: ClashDeckId,
    handsTotal: number,
    modeSetting: HoldemGameState['modeSetting'],
    rng: Rng = Math.random
): HoldemGameState => {
    const seats = shuffle(players, rng);
    const base: HoldemGameState = {
        game: 'clash-holdem',
        deck,
        phase: 'choosing',
        modeSetting,
        hand: 0,
        handsTotal,
        seats,
        dealerId: seats[seats.length - 1], // first deal moves it to seats[0]
        chips: Object.fromEntries(seats.map((id) => [id, START_CHIPS])),
        inHand: [],
        folded: {},
        cards: {},
        street: 'preflop',
        stats: [],
        usedStats: [],
        sdOrder: [],
        committed: {},
        streetBet: {},
        currentBet: 0,
        lastRaise: BIG_BLIND,
        acted: {},
        seq: 0,
        log: [],
        outHand: {},
        outStack: {},
    };
    return dealHand(base, players, rng);
};

// ── Deal the next hand ──────────────────────────────────────────────
// `present`: players still in the group (anyone who left isn't dealt in).
export const dealHand = (gs: HoldemGameState, present: string[], rng: Rng = Math.random): HoldemGameState => {
    const withChips = gs.seats.filter((id) => (gs.chips[id] ?? 0) > 0 && present.includes(id));
    const dealer = after(gs.seats, gs.dealerId).find((id) => withChips.includes(id)) ?? withChips[0];
    const pool = shuffle(DECK_CARDS[gs.deck].map((c) => c.id), rng);
    const cards: Record<string, string> = {};
    withChips.forEach((id, i) => (cards[id] = pool[i]));
    const chips = { ...gs.chips };
    const committed: Record<string, number> = {};
    const streetBet: Record<string, number> = {};
    const log: HoldemGameState['log'] = [];
    // Blinds: heads-up the dealer is the small blind; otherwise the next two seats.
    const order = [...after(gs.seats, dealer), dealer].filter((id) => withChips.includes(id));
    const sbId = withChips.length === 2 ? dealer : order[0];
    const bbId = withChips.length === 2 ? order[0] : order[1];
    const post = (id: string, n: number) => {
        const a = Math.min(n, chips[id]);
        chips[id] -= a;
        committed[id] = a;
        streetBet[id] = a;
        log.push({ pid: id, action: 'blind', amount: a, street: 'preflop' });
    };
    post(sbId, SMALL_BLIND);
    post(bbId, BIG_BLIND);
    const allStats = DECKS[gs.deck].stats.map((s) => s.key);
    const next: HoldemGameState = {
        ...gs,
        hand: gs.hand + 1,
        dealerId: dealer,
        sbId,
        bbId,
        chips,
        inHand: withChips,
        folded: {},
        cards,
        street: 'preflop',
        stats: [],
        usedStats: [],
        sdOrder: shuffle(allStats, rng),
        committed,
        streetBet,
        currentBet: BIG_BLIND,
        lastRaise: BIG_BLIND,
        acted: {},
        toAct: undefined,
        seq: gs.seq + 1,
        log,
        lastStreetChange: undefined,
        mode: gs.modeSetting === 'choice' ? undefined : gs.modeSetting,
        phase: gs.modeSetting === 'choice' ? 'choosing' : 'betting',
    };
    return gs.modeSetting === 'choice' ? next : startPreflop(next, rng);
};

// 🎩 Dealer's choice (or out of time → Draw).
export const chooseMode = (gs: HoldemGameState, mode: HoldemMode, rng: Rng = Math.random): HoldemGameState =>
    startPreflop({ ...gs, mode, phase: 'betting' }, rng);

// Pre-flop: blinds are in; first to act is left of the big blind (heads-up:
// the dealer/small blind). The big blind gets the option if everyone calls.
const startPreflop = (gs: HoldemGameState, rng: Rng): HoldemGameState => {
    const s: HoldemGameState = { ...gs, phase: 'betting', street: 'preflop', acted: {}, seq: gs.seq + 1 };
    const bettors = canBet(s);
    // The big blind's "option" only means something if someone else can still bet.
    const waiting = bettors.filter(
        (id) => (s.streetBet[id] ?? 0) < s.currentBet || (id === s.bbId && bettors.length > 1)
    );
    if (bettors.length === 0 || (bettors.length === 1 && waiting.length === 0)) return advanceStreet(s, rng);
    s.toAct = [...after(s.seats, s.bbId!), s.bbId!].find((id) => bettors.includes(id));
    return s;
};

// Reset the street's betting; whoever's first after the dealer acts. With
// fewer than two able to bet, the cards just run out to the showdown.
const startStreet = (gs: HoldemGameState, rng: Rng): HoldemGameState => {
    const s: HoldemGameState = {
        ...gs,
        phase: 'betting',
        streetBet: {},
        currentBet: 0,
        lastRaise: BIG_BLIND,
        acted: {},
        seq: gs.seq + 1,
    };
    const bettors = canBet(s);
    if (live(s).length <= 1) return settle(s, rng);
    if (bettors.length <= 1) return advanceStreet(s, rng);
    s.toAct = after(s.seats, s.dealerId).find((id) => bettors.includes(id));
    return s;
};

// Flop: 3 stats. Turn / river: replace (draw) or strike (scratch) one stat.
// After the river: showdown.
const advanceStreet = (gs: HoldemGameState, rng: Rng): HoldemGameState => {
    if (gs.street === 'river') return settle(gs, rng);
    if (gs.street === 'preflop') {
        const stats = shuffle(DECKS[gs.deck].stats.map((s) => s.key), rng).slice(0, 3);
        return startStreet({ ...gs, stats, usedStats: [...stats], street: 'flop', lastStreetChange: undefined }, rng);
    }
    const street: HoldemStreet = gs.street === 'flop' ? 'turn' : 'river';
    const i = pickIndex(gs.stats.length, rng);
    const removed = gs.stats[i];
    let stats: string[];
    let added: string | undefined;
    let usedStats = gs.usedStats;
    if (gs.mode === 'scratch') {
        stats = gs.stats.filter((_, k) => k !== i);
    } else {
        const fresh = DECKS[gs.deck].stats.map((s) => s.key).filter((k) => !gs.usedStats.includes(k));
        added = fresh[pickIndex(fresh.length, rng)];
        stats = gs.stats.map((k, j) => (j === i ? added! : k));
        usedStats = [...gs.usedStats, added];
    }
    return startStreet(
        { ...gs, street, stats, usedStats, lastStreetChange: { street, removed, ...(added ? { added } : {}) } },
        rng
    );
};

// ── A betting action ─────────────────────────────────────────────────
export type ActResult = { ok: true; gs: HoldemGameState } | { ok: false; reason: string };

export const legalActions = (gs: HoldemGameState, pid: string): HoldemAction[] => {
    if (gs.phase !== 'betting' || gs.toAct !== pid) return [];
    const owe = gs.currentBet - (gs.streetBet[pid] ?? 0);
    const chips = gs.chips[pid] ?? 0;
    const out: HoldemAction[] = ['fold'];
    if (owe <= 0) out.push('check');
    else out.push('call');
    // Raise/bet: needs chips beyond the call, and not having acted since the
    // last full raise (a short all-in doesn't reopen the betting).
    if (chips > owe && !gs.acted[pid] && canBet(gs).some((id) => id !== pid)) out.push(gs.currentBet === 0 ? 'bet' : 'raise');
    return out;
};

// What calling costs this player right now (capped at their chips).
export const toCall = (gs: HoldemGameState, pid: string): number =>
    Math.min(Math.max(0, gs.currentBet - (gs.streetBet[pid] ?? 0)), gs.chips[pid] ?? 0);
// Bet/raise sizes as the street total ("raise TO"): smallest legal, and all-in.
export const minRaiseTo = (gs: HoldemGameState): number =>
    gs.currentBet === 0 ? BIG_BLIND : gs.currentBet + Math.max(gs.lastRaise, BIG_BLIND);
export const maxRaiseTo = (gs: HoldemGameState, pid: string): number => (gs.streetBet[pid] ?? 0) + (gs.chips[pid] ?? 0);

export type BetAction = 'check' | 'call' | 'bet' | 'raise' | 'fold' | 'auto';

// `raiseTo`: for bet/raise, the player's total for this street. Anything
// from the minimum up to all-in; less than the minimum only as an all-in.
export const act = (
    gs: HoldemGameState,
    pid: string,
    action: BetAction,
    rng: Rng = Math.random,
    raiseTo?: number
): ActResult => {
    if (gs.phase !== 'betting' || gs.toAct !== pid) return { ok: false, reason: 'not-your-turn' };
    const legal = legalActions(gs, pid);
    // Out of time: check if free, otherwise fold.
    const a = action === 'auto' ? (legal.includes('check') ? 'check' : 'fold') : action;
    const kind = a === 'bet' || a === 'raise' ? (gs.currentBet === 0 ? 'bet' : 'raise') : a;
    if (!legal.includes(kind)) return { ok: false, reason: 'illegal' };

    const s: HoldemGameState = {
        ...gs,
        chips: { ...gs.chips },
        streetBet: { ...gs.streetBet },
        committed: { ...gs.committed },
        folded: { ...gs.folded },
        acted: { ...gs.acted },
        log: [...gs.log],
    };
    const pay = (n: number) => {
        s.chips[pid] -= n;
        s.streetBet[pid] = (s.streetBet[pid] ?? 0) + n;
        s.committed[pid] = (s.committed[pid] ?? 0) + n;
    };
    if (kind === 'fold') {
        s.folded[pid] = true;
        s.log.push({ pid, action: 'fold', amount: 0, street: s.street });
    } else if (kind === 'check') {
        s.log.push({ pid, action: 'check', amount: 0, street: s.street });
    } else if (kind === 'call') {
        const n = toCall(s, pid);
        pay(n);
        s.log.push({ pid, action: s.chips[pid] === 0 ? 'all-in' : 'call', amount: n, street: s.street });
    } else {
        const max = maxRaiseTo(gs, pid);
        // Only a real number (a modified client could send NaN / Infinity / text).
        if (raiseTo !== undefined && (typeof raiseTo !== 'number' || !Number.isFinite(raiseTo))) {
            return { ok: false, reason: 'bad-amount' };
        }
        const target = Math.round(raiseTo ?? Math.min(minRaiseTo(gs), max));
        // Legal: from the minimum up to all-in; below the minimum only as an all-in.
        if (target > max || target <= gs.currentBet || (target < minRaiseTo(gs) && target !== max)) {
            return { ok: false, reason: 'bad-amount' };
        }
        pay(target - (gs.streetBet[pid] ?? 0));
        const increase = target - gs.currentBet;
        const full = increase >= Math.max(gs.lastRaise, BIG_BLIND);
        if (full) {
            // A full bet/raise: everyone else has to answer it and may re-raise.
            s.lastRaise = increase;
            s.acted = {};
        }
        // A short all-in only tops up the bet: those who acted may call, not re-raise.
        s.currentBet = Math.max(gs.currentBet, target);
        s.log.push({ pid, action: s.chips[pid] === 0 ? 'all-in' : kind, amount: target, street: s.street });
    }
    s.acted[pid] = true;
    s.seq = gs.seq + 1;

    // Everyone else folded: the last one standing takes it, no showdown.
    if (live(s).length === 1) return { ok: true, gs: settle(s, rng) };

    const bettors = canBet(s);
    const waiting = bettors.filter((id) => !s.acted[id] || (s.streetBet[id] ?? 0) < s.currentBet);
    if (waiting.length === 0) return { ok: true, gs: advanceStreet({ ...s, toAct: undefined }, rng) };
    s.toAct = after(s.seats, pid).find((id) => waiting.includes(id));
    return { ok: true, gs: s };
};

// ── Showdown ─────────────────────────────────────────────────────────
const value = (gs: HoldemGameState, pid: string, stat: string): number =>
    cardById(gs.cards[pid])?.stats[stat] ?? 0;

// Best among `contenders`: draw → most crowns; scratch → highest on the last
// stat; ties go to sudden death. Returns the winners and the tie-break used.
export const bestOf = (
    gs: HoldemGameState,
    contenders: string[]
): { winners: string[]; crowns?: Record<string, number>; suddenDeath: string[] } => {
    let tied: string[];
    let crowns: Record<string, number> | undefined;
    if (gs.mode === 'scratch') {
        const stat = gs.stats[0];
        const top = Math.max(...contenders.map((id) => value(gs, id, stat)));
        tied = contenders.filter((id) => value(gs, id, stat) === top);
    } else {
        crowns = Object.fromEntries(contenders.map((id) => [id, 0]));
        for (const stat of gs.stats) {
            const top = Math.max(...contenders.map((id) => value(gs, id, stat)));
            for (const id of contenders) if (value(gs, id, stat) === top) crowns[id] += 1;
        }
        const most = Math.max(...Object.values(crowns));
        tied = contenders.filter((id) => crowns![id] === most);
    }
    const suddenDeath: string[] = [];
    for (const stat of gs.sdOrder) {
        if (tied.length <= 1) break;
        if (gs.usedStats.includes(stat)) continue;
        suddenDeath.push(stat);
        const top = Math.max(...tied.map((id) => value(gs, id, stat)));
        tied = tied.filter((id) => value(gs, id, stat) === top);
    }
    return { winners: tied, ...(crowns ? { crowns } : {}), suddenDeath };
};

// Split the pot into main + side pots by what each player put in.
export const buildPots = (gs: HoldemGameState): { amount: number; eligible: string[] }[] => {
    const left: Record<string, number> = { ...gs.committed };
    const pots: { amount: number; eligible: string[] }[] = [];
    const inIt = () => Object.keys(left).filter((id) => left[id] > 0);
    while (inIt().length > 0) {
        const contributors = inIt();
        const eligible = contributors.filter((id) => !gs.folded[id]);
        if (eligible.length === 0) {
            // Only folded chips left (they put in more than anyone still in): last pot keeps them.
            const rest = contributors.reduce((a, id) => a + left[id], 0);
            if (pots.length) pots[pots.length - 1].amount += rest;
            break;
        }
        const level = Math.min(...eligible.map((id) => left[id]));
        let amount = 0;
        for (const id of contributors) {
            const take = Math.min(left[id], level);
            amount += take;
            left[id] -= take;
        }
        const prev = pots[pots.length - 1];
        if (prev && prev.eligible.join() === eligible.join()) prev.amount += amount;
        else pots.push({ amount, eligible });
    }
    return pots;
};

// End of hand: pay out, record the result, bust anyone at zero.
const settle = (gs: HoldemGameState, _rng: Rng): HoldemGameState => {
    const chips = { ...gs.chips };
    const gains: Record<string, number> = {};
    const stillIn = live(gs);
    const order = [...after(gs.seats, gs.dealerId), gs.dealerId]; // odd chips: first winner after the dealer
    let result: HoldemHandResult;
    if (stillIn.length === 1) {
        const w = stillIn[0];
        const total = potTotal(gs);
        chips[w] += total;
        gains[w] = total;
        result = {
            hand: gs.hand,
            mode: gs.mode ?? 'draw',
            stats: gs.stats,
            cards: {},
            pots: [{ amount: total, eligible: [w], winners: [w] }],
            noShowdown: true,
            winnerIds: [w],
            gains,
        };
    } else {
        const pots: HoldemPot[] = [];
        let crowns: Record<string, number> | undefined;
        let suddenDeath: string[] = [];
        let mainWinners: string[] = [];
        buildPots(gs).forEach((p, idx) => {
            const r = bestOf(gs, p.eligible);
            if (idx === 0) {
                crowns = r.crowns;
                suddenDeath = r.suddenDeath;
                mainWinners = r.winners;
            }
            const share = Math.floor(p.amount / r.winners.length);
            let odd = p.amount - share * r.winners.length;
            const ordered = order.filter((id) => r.winners.includes(id));
            for (const id of ordered) {
                const g = share + (odd > 0 ? 1 : 0);
                if (odd > 0) odd -= 1;
                chips[id] += g;
                gains[id] = (gains[id] ?? 0) + g;
            }
            pots.push({ ...p, winners: r.winners });
        });
        result = {
            hand: gs.hand,
            mode: gs.mode ?? 'draw',
            stats: gs.stats,
            cards: Object.fromEntries(stillIn.map((id) => [id, gs.cards[id]])),
            ...(crowns ? { crowns } : {}),
            ...(suddenDeath.length ? { suddenDeath } : {}),
            pots,
            winnerIds: mainWinners,
            gains,
        };
    }
    const outHand = { ...(gs.outHand ?? {}) };
    const outStack = { ...(gs.outStack ?? {}) };
    for (const id of gs.inHand) {
        if (chips[id] === 0 && outHand[id] === undefined) {
            outHand[id] = gs.hand;
            // Busted means everything went in, so that's the stack they started the hand with.
            outStack[id] = gs.committed?.[id] ?? 0;
        }
    }
    return {
        ...gs,
        chips,
        outHand,
        outStack,
        phase: 'showdown',
        toAct: undefined,
        committed: {}, // paid out (the hand's pots are in `last`)
        streetBet: {},
        last: result,
        seq: gs.seq + 1,
    };
};

// After the showdown: the next hand, or the end.
export const nextHand = (gs: HoldemGameState, present: string[], rng: Rng = Math.random): HoldemGameState => {
    const withChips = gs.seats.filter((id) => (gs.chips[id] ?? 0) > 0 && present.includes(id));
    if (gs.hand >= gs.handsTotal || withChips.length < 2) return { ...gs, phase: 'over', seq: gs.seq + 1 };
    return dealHand(gs, present, rng);
};


// ── Standings & leaderboard points (same table as Clash Cards) ─────────
export const MIN_HANDS_FOR_ALL = 5;

// Hands actually played to the end (a hand the host called off doesn't count).
export const handsPlayed = (gs: HoldemGameState): number =>
    gs.endedEarly && gs.last?.hand !== gs.hand ? gs.hand - 1 : gs.hand;
export type HoldemStanding = { playerId: string; chips: number; outHand?: number; rank: number; points: number };

export const holdemStandings = (gs: HoldemGameState, players: { id: string }[]): HoldemStanding[] => {
    const rows = players
        .filter((p) => gs.chips[p.id] !== undefined)
        .map((p) => ({ playerId: p.id, chips: gs.chips[p.id] ?? 0, outHand: gs.outHand?.[p.id], rank: 0, points: 0 }));
    // Still in: by chips. Busted: later hand first; same hand → bigger starting stack first.
    const score = (r: (typeof rows)[number]) =>
        r.chips > 0 ? 1e12 + r.chips : (r.outHand ?? 0) * 1e6 + (gs.outStack?.[r.playerId] ?? 0);
    rows.sort((a, b) => score(b) - score(a));
    const played = handsPlayed(gs);
    const full = played >= MIN_HANDS_FOR_ALL;
    // Ended early before MIN_HANDS_FOR_ALL hands: nobody scores (no free
    // shared "win" for a table that's still level).
    const paid = full || !gs.endedEarly;
    let place = 0;
    rows.forEach((r, i) => {
        if (i === 0 || score(rows[i - 1]) !== score(r)) place += 1;
        r.rank = place;
        const n = rows.length;
        r.points = !paid
            ? 0
            : n <= 2
              ? place === 1 ? 6 : full ? 2 : 0
              : place === 1 ? 10 : !full ? 0 : place === 2 ? 5 : 2;
    });
    return rows;
};

// 🎯 Where this card's number ranks in the deck on a stat: 0-100 ("top X%").
const pctCache: Record<string, Record<string, number>> = {};
export const deckPercentile = (deck: ClashDeckId, cardId: string, stat: string): number => {
    const key = `${deck}:${stat}`;
    if (!pctCache[key]) {
        const cards = DECK_CARDS[deck];
        const vals = cards.map((c) => c.stats[stat] ?? 0).sort((a, b) => a - b);
        pctCache[key] = {};
        for (const c of cards) {
            const v = c.stats[stat] ?? 0;
            const below = vals.filter((x) => x < v).length;
            pctCache[key][c.id] = Math.round((below / Math.max(1, vals.length - 1)) * 100);
        }
    }
    return pctCache[key][cardId] ?? 0;
};
