// 🏛️ Race Before the Roof Falls: the puzzle maker.
//
// Every door is a small logic puzzle split between two kinds of player:
//   • the key-holder sees the tiles (or the numbered symbols) on the door,
//   • the explorers each hold a page of clues about them.
// Nobody can open it alone: the explorers don't know what's on the door,
// and the key-holder doesn't know the rules.
//
//   Gate      put 5 emoji tiles in order
//   Crossing  set a 3-number code worked out from numbered symbols
//   Vault     put 5 letters in order (they spell a word, as a bonus hint)
//   Seal      (after an interrupt) every player holds one tile and one clue
//
// Each puzzle is checked by brute force to have exactly one answer, and the
// clue set is trimmed so every clue is needed. Pure functions: tested
// without Firestore.
import type { RrfClue, RrfItem, RrfPuzzle, RrfSealTile } from '../../../shared/types';

export type Rng = () => number;

export const shuffle = <T,>(arr: T[], rng: Rng): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};
const pick = <T,>(arr: T[], rng: Rng): T => arr[Math.floor(rng() * arr.length)];

// Every ordering of `ids`.
export const permutations = (ids: string[]): string[][] => {
    if (ids.length <= 1) return [ids];
    const out: string[][] = [];
    ids.forEach((id, i) => {
        for (const rest of permutations([...ids.slice(0, i), ...ids.slice(i + 1)])) out.push([id, ...rest]);
    });
    return out;
};

// "first", "second", "in the middle"… for a row of n.
export const posWord = (i: number, n: number): string => {
    if (i === 0) return 'first';
    if (i === n - 1) return 'last';
    if (n % 2 === 1 && i === (n - 1) / 2) return 'in the middle';
    return ['first', 'second', 'third', 'fourth', 'fifth'][i];
};
const posAdj = (i: number, n: number): string => {
    const w = posWord(i, n);
    return w === 'in the middle' ? 'middle' : w;
};

// ── Tiles ────────────────────────────────────────────────────────────
export type GateKind = 'animal' | 'sky' | 'plant' | 'treasure';
export const GATE_KIND_NAMES: Record<GateKind, { one: string; many: string }> = {
    animal: { one: 'an animal', many: 'animals' },
    sky: { one: 'a sky tile', many: 'sky tiles' },
    plant: { one: 'a plant', many: 'plants' },
    treasure: { one: 'a treasure', many: 'treasures' },
};
export const GATE_TILES: { label: string; kind: GateKind }[] = [
    { label: '🐍', kind: 'animal' }, { label: '🐘', kind: 'animal' }, { label: '🦁', kind: 'animal' },
    { label: '🐒', kind: 'animal' }, { label: '🦅', kind: 'animal' }, { label: '🐢', kind: 'animal' },
    { label: '🌈', kind: 'sky' }, { label: '⭐', kind: 'sky' },
    { label: '☁️', kind: 'sky' }, { label: '⚡', kind: 'sky' },
    { label: '🌴', kind: 'plant' }, { label: '🌸', kind: 'plant' }, { label: '🍄', kind: 'plant' }, { label: '🌿', kind: 'plant' },
    { label: '💎', kind: 'treasure' }, { label: '👑', kind: 'treasure' }, { label: '🗝️', kind: 'treasure' }, { label: '🏺', kind: 'treasure' },
];
// ☀️ and 🌙 are the teams' emblems, so they never appear on a door.
export const CROSSING_SYMBOLS = ['⭐', '🔥', '💧', '🌿', '🐚', '🪶', '🦋', '🍄'];
export const SEAL_TILES = ['🔑', '🌊', '🗿', '🔥', '🪶', '🐚', '🦉', '💎'];
// Five different letters each, adventure-flavoured.
export const VAULT_WORDS = [
    'TORCH', 'STONE', 'CROWN', 'TIGER', 'SNAKE', 'MAGIC', 'BRAVE', 'QUEST', 'PLANK', 'FLAME',
    'NIGHT', 'LIGHT', 'STORM', 'VAULT', 'WATER', 'ZEBRA', 'CLOUD', 'BEACH', 'DREAM', 'GRAPE',
    'HEART', 'IVORY', 'LEMON', 'MANGO', 'NOBLE', 'ORBIT', 'PIANO', 'ROYAL', 'SPICE', 'TRAIL',
    'WHALE', 'AMBER', 'CABIN', 'CHIEF', 'EARTH', 'FROST', 'GIANT', 'HORNS', 'LUNAR', 'OCEAN',
    'PEARL', 'QUAKE', 'BLAZE', 'CLIMB', 'MOUTH', 'YOUTH', 'TRUMP', 'GHOST', 'JUMBO', 'SWAMP',
];
const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

