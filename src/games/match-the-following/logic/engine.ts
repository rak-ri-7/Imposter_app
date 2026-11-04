// ✏️ Match the Following: the rules, as pure functions on the game state.
//
// A round: everyone gets the same situation and answers it: typed (max 50
// characters, spelling and all) or one of 4 presets. Then each phone shows
// two columns, names and answers (shuffled), and the player draws a line
// from every name to an answer, one to one, like the school exam section.
// Your own name and answer aren't on your board. With a big group each
// board holds a random 6 of the others. Every line must be drawn to lock in.
//
// Scoring: a point for each right line. Two identical answers are
// interchangeable (either line counts). Over the game we also count how
// often each player fooled people and how often they were read right, for
// the 🎭 Poker Face and 📖 Open Book awards.
//
// Everything here is deterministic given `rng` and the times passed in, so
// it's tested without Firestore (logic/game.ts wraps it in transactions).
import type { MtfAnswer, MtfDeck, MtfGameState, MtfRoundResult } from '../../../shared/types';
import { QUESTIONS, type MtfQuestion } from '../data/questions';

// ── Numbers to tune ─────────────────────────────────────────────────
export const MIN_PLAYERS = 3;
export const MAX_CHARS = 50;
export const ANSWER_MS = 60000;
export const MATCH_BASE_MS = 30000;
export const MATCH_PER_LINE_MS = 12000;
export const MATCH_MAX_MS = 100000;
export const BOARD_MAX = 6;               // names per board in big groups
export const REVEAL_STEP_MS = 6500;       // each answer's reveal (small groups)
export const REVEAL_MIN_STEP_MS = 3500;   // never quicker than this
export const REVEAL_BUDGET_MS = 36000;    // big groups: all the answers share this much time
export const REVEAL_TAIL_MS = 9000;       // your board, marked
export const ROUND_END_MS = 20000;
export const ROUND_OPTIONS = [5, 8, 10] as const;
export const DEFAULT_ROUNDS = 5;
export const MIN_ROUNDS_FOR_POINTS = 2;   // a game ended early needs this many finished rounds to score
const STEP_GRACE_MS = 250;

export type Rng = () => number;

const shuffle = <T,>(arr: T[], rng: Rng): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

// ── Questions ───────────────────────────────────────────────────────
// Which questions a deck plays: Wholesome = level 1 (tricky ones too),
// Cheeky = levels 1 and 2, Tricky = only the 🧠 dilemmas.
export const inDeck = (q: MtfQuestion, deck: MtfDeck): boolean =>
    deck === 'tricky' ? !!q.tricky : deck === 'wholesome' ? q.spice === 1 : q.spice <= 2;

// A question from the deck, not used yet this game (the bank is big
// enough; if it runs dry, repeats are allowed).
export const pickQuestion = (bank: MtfQuestion[], deck: MtfDeck, used: string[], rng: Rng): MtfQuestion => {
    const fit = bank.filter((q) => inDeck(q, deck));
    const fresh = fit.filter((q) => !used.includes(q.id));
    const pool = fresh.length ? fresh : fit.length ? fit : bank;
    return pool[Math.floor(rng() * pool.length)];
};

// ── A new game, a new round ─────────────────────────────────────────
export const newGame = (
    players: string[],
    roundsTotal: number,
    deck: MtfDeck,
    now: number,
    rng: Rng = Math.random,
    bank: MtfQuestion[] = QUESTIONS
): MtfGameState => {
    const seats = shuffle(players, rng);
    const base: MtfGameState = {
        game: 'match-the-following',
        phase: 'answer',
        round: 0,
        roundsTotal,
        deck,
        seats,
        questionId: '',
        prompt: '',
        presets: [],
        usedQuestionIds: [],
        answers: {},
        targets: {},
        order: {},
        lines: {},
        locked: {},
        score: Object.fromEntries(seats.map((id) => [id, 0])),
        fooledTotal: {},
        readByTotal: {},
        seenTotal: {},
        history: [],
        seq: 0,
    };
    return startRound(base, players, now, rng, bank);
};

