// 🏛️ Race Before the Roof Falls: the rules, as pure functions on the game state.
//
// Two teams (☀️ Team Sun and 🌙 Team Moon; 'tiger' and 'cobra' in the code)
// race through the same ruin. Each team has
// three doors: the Gate (emoji order), the Crossing (a number code) and the
// Vault (letter order). At every door one player holds the key and sees
// the lock; the others hold the clue pages. The key passes on each door.
//
// Gems: open a door and every 5 seconds left on its 90 s timer is a gem.
// A wrong push is a strike (−2 gems); a second wrong push at the same door,
// or the timer running out, brings the roof down. The explorers (never the
// key-holder) can throw the team's one rope within a few seconds: the team
// survives, takes a strike and tries the door again with a new lock and
// no gems for it. No rope: the team is buried and out of the expedition.
//
// Between doors a team can spend 3 gems on a 🌋 tremor (one player
// proposes, a teammate confirms) to freeze and scramble the rivals' lock.
// A team starting a door the rivals have already opened gets the 🔦 torch,
// which lights up the clue that matters most.
//
// The treasure: once a team opens the vault, every one of its players must
// hold the chest together for 4 s. The rivals can stop it once, if every
// one of them holds for 3 s and they can pay 5 gems: everyone tumbles, and
// both teams race through the Final Seal (one tile and one clue per
// player). The seal's winners then claim with nobody able to stop them,
// but if one of them lets go mid-hold (or they take too long) the chest is
// unguarded and whichever team holds together first takes it.
//
// Score: gems left + 25 for the treasure, added up over the expeditions.
//
// Everything here is deterministic given `rng` and the times passed in, so
// it's tested without Firestore (logic/game.ts wraps it in transactions).
// `present` is who is still in the group: players who left don't count for
// holds, keys or pages.
import type { RrfGameState, RrfHold, RrfResult, RrfStats, RrfTeam, RrfTeamId } from '../../../shared/types';
import { SCENARIOS } from '../data/scenarios';
import { dealPages, isCorrect, makeDoorPuzzle, makeSeal, shuffle, type Rng } from './puzzles';

export type { Rng };

// ── Numbers to tune ─────────────────────────────────────────────────
export const MIN_TEAM = 2;
export const MAX_TEAM = 5;
export const MIN_PLAYERS = MIN_TEAM * 2;
export const DOORS = 3;
export const INTRO_MS = 15000;
export const DOOR_MS = 90000;
export const RETRY_MS = 60000;             // the same door again after the rope
export const GEM_MS = 5000;                // a gem per 5 s left
export const STRIKE_GEMS = 2;
export const STRIKES_TO_FALL = 2;          // per door
export const ROPE_WINDOW_MS = 6000;
export const BETWEEN_MS = 10000;
export const TREMOR_COST = 3;
export const TREMOR_MS = 8000;
export const TREMOR_CONFIRM_MS = 8000;
export const INTERRUPT_COST = 5;
export const CLAIM_HOLD_MS = 4000;
export const INTERRUPT_HOLD_MS = 3000;
export const SEAL_MS = 90000;
export const SEAL_LOCK_MS = 5000;
export const GUARD_MS = 20000;             // the seal winners' time to claim before the chest is up for grabs
export const FUMBLE_MS = 1000;             // a seal winner who lets go mid-hold has this long to grab it again
export const TREASURE = 25;
export const EXPEDITION_END_MS = 25000;
export const EXPEDITION_OPTIONS = [1, 3, 5] as const;
export const DEFAULT_EXPEDITIONS = 3;
export const TEAM_IDS: RrfTeamId[] = ['tiger', 'cobra'];

export type Teams = Record<RrfTeamId, string[]>;
export type Result = { ok: true; gs: RrfGameState } | { ok: false; reason: string };
const fail = (reason: string): Result => ({ ok: false, reason });
const clone = (gs: RrfGameState): RrfGameState => JSON.parse(JSON.stringify(gs));

export const rivalOf = (id: RrfTeamId): RrfTeamId => (id === 'tiger' ? 'cobra' : 'tiger');
export const teamOf = (gs: RrfGameState, pid: string): RrfTeam | null =>
    TEAM_IDS.map((t) => gs.teams[t]).find((t) => t.members.includes(pid)) ?? null;
export const here = (team: RrfTeam, present: string[]) => team.members.filter((m) => present.includes(m));
export const explorersOf = (team: RrfTeam, present: string[]) => here(team, present).filter((m) => m !== team.keyHolder);

