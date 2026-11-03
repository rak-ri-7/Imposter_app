// ⚖️ Court of Thieves: the rules, as pure functions on the game state.
//
// Every round each player gets a secret role (Thief, Police, Judge,
// Advocate, Citizens) and a ₹5,000 payday. The Thief's payday is
// counterfeit: it looks the same on the board but is worth nothing at the
// final count.
//
// 🔦 The outage: the lights go out for a random 20–45 s. Only the Thief can
// act: walk or tiptoe to a bag, take money out (₹500 a second), put money
// in (to frame someone: the loot in the glove goes first, then the Thief's
// own purse), and get home. Walking leaves footprints that fade in 3 s;
// tiptoeing leaves none but is slow. One or two witnesses get their lights
// back 3 s early (the Thief gets a 3-second warning at the same moment).
// Anyone not home when the lights come back, or still in the middle of
// something, is caught red-handed.
//
// ⚖️ The court: after the deals everyone secretly points at a suspect;
// only the Police's pick is an arrest (and reveals them). At the trial the
// Police, then the Advocate, then the accused (always last) each get a
// timed turn. The Judge rules. Convict the real Thief: the Police and the
// victims split the stash, and everyone who took the Thief's money gives it
// back and pays a fine. Arrest an innocent: the Police pays them ₹1,000.
// The Thief walks free: their deals stand. "On acquittal" promises pay
// unless whoever made the promise was convicted.
//
// 🤝 The deal phase: template messages to a role ("the Thief"), to "the
// witness" or to a player by name. Offers move money: hush money, demands,
// paying to learn who someone is. The Thief always pays 2 parts real to 1
// part fake (as far as their purse allows); everyone else pays from the mix
// in their purse. Each player can deal with at most 2 people a round.
//
// Everything here is deterministic given `rng` and the times passed in, so
// it's tested without Firestore (logic/game.ts wraps it in transactions).
import type {
    CotGameState,
    CotHeistAction,
    CotMoney,
    CotMsg,
    CotOfferStatus,
    CotPromise,
    CotRole,
    CotRoundResult,
    CotSpeaker,
    CotSpot,
    CotThread,
} from '../../../shared/types';
import { TEMPLATES, type CotTemplate } from './templates';

// ── Numbers to tune ─────────────────────────────────────────────────
export const PAYDAY = 5000;
export const MIN_PLAYERS = 4;
export const ROLE_MS = 9000;            // the secret role card
export const OUTAGE_LEAD_MS = 3000;     // "lights out in 3…"
export const OUTAGE_MIN_MS = 20000;
export const OUTAGE_MAX_MS = 45000;
export const EARLY_MS = 3000;           // witnesses' early lights = the Thief's warning
export const PRINT_FADE_MS = 3000;      // footprints fade out in 3 s
export const FLASH_MS = 700;            // ⚡ a lightning flash
export const RATE = 500;                // rupees a second, taking or planting
export const AMOUNT_STEP = 100;
export const WALK_MS_PER_STEP = 250;
export const WALK_BASE_MS = 150;
export const TIPTOE_MS_PER_STEP = 1000;
export const LIGHTS_MS = 9000;          // the lit room before the deals open
export const DEAL_OPTIONS = [90000, 150000, 240000] as const;
export const DEFAULT_DEAL_MS = 150000;
export const ROUND_OPTIONS = [3, 5, 7] as const;
export const DEFAULT_ROUNDS = 5;
export const MSG_COOLDOWN_MS = 5000;
export const MAX_PARTNERS = 2;
export const WITNESS_REWARD = 500;
export const REVEAL_PRICE = 500;
export const MAX_OFFER = 20000;
// the court
export const ARREST_MS = 30000;          // everyone picks a suspect (only the Police's pick arrests)
export const TURN_MS = 45000;            // each speaker at the trial
export const VERDICT_MS = 30000;
export const POLICE_REWARD = 500;
export const JUDGE_REWARD = 500;
export const WRONG_ARREST_FINE = 1000;   // paid by the Police to the innocent person they arrested
export const SUPPORTER_FINE = 500;       // took the Thief's money, and the Thief was convicted
export const TIP_REWARD = 500;           // told the Police the right name, and it led to a conviction
export const HUNCH_REWARD = 200;         // anyone else whose secret pick was the Thief
export const TIP_TEMPLATES = ['sawnear', 'watch', 'itwas'];
export const CAUGHT_FINE = 1000;         // caught red-handed: paid from the Thief's REAL money, as far as it goes
export const ROUND_END_MS = 30000;       // the round summary moves on by itself (the host can skip ahead)
export const MIN_ROUNDS_FOR_POINTS = 2; // a game ended early needs this many finished rounds to score
const STEP_GRACE_MS = 250;              // clock slack when checking a phase's end time

export type Rng = () => number;

const shuffle = <T,>(arr: T[], rng: Rng): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};
const between = (lo: number, hi: number, rng: Rng) => lo + Math.floor(rng() * (hi - lo + 1));

// ── Money ───────────────────────────────────────────────────────────
export const total = (m: CotMoney | undefined): number => (m ? m.real + m.fake : 0);
const add = (a: CotMoney, b: CotMoney): CotMoney => ({ real: a.real + b.real, fake: a.fake + b.fake });
const sub = (a: CotMoney, b: CotMoney): CotMoney => ({ real: a.real - b.real, fake: a.fake - b.fake });
const ZERO: CotMoney = { real: 0, fake: 0 };

// Take `amount` out of a purse in proportion to its real/fake mix.
export const fromMix = (m: CotMoney, amount: number): CotMoney => {
    const t = total(m);
    const amt = Math.max(0, Math.min(amount, t));
    if (t === 0 || amt === 0) return { ...ZERO };
    let real = Math.round((amt * m.real) / t);
    real = Math.min(real, m.real);
    let fake = amt - real;
    if (fake > m.fake) {
        real += fake - m.fake;
        fake = m.fake;
    }
    return { real, fake };
};

