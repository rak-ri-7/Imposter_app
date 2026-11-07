// 🏛️ Race Before the Roof Falls: tests for the puzzle maker and the rules
// engine (pure functions, no Firestore). Run with:  npm run test:rrf
//
// The puzzle tests read every clue back *from its text* and brute-force the
// answer, so they check both that each lock has exactly one answer and that
// the words on the explorers' pages really say what the maker meant.
import * as E from '../src/games/roof-race/logic/engine';
import * as Z from '../src/games/roof-race/logic/puzzles';
import type { RrfGameState, RrfPuzzle, RrfTeamId } from '../src/shared/types';

let failed = 0;
let passed = 0;
const check = (cond: unknown, name: string) => {
    if (cond) passed++;
    else {
        failed++;
        console.error(`FAIL  ${name}`);
    }
};
const section = (name: string) => console.log(`\n${name}`);
let seed = 7;
const rng = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
};
const ok = (r: E.Result, what: string): RrfGameState => {
    if (!r.ok) throw new Error(`${what}: ${r.reason}`);
    return r.gs;
};

// ── Reading clues back ──────────────────────────────────────────────
const POS = (w: string, n: number): number => {
    if (w === 'first') return 0;
    if (w === 'last') return n - 1;
    if (w === 'in the middle' || w === 'middle') return (n - 1) / 2;
    return ['first', 'second', 'third', 'fourth', 'fifth'].indexOf(w);
};
const KINDS: Record<string, string> = { animals: 'animal', 'sky tiles': 'sky', plants: 'plant', treasures: 'treasure', vowels: 'vowel' };
const ONE: Record<string, string> = { 'an animal': 'animal', 'a sky tile': 'sky', 'a plant': 'plant', 'a treasure': 'treasure', 'a vowel': 'vowel' };
const SINGLE: Record<string, string> = { animal: 'animal', 'sky tile': 'sky', plant: 'plant', treasure: 'treasure', vowel: 'vowel' };