// ── Teams ───────────────────────────────────────────────────────────
export const teamsProblem = (teams: Teams, present: string[]): string | null => {
    const all = [...teams.tiger, ...teams.cobra];
    if (new Set(all).size !== all.length) return 'Someone is on both teams.';
    if (all.some((p) => !present.includes(p))) return 'Someone on a team has left.';
    for (const t of TEAM_IDS) {
        if (teams[t].length < MIN_TEAM) return `Each team needs at least ${MIN_TEAM} players.`;
        if (teams[t].length > MAX_TEAM) return `A team can have at most ${MAX_TEAM} players.`;
    }
    return null;
};

// ── Teams come from the session ("👥 Play as Teams" in the game menu) ──
// The game needs exactly two of them, each with 2 to 5 players still in
// the group. The first becomes ☀️ Sun, the second 🌙 Moon. Players who
// aren't on a team watch.
export type SessionTeam = { id: string; name: string; color: string; playerIds: string[] };
export type Sides = Record<RrfTeamId, { name: string; color: string }>;
export type FromSession = { ok: true; teams: Teams; sides: Sides; watching: string[] } | { ok: false; problem: string };

export const NO_TEAMS =
    'Race Before the Roof Falls! is played by 2 teams. Set them up first: open the players list (👥) in the game menu and tap “Play as Teams”.';

export const fromSessionTeams = (enabled: boolean | undefined, session: SessionTeam[] | undefined, present: string[]): FromSession => {
    const list = enabled ? (session ?? []) : [];
    if (!list.length) return { ok: false, problem: NO_TEAMS };
    if (list.length !== 2) {
        return {
            ok: false,
            problem: `Race Before the Roof Falls! is played by exactly 2 teams, and you have ${list.length}. Edit the teams (👥 in the game menu) so there are 2.`,
        };
    }
    const [a, b] = list.map((t) => t.playerIds.filter((p) => present.includes(p)));
    const both = a.filter((p) => b.includes(p));
    if (both.length) return { ok: false, problem: 'Someone is on both teams. Edit the teams so everyone is on one.' };
    for (const [t, people] of [[list[0], a], [list[1], b]] as const) {
        if (people.length < MIN_TEAM) return { ok: false, problem: `${t.name} has ${people.length} player${people.length === 1 ? '' : 's'} here. Each team needs ${MIN_TEAM} to ${MAX_TEAM}.` };
        if (people.length > MAX_TEAM) return { ok: false, problem: `${t.name} has ${people.length} players. Each team can have at most ${MAX_TEAM}.` };
    }
    return {
        ok: true,
        teams: { tiger: a, cobra: b },
        sides: { tiger: { name: list[0].name, color: list[0].color }, cobra: { name: list[1].name, color: list[1].color } },
        watching: present.filter((p) => !a.includes(p) && !b.includes(p)),
    };
};

const blankTeam = (id: RrfTeamId, members: string[], keyTurn: number): RrfTeam => ({
    id,
    members,
    keyTurn,
    score: 0,
    stage: 'door',
    door: 0,
    doorStartedAt: 0,
    doorEndsAt: 0,
    stageEndsAt: 0,
    keyHolder: members[keyTurn % members.length] ?? '',
    puzzle: null,
    pages: {},
    draft: [],
    torch: false,
    gems: 0,
    strikes: 0,
    doorStrikes: 0,
    ropeUsed: false,
    retry: false,
    frozenUntil: 0,
    tremorQueued: false,
    tremorSentAfter: -1,
    tremorProposal: null,
    interruptUsed: false,
    doorLog: [],
    seal: null,
});

// ── A new game, a new expedition ────────────────────────────────────
export const newGame = (teams: Teams, expeditionsTotal: number, now: number, rng: Rng = Math.random, sides?: Sides): RrfGameState => {
    const gs: RrfGameState = {
        game: 'roof-race',
        phase: 'intro',
        seq: 0,
        expedition: 0,
        expeditionsTotal,
        scenario: '',
        usedScenarios: [],
        phaseEndsAt: 0,
        teams: { tiger: blankTeam('tiger', teams.tiger, 0), cobra: blankTeam('cobra', teams.cobra, 0) },
        holds: {},
        interruptedBy: null,
        sealWinner: null,
        unguarded: false,
        results: [],
        stats: Object.fromEntries([...teams.tiger, ...teams.cobra].map((p) => [p, { opened: 0, clean: 0, ropes: 0, strikes: 0 }])),
        ...(sides ? { sides } : {}),
    };
    return startExpedition(gs, now, rng);
};