// ── Clue candidates ─────────────────────────────────────────────────
// A candidate knows how to test any ordering, so the maker can count how
// many orderings are still possible after each clue.
type Cand = { text: string; test: (order: string[]) => boolean; tag: 'at' | 'rel' | 'kind' };
const where = (order: string[], id: string) => order.indexOf(id);

// Clues about the relative order of items (both order puzzles use these).
const relationCands = (sol: string[], name: (id: string) => string): Cand[] => {
    const n = sol.length;
    const out: Cand[] = [];
    for (const a of sol) {
        const pa = where(sol, a);
        out.push({ text: `${name(a)} is ${posWord(pa, n)}.`, tag: 'at', test: (o) => where(o, a) === pa });
        if (pa === 0 || pa === n - 1) out.push({ text: `${name(a)} is at one of the two ends.`, tag: 'rel', test: (o) => [0, n - 1].includes(where(o, a)) });
        else out.push({ text: `${name(a)} is not at either end.`, tag: 'rel', test: (o) => ![0, n - 1].includes(where(o, a)) });
        for (let i = 0; i < n; i++) {
            if (i !== pa && (i === 0 || i === n - 1)) out.push({ text: `${name(a)} is not ${posWord(i, n)}.`, tag: 'rel', test: (o) => where(o, a) !== i });
        }
        for (const b of sol) {
            if (a === b) continue;
            const pb = where(sol, b);
            if (pa < pb) out.push({ text: `${name(a)} is somewhere to the left of ${name(b)}.`, tag: 'rel', test: (o) => where(o, a) < where(o, b) });
            if (pb === pa + 1) out.push({ text: `${name(b)} comes right after ${name(a)}.`, tag: 'rel', test: (o) => where(o, b) === where(o, a) + 1 });
            if (a < b && Math.abs(pa - pb) === 1) out.push({ text: `${name(a)} and ${name(b)} are side by side.`, tag: 'rel', test: (o) => Math.abs(where(o, a) - where(o, b)) === 1 });
            if (a < b && Math.abs(pa - pb) > 1) out.push({ text: `${name(a)} and ${name(b)} never touch.`, tag: 'rel', test: (o) => Math.abs(where(o, a) - where(o, b)) > 1 });
            for (const c of sol) {
                if (c === a || c === b || a > c) continue;
                const pc = where(sol, c);
                if ((pa < pb && pb < pc) || (pc < pb && pb < pa)) {
                    out.push({
                        text: `${name(b)} is somewhere between ${name(a)} and ${name(c)}.`,
                        tag: 'rel',
                        test: (o) => {
                            const [x, y, z] = [where(o, a), where(o, b), where(o, c)];
                            return (x < y && y < z) || (z < y && y < x);
                        },
                    });
                }
            }
        }
    }
    return out;
};