// The Thief pays 2 parts real to 1 part fake, topping up from whichever
// they still have.
export const fromThief = (m: CotMoney, amount: number): CotMoney => {
    const amt = Math.max(0, Math.min(amount, total(m)));
    let real = Math.min(m.real, Math.round((amt * 2) / 3));
    let fake = Math.min(m.fake, amt - real);
    if (real + fake < amt) real = Math.min(m.real, amt - fake);
    return { real, fake };
};

// Money in the room: who pays how.
const payment = (gs: CotGameState, payer: string, amount: number): CotMoney =>
    gs.roles[payer] === 'thief' ? fromThief(gs.purse[payer] ?? ZERO, amount) : fromMix(gs.purse[payer] ?? ZERO, amount);

const transfer = (purse: Record<string, CotMoney>, from: string, to: string, m: CotMoney) => {
    purse[from] = sub(purse[from] ?? ZERO, m);
    purse[to] = add(purse[to] ?? ZERO, m);
};

export const shown = (gs: CotGameState): Record<string, number> =>
    Object.fromEntries(gs.seats.map((id) => [id, total(gs.purse[id])]));

export const thiefOf = (gs: CotGameState): string | undefined =>
    Object.keys(gs.roles).find((id) => gs.roles[id] === 'thief');

// ── Roles ───────────────────────────────────────────────────────────
export const rolesFor = (n: number): CotRole[] => {
    const r: CotRole[] = ['thief', 'police', 'judge', 'advocate'];
    while (r.length < n) r.push('citizen');
    return r.slice(0, n);
};

export const ROLE_INFO: Record<CotRole, { name: string; emoji: string; goal: string }> = {
    thief: { name: 'Thief', emoji: '🧤', goal: 'Rob the room in the blackout and get away with it. Your ₹5,000 payday is counterfeit: only stolen money is real.' },
    police: { name: 'Police', emoji: '🚓', goal: 'Find the Thief. Watch the room, read the deals, and trust no one.' },
    judge: { name: 'Judge', emoji: '⚖️', goal: 'Hear everyone out and get the verdict right. Bribes are tempting… and risky.' },
    advocate: { name: 'Advocate', emoji: '💼', goal: 'Make deals. Offer the Thief your help for a fee, or sell what you learn.' },
    citizen: { name: 'Citizen', emoji: '🙂', goal: 'Keep your money safe. If you saw something, it might be worth a lot.' },
};

// ── A new game, a new round ─────────────────────────────────────────
export const newGame = (
    players: string[],
    roundsTotal: number,
    dealMs: number,
    now: number,
    rng: Rng = Math.random
): CotGameState => {
    const seats = shuffle(players, rng);
    const base: CotGameState = {
        game: 'court-of-thieves',
        phase: 'roles',
        round: 0,
        roundsTotal,
        dealMs,
        seats,
        roles: {},
        purse: Object.fromEntries(seats.map((id) => [id, { real: 0, fake: 0 }])),
        history: [],
        seq: 0,
    };
    return startRound(base, players, now, rng);
};

export const startRound = (gs: CotGameState, present: string[], now: number, rng: Rng = Math.random): CotGameState => {
    // Players who left are dropped from the seats; their money goes with them.
    const seats = gs.seats.filter((id) => present.includes(id));
    const roles: Record<string, CotRole> = {};
    shuffle(rolesFor(seats.length), rng).forEach((r, i) => (roles[seats[i]] = r));
    const purse: Record<string, CotMoney> = {};
    const roundStartPurse: Record<string, CotMoney> = {};
    for (const id of seats) {
        const m = gs.purse[id] ?? { ...ZERO };
        roundStartPurse[id] = { ...m };
        purse[id] = roles[id] === 'thief' ? { real: m.real, fake: m.fake + PAYDAY } : { real: m.real + PAYDAY, fake: m.fake };
    }
    const thief = seats.find((id) => roles[id] === 'thief')!;
    const phaseEndsAt = now + ROLE_MS;
    const outageAt = phaseEndsAt + OUTAGE_LEAD_MS;
    const lightsAt = outageAt + between(OUTAGE_MIN_MS, OUTAGE_MAX_MS, rng);
    const flashCount = between(1, 3, rng);
    const flashes = Array.from({ length: flashCount }, () => between(outageAt + 3000, lightsAt - 5000, rng)).sort((a, b) => a - b);
    const others = shuffle(seats.filter((id) => id !== thief), rng);
    const witnessCount = seats.length >= 5 && rng() < 0.35 ? 2 : 1;
    return {
        ...gs,
        phase: 'roles',
        round: gs.round + 1,
        seats,
        roles,
        purse,
        phaseEndsAt,
        outageAt,
        lightsAt,
        flashes,
        witnessIds: others.slice(0, witnessCount),
        heist: [],
        threads: [],
        lastSentAt: {},
        promises: [],
        supporters: {},
        thiefPaid: {},
        picks: {},
        trial: undefined,
        roundStartPurse,
        last: undefined,
        seq: gs.seq + 1,
    };
};

export const toOutage = (gs: CotGameState): CotGameState =>
    gs.phase === 'roles' ? { ...gs, phase: 'outage', phaseEndsAt: gs.lightsAt, seq: gs.seq + 1 } : gs;

// ── The heist ───────────────────────────────────────────────────────
const spotSeat = (gs: CotGameState, spot: CotSpot): string => (spot === 'home' ? thiefOf(gs)! : spot);

// Seats between two spots, round the shorter way (at least 1).
export const stepsBetween = (gs: CotGameState, a: CotSpot, b: CotSpot): number => {
    const n = gs.seats.length;
    const i = gs.seats.indexOf(spotSeat(gs, a));
    const j = gs.seats.indexOf(spotSeat(gs, b));
    const d = Math.abs(i - j);
    return Math.max(1, Math.min(d, n - d));
};