const startExpedition = (gs: RrfGameState, now: number, rng: Rng): RrfGameState => {
    const fresh = SCENARIOS.filter((s) => !gs.usedScenarios.includes(s.id));
    const scenario = (fresh.length ? fresh : SCENARIOS)[Math.floor(rng() * (fresh.length || SCENARIOS.length))];
    for (const id of TEAM_IDS) {
        const t = gs.teams[id];
        gs.teams[id] = { ...blankTeam(id, t.members, t.keyTurn), score: t.score };
    }
    return {
        ...gs,
        phase: 'intro',
        seq: gs.seq + 1,
        expedition: gs.expedition + 1,
        scenario: scenario.id,
        usedScenarios: fresh.length ? [...gs.usedScenarios, scenario.id] : [scenario.id],
        phaseEndsAt: now + INTRO_MS,
        holds: {},
        interruptedBy: null,
        sealWinner: null,
        unguarded: false,
    };
};

// How far a team has got: 2 per door opened, +1 while it's past a door.
// A buried team keeps the doors it opened (it died at the next one).
const progress = (t: RrfTeam): number => t.door * 2 + (t.stage === 'between' || t.stage === 'vault' ? 1 : 0);

// Start (or, after the rope, restart) a door.
const startDoor = (gs: RrfGameState, id: RrfTeamId, door: number, now: number, present: string[], rng: Rng, retry = false) => {
    const t = gs.teams[id];
    const people = here(t, present);
    if (!people.length) {
        t.stage = 'buried';
        return;
    }
    if (!retry || !people.includes(t.keyHolder)) {
        t.keyHolder = people[t.keyTurn % people.length];
        t.keyTurn += 1;
    }
    const rival = gs.teams[rivalOf(id)];
    t.door = door;
    t.stage = 'door';
    t.retry = retry;
    t.puzzle = makeDoorPuzzle(door, rng);
    const explorers = people.filter((p) => p !== t.keyHolder);
    t.pages = dealPages(t.puzzle.clues.length, explorers.length ? explorers : [t.keyHolder], rng);
    t.draft = [];
    t.doorStrikes = 0;
    if (!retry) t.torch = progress(rival) > door * 2;
    t.doorStartedAt = now;
    t.doorEndsAt = now + (retry ? RETRY_MS : DOOR_MS);
    t.stageEndsAt = 0;
    t.tremorProposal = null;
    if (t.tremorQueued) {
        t.tremorQueued = false;
        t.frozenUntil = now + TREMOR_MS;
    }
};

const beginRun = (gs: RrfGameState, now: number, present: string[], rng: Rng): RrfGameState => {
    const next = { ...gs, phase: 'run' as const, seq: gs.seq + 1, phaseEndsAt: 0 };
    for (const id of TEAM_IDS) startDoor(next, id, 0, now, present, rng);
    return next;
};

const fall = (t: RrfTeam, now: number, gs: RrfGameState) => {
    t.stage = 'falling';
    t.stageEndsAt = now + ROPE_WINDOW_MS;
    t.tremorProposal = null;
    dropHolds(gs, t.id);
};

const dropHolds = (gs: RrfGameState, id: RrfTeamId) => {
    for (const p of gs.teams[id].members) delete gs.holds[p];
};

const endExpedition = (gs: RrfGameState, winner: RrfTeamId | null, how: RrfResult['how'], now: number): RrfGameState => {
    const result: RrfResult = {
        expedition: gs.expedition,
        scenario: gs.scenario,
        winner,
        how,
        gems: { tiger: gs.teams.tiger.gems, cobra: gs.teams.cobra.gems },
        interruptedBy: gs.interruptedBy,
    };
    for (const id of TEAM_IDS) gs.teams[id].score += gs.teams[id].gems + (winner === id ? TREASURE : 0);
    return { ...gs, phase: 'expeditionEnd', seq: gs.seq + 1, phaseEndsAt: now + EXPEDITION_END_MS, holds: {}, results: [...gs.results, result] };
};

// ── Holding the chest (and the interrupt) ───────────────────────────
const canInterrupt = (gs: RrfGameState, id: RrfTeamId): boolean => {
    const t = gs.teams[id];
    return (
        gs.phase === 'run' &&
        gs.teams[rivalOf(id)].stage === 'vault' &&
        (t.stage === 'door' || t.stage === 'between') &&
        !t.interruptUsed &&
        t.gems >= INTERRUPT_COST
    );
};