// Clues about a group of items (the animals, the vowels…).
const groupCands = (sol: string[], members: string[], many: string, one: string, unit: string): Cand[] => {
    const n = sol.length;
    const out: Cand[] = [];
    if (!members.length) return out;
    const pos = members.map((m) => where(sol, m));
    const posOf = (o: string[]) => members.map((m) => where(o, m));
    const ends = [0, n - 1];
    if (members.length === 2) {
        const [p, q] = pos;
        if (ends.includes(p) && ends.includes(q)) out.push({ text: `Both ${many} are at the ends.`, tag: 'kind', test: (o) => posOf(o).every((x) => ends.includes(x)) });
        if (Math.abs(p - q) === 1) out.push({ text: `The two ${many} are side by side.`, tag: 'kind', test: (o) => { const [x, y] = posOf(o); return Math.abs(x - y) === 1; } });
        else out.push({ text: `The two ${many} never touch.`, tag: 'kind', test: (o) => { const [x, y] = posOf(o); return Math.abs(x - y) > 1; } });
    }
    if (pos.every((x) => !ends.includes(x))) out.push({ text: `No ${many.replace(/s$/, '')} is at either end.`, tag: 'kind', test: (o) => posOf(o).every((x) => !ends.includes(x)) });
    for (const i of ends) {
        if (pos.includes(i)) {
            if (members.length > 1) out.push({ text: `The ${posAdj(i, n)} ${unit} is ${one}.`, tag: 'kind', test: (o) => posOf(o).includes(i) });
        } else out.push({ text: `The ${posAdj(i, n)} ${unit} is not ${one}.`, tag: 'kind', test: (o) => !posOf(o).includes(i) });
    }
    return out;
};

// Pick clues until exactly one ordering is left, then drop any clue that
// isn't needed. Returns null if this attempt didn't work out.
const solveDown = (sol: string[], cands: Cand[], rng: Rng, maxClues: number): Cand[] | null => {
    let alive = permutations(sol);
    // Exact-position clues make it too easy: at most one, and usually late.
    const ordered = shuffle(cands, rng).sort((x, y) => (x.tag === 'at' ? 1 : 0) - (y.tag === 'at' ? 1 : 0) || 0);
    const chosen: Cand[] = [];
    let atUsed = 0;
    for (const c of ordered) {
        if (alive.length === 1) break;
        if (c.tag === 'at' && atUsed >= 1) continue;
        const next = alive.filter(c.test);
        if (next.length < alive.length && next.length > 0) {
            alive = next;
            chosen.push(c);
            if (c.tag === 'at') atUsed++;
        }
    }
    if (alive.length !== 1) return null;
    // Trim: try dropping each clue.
    let kept = shuffle(chosen, rng);
    for (const c of [...kept]) {
        const without = kept.filter((k) => k !== c);
        if (countSolutions(sol, without) === 1) kept = without;
    }
    return kept.length <= maxClues ? kept : null;
};

const countSolutions = (sol: string[], clues: { test: (o: string[]) => boolean }[]): number =>
    permutations(sol).filter((o) => clues.every((c) => c.test(o))).length;

// The torch lights the clue that does the most on its own.
const strongest = (sol: string[], clues: Cand[]): Cand => {
    const all = permutations(sol);
    let best = clues[0];
    let bestLeft = Infinity;
    for (const c of clues) {
        const left = all.filter(c.test).length;
        if (left < bestLeft) {
            best = c;
            bestLeft = left;
        }
    }
    return best;
};

const finish = (type: RrfPuzzle['type'], items: RrfItem[], answer: string[], real: Cand[], decoys: string[], key: Cand, rng: Rng): RrfPuzzle => {
    const clues: (RrfClue & { key?: boolean })[] = shuffle(
        [...real.map((c) => ({ text: c.text, key: c === key })), ...decoys.map((text) => ({ text, decoy: true }))],
        rng
    );
    const keyClue = clues.findIndex((c) => c.key);
    return { type, items, answer, keyClue, clues: clues.map(({ key: _k, ...c }) => c) };
};

// ── Gate: emoji order ───────────────────────────────────────────────
export const MIN_CLUES = 3;
export const MAX_CLUES = 6;