export const moveMs = (gs: CotGameState, from: CotSpot, to: CotSpot, mode: 'walk' | 'tiptoe'): number => {
    const s = stepsBetween(gs, from, to);
    return mode === 'walk' ? WALK_BASE_MS + WALK_MS_PER_STEP * s : TIPTOE_MS_PER_STEP * s;
};

export const transferMs = (amount: number): number => Math.round((amount * 1000) / RATE);

export type HeistSim = {
    purse: Record<string, CotMoney>;
    glove: CotMoney;
    spot: CotSpot;
    stolen: Record<string, CotMoney>;   // taken from each bag
    planted: Record<string, CotMoney>;  // put into each bag
};

// Play the heist log forward. Actions are applied when they finish; with
// `upTo`, anything not finished by then is left out.
export const simulate = (gs: CotGameState, actions: CotHeistAction[] = gs.heist ?? [], upTo = Infinity): HeistSim => {
    const thief = thiefOf(gs)!;
    const purse: Record<string, CotMoney> = Object.fromEntries(Object.entries(gs.purse).map(([k, v]) => [k, { ...v }]));
    let glove: CotMoney = { ...ZERO };
    let spot: CotSpot = 'home';
    const stolen: Record<string, CotMoney> = {};
    const planted: Record<string, CotMoney> = {};
    for (const a of actions) {
        if (a.until > upTo) break;
        if (a.k === 'move') {
            spot = a.to;
            if (a.to === 'home') {
                purse[thief] = add(purse[thief], glove);
                glove = { ...ZERO };
            }
        } else if (a.k === 'take') {
            const m = fromMix(purse[a.bag] ?? ZERO, a.amount);
            purse[a.bag] = sub(purse[a.bag], m);
            glove = add(glove, m);
            stolen[a.bag] = add(stolen[a.bag] ?? ZERO, m);
        } else if (a.k === 'plant') {
            const fromGlove = fromMix(glove, Math.min(a.amount, total(glove)));
            glove = sub(glove, fromGlove);
            const rest = a.amount - total(fromGlove);
            const fromPurse = rest > 0 ? fromMix(purse[thief], rest) : { ...ZERO };
            purse[thief] = sub(purse[thief], fromPurse);
            const m = add(fromGlove, fromPurse);
            purse[a.bag] = add(purse[a.bag] ?? ZERO, m);
            planted[a.bag] = add(planted[a.bag] ?? ZERO, m);
        }
    }
    return { purse, glove, spot, stolen, planted };
};

// Where the Thief is at time t, for drawing.
export type ThiefView = {
    spot: CotSpot;                                     // last place reached
    move?: { from: CotSpot; to: CotSpot; mode: 'walk' | 'tiptoe'; p: number };
    work?: { k: 'take' | 'plant'; bag: string; amount: number; p: number };
    busyUntil: number;
};
export const thiefAt = (gs: CotGameState, t: number): ThiefView => {
    let spot: CotSpot = 'home';
    let busyUntil = 0;
    for (const a of gs.heist ?? []) {
        if (a.at > t) break;
        busyUntil = a.until;
        const p = a.until > a.at ? Math.min(1, (t - a.at) / (a.until - a.at)) : 1;
        if (a.k === 'move') {
            if (t < a.until) return { spot, move: { from: a.from, to: a.to, mode: a.mode, p }, busyUntil };
            spot = a.to;
        } else if (t < a.until) {
            return { spot, work: { k: a.k, bag: a.bag, amount: a.amount, p }, busyUntil };
        }
    }
    return { spot, busyUntil };
};

// Footprints: each walk leaves prints spread along its path, laid at even
// times through the walk. `p` = how far along the path, `age` in ms.
export type Print = { from: CotSpot; to: CotSpot; p: number; age: number; i: number };
export const PRINTS_PER_STEP = 5;
export const printsAt = (gs: CotGameState, t: number): Print[] => {
    const out: Print[] = [];
    for (const a of gs.heist ?? []) {
        if (a.k !== 'move' || a.mode !== 'walk' || a.at > t) continue;
        if (t - a.until > PRINT_FADE_MS) continue;
        const n = PRINTS_PER_STEP * stepsBetween(gs, a.from, a.to);
        for (let i = 0; i < n; i++) {
            const p = (i + 0.5) / n;
            const laidAt = a.at + p * (a.until - a.at);
            const age = t - laidAt;
            if (age < 0 || age > PRINT_FADE_MS) continue;
            out.push({ from: a.from, to: a.to, p, age, i });
        }
    }
    return out;
};

export type HeistInput =
    | { k: 'move'; to: CotSpot; mode: 'walk' | 'tiptoe' }
    | { k: 'take'; amount: number }
    | { k: 'plant'; amount: number };