const canClaim = (gs: RrfGameState, id: RrfTeamId): boolean =>
    (gs.phase === 'run' && gs.teams[id].stage === 'vault') ||
    (gs.phase === 'finalClaim' && (gs.sealWinner === id || gs.unguarded));

// What a press from this player means right now, if anything.
export const holdKind = (gs: RrfGameState, pid: string): RrfHold['kind'] | null => {
    const t = teamOf(gs, pid);
    if (!t) return null;
    if (canClaim(gs, t.id)) return 'claim';
    if (canInterrupt(gs, t.id)) return 'interrupt';
    return null;
};

// When this team's hold completes (every player still here holding the
// same kind of hold), or null.
export const holdDoneAt = (gs: RrfGameState, id: RrfTeamId, present: string[]): { at: number; kind: RrfHold['kind'] } | null => {
    const people = here(gs.teams[id], present);
    if (!people.length) return null;
    const holds = people.map((p) => gs.holds[p]);
    if (holds.some((h) => !h)) return null;
    const kind = holds[0].kind;
    if (holds.some((h) => h.kind !== kind)) return null;
    if (kind === 'claim' ? !canClaim(gs, id) : !canInterrupt(gs, id)) return null;
    return { at: Math.max(...holds.map((h) => h.at)) + (kind === 'claim' ? CLAIM_HOLD_MS : INTERRUPT_HOLD_MS), kind };
};

const startSeal = (gs: RrfGameState, now: number, present: string[], rng: Rng): RrfGameState => {
    for (const id of TEAM_IDS) {
        const t = gs.teams[id];
        const people = here(t, present);
        const s = makeSeal(people, rng);
        t.seal = { tiles: s.tiles, answer: s.answer, placed: {}, lockedUntil: 0, wrong: 0 };
        t.tremorProposal = null;
        t.frozenUntil = 0;
    }
    return { ...gs, phase: 'seal', seq: gs.seq + 1, phaseEndsAt: now + SEAL_MS, holds: {} };
};

const applyHold = (gs: RrfGameState, id: RrfTeamId, kind: RrfHold['kind'], now: number, present: string[], rng: Rng): RrfGameState => {
    if (kind === 'claim') {
        const how: RrfResult['how'] = gs.phase === 'finalClaim' && gs.sealWinner !== id ? 'steal' : 'claim';
        return endExpedition(gs, id, how, now);
    }
    const t = gs.teams[id];
    t.gems -= INTERRUPT_COST;
    t.interruptUsed = true;
    return startSeal({ ...gs, interruptedBy: id }, now, present, rng);
};

// ── Things that happen on their own ─────────────────────────────────
// Everything due at or before `now`, earliest first. `nextDue` tells the
// phones when to call `advance` next.
type Ev = { at: number; run: (gs: RrfGameState) => RrfGameState };