export const startRound = (
    gs: MtfGameState,
    present: string[],
    now: number,
    rng: Rng = Math.random,
    bank: MtfQuestion[] = QUESTIONS
): MtfGameState => {
    // Players who left drop out; anyone who joined the group since comes in
    // now, starting from 0.
    const seats = [...gs.seats.filter((id) => present.includes(id)), ...present.filter((id) => !gs.seats.includes(id))];
    const score = { ...gs.score };
    for (const id of seats) score[id] = score[id] ?? 0;
    const q = pickQuestion(bank, gs.deck, gs.usedQuestionIds, rng);
    return {
        ...gs,
        phase: 'answer',
        round: gs.round + 1,
        seats,
        score,
        questionId: q.id,
        prompt: q.text,
        presets: [...q.presets],
        usedQuestionIds: [...gs.usedQuestionIds, q.id],
        answers: {},
        targets: {},
        order: {},
        lines: {},
        locked: {},
        phaseEndsAt: now + ANSWER_MS,
        revealAt: undefined,
        last: undefined,
        seq: gs.seq + 1,
    };
};

// ── Answering ───────────────────────────────────────────────────────
// Typed answers keep their spelling and case; only spaces are tidied.
export const cleanAnswer = (text: string): string => text.replace(/\s+/g, ' ').trim();

export type AnswerInput = { text: string } | { preset: number };

export const submitAnswer = (
    gs: MtfGameState,
    who: string,
    input: AnswerInput,
    now: number
): { ok: true; gs: MtfGameState } | { ok: false; reason: string } => {
    if (gs.phase !== 'answer') return { ok: false, reason: "Time's up." };
    if (!gs.seats.includes(who)) return { ok: false, reason: "You're not in this game." };
    let answer: MtfAnswer;
    if ('preset' in input) {
        const p = gs.presets[input.preset];
        if (!Number.isInteger(input.preset) || p === undefined) return { ok: false, reason: 'Pick an answer.' };
        answer = { text: p, preset: true, at: now };
    } else {
        if (typeof input.text !== 'string') return { ok: false, reason: 'Type an answer.' };
        const text = cleanAnswer(input.text);
        if (!text) return { ok: false, reason: 'Type an answer.' };
        if ([...text].length > MAX_CHARS) return { ok: false, reason: `Max ${MAX_CHARS} characters.` };
        answer = { text, at: now };
    }
    return { ok: true, gs: { ...gs, answers: { ...gs.answers, [who]: answer } } };
};

export const allAnswered = (gs: MtfGameState, present: string[]): boolean =>
    gs.seats.filter((id) => present.includes(id)).every((id) => !!gs.answers[id]);

// ── Matching ────────────────────────────────────────────────────────
export const matchMs = (lines: number): number => Math.min(MATCH_MAX_MS, MATCH_BASE_MS + MATCH_PER_LINE_MS * lines);

// `present` = players still in the group: anyone who left during answering
// is taken off the boards (their name and answer).
export const toMatch = (gs: MtfGameState, now: number, rng: Rng = Math.random, present?: string[]): MtfGameState => {
    if (gs.phase !== 'answer') return gs;
    if (present) gs = { ...gs, seats: gs.seats.filter((id) => present.includes(id)) };
    const targets: Record<string, string[]> = {};
    const order: Record<string, string[]> = {};
    // Big groups: seat everyone round a shuffled ring and give each viewer
    // the next BOARD_MAX people along it. Every answer then lands on exactly
    // BOARD_MAX boards: nobody is left off, nobody is on more than others.
    const ring = shuffle(gs.seats, rng);
    const n = ring.length;
    for (const viewer of gs.seats) {
        let others = gs.seats.filter((id) => id !== viewer);
        if (others.length > BOARD_MAX) {
            const at = ring.indexOf(viewer);
            others = Array.from({ length: BOARD_MAX }, (_, k) => ring[(at + 1 + k) % n]);
        }
        // Names in seat order, answers shuffled.
        targets[viewer] = gs.seats.filter((id) => others.includes(id));
        order[viewer] = shuffle(others, rng);
    }
    const lines = Math.max(...Object.values(targets).map((t) => t.length), 1);
    return { ...gs, phase: 'match', targets, order, lines: {}, locked: {}, boardRev: {}, phaseEndsAt: now + matchMs(lines), seq: gs.seq + 1 };
};