// The Thief does something at `now`. Returns the new state or why not.
export const heistAct = (
    gs: CotGameState,
    playerId: string,
    input: HeistInput,
    now: number
): { ok: true; gs: CotGameState } | { ok: false; reason: string } => {
    if (gs.phase !== 'outage') return { ok: false, reason: 'The lights are on.' };
    if (gs.roles[playerId] !== 'thief') return { ok: false, reason: 'Only the Thief can do that.' };
    if (now < (gs.outageAt ?? 0)) return { ok: false, reason: 'Wait for the lights to go out.' };
    const log = gs.heist ?? [];
    const lastUntil = log.length ? log[log.length - 1].until : 0;
    if (now < lastUntil - 50) return { ok: false, reason: 'Still busy.' };
    const at = Math.max(now, lastUntil);
    if (at >= (gs.lightsAt ?? 0)) return { ok: false, reason: 'The lights are back.' };
    const sim = simulate(gs, log);
    const thief = playerId;
    let action: CotHeistAction;
    if (input.k === 'move') {
        if (input.mode !== 'walk' && input.mode !== 'tiptoe') return { ok: false, reason: 'Walk or tiptoe?' };
        if (input.to === sim.spot) return { ok: false, reason: "You're already there." };
        if (input.to !== 'home' && (!gs.seats.includes(input.to) || input.to === thief))
            return { ok: false, reason: 'No bag there.' };
        action = { k: 'move', from: sim.spot, to: input.to, mode: input.mode, at, until: at + moveMs(gs, sim.spot, input.to, input.mode) };
    } else {
        if (sim.spot === 'home') return { ok: false, reason: 'Go to a bag first.' };
        if (!Number.isFinite(input.amount)) return { ok: false, reason: 'Pick an amount.' };
        const amount = Math.floor(input.amount / AMOUNT_STEP) * AMOUNT_STEP;
        if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'Pick an amount.' };
        const bag = sim.spot;
        if (input.k === 'take') {
            if (amount > total(sim.purse[bag])) return { ok: false, reason: "There isn't that much in the bag." };
            action = { k: 'take', bag, amount, at, until: at + transferMs(amount) };
        } else {
            if (amount > total(sim.glove) + total(sim.purse[thief])) return { ok: false, reason: "You don't have that much." };
            action = { k: 'plant', bag, amount, at, until: at + transferMs(amount) };
        }
    }
    return { ok: true, gs: { ...gs, heist: [...log, action] } };
};

// Times the Thief was out of their seat (glove visible), [start, end].
const outIntervals = (gs: CotGameState): [number, number][] => {
    const res: [number, number][] = [];
    let start: number | null = null;
    for (const a of gs.heist ?? []) {
        if (a.k !== 'move') continue;
        if (a.from === 'home' && start === null) start = a.at;
        if (a.to === 'home' && start !== null) {
            res.push([start, a.until]);
            start = null;
        }
    }
    if (start !== null) res.push([start, Infinity]);
    return res;
};

// The lights come back: work out what happened.
export const resolveOutage = (gs: CotGameState, now: number): CotGameState => {
    if (gs.phase !== 'outage') return gs;
    const lightsAt = gs.lightsAt!;
    const thief = thiefOf(gs)!;
    const log = (gs.heist ?? []).filter((a) => a.at < lightsAt);
    const last = log[log.length - 1];
    const finalSpot = simulate({ ...gs, heist: log }, log).spot;
    const lastMoveTo = [...log].reverse().find((a) => a.k === 'move') as Extract<CotHeistAction, { k: 'move' }> | undefined;
    const outAtEnd = (lastMoveTo ? lastMoveTo.to : 'home') !== 'home' || finalSpot !== 'home';
    const caught = !!last && (last.until > lightsAt || outAtEnd);
    const windowStart = lightsAt - EARLY_MS;
    const seenOut = outIntervals({ ...gs, heist: log }).some(([s, e]) => s <= lightsAt && e >= windowStart);
    const seenPrints = log.some((a) => a.k === 'move' && a.mode === 'walk' && a.until >= windowStart - PRINT_FADE_MS);
    const seen = caught || seenOut || seenPrints;
    const witnessIds = gs.witnessIds ?? [];
    const before = shown(gs);
    const notes: string[] = [];
    let purse: Record<string, CotMoney>;
    let stolen: Record<string, number> = {};
    let planted: Record<string, CotMoney> = {};
    let loot: CotMoney = { ...ZERO };
    const payouts: { id: string; amount: number; why: string }[] = [];
    if (caught) {
        purse = Object.fromEntries(Object.entries(gs.purse).map(([k, v]) => [k, { ...v }]));
        for (const w of witnessIds) {
            purse[w] = add(purse[w] ?? ZERO, { real: WITNESS_REWARD, fake: 0 });
            payouts.push({ id: w, amount: WITNESS_REWARD, why: 'Caught the Thief in the act' });
        }
        // The fine comes out of real money only: fake notes wouldn't hurt.
        const fine = Math.min(CAUGHT_FINE, purse[thief]?.real ?? 0);
        if (fine > 0) {
            purse[thief] = sub(purse[thief], { real: fine, fake: 0 });
            payouts.push({ id: thief, amount: -fine, why: 'Fine for being caught red-handed' });
        }
        notes.push('caught');
    } else {
        const sim = simulate({ ...gs, heist: log }, log);
        purse = sim.purse;
        stolen = Object.fromEntries(Object.entries(sim.stolen).map(([k, v]) => [k, total(v)]));
        planted = sim.planted;
        loot = Object.values(sim.stolen).reduce(add, { ...ZERO });
        if (log.length === 0) notes.push('nothing');
    }
    const next: CotGameState = { ...gs, heist: log, purse };
    const result: CotRoundResult = {
        round: gs.round,
        thiefId: thief,
        caught,
        seen,
        witnessIds,
        stolen,
        planted,
        loot,
        before,
        after: shown(next),
        notes,
        ...(caught ? { payouts, accused: null } : {}),
    };
    return {
        ...next,
        phase: caught ? 'roundEnd' : 'lights',
        phaseEndsAt: now + (caught ? ROUND_END_MS : LIGHTS_MS),
        last: result,
        seq: gs.seq + 1,
    };
};

export const toDeals = (gs: CotGameState, now: number): CotGameState =>
    gs.phase === 'lights' ? { ...gs, phase: 'deals', phaseEndsAt: now + gs.dealMs, seq: gs.seq + 1 } : gs;

// ── The deal phase ──────────────────────────────────────────────────
export type CotTarget = { kind: 'role'; role: CotRole } | { kind: 'witness' } | { kind: 'player'; id: string };