const events = (gs: RrfGameState, now: number, present: string[], rng: Rng): Ev[] => {
    const evs: Ev[] = [];
    const ph = gs.phase;
    if (ph === 'intro') evs.push({ at: gs.phaseEndsAt, run: (g) => beginRun(g, now, present, rng) });
    if (ph === 'expeditionEnd') {
        evs.push({
            at: gs.phaseEndsAt,
            run: (g) => (g.expedition >= g.expeditionsTotal ? { ...g, phase: 'over', seq: g.seq + 1, phaseEndsAt: 0 } : startExpedition(g, now, rng)),
        });
    }
    if (ph === 'run') {
        for (const id of TEAM_IDS) {
            const t = gs.teams[id];
            const people = here(t, present);
            if (t.stage !== 'buried' && !people.length) {
                evs.push({ at: -Infinity, run: (g) => { g.teams[id].stage = 'buried'; dropHolds(g, id); return g; } });
                continue;
            }
            if ((t.stage === 'door' || t.stage === 'falling') && !people.includes(t.keyHolder)) {
                // The key-holder left: the next player takes the key, same lock.
                evs.push({ at: -Infinity, run: (g) => { const tt = g.teams[id]; tt.keyHolder = people[0]; tt.draft = []; reDeal(tt, present, rng); return g; } });
                continue;
            }
            if (t.stage === 'door' && t.puzzle && !samePages(t, present)) {
                evs.push({ at: -Infinity, run: (g) => { reDeal(g.teams[id], present, rng); return g; } });
            }
            if (t.stage === 'door') evs.push({ at: t.doorEndsAt, run: (g) => { fall(g.teams[id], now, g); return g; } });
            if (t.stage === 'falling') evs.push({ at: t.stageEndsAt, run: (g) => { g.teams[id].stage = 'buried'; return g; } });
            if (t.stage === 'between') evs.push({ at: t.stageEndsAt, run: (g) => { startDoor(g, id, g.teams[id].door + 1, now, present, rng); return g; } });
            if (t.tremorProposal) evs.push({ at: t.tremorProposal.at + TREMOR_CONFIRM_MS, run: (g) => { g.teams[id].tremorProposal = null; return g; } });
        }
        if (TEAM_IDS.every((id) => gs.teams[id].stage === 'buried')) evs.push({ at: -Infinity, run: (g) => endExpedition(g, null, 'none', now) });
    }
    if (ph === 'seal') {
        evs.push({
            at: gs.phaseEndsAt,
            run: (g) => {
                const [a, b] = [g.teams.tiger.gems, g.teams.cobra.gems];
                const w: RrfTeamId | null = a > b ? 'tiger' : b > a ? 'cobra' : null;
                return endExpedition(g, w, w ? 'seal-timeout' : 'none', now);
            },
        });
    }
    if (ph === 'finalClaim' && !gs.unguarded) evs.push({ at: gs.phaseEndsAt, run: (g) => ({ ...g, unguarded: true, fumble: null }) });
    if (ph === 'finalClaim' && !gs.unguarded && gs.fumble) evs.push({ at: gs.fumble.at, run: (g) => ({ ...g, unguarded: true, fumble: null }) });
    if (ph === 'run' || ph === 'finalClaim') {
        // Holds from players who left (or who can't hold now) don't count.
        for (const [p, h] of Object.entries(gs.holds)) {
            if (!present.includes(p) || holdKind(gs, p) !== h.kind) evs.push({ at: -Infinity, run: (g) => { delete g.holds[p]; return g; } });
        }
        const done = TEAM_IDS.map((id) => ({ id, d: holdDoneAt(gs, id, present) }))
            .filter((x) => x.d)
            .sort((x, y) => x.d!.at - y.d!.at || (x.d!.kind === 'claim' ? -1 : 1));
        if (done.length) evs.push({ at: done[0].d!.at, run: (g) => applyHold(g, done[0].id, done[0].d!.kind, now, present, rng) });
    }
    return evs.sort((x, y) => x.at - y.at);
};

const samePages = (t: RrfTeam, present: string[]): boolean => {
    const want = explorersOf(t, present);
    const have = Object.keys(t.pages);
    if (!want.length) return have.length === 1 && have[0] === t.keyHolder;
    return want.length === have.length && want.every((w) => have.includes(w));
};
const reDeal = (t: RrfTeam, present: string[], rng: Rng) => {
    if (!t.puzzle) return;
    const ex = explorersOf(t, present);
    t.pages = dealPages(t.puzzle.clues.length, ex.length ? ex : [t.keyHolder], rng);
};

// Bring the game up to `now`: run everything that's due, in order.
export const advance = (gs0: RrfGameState, now: number, present: string[], rng: Rng = Math.random): RrfGameState => {
    let gs = clone(gs0);
    for (let i = 0; i < 40; i++) {
        const due = events(gs, now, present, rng).filter((e) => e.at <= now);
        if (!due.length) break;
        gs = due[0].run(gs);
    }
    return gs;
};

// When the next thing happens on its own (Infinity: nothing scheduled).
export const nextDue = (gs: RrfGameState, present: string[]): number => {
    const evs = events(clone(gs), 0, present, () => 0.5);
    return evs.length ? Math.max(0, evs[0].at) : Infinity;
};

export const changed = (a: RrfGameState, b: RrfGameState) => JSON.stringify(a) !== JSON.stringify(b);

// ── Dropped phones ──────────────────────────────────────────────────
// Who counts as here: in the group, and not marked away. A dropped
// key-holder's key passes on, their clue pages go to teammates, and the
// chest doesn't wait for their hand. When they're back, they count again.
export const presentIds = (playerIds: string[], gs: Pick<RrfGameState, 'away'> | null | undefined): string[] =>
    playerIds.filter((p) => !(gs?.away ?? []).includes(p));

export const setAway = (gs: RrfGameState, away: string[]): Result => {
    const next = [...new Set(away)].sort();
    if ((gs.away ?? []).join() === next.join()) return fail('No change.');
    return { ok: true, gs: { ...clone(gs), away: next } };
};