type Test = (o: string[]) => boolean;
const orderTest = (p: RrfPuzzle, text: string): Test | 'decoy' | null => {
    const n = p.items.length;
    const id = (label: string) => p.items.find((i) => i.label === label)?.id ?? null;
    const kindOf = (iid: string) => {
        const it = p.items.find((i) => i.id === iid)!;
        return p.type === 'vault' ? ('AEIOU'.includes(it.label) ? 'vowel' : 'consonant') : it.kind!;
    };
    const members = (k: string) => p.items.filter((i) => kindOf(i.id) === k).map((i) => i.id);
    const at = (o: string[], x: string) => o.indexOf(x);
    let m: RegExpMatchArray | null;
    if ((m = text.match(/^If there's an? (.+) on the door, it goes (first|last|in the middle)\.$/))) return id(m[1]) ? null : 'decoy';
    if ((m = text.match(/^The (first|second|middle|fourth|last) letter comes right (after|before) (.) in the alphabet\.$/))) {
        const code = m[3].charCodeAt(0) + (m[2] === 'after' ? 1 : -1);
        const x = id(String.fromCharCode(code));
        const i = POS(m[1], n);
        return x ? (o) => o[i] === x : null;
    }
    if ((m = text.match(/^The letter that comes (earliest|latest) in the alphabet is (.+)\.$/))) {
        const sorted = [...p.items].sort((a, b) => a.label.localeCompare(b.label));
        const x = (m[1] === 'earliest' ? sorted[0] : sorted[n - 1]).id;
        const i = POS(m[2], n);
        return (o) => at(o, x) === i;
    }
    if (text === 'The earliest letter in the alphabet is somewhere left of the latest one.') {
        const sorted = [...p.items].sort((a, b) => a.label.localeCompare(b.label));
        return (o) => at(o, sorted[0].id) < at(o, sorted[n - 1].id);
    }
    if ((m = text.match(/^Both (.+) are at the ends\.$/))) {
        const ms = members(KINDS[m[1]]);
        return ms.length === 2 ? (o) => ms.every((x) => [0, n - 1].includes(at(o, x))) : null;
    }
    if ((m = text.match(/^The two (.+) are side by side\.$/))) {
        const ms = members(KINDS[m[1]]);
        return ms.length === 2 ? (o) => Math.abs(at(o, ms[0]) - at(o, ms[1])) === 1 : null;
    }
    if ((m = text.match(/^The two (.+) never touch\.$/))) {
        const ms = members(KINDS[m[1]]);
        return ms.length === 2 ? (o) => Math.abs(at(o, ms[0]) - at(o, ms[1])) > 1 : null;
    }
    if ((m = text.match(/^No (.+) is at either end\.$/)) && SINGLE[m[1]]) {
        const ms = members(SINGLE[m[1]]);
        return (o) => ms.every((x) => ![0, n - 1].includes(at(o, x)));
    }
    if ((m = text.match(/^The (first|last) (tile|letter) is (not )?(an? .+)\.$/))) {
        const ms = members(ONE[m[4]]);
        const i = POS(m[1], n);
        return m[3] ? (o) => !ms.includes(o[i]) : (o) => ms.includes(o[i]);
    }
    if ((m = text.match(/^(.+) is somewhere between (.+) and (.+)\.$/))) {
        const [b, a, c] = [id(m[1]), id(m[2]), id(m[3])];
        if (!a || !b || !c) return null;
        return (o) => (at(o, a) < at(o, b) && at(o, b) < at(o, c)) || (at(o, c) < at(o, b) && at(o, b) < at(o, a));
    }
    if ((m = text.match(/^(.+) is somewhere to the left of (.+)\.$/))) {
        const [a, b] = [id(m[1]), id(m[2])];
        return a && b ? (o) => at(o, a) < at(o, b) : null;
    }
    if ((m = text.match(/^(.+) comes right after (.+)\.$/))) {
        const [b, a] = [id(m[1]), id(m[2])];
        return a && b ? (o) => at(o, b) === at(o, a) + 1 : null;
    }
    if ((m = text.match(/^(.+) and (.+) are side by side\.$/))) {
        const [a, b] = [id(m[1]), id(m[2])];
        return a && b ? (o) => Math.abs(at(o, a) - at(o, b)) === 1 : null;
    }
    if ((m = text.match(/^(.+) and (.+) never touch\.$/))) {
        const [a, b] = [id(m[1]), id(m[2])];
        return a && b ? (o) => Math.abs(at(o, a) - at(o, b)) > 1 : null;
    }
    if ((m = text.match(/^(.+) is at one of the two ends\.$/))) {
        const a = id(m[1]);
        return a ? (o) => [0, n - 1].includes(at(o, a)) : null;
    }
    if ((m = text.match(/^(.+) is not at either end\.$/))) {
        const a = id(m[1]);
        return a ? (o) => ![0, n - 1].includes(at(o, a)) : null;
    }
    if ((m = text.match(/^(.+) is not (first|last)\.$/))) {
        const a = id(m[1]);
        const i = POS(m[2], n);
        return a ? (o) => at(o, a) !== i : null;
    }
    if ((m = text.match(/^(.+) is (first|second|third|fourth|last|in the middle)\.$/))) {
        const a = id(m[1]);
        const i = POS(m[2], n);
        return a ? (o) => at(o, a) === i : null;
    }
    return null;
};

// Read an order puzzle's clues; returns the answers they allow (or null if a clue can't be read).
const solveOrder = (p: RrfPuzzle): string[][] | null => {
    const tests: Test[] = [];
    for (const c of p.clues) {
        const t = orderTest(p, c.text);
        if (t === null) {
            console.error('   unreadable:', c.text);
            return null;
        }
        if (t === 'decoy') {
            if (!c.decoy) return null;
            continue;
        }
        if (c.decoy) return null;
        tests.push(t);
    }
    return Z.permutations(p.items.map((i) => i.id)).filter((o) => tests.every((t) => t(o)));
};

// Work a crossing code out from its clue texts and the symbols' numbers.
const solveCrossing = (p: RrfPuzzle): string[] | null => {
    const val = (label: string) => p.items.find((i) => i.label === label)?.value;
    const digits: (number | undefined)[] = [undefined, undefined, undefined];
    const ordIx: Record<string, number> = { first: 0, middle: 1, last: 2 };
    let swap = false;
    const vals = p.items.map((i) => i.value!);
    for (const c of p.clues) {
        let m: RegExpMatchArray | null;
        if ((m = c.text.match(/^If there's an? (.+) on the door, add 1 to the (first|middle|last) number\.$/))) {
            if (val(m[1]) !== undefined || !c.decoy) return null;
            continue;
        }
        if (c.decoy) return null;
        if ((m = c.text.match(/^If (.+) is bigger than (.+), swap the first and last numbers\.$/))) {
            const [a, b] = [val(m[1]), val(m[2])];
            if (a === undefined || b === undefined) return null;
            swap = a > b;
            continue;
        }
        m = c.text.match(/^The (first|middle|last) number is (.+)\.$/);
        if (!m) return null;
        const i = ordIx[m[1]];
        if (digits[i] !== undefined) return null;
        const rest = m[2];
        let r: RegExpMatchArray | null;
        if ((r = rest.match(/^the (.+) number$/)) && val(r[1]) !== undefined) digits[i] = val(r[1]);
        else if ((r = rest.match(/^(.+) doubled$/))) digits[i] = val(r[1])! * 2;
        else if ((r = rest.match(/^(.+) \+ (.+)$/))) digits[i] = val(r[1])! + val(r[2])!;
        else if ((r = rest.match(/^(.+) − (.+)$/))) digits[i] = val(r[1])! - val(r[2])!;
        else if (rest === 'the biggest number on the door') digits[i] = Math.max(...vals);
        else if (rest === 'the smallest number on the door') digits[i] = Math.min(...vals);
        else if (rest === 'how many odd numbers are on the door') digits[i] = vals.filter((v) => v % 2).length;
        else return null;
    }
    if (digits.some((d) => d === undefined || Number.isNaN(d) || d! < 0 || d! > 9)) return null;
    const d = digits as number[];
    return (swap ? [d[2], d[1], d[0]] : d).map(String);
};

// A seal's clues, read back: "I am …" about the owner's own tile.
const solveSeal = (tiles: { id: string; emoji: string; clue: string }[]): string[][] | null => {
    const n = tiles.length;
    const idOf = (e: string) => tiles.find((t) => t.emoji === e)?.id ?? null;
    const tests: Test[] = [];
    for (const t of tiles) {
        const me = t.id;
        const at = (o: string[], x: string) => o.indexOf(x);
        let m: RegExpMatchArray | null;
        const c = t.clue;
        if ((m = c.match(/^I am not (first|last)\.$/))) { const i = POS(m[1], n); tests.push((o) => at(o, me) !== i); }
        else if (c === 'I am at one of the ends.') tests.push((o) => [0, n - 1].includes(at(o, me)));
        else if (c === 'I am not at either end.') tests.push((o) => ![0, n - 1].includes(at(o, me)));
        else if ((m = c.match(/^I am (first|second|third|fourth|last|in the middle)\.$/))) { const i = POS(m[1], n); tests.push((o) => at(o, me) === i); }
        else if ((m = c.match(/^I come right (after|before) (.+)\.$/))) {
            const x = idOf(m[2]);
            if (!x) return null;
            const d = m[1] === 'after' ? 1 : -1;
            tests.push((o) => at(o, me) === at(o, x) + d);
        } else if ((m = c.match(/^I am (not )?next to (.+)\.$/))) {
            const x = idOf(m[2]);
            if (!x) return null;
            tests.push(m[1] ? (o) => Math.abs(at(o, me) - at(o, x)) > 1 : (o) => Math.abs(at(o, me) - at(o, x)) === 1);
        } else if ((m = c.match(/^I am somewhere (left|right) of (.+)\.$/))) {
            const x = idOf(m[2]);
            if (!x) return null;
            tests.push(m[1] === 'left' ? (o) => at(o, me) < at(o, x) : (o) => at(o, me) > at(o, x));
        } else {
            console.error('   unreadable seal clue:', c);
            return null;
        }
    }
    return Z.permutations(tiles.map((t) => t.id)).filter((o) => tests.every((f) => f(o)));
};

// ════════════════════════════════════════════════════════════════════
section('puzzles: gate (emoji order)');
{
    let good = 0;
    let sizesOk = true;
    let keyOk = true;
    let decoyOk = true;
    const N = 300;
    for (let i = 0; i < N; i++) {
        const p = Z.makeGate(rng);
        const sols = solveOrder(p);
        if (sols && sols.length === 1 && sols[0].join() === p.answer.join()) good++;
        const real = p.clues.filter((c) => !c.decoy).length;
        if (real < Z.MIN_CLUES || real > Z.MAX_CLUES || p.items.length !== 5) sizesOk = false;
        if (!p.clues[p.keyClue] || p.clues[p.keyClue].decoy) keyOk = false;
        if (p.clues.filter((c) => c.decoy).length !== 1) decoyOk = false;
    }
    check(good === N, `${N} gates: every clue reads right and allows exactly one order (${good}/${N})`);
    check(sizesOk, `gates have 5 tiles and ${Z.MIN_CLUES}-${Z.MAX_CLUES} real clues`);
    check(keyOk, 'the torch lights a real clue');
    check(decoyOk, 'one decoy clue about a tile that isn’t there');
    const p = Z.makeGate(rng);
    check(new Set(p.items.map((i) => i.label)).size === 5, 'no tile twice on a door');
}

section('puzzles: vault (letter order)');
{
    let good = 0;
    let spells = true;
    const N = 300;
    for (let i = 0; i < N; i++) {
        const p = Z.makeVault(rng);
        const sols = solveOrder(p);
        if (sols && sols.length === 1 && sols[0].join() === p.answer.join()) good++;
        const word = p.answer.map((id) => p.items.find((x) => x.id === id)!.label).join('');
        if (!Z.VAULT_WORDS.includes(word)) spells = false;
    }
    check(good === N, `${N} vaults: every clue reads right and allows exactly one order (${good}/${N})`);
    check(spells, 'the right order spells the word');
    check(Z.VAULT_WORDS.every((w) => w.length === 5 && new Set(w).size === 5), 'vault words: 5 different letters');
}

section('puzzles: crossing (number code)');
{
    let good = 0;
    let twists = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
        const p = Z.makeCrossing(rng);
        const code = solveCrossing(p);
        if (code && code.join() === p.answer.join()) good++;
        if (p.clues.some((c) => c.text.includes('swap'))) twists++;
    }
    check(good === N, `${N} codes: worked out from the clue texts, each matches the answer (${good}/${N})`);
    check(twists > N * 0.3 && twists < N * 0.7, `about half have the swap twist (${twists}/${N})`);
}

section('puzzles: final seal');
for (const n of [2, 3, 4, 5]) {
    let good = 0;
    const N = 150;
    for (let i = 0; i < N; i++) {
        const players = ['p1', 'p2', 'p3', 'p4', 'p5'].slice(0, n);
        const s = Z.makeSeal(players, rng);
        const sols = solveSeal(s.tiles);
        const owners = new Set(s.tiles.map((t) => t.owner));
        if (sols && sols.length === 1 && sols[0].join() === s.answer.join() && owners.size === n && players.every((p) => owners.has(p))) good++;
    }
    check(good === N, `team of ${n}: one tile and one clue each, exactly one order (${good}/${N})`);
}

section('puzzles: team emblems stay off the doors');
check([...Z.GATE_TILES.map((t) => t.label), ...Z.CROSSING_SYMBOLS, ...Z.SEAL_TILES].every((e) => e !== '☀️' && e !== '🌙'), 'no ☀️ or 🌙 tiles (they’re the teams)');
check(Z.GATE_TILES.filter((t) => t.kind === 'sky').length >= 2, 'still enough sky tiles for a pair');

section('puzzles: clue pages');
{
    const pages = Z.dealPages(6, ['a', 'b', 'c'], rng);
    const all = Object.values(pages).flat().sort();
    check(all.join() === '0,1,2,3,4,5', 'every clue on exactly one page');
    check(Object.values(pages).every((p) => p.length === 2), 'shared out evenly');
    const one = Z.dealPages(4, ['a'], rng);
    check(one.a.length === 4, 'a lone explorer gets every clue');
}

// ════════════════════════════════════════════════════════════════════
const TIGER = ['rakesh', 'unni', 'lachu', 'swathi'];
const COBRA = ['radhika', 'bharat', 'gayatri', 'gowri'];
const ALL = [...TIGER, ...COBRA];

section('teams from the session');
{
    const A = { id: 'A', name: 'Team A', color: '#E63946', playerIds: TIGER };
    const B = { id: 'B', name: 'Team B', color: '#4FC3F7', playerIds: COBRA };
    const f = E.fromSessionTeams(true, [A, B], ALL);
    check(f.ok && f.teams.tiger.join() === TIGER.join() && f.teams.cobra.join() === COBRA.join(), 'the first session team plays as Tiger, the second as Cobra');
    check(f.ok && f.sides.tiger.name === 'Team A' && f.sides.cobra.color === '#4FC3F7', 'their own names and colours come along');
    check(!E.fromSessionTeams(false, [A, B], ALL).ok, 'teams switched off: refused');
    check(!E.fromSessionTeams(true, [], ALL).ok && !E.fromSessionTeams(true, undefined, ALL).ok, 'no teams set up: refused');
    const C = { id: 'C', name: 'Team C', color: '#4CAF50', playerIds: [] as string[] };
    const three = E.fromSessionTeams(true, [A, B, C], ALL);
    check(!three.ok && three.problem.includes('3'), 'three teams: refused, says how many');
    const small = E.fromSessionTeams(true, [{ ...A, playerIds: ['rakesh'] }, B], ALL);
    check(!small.ok && small.problem.includes('Team A'), 'a team of 1: refused, names the team');
    const big = E.fromSessionTeams(true, [{ ...A, playerIds: ['a', 'b', 'c', 'd', 'e', 'f'] }, B], [...'abcdef', ...COBRA]);
    check(!big.ok, 'a team of 6: refused');
    const gone = E.fromSessionTeams(true, [A, B], ALL.filter((p) => p !== 'unni' && p !== 'lachu' && p !== 'swathi'));
    check(!gone.ok, 'players who left don’t count towards a team');
    const dup = E.fromSessionTeams(true, [A, { ...B, playerIds: [...COBRA, 'rakesh'] }], ALL);
    check(!dup.ok, 'nobody on both teams');
    const watch = E.fromSessionTeams(true, [A, B], [...ALL, 'guest']);
    check(watch.ok && watch.watching.join() === 'guest', 'players on no team watch');
    if (f.ok) {
        const g = E.newGame(f.teams, 3, 0, rng, f.sides);
        check(g.sides?.tiger.name === 'Team A' && g.teams.tiger.members.join() === TIGER.join(), 'the game remembers which session team is which');
    }
    check(E.teamsProblem({ tiger: TIGER, cobra: COBRA }, ALL) === null, '4 v 4 is fine');
    check(E.teamsProblem({ tiger: ['a', 'b'], cobra: ['c', 'd'] }, ['a', 'b', 'c', 'd']) === null, '2 v 2 is fine');
}

section('intro and the first doors');
let now = 1_000_000;
let gs = E.newGame({ tiger: TIGER, cobra: COBRA }, 3, now, rng);
check(gs.phase === 'intro' && gs.expedition === 1 && gs.phaseEndsAt === now + E.INTRO_MS, 'expedition 1 starts with the story');
check(E.nextDue(gs, ALL) === now + E.INTRO_MS, 'next thing: the end of the intro');
check(!E.changed(gs, E.advance(gs, now + 1000, ALL, rng)), 'nothing happens early');
now += E.INTRO_MS;
gs = E.advance(gs, now, ALL, rng);
const T = () => gs.teams.tiger;
const C = () => gs.teams.cobra;
check(gs.phase === 'run' && T().stage === 'door' && C().stage === 'door' && T().door === 0, 'both teams at the Gate');
check(T().keyHolder === 'rakesh' && C().keyHolder === 'radhika', 'the first player of each team holds the key');
check(T().puzzle?.type === 'gate' && T().doorEndsAt === now + E.DOOR_MS, 'a 90 s emoji lock');
check(Object.keys(T().pages).sort().join() === ['lachu', 'swathi', 'unni'].join() && !T().pages.rakesh, 'pages go to the three explorers, not the key-holder');
check(Object.values(T().pages).flat().length === T().puzzle!.clues.length, 'every clue is on someone’s page');
check(!T().torch && !C().torch, 'no torch when nobody is ahead');
check(!E.setDraft(gs, 'unni', [], now, ALL, rng).ok, 'an explorer can’t touch the lock');
check(!E.pushDoor(gs, 'rakesh', T().puzzle!.answer.slice(0, 2), now, ALL, rng).ok, 'can’t push with empty slots');

section('strikes and gems');
gs = ok(E.setDraft(gs, 'rakesh', T().puzzle!.answer.slice(0, 2), now + 1000, ALL, rng), 'draft');
check(T().draft.length === 2, 'the key-holder’s tiles are saved for the explorers to follow');
check(!E.setDraft(gs, 'rakesh', ['zz'], now + 1000, ALL, rng).ok, 'tiles that aren’t on the door refused');
// Cobra pushes a wrong order once.
const wrong = (p: string[]) => [p[1], p[0], ...p.slice(2)];
now += 20000;
gs = ok(E.pushDoor(gs, 'radhika', wrong(C().puzzle!.answer), now, ALL, rng), 'cobra wrong');
check(C().stage === 'door' && C().strikes === 1 && C().doorStrikes === 1 && C().gems === 0, 'a wrong push: a strike (gems can’t go below 0)');
// Tiger opens with 70 s left.
gs = ok(E.pushDoor(gs, 'rakesh', T().puzzle!.answer, now, ALL, rng), 'tiger opens');
check(T().stage === 'between' && T().gems === 14 && T().stageEndsAt === now + E.BETWEEN_MS, 'opened with 70 s left: 14 gems, then a breather');
check(gs.stats.rakesh.opened === 1 && gs.stats.rakesh.clean === 1, 'rakesh: one clean door');

section('tremor');
check(!E.proposeTremor(gs, 'radhika', now, ALL, rng).ok, 'not while at a door');
gs = ok(E.proposeTremor(gs, 'rakesh', now + 500, ALL, rng), 'propose');
check(T().tremorProposal?.by === 'rakesh' && T().gems === 14, 'proposed, nothing paid yet');
check(!E.answerTremor(gs, 'rakesh', true, now + 600, ALL, rng).ok, 'the proposer can’t confirm their own');
check(!E.answerTremor(gs, 'radhika', true, now + 600, ALL, rng).ok, 'the rivals can’t confirm it');
{
    const no = ok(E.answerTremor(gs, 'unni', false, now + 600, ALL, rng), 'no');
    check(no.teams.tiger.tremorProposal === null && no.teams.tiger.gems === 14, 'a teammate says no: cancelled, gems kept');
    const late = E.advance(gs, now + 500 + E.TREMOR_CONFIRM_MS, ALL, rng);
    check(late.teams.tiger.tremorProposal === null, 'nobody answers in time: it lapses');
}
gs = ok(E.answerTremor(gs, 'lachu', true, now + 1000, ALL, rng), 'yes');
check(T().gems === 11 && T().tremorSentAfter === 0, 'confirmed: 3 gems paid');
check(C().frozenUntil === now + 1000 + E.TREMOR_MS && C().draft.length === 0, 'cobra’s lock freezes and their tiles fall out');
check(!E.pushDoor(gs, 'radhika', C().puzzle!.answer, now + 2000, ALL, rng).ok, 'cobra can’t push while it shakes');
check(!E.proposeTremor(gs, 'swathi', now + 2000, ALL, rng).ok, 'one tremor per gap between doors');

section('torch and the next door');
now += E.BETWEEN_MS;
gs = E.advance(gs, now, ALL, rng);
check(T().stage === 'door' && T().door === 1 && T().puzzle?.type === 'crossing', 'tiger moves on to the Crossing');
check(T().keyHolder === 'unni' && !T().pages.unni && !!T().pages.rakesh, 'the key passes to unni; rakesh is an explorer now');
check(!T().torch, 'tiger is ahead: no torch');
gs = ok(E.pushDoor(gs, 'radhika', C().puzzle!.answer, now, ALL, rng), 'cobra opens the gate');
check(C().stage === 'between' && C().gems === Math.floor((C().doorEndsAt - now) / E.GEM_MS), 'cobra’s gems: what was left (the strike happened at 0)');
const cobraGateGems = C().gems;
gs = E.advance(gs, now + E.BETWEEN_MS, ALL, rng);
check(C().door === 1 && C().torch === false, 'cobra starts the Crossing before tiger opens it: no torch yet');

section('the roof comes down, the rope');
now += E.BETWEEN_MS;
const crossingEnds = T().doorEndsAt;
gs = ok(E.pushDoor(gs, 'unni', ['9', '9', '9'].map((d, i) => (T().puzzle!.answer[i] === d ? '0' : d)), now, ALL, rng), 'wrong 1');
gs = ok(E.pushDoor(gs, 'unni', ['9', '9', '9'].map((d, i) => (T().puzzle!.answer[i] === d ? '0' : d)), now + 100, ALL, rng), 'wrong 2');
check(T().stage === 'falling' && T().stageEndsAt === now + 100 + E.ROPE_WINDOW_MS, 'a second wrong push brings the roof down');
check(T().gems === 7, 'two strikes: 4 gems gone');
check(!E.throwRope(gs, 'unni', now + 200, ALL, rng).ok, 'the key-holder can’t throw the rope to themselves');
check(!E.throwRope(gs, 'radhika', now + 200, ALL, rng).ok, 'the rivals can’t throw it');
{
    const buried = E.advance(gs, now + 100 + E.ROPE_WINDOW_MS, ALL, rng);
    check(buried.teams.tiger.stage === 'buried', 'nobody throws it in time: buried');
}
gs = ok(E.throwRope(gs, 'swathi', now + 300, ALL, rng), 'rope');
check(T().stage === 'door' && T().door === 1 && T().retry && T().ropeUsed, 'swathi throws it: the same door again');
check(T().keyHolder === 'unni' && T().doorEndsAt === now + 300 + E.RETRY_MS, 'same key-holder, a fresh lock, 60 s');
check(T().gems === 5 && T().strikes === 3, 'the rope costs a strike');
check(T().doorLog.at(-1)?.how === 'rope' && gs.stats.swathi.ropes === 1, 'logged: swathi’s rope');
check(crossingEnds !== T().doorEndsAt, 'the timer restarted');
gs = ok(E.pushDoor(gs, 'unni', T().puzzle!.answer, now + 1000, ALL, rng), 'retry opened');
check(T().stage === 'between' && T().gems === 5, 'a retried door gives no gems');
{
    // Second catastrophe: no rope left.
    let g2 = E.advance(gs, now + 1000 + E.BETWEEN_MS, ALL, rng);
    g2 = E.advance(g2, g2.teams.tiger.doorEndsAt, ALL, rng);
    check(g2.teams.tiger.stage === 'falling', 'the vault timer runs out: falling again');
    check(!E.throwRope(g2, 'rakesh', g2.teams.tiger.doorEndsAt + 10, ALL, rng).ok, 'only one rope per expedition');
}

section('cobra gets the torch');
gs = ok(E.pushDoor(gs, 'bharat', C().puzzle!.answer, now + 2000, ALL, rng), 'cobra opens the crossing');
check(C().gems === cobraGateGems + Math.floor((C().doorEndsAt - (now + 2000)) / E.GEM_MS), 'cobra’s crossing gems');
now += 1000 + E.BETWEEN_MS;
gs = E.advance(gs, now, ALL, rng);
check(T().door === 2 && T().puzzle?.type === 'vault' && T().keyHolder === 'lachu', 'tiger at the Vault, lachu has the key');
check(!T().torch, 'tiger reached the vault first: no torch');
gs = E.advance(gs, now + 1000, ALL, rng);
check(C().door === 2 && !C().torch, 'cobra starts the vault while tiger is still working on it: no torch');

section('claiming the treasure, and the interrupt');
gs = ok(E.pushDoor(gs, 'lachu', T().puzzle!.answer, now + 2000, ALL, rng), 'tiger opens the vault');
now += 2000;
check(T().stage === 'vault', 'tiger is at the chest');
check(E.holdKind(gs, 'rakesh') === 'claim' && E.holdKind(gs, 'radhika') === 'interrupt', 'tiger can claim; cobra (with gems) can interrupt');
for (const p of ['rakesh', 'unni', 'swathi']) gs = ok(E.holdDown(gs, p, now, ALL, rng), `hold ${p}`);
check(E.holdDoneAt(gs, 'tiger', ALL) === null, 'three hands of four: not yet');
for (const p of COBRA) gs = ok(E.holdDown(gs, p, now + 200, ALL, rng), `interrupt ${p}`);
gs = ok(E.holdDown(gs, 'lachu', now + 1000, ALL, rng), 'lachu late');
check(E.holdDoneAt(gs, 'tiger', ALL)?.at === now + 1000 + E.CLAIM_HOLD_MS, 'tiger’s 4 s start with the last hand');
check(E.holdDoneAt(gs, 'cobra', ALL)?.at === now + 200 + E.INTERRUPT_HOLD_MS, 'cobra’s 3 s started earlier');
check(E.nextDue(gs, ALL) === now + 200 + E.INTERRUPT_HOLD_MS, 'next thing: cobra’s interrupt lands');
{
    // If one cobra lets go, the interrupt fails and tiger claims.
    let g2 = ok(E.holdUp(gs, 'gowri', now + 2000, ALL, rng), 'release');
    g2 = E.advance(g2, now + 1000 + E.CLAIM_HOLD_MS, ALL, rng);
    check(g2.phase === 'expeditionEnd' && g2.results[0].winner === 'tiger' && g2.results[0].how === 'claim', 'a cobra lets go: tiger claims');
    check(g2.teams.tiger.score === g2.teams.tiger.gems + E.TREASURE && g2.teams.cobra.score === g2.teams.cobra.gems, 'score: gems + 25 for the treasure');
}
const cobraGemsBefore = C().gems;
gs = E.advance(gs, now + 200 + E.INTERRUPT_HOLD_MS, ALL, rng);
check(gs.phase === 'seal' && gs.interruptedBy === 'cobra', 'cobra’s interrupt lands first: everyone tumbles into the Final Seal');
check(C().gems === cobraGemsBefore - E.INTERRUPT_COST && C().interruptUsed, 'it cost cobra 5 gems');
check(Object.keys(gs.holds).length === 0, 'all hands released');
check(T().seal!.tiles.length === 4 && C().seal!.tiles.length === 4, 'four tiles per team');
check(T().seal!.tiles.every((t) => TIGER.includes(t.owner)) && new Set(T().seal!.tiles.map((t) => t.owner)).size === 4, 'one tile per tiger');

section('the final seal');
now += 200 + E.INTERRUPT_HOLD_MS;
const sealT = () => T().seal!;
const tileOf = (team: RrfTeamId, p: string) => gs.teams[team].seal!.tiles.find((t) => t.owner === p)!;
check(!E.placeSeal(gs, 'rakesh', tileOf('tiger', 'unni').id, 0, now, ALL, rng).ok, 'can’t move a teammate’s tile');
check(!E.pushSeal(gs, 'rakesh', now, ALL, rng).ok, 'can’t push before every tile is placed');
const placeAll = (team: RrfTeamId, order: string[]) => {
    order.forEach((tid, slot) => {
        const owner = gs.teams[team].seal!.tiles.find((t) => t.id === tid)!.owner;
        gs = ok(E.placeSeal(gs, owner, tid, slot, now, ALL, rng), `place ${tid}`);
    });
};
placeAll('tiger', [...sealT().answer].reverse());
gs = ok(E.pushSeal(gs, 'swathi', now, ALL, rng), 'wrong seal');
check(gs.phase === 'seal' && sealT().wrong === 1 && sealT().lockedUntil === now + E.SEAL_LOCK_MS, 'wrong: locked for 5 s');
placeAll('tiger', sealT().answer);
check(!E.pushSeal(gs, 'swathi', now + 1000, ALL, rng).ok, 'still locked');
placeAll('cobra', C().seal!.answer);
gs = ok(E.pushSeal(gs, 'gayatri', now + 2000, ALL, rng), 'cobra seal');
check(gs.phase === 'finalClaim' && gs.sealWinner === 'cobra' && gs.phaseEndsAt === now + 2000 + E.GUARD_MS, 'cobra opens the seal first: their chest to claim');
now += 2000;
check(E.holdKind(gs, 'rakesh') === null, 'tiger can’t interrupt this time');
check(!E.holdDown(gs, 'rakesh', now, ALL, rng).ok, 'tiger’s press does nothing');
for (const p of COBRA) gs = ok(E.holdDown(gs, p, now, ALL, rng), `claim ${p}`);
{
    const g2 = E.advance(gs, now + E.CLAIM_HOLD_MS, ALL, rng);
    check(g2.phase === 'expeditionEnd' && g2.results[0].winner === 'cobra' && g2.results[0].how === 'claim', 'cobra holds 4 s: theirs');
}

section('the steal');
gs = ok(E.holdUp(gs, 'gowri', now + 2600, ALL, rng), 'gowri lets go');
check(!gs.unguarded && gs.fumble?.pid === 'gowri' && E.nextDue(gs, ALL) === now + 2600 + E.FUMBLE_MS, 'gowri lets go mid-hold: a second to grab it again');
gs = E.advance(gs, now + 2600 + E.FUMBLE_MS, ALL, rng);
check(gs.unguarded, 'she doesn’t: chest unguarded');
check(E.holdKind(gs, 'swathi') === 'claim', 'now tiger can grab it too');
for (const p of TIGER) gs = ok(E.holdDown(gs, p, now + 3700, ALL, rng), `steal ${p}`);
gs = ok(E.holdDown(gs, 'gowri', now + 4200, ALL, rng), 'gowri back');
check(E.holdDoneAt(gs, 'tiger', ALL)!.at < E.holdDoneAt(gs, 'cobra', ALL)!.at, 'tiger’s hold started first');
gs = E.advance(gs, now + 3700 + E.CLAIM_HOLD_MS, ALL, rng);
check(gs.phase === 'expeditionEnd' && gs.results[0].winner === 'tiger' && gs.results[0].how === 'steal', '🐯 tiger steals the treasure!');
check(gs.results[0].interruptedBy === 'cobra', 'the result remembers the interrupt');
const tigerScore1 = T().score;
check(tigerScore1 === T().gems + E.TREASURE, 'tiger: gems + 25');

section('the next expedition');
now += 3700 + E.CLAIM_HOLD_MS;
check(E.skip(gs, now, ALL, rng).ok, 'the host can skip the summary');
gs = ok(E.skip(gs, now, ALL, rng), 'skip');
check(gs.phase === 'intro' && gs.expedition === 2 && gs.scenario !== gs.results[0].scenario, 'expedition 2, somewhere new');
check(T().score === tigerScore1 && T().gems === 0 && !T().ropeUsed && !C().interruptUsed, 'scores carry on; gems, rope and interrupt reset');
gs = ok(E.skip(gs, now, ALL, rng), 'skip intro');
check(T().keyHolder === 'swathi' && C().keyHolder === 'gowri', 'the key keeps turning: swathi’s and gowri’s first go with the key');

section('players leaving');
{
    const left = ALL.filter((p) => p !== 'swathi');
    const g2 = E.advance(gs, now + 10, left, rng);
    check(g2.teams.tiger.keyHolder === 'rakesh' && g2.teams.tiger.stage === 'door', 'the key-holder leaves: the next player takes the key');
    check(!g2.teams.tiger.pages.rakesh && Object.values(g2.teams.tiger.pages).flat().length === g2.teams.tiger.puzzle!.clues.length, 'pages re-dealt, nothing lost');
    const g3 = E.advance(gs, now + 10, ALL.filter((p) => p !== 'unni'), rng);
    check(!g3.teams.tiger.pages.unni && Object.values(g3.teams.tiger.pages).flat().length === g3.teams.tiger.puzzle!.clues.length, 'an explorer leaves: their clues go to the others');
    const g4 = E.advance(gs, now + 10, COBRA, rng);
    check(g4.teams.tiger.stage === 'buried' && g4.phase === 'run', 'a whole team leaves: they’re out, the other plays on');
    const g5 = E.advance(gs, now + 10, [], rng);
    check(g5.phase === 'expeditionEnd' && g5.results.at(-1)!.winner === null, 'everyone gone: nobody wins it');
}

section('both buried, seal timeout, guard timeout');
{
    const g1 = E.advance(gs, now + E.DOOR_MS, ALL, rng);
    check(g1.teams.tiger.stage === 'falling' && g1.teams.cobra.stage === 'falling', 'both timers run out: both teams falling');
    const g2 = E.advance(g1, now + E.DOOR_MS + E.ROPE_WINDOW_MS, ALL, rng);
    check(g2.phase === 'expeditionEnd' && g2.results.at(-1)!.winner === null && g2.results.at(-1)!.how === 'none', 'both teams time out with no rope thrown: nobody wins');
    check(g2.teams.tiger.score === tigerScore1, 'no gems, no treasure');
}
{
    let g = E.newGame({ tiger: ['a', 'b'], cobra: ['c', 'd'] }, 1, 0, rng);
    const P4 = ['a', 'b', 'c', 'd'];
    g = E.advance(g, E.INTRO_MS, P4, rng);
    let t = E.INTRO_MS;
    check(Object.keys(g.teams.tiger.pages).length === 1 && Object.values(g.teams.tiger.pages)[0].length === g.teams.tiger.puzzle!.clues.length, '2 v 2: the one explorer has every clue');
    // Tiger races through; cobra opens the gate slowly.
    for (let d = 0; d < 3; d++) {
        g = ok(E.pushDoor(g, g.teams.tiger.keyHolder, g.teams.tiger.puzzle!.answer, t + 1000, P4, rng), `door ${d}`);
        if (d < 2) g = E.advance(g, (t = t + 1000 + E.BETWEEN_MS), P4, rng);
    }
    t += 1000;
    g = ok(E.pushDoor(g, g.teams.cobra.keyHolder, g.teams.cobra.puzzle!.answer, t, P4, rng), 'cobra gate');
    check(g.teams.tiger.stage === 'vault', '2 v 2: tiger at the chest');
    check(E.holdKind(g, 'c') === 'interrupt', 'cobra has the gems to interrupt');
    {
        const g2 = E.advance(g, t + E.BETWEEN_MS, P4, rng);
        check(g2.teams.cobra.door === 1 && g2.teams.cobra.torch, 'cobra starts a door tiger already opened: 🔦 torch');
        check(g2.teams.cobra.puzzle!.clues[g2.teams.cobra.puzzle!.keyClue].decoy !== true, 'the torch lights a real clue');
    }
    g = ok(E.holdDown(g, 'c', t, P4, rng), 'c');
    g = ok(E.holdDown(g, 'd', t, P4, rng), 'd');
    g = E.advance(g, t + E.INTERRUPT_HOLD_MS, P4, rng);
    check(g.phase === 'seal' && g.teams.tiger.seal!.tiles.length === 2, '2 v 2 interrupt: a two-tile seal');
    const sealEnd = g.phaseEndsAt;
    const richer: RrfTeamId = g.teams.tiger.gems > g.teams.cobra.gems ? 'tiger' : 'cobra';
    const g3 = E.advance(g, sealEnd, P4, rng);
    check(g3.phase === 'expeditionEnd' && g3.results[0].winner === richer && g3.results[0].how === 'seal-timeout', 'nobody opens the seal: the richer team takes it');
    // Seal won, then the winners dither past the guard time.
    for (const tile of g.teams.tiger.seal!.answer) {
        const owner = g.teams.tiger.seal!.tiles.find((x) => x.id === tile)!.owner;
        g = ok(E.placeSeal(g, owner, tile, g.teams.tiger.seal!.answer.indexOf(tile), t + 4000, P4, rng), 'place');
    }
    g = ok(E.pushSeal(g, 'a', t + 4000, P4, rng), 'tiger seal');
    check(!g.unguarded && E.holdKind(g, 'c') === null, 'cobra must wait while tiger has the chest');
    g = E.advance(g, t + 4000 + E.GUARD_MS, P4, rng);
    check(g.unguarded && E.holdKind(g, 'c') === 'claim', 'tiger took too long: the chest is up for grabs');
    check(g.teams.cobra.interruptUsed && E.holdKind(g, 'a') === 'claim', 'both teams can grab it');
    g = ok(E.holdDown(g, 'c', t + 25000, P4, rng), 'c');
    g = ok(E.holdDown(g, 'd', t + 25000, P4, rng), 'd');
    g = E.advance(g, t + 25000 + E.CLAIM_HOLD_MS, P4, rng);
    check(g.phase === 'expeditionEnd' && g.results[0].winner === 'cobra' && g.results[0].how === 'steal', 'cobra grabs it');
    g = E.advance(g, g.phaseEndsAt, P4, rng);
    check(g.phase === 'over', 'the last expedition ends the game');
    check(E.nightWinner(g) === E.standings(g)[0].id, 'night winner is the top score');
}

section('interrupt rules');
{
    let g = E.newGame({ tiger: ['a', 'b'], cobra: ['c', 'd'] }, 1, 0, rng);
    const P4 = ['a', 'b', 'c', 'd'];
    g = E.advance(g, E.INTRO_MS, P4, rng);
    let t = E.INTRO_MS;
    for (let d = 0; d < 3; d++) {
        g = ok(E.pushDoor(g, g.teams.tiger.keyHolder, g.teams.tiger.puzzle!.answer, t + 1000, P4, rng), `door ${d}`);
        if (d < 2) g = E.advance(g, (t = t + 1000 + E.BETWEEN_MS), P4, rng);
    }
    check(g.teams.cobra.gems < E.INTERRUPT_COST && E.holdKind(g, 'c') === null, 'a team without 5 gems can’t interrupt');
    g = ok(E.holdDown(g, 'a', t + 2000, P4, rng), 'a');
    check(!E.holdDown(g, 'c', t + 2000, P4, rng).ok, 'cobra’s press refused');
    g = ok(E.holdDown(g, 'b', t + 2000, P4, rng), 'b');
    g = ok(E.holdUp(g, 'b', t + 3000, P4, rng), 'b lets go');
    check(g.phase === 'run' && !g.unguarded, 'letting go before the 4 s at the first claim just resets it');
    g = ok(E.holdDown(g, 'b', t + 3500, P4, rng), 'b again');
    g = E.advance(g, t + 3500 + E.CLAIM_HOLD_MS - 1, P4, rng);
    check(g.phase === 'run', '1 ms short: not yet');
    g = E.advance(g, t + 3500 + E.CLAIM_HOLD_MS, P4, rng);
    check(g.phase === 'expeditionEnd' && g.results[0].winner === 'tiger' && g.results[0].interruptedBy === null, 'tiger claims');
}

section('host and results');
{
    const g = E.endEarly(gs);
    check(g.phase === 'over' && g.endedEarly && g.teams.tiger.score === tigerScore1, 'ending early: finished expeditions still count');
    const a = E.awards(gs, ALL);
    check(a.rope === 'swathi', '🪢 rope hero: swathi');
    check(a.keyHolder !== null && gs.stats[a.keyHolder].clean >= 1, '⭐ key-holder of the night has a clean door');
    check(E.standings(gs)[0].id === 'tiger', 'tiger leads the night');
}

section('leaderboard points');
{
    const pts = E.playerPoints(gs, ALL);
    check(TIGER.every((p) => pts[p] === E.POINTS.win) && COBRA.every((p) => pts[p] === E.POINTS.lose), 'night winners 10 each, the others 4');
    check(!('unni' in E.playerPoints(gs, ALL.filter((p) => p !== 'unni'))), 'players who left get nothing');
    const fresh = E.newGame({ tiger: TIGER, cobra: COBRA }, 3, 0, rng);
    check(Object.keys(E.playerPoints(E.endEarly(fresh), ALL)).length === 0, 'no expedition finished: no points');
    const draw = { ...gs, teams: { tiger: { ...gs.teams.tiger, score: 20 }, cobra: { ...gs.teams.cobra, score: 20 } }, results: [{ ...gs.results[0], winner: null }] } as RrfGameState;
    const dp = E.playerPoints(draw, ALL);
    check(ALL.every((p) => dp[p] === E.POINTS.draw), 'a drawn night: 6 each');
}

section('review fixes');
{
    // 🔦 torch: a buried rival keeps the doors it opened.
    let g = E.newGame({ tiger: ['a', 'b'], cobra: ['c', 'd'] }, 3, 0, rng);
    const P4 = ['a', 'b', 'c', 'd'];
    const t = E.INTRO_MS;
    g = E.advance(g, t, P4, rng);
    const C = () => g.teams.cobra;
    const wrongOf = (a: string[]) => (C().puzzle!.type === 'crossing' ? a.map((d) => (d === '9' ? '8' : '9')) : [a[1], a[0], ...a.slice(2)]);
    g = ok(E.pushDoor(g, C().keyHolder, C().puzzle!.answer, t + 1000, P4, rng), 'cobra gate');
    g = E.advance(g, t + 11000, P4, rng);
    g = ok(E.pushDoor(g, C().keyHolder, C().puzzle!.answer, t + 12000, P4, rng), 'cobra crossing');
    g = E.advance(g, t + 22000, P4, rng);
    g = ok(E.pushDoor(g, C().keyHolder, wrongOf(C().puzzle!.answer), t + 23000, P4, rng), 'cobra wrong');
    g = ok(E.pushDoor(g, C().keyHolder, wrongOf(C().puzzle!.answer), t + 23000, P4, rng), 'cobra wrong again');
    g = E.advance(g, t + 23000 + E.ROPE_WINDOW_MS, P4, rng);
    check(C().stage === 'buried' && C().door === 2, 'cobra opened two doors, then got buried at the vault');
    g = ok(E.pushDoor(g, g.teams.tiger.keyHolder, g.teams.tiger.puzzle!.answer, t + 30000, P4, rng), 'tiger gate');
    g = E.advance(g, t + 30000 + E.BETWEEN_MS, P4, rng);
    check(g.teams.tiger.door === 1 && g.teams.tiger.torch, 'tiger starts the crossing the buried team had opened: 🔦 torch');
}
{
    // Points after ending early: at least half the expeditions.
    const base = E.newGame({ tiger: TIGER, cobra: COBRA }, 5, 0, rng);
    const r = { expedition: 1, scenario: 'temple', winner: 'tiger' as const, how: 'claim' as const, gems: { tiger: 10, cobra: 2 }, interruptedBy: null };
    const one = { ...base, phase: 'over' as const, endedEarly: true, results: [r], teams: { ...base.teams, tiger: { ...base.teams.tiger, score: 35 } } };
    check(Object.keys(E.playerPoints(one, ALL)).length === 0, 'a 5-expedition game ended after 1: no points');
    const three = { ...one, results: [r, { ...r, expedition: 2 }, { ...r, expedition: 3 }] };
    check(E.playerPoints(three, ALL).rakesh === E.POINTS.win, 'ended after 3 of 5: points');
    const full1 = { ...one, expeditionsTotal: 1, endedEarly: false };
    check(E.playerPoints(full1, ALL).rakesh === E.POINTS.win, 'a 1-expedition game played out: points');
    check(E.expeditionsForPoints({ ...one, expeditionsTotal: 3 }) === 2, 'ended early, 3 planned: needs 2');
}
{
    // Fumble: a seal winner who slips has a second to grab it again.
    let g = E.newGame({ tiger: ['a', 'b'], cobra: ['c', 'd'] }, 1, 0, rng);
    const P4 = ['a', 'b', 'c', 'd'];
    g = E.advance(g, E.INTRO_MS, P4, rng);
    let t = E.INTRO_MS;
    for (let d = 0; d < 3; d++) {
        g = ok(E.pushDoor(g, g.teams.tiger.keyHolder, g.teams.tiger.puzzle!.answer, t + 1000, P4, rng), `door ${d}`);
        if (d < 2) g = E.advance(g, (t = t + 1000 + E.BETWEEN_MS), P4, rng);
    }
    t += 1000;
    g = ok(E.pushDoor(g, g.teams.cobra.keyHolder, g.teams.cobra.puzzle!.answer, t, P4, rng), 'cobra gate');
    g = ok(E.holdDown(g, 'c', t, P4, rng), 'c');
    g = ok(E.holdDown(g, 'd', t, P4, rng), 'd');
    g = E.advance(g, t + E.INTERRUPT_HOLD_MS, P4, rng);
    t += E.INTERRUPT_HOLD_MS;
    for (const tile of g.teams.tiger.seal!.answer) {
        const owner = g.teams.tiger.seal!.tiles.find((x) => x.id === tile)!.owner;
        g = ok(E.placeSeal(g, owner, tile, g.teams.tiger.seal!.answer.indexOf(tile), t, P4, rng), 'place');
    }
    g = ok(E.pushSeal(g, 'a', t, P4, rng), 'seal');
    g = ok(E.holdDown(g, 'a', t, P4, rng), 'a');
    g = ok(E.holdDown(g, 'b', t, P4, rng), 'b');
    g = ok(E.holdUp(g, 'a', t + 1000, P4, rng), 'a slips');
    check(!g.unguarded && g.fumble?.pid === 'a', 'a slip: not unguarded yet');
    check(E.holdKind(g, 'c') === null, 'the other team still can’t grab during the second');
    const regrab = ok(E.holdDown(g, 'a', t + 1500, P4, rng), 'a again');
    check(!regrab.unguarded && !regrab.fumble, 'grabbed again in time: still theirs');
    const late = E.advance(g, t + 1000 + E.FUMBLE_MS, P4, rng);
    check(late.unguarded && E.holdKind(late, 'c') === 'claim', 'not grabbed in time: unguarded');
    const lateGrab = E.holdDown(late, 'a', t + 1000 + E.FUMBLE_MS + 10, P4, rng);
    check(lateGrab.ok && lateGrab.gs.unguarded, 'too late: pressing again doesn’t undo it');
}
check(E.judgedNow(1000, 5000) === 5000 && E.judgedNow(9000, 5000) === 9000 && E.judgedNow(7, undefined) === 7, 'a phone’s clock is never judged earlier than the last server write');

section('places');
{
    const { SCENARIOS } = require('../src/games/roof-race/data/scenarios');
    check(SCENARIOS.length === 5 && new Set(SCENARIOS.map((x: { id: string }) => x.id)).size === 5, 'five different places');
    check(SCENARIOS.every((x: { doors: string[]; dooms: string[]; name: string }) => x.doors.length === 3 && x.dooms.length === 3 && x.name.includes(' of ')), 'each has 3 doors, 3 catastrophes, and a “X of Y” name');
    let g = E.newGame({ tiger: ['a', 'b'], cobra: ['c', 'd'] }, 5, 0, rng);
    const seen = [g.scenario];
    for (let i = 0; i < 4; i++) {
        g = E.endEarly(g);
        g = { ...g, phase: 'expeditionEnd', endedEarly: false, phaseEndsAt: 0, results: [] };
        g = E.advance(g, 1, ['a', 'b', 'c', 'd'], rng);
        seen.push(g.scenario);
    }
    check(new Set(seen).size === 5, `a 5-expedition game visits all five (${seen.join(', ')})`);
}

section('dropped phones');
{
    let g = E.newGame({ tiger: TIGER, cobra: COBRA }, 1, 0, rng);
    g = E.advance(g, E.INTRO_MS, ALL, rng);
    let t = E.INTRO_MS;
    check(!E.setAway(g, []).ok, 'no change: nothing written');
    g = ok(E.setAway(g, ['rakesh', 'rakesh']), 'away');
    check(g.away!.join() === 'rakesh', 'marked away once');
    const here = E.presentIds(ALL, g);
    check(!here.includes('rakesh') && here.length === 7, 'away players don’t count as here');
    g = E.advance(g, t + 100, here, rng);
    check(g.teams.tiger.keyHolder !== 'rakesh' && g.teams.tiger.stage === 'door', 'the dropped key-holder’s key passes to a teammate');
    check(!g.teams.tiger.pages[g.teams.tiger.keyHolder] && Object.values(g.teams.tiger.pages).flat().length === g.teams.tiger.puzzle!.clues.length, 'pages re-dealt to the teammates still here');
    // Tiger races to the vault without Rakesh; the chest doesn't wait for him.
    for (let d = 0; d < 3; d++) {
        g = ok(E.pushDoor(g, g.teams.tiger.keyHolder, g.teams.tiger.puzzle!.answer, t + 1000, here, rng), `door ${d}`);
        if (d < 2) g = E.advance(g, (t = t + 1000 + E.BETWEEN_MS), here, rng);
    }
    t += 1000;
    for (const p of ['unni', 'lachu', 'swathi']) g = ok(E.holdDown(g, p, t, here, rng), p);
    check(E.holdDoneAt(g, 'tiger', here)?.kind === 'claim', 'three hands are enough while Rakesh is away');
    // He's back before it completes: now his hand is needed too.
    g = ok(E.setAway(g, []), 'back');
    check(E.holdDoneAt(g, 'tiger', ALL) === null, 'back: the chest needs his hand again');
    g = ok(E.holdDown(g, 'rakesh', t + 500, ALL, rng), 'rakesh holds');
    g = E.advance(g, t + 500 + E.CLAIM_HOLD_MS, ALL, rng);
    check(g.phase === 'expeditionEnd' && g.results[0].winner === 'tiger', 'all four hands: tiger claims');
    check(E.playerPoints({ ...g, phase: 'over', away: ['rakesh'] }, ALL).rakesh === E.POINTS.win, 'a dropped player still gets their team’s points');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