export const recipientsOf = (gs: CotGameState, sender: string, target: CotTarget): string[] => {
    if (target.kind === 'player') return gs.seats.includes(target.id) && target.id !== sender ? [target.id] : [];
    if (target.kind === 'witness') return (gs.witnessIds ?? []).filter((id) => id !== sender);
    return gs.seats.filter((id) => gs.roles[id] === target.role && id !== sender);
};

const targetKey = (t: CotTarget): string => (t.kind === 'player' ? 'player' : t.kind === 'witness' ? 'witness' : t.role);

// The people `who` has dealt with this round: sent them a message, or
// took one of their offers (a refusal doesn't count).
export const partnersOf = (gs: CotGameState, who: string): string[] => {
    const set = new Set<string>();
    for (const th of gs.threads ?? []) {
        const engaged = th.msgs.some((m) => m.from === who || (m.from !== who && !!m.offer && (m.offer.status === 'now' || m.offer.status === 'later')));
        if (!engaged) continue;
        if (th.a === who) set.add(th.b);
        else if (th.b === who) set.add(th.a);
    }
    return [...set];
};

export type SendInput = { tpl: string; amount?: number; about?: string };

const validateMsg = (gs: CotGameState, sender: string, input: SendInput): { tpl: CotTemplate } | { reason: string } => {
    const tpl = TEMPLATES.find((t) => t.id === input.tpl);
    if (!tpl) return { reason: 'Unknown message.' };
    if (tpl.amount === 'pick') {
        const a = input.amount ?? 0;
        if (!Number.isFinite(a) || a < AMOUNT_STEP || a > MAX_OFFER || a % AMOUNT_STEP !== 0) return { reason: 'Pick an amount.' };
        if (tpl.offer === 'hush' && a > total(gs.purse[sender])) return { reason: "You don't have that much." };
    }
    if (tpl.offer === 'reveal' && total(gs.purse[sender]) < REVEAL_PRICE) return { reason: "You don't have ₹500." };
    if (tpl.about && (!input.about || !gs.seats.includes(input.about))) return { reason: 'Pick a player.' };
    return { tpl };
};

const makeMsg = (sender: string, tpl: CotTemplate, input: SendInput, now: number, idx: number): CotMsg => {
    const m: CotMsg = { id: `${now}-${sender.slice(0, 4)}-${idx}`, from: sender, at: now, tpl: tpl.id };
    if (tpl.amount === 'pick') m.amount = input.amount;
    if (tpl.amount === 'fixed') m.amount = REVEAL_PRICE;
    if (tpl.about) m.about = input.about;
    if (tpl.offer) m.offer = { kind: tpl.offer, status: 'open' };
    return m;
};

const checkCooldown = (gs: CotGameState, sender: string, now: number): string | null => {
    if (gs.phase !== 'deals') return 'The deal phase is over.';
    if (!gs.seats.includes(sender)) return "You're not in this game.";
    const lastAt = gs.lastSentAt?.[sender] ?? 0;
    if (now - lastAt < MSG_COOLDOWN_MS) return `Wait ${Math.ceil((MSG_COOLDOWN_MS - (now - lastAt)) / 1000)} s.`;
    return null;
};

// Start (or continue) a conversation by addressing a role, the witness, or a player.
export const sendNew = (
    gs: CotGameState,
    sender: string,
    target: CotTarget,
    input: SendInput,
    now: number
): { ok: true; gs: CotGameState } | { ok: false; reason: string } => {
    const cd = checkCooldown(gs, sender, now);
    if (cd) return { ok: false, reason: cd };
    const v = validateMsg(gs, sender, input);
    if ('reason' in v) return { ok: false, reason: v.reason };
    const to = recipientsOf(gs, sender, target);
    if (to.length === 0) return { ok: false, reason: target.kind === 'player' ? 'Pick someone else.' : "There's nobody else to send that to." };
    const partners = new Set(partnersOf(gs, sender));
    const fresh = to.filter((id) => !partners.has(id));
    if (partners.size + fresh.length > MAX_PARTNERS) return { ok: false, reason: `You can deal with ${MAX_PARTNERS} people a round.` };
    const key = targetKey(target);
    const threads = [...(gs.threads ?? [])];
    to.forEach((b, i) => {
        const msg = makeMsg(sender, v.tpl, input, now, i);
        const idx = threads.findIndex((th) => th.a === sender && th.b === b && th.to === key);
        if (idx >= 0) threads[idx] = { ...threads[idx], msgs: [...threads[idx].msgs, msg] };
        else threads.push({ id: `${now}-${sender.slice(0, 4)}-${b.slice(0, 4)}`, a: sender, b, to: key, aKnowsB: key === 'player', msgs: [msg] });
    });
    return { ok: true, gs: { ...gs, threads, lastSentAt: { ...(gs.lastSentAt ?? {}), [sender]: now } } };
};

// Reply inside an existing conversation.
export const reply = (
    gs: CotGameState,
    sender: string,
    threadId: string,
    input: SendInput,
    now: number
): { ok: true; gs: CotGameState } | { ok: false; reason: string } => {
    const cd = checkCooldown(gs, sender, now);
    if (cd) return { ok: false, reason: cd };
    const threads = [...(gs.threads ?? [])];
    const idx = threads.findIndex((th) => th.id === threadId);
    if (idx < 0) return { ok: false, reason: 'That conversation is gone.' };
    const th = threads[idx];
    if (th.a !== sender && th.b !== sender) return { ok: false, reason: 'Not your conversation.' };
    const other = th.a === sender ? th.b : th.a;
    const partners = new Set(partnersOf(gs, sender));
    if (!partners.has(other) && partners.size >= MAX_PARTNERS) return { ok: false, reason: `You can deal with ${MAX_PARTNERS} people a round.` };
    const v = validateMsg(gs, sender, input);
    if ('reason' in v) return { ok: false, reason: v.reason };
    threads[idx] = { ...th, msgs: [...th.msgs, makeMsg(sender, v.tpl, input, now, th.msgs.length)] };
    return { ok: true, gs: { ...gs, threads, lastSentAt: { ...(gs.lastSentAt ?? {}), [sender]: now } } };
};