// Save a board (names → the author of the answer they're joined to).
// `lock` = done: every name needs a line. `rev` is the phone's own
// counter: a save older than one already applied is ignored, so a slow
// earlier save can't overwrite a newer board.
export const submitBoard = (
    gs: MtfGameState,
    viewer: string,
    lines: Record<string, string>,
    lock: boolean,
    rev = 0
): { ok: true; gs: MtfGameState } | { ok: false; reason: string } => {
    if (gs.phase !== 'match') return { ok: false, reason: "Time's up." };
    if (gs.locked[viewer]) return { ok: false, reason: 'Already locked in.' };
    if (!Number.isFinite(rev) || rev < (gs.boardRev?.[viewer] ?? 0)) return { ok: false, reason: 'stale' };
    const names = gs.targets[viewer] ?? [];
    const answers = gs.order[viewer] ?? [];
    const used = new Set<string>();
    const clean: Record<string, string> = {};
    for (const [name, author] of Object.entries(lines ?? {})) {
        if (!names.includes(name) || !answers.includes(author)) return { ok: false, reason: 'That line goes nowhere.' };
        if (used.has(author)) return { ok: false, reason: 'One line per answer.' };
        used.add(author);
        clean[name] = author;
    }
    if (lock && names.some((n) => !clean[n])) return { ok: false, reason: 'Draw a line from every name first.' };
    return {
        ok: true,
        gs: {
            ...gs,
            lines: { ...gs.lines, [viewer]: clean },
            locked: lock ? { ...gs.locked, [viewer]: true } : gs.locked,
            boardRev: { ...(gs.boardRev ?? {}), [viewer]: rev },
        },
    };
};

export const allLocked = (gs: MtfGameState, present: string[]): boolean =>
    gs.seats.filter((id) => present.includes(id)).every((id) => !!gs.locked[id]);

// ── Scoring ─────────────────────────────────────────────────────────
const norm = (a: MtfAnswer | undefined) => (a ? cleanAnswer(a.text).toLowerCase() : '');

// Joining `name` to `author`'s answer is right if it's their answer, or an
// answer word-for-word the same (no answer at all counts as the same too).
export const isRight = (gs: MtfGameState, name: string, author: string): boolean =>
    name === author || norm(gs.answers[name]) === norm(gs.answers[author]);

export const scoreRound = (gs: MtfGameState): MtfRoundResult => {
    const correct: Record<string, number> = {};
    const lines: Record<string, number> = {};
    const fooled: Record<string, number> = {};
    const readBy: Record<string, number> = {};
    for (const viewer of gs.seats) {
        const names = gs.targets[viewer] ?? [];
        const board = gs.lines[viewer] ?? {};
        lines[viewer] = names.length;
        correct[viewer] = 0;
        for (const name of names) {
            const author = board[name];
            if (author === undefined) continue; // no line drawn: no point, nobody fooled
            if (isRight(gs, name, author)) {
                correct[viewer]++;
                readBy[name] = (readBy[name] ?? 0) + 1;
            } else fooled[name] = (fooled[name] ?? 0) + 1;
        }
    }
    return {
        round: gs.round,
        questionId: gs.questionId,
        prompt: gs.prompt,
        answers: Object.fromEntries(gs.seats.map((id) => [id, gs.answers[id] ?? null])),
        correct,
        lines,
        fooled,
        readBy,
        revealOrder: [],
    };
};

// Each answer's reveal: 6.5 s in small groups, shorter in big ones so the
// whole reveal stays under about 45 s (10 players: 3.6 s each → 45 s).
export const revealStepMs = (players: number): number =>
    Math.max(REVEAL_MIN_STEP_MS, Math.min(REVEAL_STEP_MS, Math.floor(REVEAL_BUDGET_MS / Math.max(1, players))));
export const revealMs = (gs: MtfGameState): number => gs.seats.length * revealStepMs(gs.seats.length) + REVEAL_TAIL_MS;

export const toReveal = (gs: MtfGameState, now: number, rng: Rng = Math.random): MtfGameState => {
    if (gs.phase !== 'match') return gs;
    const result = { ...scoreRound(gs), revealOrder: shuffle(gs.seats, rng) };
    const bump = (acc: Record<string, number>, add: Record<string, number>) => {
        const out = { ...acc };
        for (const [k, v] of Object.entries(add)) out[k] = (out[k] ?? 0) + v;
        return out;
    };
    const seen: Record<string, number> = {};
    for (const viewer of gs.seats) for (const name of gs.targets[viewer] ?? []) seen[name] = (seen[name] ?? 0) + 1;
    return {
        ...gs,
        phase: 'reveal',
        revealAt: now,
        revealStepMs: revealStepMs(gs.seats.length),
        phaseEndsAt: now + revealMs(gs),
        score: bump(gs.score, result.correct),
        fooledTotal: bump(gs.fooledTotal, result.fooled),
        readByTotal: bump(gs.readByTotal, result.readBy),
        seenTotal: bump(gs.seenTotal, seen),
        last: result,
        seq: gs.seq + 1,
    };
};