export const makeGate = (rng: Rng): RrfPuzzle => {
    for (let attempt = 0; attempt < 300; attempt++) {
        // Two kinds with 2 tiles each and one odd one out: room for group clues.
        const kinds = shuffle(Object.keys(GATE_KIND_NAMES) as GateKind[], rng).slice(0, 3);
        const chosen = [
            ...shuffle(GATE_TILES.filter((t) => t.kind === kinds[0]), rng).slice(0, 2),
            ...shuffle(GATE_TILES.filter((t) => t.kind === kinds[1]), rng).slice(0, 2),
            ...shuffle(GATE_TILES.filter((t) => t.kind === kinds[2]), rng).slice(0, 1),
        ];
        const items: RrfItem[] = chosen.map((t, i) => ({ id: `g${i}`, label: t.label, kind: t.kind }));
        const sol = shuffle(items.map((i) => i.id), rng);
        const name = (id: string) => items.find((i) => i.id === id)!.label;
        const cands = [
            ...relationCands(sol, name),
            ...kinds.flatMap((k) => {
                const ids = items.filter((i) => i.kind === k).map((i) => i.id);
                return groupCands(sol, ids, GATE_KIND_NAMES[k].many, GATE_KIND_NAMES[k].one, 'tile');
            }),
        ];
        const real = solveDown(sol, cands, rng, MAX_CLUES);
        if (!real || real.length < MIN_CLUES) continue;
        const absent = GATE_TILES.filter((t) => !chosen.some((c) => c.label === t.label));
        const ghost = pick(absent, rng).label;
        const decoy = `If there's a ${ghost} on the door, it goes ${pick(['first', 'last', 'in the middle'], rng)}.`;
        return finish('gate', shuffle(items, rng), sol, real, [decoy], strongest(sol, real), rng);
    }
    throw new Error('could not make a gate puzzle');
};

// ── Vault: letter order ─────────────────────────────────────────────
export const makeVault = (rng: Rng, words: string[] = VAULT_WORDS): RrfPuzzle => {
    for (let attempt = 0; attempt < 300; attempt++) {
        const word = pick(words, rng);
        const letters = [...word];
        const items: RrfItem[] = letters.map((l, i) => ({ id: `v${i}`, label: l }));
        const sol = items.map((i) => i.id); // the word's own order
        const n = sol.length;
        const name = (id: string) => items.find((i) => i.id === id)!.label;
        const cands: Cand[] = [...relationCands(sol, name)];
        // Alphabet clues.
        sol.forEach((id, p) => {
            const l = name(id);
            const code = l.charCodeAt(0);
            const hint = l === 'A' ? 'right before B' : `right after ${String.fromCharCode(code - 1)}`;
            cands.push({ text: `The ${posAdj(p, n)} letter comes ${hint} in the alphabet.`, tag: 'at', test: (o) => o[p] === id });
        });
        const byAlpha = [...sol].sort((a, b) => name(a).localeCompare(name(b)));
        const first = byAlpha[0];
        const last = byAlpha[n - 1];
        cands.push({ text: `The letter that comes earliest in the alphabet is ${posWord(where(sol, first), n)}.`, tag: 'at', test: (o) => where(o, first) === where(sol, first) });
        cands.push({ text: `The letter that comes latest in the alphabet is ${posWord(where(sol, last), n)}.`, tag: 'at', test: (o) => where(o, last) === where(sol, last) });
        if (where(sol, first) < where(sol, last))
            cands.push({ text: `The earliest letter in the alphabet is somewhere left of the latest one.`, tag: 'rel', test: (o) => where(o, first) < where(o, last) });
        const vowels = sol.filter((id) => VOWELS.has(name(id)));
        cands.push(...groupCands(sol, vowels, 'vowels', 'a vowel', 'letter'));
        const real = solveDown(sol, cands, rng, MAX_CLUES);
        if (!real || real.length < MIN_CLUES) continue;
        const ghost = pick([...'ZXQJKVWY'].filter((l) => !letters.includes(l)), rng);
        const decoy = `If there's a ${ghost} on the door, it goes ${pick(['first', 'last', 'in the middle'], rng)}.`;
        return finish('vault', shuffle(items, rng), sol, real, [decoy], strongest(sol, real), rng);
    }
    throw new Error('could not make a vault puzzle');
};

// ── Crossing: a 3-number code ───────────────────────────────────────
// The key-holder sees 4 symbols with a number on each. Each clue says how
// to work out one number of the code from them, and sometimes a twist swaps
// two numbers. Unique by construction (each number has exactly one rule).
type Sym = { id: string; label: string; value: number };
type Rule = { kind: string; value: number; text: (ord: string) => string };