export type OfferChoice = 'now' | 'later' | 'refuse';

// Answer an offer. Money moves now, or a promise is kept for later.
export const respond = (
    gs: CotGameState,
    responder: string,
    threadId: string,
    msgId: string,
    choice: OfferChoice
): { ok: true; gs: CotGameState } | { ok: false; reason: string } => {
    if (gs.phase !== 'deals') return { ok: false, reason: 'The deal phase is over.' };
    const threads = [...(gs.threads ?? [])];
    const ti = threads.findIndex((th) => th.id === threadId);
    if (ti < 0) return { ok: false, reason: 'That conversation is gone.' };
    const th = threads[ti];
    const mi = th.msgs.findIndex((m) => m.id === msgId);
    const msg = th.msgs[mi];
    if (!msg?.offer || msg.offer.status !== 'open') return { ok: false, reason: 'That offer is closed.' };
    if (msg.from === responder || (th.a !== responder && th.b !== responder)) return { ok: false, reason: 'Not your offer to answer.' };
    const kind = msg.offer.kind;
    if (choice === 'later' && kind !== 'hush') return { ok: false, reason: 'Pay later only works for hush money.' };
    if (choice !== 'refuse') {
        const partners = new Set(partnersOf(gs, responder));
        if (!partners.has(msg.from) && partners.size >= MAX_PARTNERS)
            return { ok: false, reason: `You can deal with ${MAX_PARTNERS} people a round.` };
    }
    const purse: Record<string, CotMoney> = Object.fromEntries(Object.entries(gs.purse).map(([k, v]) => [k, { ...v }]));
    const promises: CotPromise[] = [...(gs.promises ?? [])];
    const supporters = { ...(gs.supporters ?? {}) };
    const thiefPaid: Record<string, CotMoney> = { ...(gs.thiefPaid ?? {}) };
    let status: CotOfferStatus = 'refused';
    let next: CotThread = th;
    if (choice !== 'refuse') {
        const payer = kind === 'demand' ? responder : msg.from;
        const payee = kind === 'demand' ? msg.from : responder;
        const amount = msg.amount ?? 0;
        if (choice === 'later') {
            promises.push({ from: payer, to: payee, amount, why: msg.tpl });
            status = 'later';
        } else if (total(purse[payer]) < amount) {
            status = 'failed';
        } else {
            const m = payment({ ...gs, purse }, payer, amount);
            transfer(purse, payer, payee, m);
            if (gs.roles[payer] === 'thief') thiefPaid[payee] = add(thiefPaid[payee] ?? ZERO, m);
            status = 'now';
        }
        if (status !== 'failed' && gs.roles[payer] === 'thief') supporters[payee] = true;
        if (status === 'now' && kind === 'reveal') {
            // The one who paid learns who the responder is.
            next = msg.from === th.a ? { ...th, aKnowsB: true } : { ...th, bKnowsA: true };
        }
    }
    const msgs = [...next.msgs];
    msgs[mi] = { ...msg, offer: { kind, status } };
    threads[ti] = { ...next, msgs };
    return { ok: true, gs: { ...gs, threads, purse, promises, supporters, thiefPaid } };
};

// "On acquittal" promises are paid at the end of the round, unless the
// person who made the promise was convicted (convicted Thief: the deal is
// off; an innocent who promised the Judge and got convicted anyway doesn't
// pay either). Whatever the payer can't cover is lost.
export const settlePromises = (gs: CotGameState, convictedId: string | null): CotGameState => {
    if (!(gs.promises ?? []).length) return { ...gs, promises: [] };
    const purse: Record<string, CotMoney> = Object.fromEntries(Object.entries(gs.purse).map(([k, v]) => [k, { ...v }]));
    for (const p of gs.promises ?? []) {
        if (p.from === convictedId) continue;
        if (!purse[p.from] || !purse[p.to]) continue;
        transfer(purse, p.from, p.to, payment({ ...gs, purse }, p.from, p.amount));
    }
    return { ...gs, purse, promises: [] };
};

export const endDeals = (gs: CotGameState, now: number): CotGameState => {
    if (gs.phase !== 'deals') return gs;
    return { ...gs, phase: 'arrest', phaseEndsAt: now + ARREST_MS, picks: {}, seq: gs.seq + 1 };
};

// ── The arrest ──────────────────────────────────────────────────────
export const policeOf = (gs: CotGameState): string | undefined =>
    Object.keys(gs.roles).find((id) => gs.roles[id] === 'police');

export const pickSuspect = (
    gs: CotGameState,
    who: string,
    suspect: string
): { ok: true; gs: CotGameState } | { ok: false; reason: string } => {
    if (gs.phase !== 'arrest') return { ok: false, reason: 'Too late.' };
    if (!gs.seats.includes(who)) return { ok: false, reason: "You're not in this game." };
    if (gs.picks?.[who]) return { ok: false, reason: 'Already locked in.' };
    if (suspect !== 'none' && (!gs.seats.includes(suspect) || suspect === who)) return { ok: false, reason: 'Pick someone else.' };
    return { ok: true, gs: { ...gs, picks: { ...(gs.picks ?? {}), [who]: suspect } } };
};

export const allPicked = (gs: CotGameState, present: string[]): boolean =>
    gs.seats.filter((id) => present.includes(id)).every((id) => !!gs.picks?.[id]);