// The time a move is judged at. Phones estimate the server clock, but a
// phone's estimate is never allowed to be earlier than the real server
// time of the last write to the game (Firestore stamps it), so a slow or
// wound-back clock can't buy extra gems or older hold stamps.
export const judgedNow = (phoneNow: number, lastWriteMs: number | undefined): number =>
    Math.max(phoneNow, lastWriteMs ?? 0);

// ── Player moves ────────────────────────────────────────────────────
// Every move first brings the game up to date, then checks it's allowed.
type Move = (gs: RrfGameState, t: RrfTeam) => Result | RrfGameState;
const move = (gs0: RrfGameState, pid: string, now: number, present: string[], rng: Rng, phases: RrfGameState['phase'][], fn: Move): Result => {
    const gs = advance(gs0, now, present, rng);
    if (!phases.includes(gs.phase)) return fail('Not now.');
    if (!present.includes(pid)) return fail('You’re not in this game.');
    const t = teamOf(gs, pid);
    if (!t) return fail('You’re watching this one.');
    const r = fn(gs, gs.teams[t.id]);
    return 'ok' in r ? r : { ok: true, gs: r };
};

// The key-holder arranges tiles (saved so the explorers can follow along).
export const setDraft = (gs0: RrfGameState, pid: string, draft: string[], now: number, present: string[], rng: Rng = Math.random): Result =>
    move(gs0, pid, now, present, rng, ['run'], (gs, t) => {
        if (t.stage !== 'door' || !t.puzzle) return fail('No door open.');
        if (t.keyHolder !== pid) return fail('Only the key-holder can touch the lock.');
        if (now < t.frozenUntil) return fail('The door is shaking!');
        if (!draftOk(t, draft)) return fail('That doesn’t fit this lock.');
        t.draft = draft;
        return gs;
    });

const draftOk = (t: RrfTeam, draft: string[]): boolean => {
    const p = t.puzzle!;
    if (draft.length > p.answer.length) return false;
    if (p.type === 'crossing') return draft.every((d) => /^[0-9]$/.test(d));
    const ids = p.items.map((i) => i.id);
    return draft.every((d) => ids.includes(d)) && new Set(draft).size === draft.length;
};

// The key-holder pushes the door.
export const pushDoor = (gs0: RrfGameState, pid: string, answer: string[], now: number, present: string[], rng: Rng = Math.random): Result =>
    move(gs0, pid, now, present, rng, ['run'], (gs, t) => {
        if (t.stage !== 'door' || !t.puzzle) return fail('No door open.');
        if (t.keyHolder !== pid) return fail('Only the key-holder can push the door.');
        if (now < t.frozenUntil) return fail('The door is shaking!');
        if (!draftOk(t, answer) || answer.length !== t.puzzle.answer.length) return fail('Fill every slot first.');
        const st = (gs.stats[pid] ??= { opened: 0, clean: 0, ropes: 0, strikes: 0 }) as RrfStats;
        if (!isCorrect(t.puzzle, answer)) {
            t.doorStrikes += 1;
            t.strikes += 1;
            t.gems = Math.max(0, t.gems - STRIKE_GEMS);
            st.strikes += 1;
            if (t.doorStrikes >= STRIKES_TO_FALL) fall(t, now, gs);
            return gs;
        }
        const gems = t.retry ? 0 : Math.max(0, Math.floor((t.doorEndsAt - now) / GEM_MS));
        t.gems += gems;
        t.draft = answer;
        st.opened += 1;
        if (t.doorStrikes === 0 && !t.retry) st.clean += 1;
        if (!t.retry) t.doorLog.push({ door: t.door, gems, how: 'opened' });
        dropHolds(gs, t.id);
        if (t.door < DOORS - 1) {
            t.stage = 'between';
            t.stageEndsAt = now + BETWEEN_MS;
        } else {
            t.stage = 'vault';
            t.stageEndsAt = 0;
        }
        return gs;
    });

// An explorer throws the rope while the roof comes down.
export const throwRope = (gs0: RrfGameState, pid: string, now: number, present: string[], rng: Rng = Math.random): Result =>
    move(gs0, pid, now, present, rng, ['run'], (gs, t) => {
        if (t.stage !== 'falling') return fail('Nobody’s falling.');
        if (t.ropeUsed) return fail('The rope is gone.');
        if (t.keyHolder === pid) return fail('You can’t throw the rope to yourself!');
        t.ropeUsed = true;
        t.strikes += 1;
        t.gems = Math.max(0, t.gems - STRIKE_GEMS);
        t.doorLog.push({ door: t.door, gems: 0, how: 'rope' });
        (gs.stats[pid] ??= { opened: 0, clean: 0, ropes: 0, strikes: 0 }).ropes += 1;
        startDoor(gs, t.id, t.door, now, present, rng, true);
        return gs;
    });