const crossingRules = (syms: Sym[]): Rule[] => {
    const out: Rule[] = [];
    const vals = syms.map((s) => s.value);
    for (const a of syms) {
        out.push({ kind: 'val', value: a.value, text: (o) => `The ${o} number is the ${a.label} number.` });
        if (a.value * 2 <= 9) out.push({ kind: 'double', value: a.value * 2, text: (o) => `The ${o} number is ${a.label} doubled.` });
        for (const b of syms) {
            if (a.id < b.id && a.value + b.value <= 9) out.push({ kind: 'sum', value: a.value + b.value, text: (o) => `The ${o} number is ${a.label} + ${b.label}.` });
            if (a.value > b.value) out.push({ kind: 'diff', value: a.value - b.value, text: (o) => `The ${o} number is ${a.label} − ${b.label}.` });
        }
    }
    out.push({ kind: 'max', value: Math.max(...vals), text: (o) => `The ${o} number is the biggest number on the door.` });
    out.push({ kind: 'min', value: Math.min(...vals), text: (o) => `The ${o} number is the smallest number on the door.` });
    out.push({ kind: 'odd', value: vals.filter((v) => v % 2 === 1).length, text: (o) => `The ${o} number is how many odd numbers are on the door.` });
    return out;
};

export const makeCrossing = (rng: Rng): RrfPuzzle => {
    for (let attempt = 0; attempt < 300; attempt++) {
        const labels = shuffle(CROSSING_SYMBOLS, rng).slice(0, 4);
        const values = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng).slice(0, 4);
        const syms: Sym[] = labels.map((label, i) => ({ id: `c${i}`, label, value: values[i] }));
        const rules = shuffle(crossingRules(syms), rng);
        // Three different kinds of rule, at most one plain "is the X number".
        const picked: Rule[] = [];
        for (const r of rules) {
            if (picked.length === 3) break;
            if (picked.some((p) => p.kind === r.kind)) continue;
            picked.push(r);
        }
        if (picked.length < 3) continue;
        const ords = ['first', 'middle', 'last'];
        let digits = picked.map((r) => r.value);
        const real: Cand[] = picked.map((r, i) => ({ text: r.text(ords[i]), tag: 'rel', test: () => true }));
        // The twist: half the time, a swap rule that really matters.
        let twist: Cand | null = null;
        if (rng() < 0.5 && digits[0] !== digits[2]) {
            const [a, b] = shuffle(syms, rng);
            twist = { text: `If ${a.label} is bigger than ${b.label}, swap the first and last numbers.`, tag: 'rel', test: () => true };
            if (a.value > b.value) digits = [digits[2], digits[1], digits[0]];
            real.push(twist);
        }
        const ghost = pick(CROSSING_SYMBOLS.filter((l) => !labels.includes(l)), rng);
        const decoy = `If there's a ${ghost} on the door, add 1 to the ${pick(ords, rng)} number.`;
        const hard = real.find((c) => c === twist) ?? real.find((c, i) => picked[i] && picked[i].kind !== 'val') ?? real[0];
        const items: RrfItem[] = syms.map((s) => ({ id: s.id, label: s.label, value: s.value }));
        return finish('crossing', items, digits.map(String), real, [decoy], hard, rng);
    }
    throw new Error('could not make a crossing puzzle');
};

export const makeDoorPuzzle = (door: number, rng: Rng): RrfPuzzle =>
    door === 0 ? makeGate(rng) : door === 1 ? makeCrossing(rng) : makeVault(rng);

// ── Checking an answer ──────────────────────────────────────────────
export const isCorrect = (p: RrfPuzzle, answer: string[]): boolean =>
    answer.length === p.answer.length && answer.every((a, i) => a === p.answer[i]);

// ── Clue pages ──────────────────────────────────────────────────────
// Shared out round-robin, so every explorer has something to read.
export const dealPages = (clueCount: number, explorers: string[], rng: Rng): Record<string, number[]> => {
    const pages: Record<string, number[]> = {};
    if (!explorers.length) return pages;
    explorers.forEach((e) => (pages[e] = []));
    shuffle([...Array(clueCount).keys()], rng).forEach((c, k) => pages[explorers[k % explorers.length]].push(c));
    for (const e of explorers) pages[e].sort((a, b) => a - b);
    return pages;
};