// Time's up (or everyone locked in): the Police's pick is the arrest.
export const closeArrest = (gs: CotGameState, now: number): CotGameState => {
    if (gs.phase !== 'arrest') return gs;
    const police = policeOf(gs);
    const pick = police ? gs.picks?.[police] : undefined;
    if (!police || !pick || pick === 'none' || !gs.seats.includes(pick)) return finishRound(gs, null, false, now);
    const judge = Object.keys(gs.roles).find((id) => gs.roles[id] === 'judge');
    const advocate = Object.keys(gs.roles).find((id) => gs.roles[id] === 'advocate');
    // The Judge can't judge their own trial: the Advocate stands in.
    const judgeId = judge && judge !== pick ? judge : advocate ?? police;
    const speakers: CotSpeaker[] = [{ id: police, as: 'police' }];
    if (advocate && advocate !== pick && advocate !== judgeId) speakers.push({ id: advocate, as: 'advocate' });
    speakers.push({ id: pick, as: 'accused' });
    return {
        ...gs,
        phase: 'trial',
        trial: { accused: pick, policeId: police, judgeId, speakers, turn: 0 },
        phaseEndsAt: now + TURN_MS,
        seq: gs.seq + 1,
    };
};

// ── The trial ───────────────────────────────────────────────────────
export const endTurn = (gs: CotGameState, turn: number, now: number): CotGameState => {
    if (gs.phase !== 'trial' || !gs.trial || gs.trial.turn !== turn) return gs;
    const next = turn + 1;
    if (next < gs.trial.speakers.length)
        return { ...gs, trial: { ...gs.trial, turn: next }, phaseEndsAt: now + TURN_MS, seq: gs.seq + 1 };
    return { ...gs, phase: 'verdict', phaseEndsAt: now + VERDICT_MS, seq: gs.seq + 1 };
};

// The Judge rules (null = ran out of time: not guilty).
export const decide = (
    gs: CotGameState,
    who: string | null,
    guilty: boolean,
    now: number
): { ok: true; gs: CotGameState } | { ok: false; reason: string } => {
    if (gs.phase !== 'verdict' || !gs.trial) return { ok: false, reason: 'Too late.' };
    if (who !== null && who !== gs.trial.judgeId) return { ok: false, reason: 'Only the Judge rules.' };
    return { ok: true, gs: finishRound(gs, gs.trial.accused, guilty, now) };
};

// Each player's first tip to the Police this round: tipster -> who they named.
export const firstTips = (gs: CotGameState, police: string | undefined): Map<string, string> => {
    const out = new Map<string, string>();
    if (!police) return out;
    const tips: CotMsg[] = [];
    for (const th of gs.threads ?? []) {
        for (const m of th.msgs) {
            const other = m.from === th.a ? th.b : th.a;
            if (other === police && m.from !== police && m.about && TIP_TEMPLATES.includes(m.tpl)) tips.push(m);
        }
    }
    tips.sort((x, y) => x.at - y.at);
    for (const m of tips) if (!out.has(m.from)) out.set(m.from, m.about!);
    return out;
};

// ── Who a phase is waiting for ──────────────────────────────────────
// The one person a phase can't go on without, if they've left the group.
export const actorGone = (gs: CotGameState, present: string[]): boolean => {
    const gone = (id: string | undefined) => !!id && !present.includes(id);
    if (gs.phase === 'outage') return gone(thiefOf(gs));
    if (gs.phase === 'arrest') return gone(policeOf(gs));
    if (gs.phase === 'trial') return gone(gs.trial?.speakers[gs.trial.turn]?.id);
    if (gs.phase === 'verdict') return gone(gs.trial?.judgeId);
    return false;
};

// May a timed step run now? Its time is up (on the server clock), or the
// person it waits for has left.
export const isDue = (gs: CotGameState, now: number, present: string[]): boolean => {
    const end = gs.phase === 'outage' ? gs.lightsAt : gs.phaseEndsAt;
    if (end !== undefined && now >= end - STEP_GRACE_MS) return true;
    return actorGone(gs, present);
};