// 🌋 Tremor: proposed between doors, confirmed by a teammate.
export const tremorProblem = (gs: RrfGameState, t: RrfTeam): string | null => {
    if (gs.phase !== 'run' || t.stage !== 'between') return 'Only between doors.';
    if (t.tremorSentAfter === t.door) return 'One tremor between doors.';
    if (t.gems < TREMOR_COST) return `A tremor costs ${TREMOR_COST} gems.`;
    const r = gs.teams[rivalOf(t.id)];
    if (r.stage !== 'door' && r.stage !== 'between') return 'They can’t be shaken right now.';
    return null;
};

const sendTremor = (gs: RrfGameState, t: RrfTeam, now: number) => {
    const r = gs.teams[rivalOf(t.id)];
    t.gems -= TREMOR_COST;
    t.tremorSentAfter = t.door;
    t.tremorProposal = null;
    if (r.stage === 'door') {
        r.frozenUntil = now + TREMOR_MS;
        // Their tiles fall out of place.
        r.draft = [];
    } else r.tremorQueued = true;
};

export const proposeTremor = (gs0: RrfGameState, pid: string, now: number, present: string[], rng: Rng = Math.random): Result =>
    move(gs0, pid, now, present, rng, ['run'], (gs, t) => {
        const why = tremorProblem(gs, t);
        if (why) return fail(why);
        if (t.tremorProposal) return fail('A tremor is already proposed.');
        // A team of one (the others left) decides alone.
        if (here(t, present).length < 2) sendTremor(gs, t, now);
        else t.tremorProposal = { by: pid, at: now };
        return gs;
    });

export const answerTremor = (gs0: RrfGameState, pid: string, yes: boolean, now: number, present: string[], rng: Rng = Math.random): Result =>
    move(gs0, pid, now, present, rng, ['run'], (gs, t) => {
        if (!t.tremorProposal) return fail('No tremor proposed.');
        if (!yes) {
            t.tremorProposal = null;
            return gs;
        }
        if (t.tremorProposal.by === pid) return fail('A teammate has to say yes.');
        const why = tremorProblem(gs, t);
        if (why) return fail(why);
        sendTremor(gs, t, now);
        return gs;
    });

// ✋ Press and release (claim, interrupt, steal: holdKind decides).
// `at` is when the finger actually went down (a moment before `now` on a slow network).
export const holdDown = (gs0: RrfGameState, pid: string, now: number, present: string[], rng: Rng = Math.random, at = now): Result =>
    move(gs0, pid, now, present, rng, ['run', 'finalClaim'], (gs) => {
        const kind = holdKind(gs, pid);
        if (!kind) return fail('Nothing to hold.');
        if (gs.holds[pid]?.kind === kind) return gs;
        gs.holds[pid] = { kind, at: Math.min(at, now) };
        if (gs.fumble?.pid === pid) gs.fumble = null; // grabbed it again in time
        return gs;
    });

export const holdUp = (gs0: RrfGameState, pid: string, now: number, present: string[], rng: Rng = Math.random): Result =>
    move(gs0, pid, now, present, rng, ['run', 'finalClaim', 'seal', 'expeditionEnd', 'intro', 'over'], (gs, t) => {
        if (!gs.holds[pid]) return gs;
        // A seal winner lets go mid-hold: unless they grab it again within a
        // second (a slipped finger, a notification), the chest is up for grabs.
        if (gs.phase === 'finalClaim' && !gs.unguarded && !gs.fumble && gs.sealWinner === t.id && here(t, present).every((p) => gs.holds[p])) {
            gs.fumble = { pid, at: now + FUMBLE_MS };
        }
        delete gs.holds[pid];
        return gs;
    });

// ── The Final Seal ──────────────────────────────────────────────────
export const placeSeal = (gs0: RrfGameState, pid: string, tileId: string, slot: number, now: number, present: string[], rng: Rng = Math.random): Result =>
    move(gs0, pid, now, present, rng, ['seal'], (gs, t) => {
        const seal = t.seal;
        const tile = seal?.tiles.find((x) => x.id === tileId);
        if (!seal || !tile) return fail('No such tile.');
        if (tile.owner !== pid && present.includes(tile.owner)) return fail('That’s a teammate’s tile.');
        if (slot === -1) {
            delete seal.placed[tileId];
            return gs;
        }
        if (!Number.isInteger(slot) || slot < 0 || slot >= seal.tiles.length) return fail('No such slot.');
        for (const [other, s] of Object.entries(seal.placed)) if (s === slot && other !== tileId) delete seal.placed[other];
        seal.placed[tileId] = slot;
        return gs;
    });