// ── The Final Seal ──────────────────────────────────────────────────
// One tile per player, and a clue about that tile only ("I am last",
// "I come right after 🌊"). Together the clues allow one order.
export type SealPuzzle = { tiles: RrfSealTile[]; answer: string[] };

const sealCands = (sol: string[], id: string, emoji: (id: string) => string): Cand[] => {
    const n = sol.length;
    const p = where(sol, id);
    const out: Cand[] = [];
    out.push({ text: `I am ${posWord(p, n)}.`, tag: 'at', test: (o) => where(o, id) === p });
    if (p !== 0) out.push({ text: 'I am not first.', tag: 'rel', test: (o) => where(o, id) !== 0 });
    if (p !== n - 1) out.push({ text: 'I am not last.', tag: 'rel', test: (o) => where(o, id) !== n - 1 });
    if (n >= 3) {
        if (p === 0 || p === n - 1) out.push({ text: 'I am at one of the ends.', tag: 'rel', test: (o) => [0, n - 1].includes(where(o, id)) });
        else out.push({ text: 'I am not at either end.', tag: 'rel', test: (o) => ![0, n - 1].includes(where(o, id)) });
    }
    for (const other of sol) {
        if (other === id) continue;
        const q = where(sol, other);
        const e = emoji(other);
        if (p === q + 1) out.push({ text: `I come right after ${e}.`, tag: 'rel', test: (o) => where(o, id) === where(o, other) + 1 });
        if (p === q - 1) out.push({ text: `I come right before ${e}.`, tag: 'rel', test: (o) => where(o, id) === where(o, other) - 1 });
        if (n >= 3 && Math.abs(p - q) === 1) out.push({ text: `I am next to ${e}.`, tag: 'rel', test: (o) => Math.abs(where(o, id) - where(o, other)) === 1 });
        if (n >= 3 && Math.abs(p - q) > 1) out.push({ text: `I am not next to ${e}.`, tag: 'rel', test: (o) => Math.abs(where(o, id) - where(o, other)) > 1 });
        if (p < q) out.push({ text: `I am somewhere left of ${e}.`, tag: 'rel', test: (o) => where(o, id) < where(o, other) });
        else out.push({ text: `I am somewhere right of ${e}.`, tag: 'rel', test: (o) => where(o, id) > where(o, other) });
    }
    return out;
};

export const makeSeal = (players: string[], rng: Rng): SealPuzzle => {
    const n = players.length;
    const emojis = shuffle(SEAL_TILES, rng).slice(0, n);
    const ids = emojis.map((_, i) => `s${i}`);
    const emoji = (id: string) => emojis[ids.indexOf(id)];
    const owners = shuffle(players, rng);
    const sol = shuffle(ids, rng);
    const cands = Object.fromEntries(ids.map((id) => [id, sealCands(sol, id, emoji)]));
    let clues: Record<string, Cand> | null = null;
    for (let attempt = 0; attempt < 600 && !clues; attempt++) {
        let ats = 0;
        const tryClues: Record<string, Cand> = {};
        for (const id of ids) {
            let c = pick(cands[id], rng);
            if (c.tag === 'at' && (ats >= 1 || rng() < 0.6)) c = pick(cands[id].filter((x) => x.tag !== 'at'), rng) ?? c;
            if (c.tag === 'at') ats++;
            tryClues[id] = c;
        }
        if (countSolutions(sol, Object.values(tryClues)) === 1) clues = tryClues;
    }
    // Fallback (never seen in tests): everyone is told their place.
    if (!clues) clues = Object.fromEntries(ids.map((id) => [id, cands[id].find((c) => c.tag === 'at')!]));
    const tiles: RrfSealTile[] = ids.map((id, i) => ({ id, emoji: emojis[i], clue: clues![id].text, owner: owners[i] }));
    return { tiles, answer: sol };
};