// ── Payouts ─────────────────────────────────────────────────────────
// Money the court hands out comes from the bank (real). Money it takes
// goes to the bank, as far as the purse can cover it.
export const finishRound = (gs: CotGameState, accused: string | null, guilty: boolean, now: number): CotGameState => {
    const purse: Record<string, CotMoney> = Object.fromEntries(Object.entries(gs.purse).map(([k, v]) => [k, { ...v }]));
    const payouts: { id: string; amount: number; why: string }[] = [];
    const gain = (id: string | undefined, real: number, why: string) => {
        if (!id || !purse[id] || real <= 0) return;
        purse[id] = add(purse[id], { real, fake: 0 });
        payouts.push({ id, amount: real, why });
    };
    const takeAway = (id: string, amount: number, why: string): number => {
        if (!purse[id] || amount <= 0) return 0;
        const m = fromMix(purse[id], amount);
        purse[id] = sub(purse[id], m);
        if (total(m) > 0) payouts.push({ id, amount: -total(m), why });
        return total(m);
    };
    const thief = thiefOf(gs)!;
    const police = gs.trial?.policeId ?? policeOf(gs);
    const judgeId = gs.trial?.judgeId;
    const convicted = accused === thief && guilty;
    const last = gs.last;
    let promises = gs.promises ?? [];

    if (convicted) {
        // The stash: the real money stolen this round that's still in the Thief's purse.
        const stash = Math.min(last?.loot.real ?? 0, purse[thief].real);
        purse[thief] = sub(purse[thief], { real: stash, fake: 0 });
        if (stash > 0) payouts.push({ id: thief, amount: -stash, why: 'Stash seized' });
        const policeShare = Math.floor(stash / 2);
        gain(police, policeShare, 'Half the seized stash');
        const victims = Object.entries(last?.stolen ?? {}).filter(([id, v]) => v > 0 && id !== thief);
        const stolenTotal = victims.reduce((a, [, v]) => a + v, 0);
        let left = stash - policeShare;
        victims.forEach(([id, v], i) => {
            const share = i === victims.length - 1 ? left : Math.floor(((stash - policeShare) * v) / stolenTotal);
            left -= share;
            gain(id, share, 'Your stolen money, back');
        });
        gain(police, POLICE_REWARD, 'Caught the Thief');
        gain(judgeId, JUDGE_REWARD, 'Right verdict');
        // Witnesses who saw it and didn't take the Thief's money.
        if (last?.seen) for (const w of last.witnessIds) if (!gs.supporters?.[w]) gain(w, WITNESS_REWARD, 'Saw the heist');
        // Took the Thief's money? Give it back (to the bank) and pay a fine.
        for (const [id, m] of Object.entries(gs.thiefPaid ?? {})) {
            if (!purse[id]) continue;
            const back = { real: Math.min(m.real, purse[id].real), fake: Math.min(m.fake, purse[id].fake) };
            purse[id] = sub(purse[id], back);
            if (total(back) > 0) payouts.push({ id, amount: -total(back), why: "The Thief's money, returned" });
            takeAway(id, SUPPORTER_FINE, 'Fine for helping the Thief');
        }
        for (const id of Object.keys(gs.supporters ?? {})) {
            if (!(gs.thiefPaid ?? {})[id]) takeAway(id, SUPPORTER_FINE, 'Fine for helping the Thief');
        }
        // The Thief's own promises are off; anyone else's still stand.
        promises = promises.filter((p) => p.from !== thief);
        // Tips to the Police: only each player's FIRST tip counts, so naming
        // everyone in turn earns nothing. The Thief can't tip on themselves.
        firstTips(gs, police).forEach((about, id) => {
            if (about === thief && id !== thief) gain(id, TIP_REWARD, 'Your tip was right');
        });
    } else {
        if (accused && accused !== thief && police) {
            const paid = takeAway(police, WRONG_ARREST_FINE, `Arrested the wrong person`);
            if (paid > 0) {
                purse[accused] = add(purse[accused], { real: paid, fake: 0 });
                payouts.push({ id: accused, amount: paid, why: 'Wrongly arrested: paid by the Police' });
            }
        }
        if (accused && accused !== thief && !guilty) gain(judgeId, JUDGE_REWARD, 'Right verdict');
    }
    // Everyone else who secretly picked the Thief.
    for (const [id, pick] of Object.entries(gs.picks ?? {})) {
        if (id !== police && id !== thief && pick === thief) gain(id, HUNCH_REWARD, 'Your hunch was right');
    }

    let next: CotGameState = { ...gs, purse, promises };
    {
        const before = shown(next);
        next = settlePromises(next, accused && guilty ? accused : null);
        const after = shown(next);
        for (const id of gs.seats) if (after[id] !== before[id]) payouts.push({ id, amount: after[id] - before[id], why: 'Promises paid' });
    }

    const result = last
        ? {
              ...last,
              after: shown(next),
              policeId: police,
              accused,
              judgeId,
              guilty: accused ? guilty : undefined,
              convicted,
              payouts,
          }
        : last;
    return { ...next, phase: 'roundEnd', phaseEndsAt: now + ROUND_END_MS, last: result, seq: gs.seq + 1 };
};

// After the round summary: the next round, or the final count.
export const nextRound = (gs: CotGameState, present: string[], now: number, rng: Rng = Math.random): CotGameState => {
    if (gs.phase !== 'roundEnd') return gs;
    const history = [...(gs.history ?? []), ...(gs.last ? [gs.last] : [])];
    const done = { ...gs, history };
    if (gs.round >= gs.roundsTotal || present.filter((id) => gs.seats.includes(id)).length < MIN_PLAYERS)
        return { ...done, phase: 'over', phaseEndsAt: undefined, seq: gs.seq + 1 };
    return startRound(done, present, now, rng);
};

export const endEarly = (gs: CotGameState): CotGameState => {
    if (gs.phase === 'over') return gs;
    if (gs.phase === 'roundEnd') {
        // The round is finished: it counts.
        const history = [...(gs.history ?? []), ...(gs.last ? [gs.last] : [])];
        return { ...gs, phase: 'over', endedEarly: true, phaseEndsAt: undefined, history, seq: gs.seq + 1 };
    }
    // A round in progress is called off: purses go back to before its payday,
    // so nobody keeps half a round (the Thief's fake payday included).
    const purse = gs.roundStartPurse
        ? Object.fromEntries(gs.seats.map((id) => [id, { ...(gs.roundStartPurse![id] ?? ZERO) }]))
        : gs.purse;
    return { ...gs, purse, phase: 'over', endedEarly: true, phaseEndsAt: undefined, seq: gs.seq + 1 };
};

// ── The final count ─────────────────────────────────────────────────
export const roundsPlayed = (gs: CotGameState): number => (gs.history ?? []).length;

export type CotStanding = { playerId: string; shown: number; real: number; fake: number; rank: number; points: number };
// `present` = players still in the group: anyone who left doesn't place or score.
export const standings = (gs: CotGameState, present?: string[]): CotStanding[] => {
    const seats = present ? gs.seats.filter((id) => present.includes(id)) : gs.seats;
    const rows = seats.map((id) => {
        const m = gs.purse[id] ?? ZERO;
        return { playerId: id, shown: total(m), real: m.real, fake: m.fake, rank: 0, points: 0 };
    });
    rows.sort((a, b) => b.real - a.real || b.shown - a.shown);
    rows.forEach((r, i) => (r.rank = i === 0 ? 1 : r.real === rows[i - 1].real ? rows[i - 1].rank : rows[i - 1].rank + 1));
    const scores = roundsPlayed(gs) >= (gs.endedEarly ? MIN_ROUNDS_FOR_POINTS : 1);
    for (const r of rows) r.points = !scores ? 0 : r.rank === 1 ? 10 : r.rank === 2 ? 5 : 2;
    return rows;
};