export const pushSeal = (gs0: RrfGameState, pid: string, now: number, present: string[], rng: Rng = Math.random): Result =>
    move(gs0, pid, now, present, rng, ['seal'], (gs, t) => {
        const seal = t.seal;
        if (!seal) return fail('No seal.');
        if (now < seal.lockedUntil) return fail('The seal is locked for a moment.');
        if (Object.keys(seal.placed).length !== seal.tiles.length) return fail('Every tile must be placed.');
        const order = [...seal.tiles].sort((a, b) => seal.placed[a.id] - seal.placed[b.id]).map((x) => x.id);
        if (order.some((id, i) => id !== seal.answer[i])) {
            seal.lockedUntil = now + SEAL_LOCK_MS;
            seal.wrong += 1;
            return gs;
        }
        return { ...gs, phase: 'finalClaim', seq: gs.seq + 1, sealWinner: t.id, unguarded: false, fumble: null, phaseEndsAt: now + GUARD_MS, holds: {} };
    });

// ── Host ────────────────────────────────────────────────────────────
// Skip the intro or the expedition summary.
export const skip = (gs0: RrfGameState, now: number, present: string[], rng: Rng = Math.random): Result => {
    const gs = clone(gs0);
    if (gs.phase !== 'intro' && gs.phase !== 'expeditionEnd') return fail('Nothing to skip.');
    gs.phaseEndsAt = Math.min(gs.phaseEndsAt, now);
    return { ok: true, gs: advance(gs, now, present, rng) };
};

// Stop now: the expedition in progress doesn't count.
export const endEarly = (gs: RrfGameState): RrfGameState => ({ ...clone(gs), phase: 'over', seq: gs.seq + 1, endedEarly: true, holds: {}, phaseEndsAt: 0 });

// ── Results ─────────────────────────────────────────────────────────
export const expeditionsPlayed = (gs: RrfGameState) => gs.results.length;

export const standings = (gs: RrfGameState): { id: RrfTeamId; score: number; treasures: number }[] =>
    TEAM_IDS.map((id) => ({ id, score: gs.teams[id].score, treasures: gs.results.filter((r) => r.winner === id).length })).sort(
        (a, b) => b.score - a.score || b.treasures - a.treasures
    );

export const nightWinner = (gs: RrfGameState): RrfTeamId | null => {
    const [a, b] = standings(gs);
    if (!gs.results.length || (a.score === b.score && a.treasures === b.treasures)) return null;
    return a.id;
};

// ⭐ Key-holder of the night: most clean doors, then most doors, fewest strikes.
// 🪢 Rope hero: most ropes thrown.
export const awards = (gs: RrfGameState, present: string[]): { keyHolder: string | null; rope: string | null } => {
    const ids = Object.keys(gs.stats).filter((p) => present.includes(p));
    const best = [...ids].sort((a, b) => {
        const x = gs.stats[a];
        const y = gs.stats[b];
        return y.clean - x.clean || y.opened - x.opened || x.strikes - y.strikes;
    })[0];
    const rope = [...ids].sort((a, b) => gs.stats[b].ropes - gs.stats[a].ropes)[0];
    return {
        keyHolder: best && gs.stats[best].opened > 0 ? best : null,
        rope: rope && gs.stats[rope].ropes > 0 ? rope : null,
    };
};

// Leaderboard points for the app: the night's winning team 10 each, the
// other team 4; a drawn night 6 each. A game ended early only scores if at
// least half its expeditions were finished (1 of 1, 2 of 3, 3 of 5).
export const POINTS = { win: 10, lose: 4, draw: 6 };
export const expeditionsForPoints = (gs: RrfGameState): number => (gs.endedEarly ? Math.ceil(gs.expeditionsTotal / 2) : 1);
export const playerPoints = (gs: RrfGameState, present: string[]): Record<string, number> => {
    const out: Record<string, number> = {};
    if (gs.results.length < expeditionsForPoints(gs)) return out;
    const w = nightWinner(gs);
    for (const id of TEAM_IDS) {
        const pts = w === null ? POINTS.draw : w === id ? POINTS.win : POINTS.lose;
        for (const p of gs.teams[id].members) if (present.includes(p)) out[p] = pts;
    }
    return out;
};