// Which step of the reveal is showing at `now`: an index into revealOrder,
// or 'board' for the final look at your own board.
export const revealStep = (gs: MtfGameState, now: number): number | 'board' => {
    const i = Math.floor((now - (gs.revealAt ?? now)) / (gs.revealStepMs ?? REVEAL_STEP_MS));
    return i >= (gs.last?.revealOrder.length ?? 0) ? 'board' : Math.max(0, i);
};

export const toRoundEnd = (gs: MtfGameState, now: number): MtfGameState => {
    if (gs.phase !== 'reveal') return gs;
    return {
        ...gs,
        phase: 'roundEnd',
        phaseEndsAt: now + ROUND_END_MS,
        history: [...(gs.history ?? []), ...(gs.last ? [gs.last] : [])],
        seq: gs.seq + 1,
    };
};

export const nextRound = (
    gs: MtfGameState,
    present: string[],
    now: number,
    rng: Rng = Math.random,
    bank: MtfQuestion[] = QUESTIONS
): MtfGameState => {
    if (gs.phase !== 'roundEnd') return gs;
    if (gs.round >= gs.roundsTotal || present.length < MIN_PLAYERS)
        return { ...gs, phase: 'over', phaseEndsAt: undefined, seq: gs.seq + 1 };
    return startRound(gs, present, now, rng, bank);
};

// Host ends it. A round still being answered or matched is dropped (its
// points haven't been added yet); one being revealed counts.
export const endEarly = (gs: MtfGameState): MtfGameState => {
    if (gs.phase === 'over') return gs;
    const history = gs.phase === 'reveal' && gs.last ? [...(gs.history ?? []), gs.last] : gs.history ?? [];
    return { ...gs, phase: 'over', endedEarly: true, phaseEndsAt: undefined, history, seq: gs.seq + 1 };
};

// ── Timed steps ─────────────────────────────────────────────────────
// May the timed step run now? Its time is up (server clock), or everyone
// still here has already answered / locked in.
export const isDue = (gs: MtfGameState, now: number, present: string[]): boolean => {
    if (gs.phaseEndsAt !== undefined && now >= gs.phaseEndsAt - STEP_GRACE_MS) return true;
    if (gs.phase === 'answer') return allAnswered(gs, present);
    if (gs.phase === 'match') return allLocked(gs, present);
    return false;
};

// ── The end ─────────────────────────────────────────────────────────
export const roundsPlayed = (gs: MtfGameState): number => (gs.history ?? []).length;

export type MtfStanding = { playerId: string; score: number; rank: number; points: number };
export const standings = (gs: MtfGameState, present?: string[]): MtfStanding[] => {
    const seats = present ? gs.seats.filter((id) => present.includes(id)) : gs.seats;
    const rows = seats.map((id) => ({ playerId: id, score: gs.score[id] ?? 0, rank: 0, points: 0 }));
    rows.sort((a, b) => b.score - a.score);
    rows.forEach((r, i) => (r.rank = i === 0 ? 1 : r.score === rows[i - 1].score ? rows[i - 1].rank : rows[i - 1].rank + 1));
    const scores = roundsPlayed(gs) >= (gs.endedEarly ? MIN_ROUNDS_FOR_POINTS : 1);
    for (const r of rows) r.points = !scores ? 0 : r.rank === 1 ? 10 : r.rank === 2 ? 5 : 2;
    return rows;
};

// 🎭 Poker Face: fooled the biggest share of the boards they were on.
// 📖 Open Book: read right by the biggest share.
export const awards = (gs: MtfGameState, present?: string[]): { pokerFace?: string; openBook?: string } => {
    const seats = (present ? gs.seats.filter((id) => present.includes(id)) : gs.seats).filter((id) => (gs.seenTotal[id] ?? 0) > 0);
    const best = (counts: Record<string, number>) => {
        let top: string | undefined;
        let topShare = 0;
        for (const id of seats) {
            const share = (counts[id] ?? 0) / gs.seenTotal[id];
            if (share > topShare) {
                topShare = share;
                top = id;
            }
        }
        return top;
    };
    return { pokerFace: best(gs.fooledTotal), openBook: best(gs.readByTotal) };
};
