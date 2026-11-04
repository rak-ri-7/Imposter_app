// ✏️ Match the Following: tests for the rules engine (pure functions, no
// Firestore). Run with:  npm run test:mtf
import * as E from '../src/games/match-the-following/logic/engine';
import { QUESTIONS } from '../src/games/match-the-following/data/questions';
import type { MtfGameState } from '../src/shared/types';

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
let seed = 5;
const rng = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
};
const ok = <T,>(r: { ok: true; gs: T } | { ok: false; reason: string }, what: string): T => {
    if (!r.ok) throw new Error(`${what}: ${r.reason}`);
    return r.gs;
};
const P = ['a', 'b', 'c', 'd'];

section('question bank');
check(QUESTIONS.length >= 100, 'at least 100 situations');
check(new Set(QUESTIONS.map((q) => q.id)).size === QUESTIONS.length, 'ids are unique');
check(QUESTIONS.every((q) => q.presets.every((p) => [...p].length <= E.MAX_CHARS)), `presets fit in ${E.MAX_CHARS} characters`);
check(QUESTIONS.every((q) => new Set(q.presets.map((p) => p.toLowerCase())).size === 4), 'presets differ within a question');
{
    const used: string[] = [];
    for (let i = 0; i < 30; i++) used.push(E.pickQuestion(QUESTIONS, 'wholesome', used, rng).id);
    check(new Set(used).size === 30 && used.every((id) => QUESTIONS.find((q) => q.id === id)!.spice === 1), 'wholesome games: no repeats, no cheeky questions');
}
check(QUESTIONS.every((q) => q.spice === 1 || q.spice === 2), 'no savage questions left');
check(QUESTIONS.filter((q) => q.tricky).every((q) => q.spice === 1), 'tricky questions are all wholesome');
{
    const trickyCount = QUESTIONS.filter((q) => q.tricky).length;
    const used: string[] = [];
    for (let i = 0; i < trickyCount; i++) used.push(E.pickQuestion(QUESTIONS, 'tricky', used, rng).id);
    check(used.every((id) => QUESTIONS.find((q) => q.id === id)!.tricky) && new Set(used).size === trickyCount, 'tricky games: only the dilemmas, no repeats');
    check(E.pickQuestion(QUESTIONS, 'tricky', used, rng).tricky, 'tricky deck run dry: repeats, still tricky');
    const cheeky = QUESTIONS.filter((q) => E.inDeck(q, 'cheeky')).length;
    check(cheeky === QUESTIONS.length, 'cheeky games draw from the whole bank');
}

section('answering');
let gs = E.newGame(P, 3, 'cheeky', 0, rng);
check(gs.phase === 'answer' && gs.phaseEndsAt === E.ANSWER_MS && gs.presets.length === 4, 'round 1 starts with a 60 s answer timer');
check(!E.submitAnswer(gs, 'a', { text: '   ' }, 1).ok, 'empty answer refused');
check(!E.submitAnswer(gs, 'a', { text: 'x'.repeat(51) }, 1).ok, '51 characters refused');
check(E.submitAnswer(gs, 'a', { text: '😂'.repeat(50) }, 1).ok, '50 emoji count as 50 characters');
check(!E.submitAnswer(gs, 'a', { preset: 9 }, 1).ok, 'unknown preset refused');
check(!E.submitAnswer(gs, 'zz', { text: 'hi' }, 1).ok, 'outsiders refused');
gs = ok(E.submitAnswer(gs, 'a', { text: '  ignore  it   lol ' }, 1), 'a');
check(gs.answers.a.text === 'ignore it lol', 'spaces tidied, spelling kept');
gs = ok(E.submitAnswer(gs, 'b', { preset: 0 }, 2), 'b');
check(gs.answers.b.preset && gs.answers.b.text === gs.presets[0], 'preset answer stored');
gs = ok(E.submitAnswer(gs, 'c', { text: 'Ignore it LOL' }, 3), 'c');
check(!E.isDue(gs, 10, P), 'not due while someone still has to answer');
check(E.isDue(gs, 10, ['a', 'b', 'c']), 'due early once everyone still here has answered');
check(E.isDue(gs, E.ANSWER_MS, P), 'due when time is up');

section('matching');
gs = E.toMatch(gs, E.ANSWER_MS, rng);
check(gs.phase === 'match', 'into matching');
check(P.every((v) => gs.targets[v].length === 3 && !gs.targets[v].includes(v) && !gs.order[v].includes(v)), 'your own name and answer are left off');
check(gs.phaseEndsAt === E.ANSWER_MS + E.matchMs(3), 'match timer grows with the lines');
check(!E.submitBoard(gs, 'a', { b: 'c', c: 'c' }, false).ok, 'one line per answer');
check(!E.submitBoard(gs, 'a', { b: 'a' }, false).ok, "can't join to your own answer");
check(!E.submitBoard(gs, 'a', { b: 'c' }, true).ok, "can't lock in with names left");
gs = ok(E.submitBoard(gs, 'a', { b: 'b', c: 'd', d: 'c' }, true), 'a locks'); // d (no answer) <-> c swapped
check(!E.submitBoard(gs, 'a', { b: 'c', c: 'b', d: 'd' }, true).ok, "can't change after locking");
gs = ok(E.submitBoard(gs, 'b', { a: 'c', c: 'a', d: 'd' }, true), 'b'); // a and c wrote the same thing
gs = ok(E.submitBoard(gs, 'c', { a: 'b', b: 'a' }, false), 'c saves partial'); // a↔b wrong, d not drawn
check(!E.isDue(gs, E.ANSWER_MS + 10, P), 'not due until all lock in');

section('scoring');
gs = E.toReveal(gs, E.ANSWER_MS + 100000, rng);
const res = gs.last!;
check(res.correct.a === 1, 'a: one right, two wrong');
check(res.correct.b === 3, 'identical answers are interchangeable: b gets 3');
check(res.correct.c === 0 && res.lines.c === 3, 'partial board: only drawn lines count, out of all 3');
check(res.correct.d === 0, 'd drew nothing');
check(res.fooled.c === 1 && res.fooled.d === 1, 'fooled counts wrong lines on you');
check(res.readBy.b === 1 && res.fooled.b === 1, 'read right by one, fooled another');
check((res.fooled.a ?? 0) + (res.readBy.a ?? 0) === 2, 'a was on 3 boards; the empty one neither fools nor reads');
check(gs.score.b === 3 && gs.seenTotal.a === 3, 'scores and appearances add up');
check(new Set(res.revealOrder).size === P.length, 'every answer gets a reveal');
check(E.revealStep(gs, gs.revealAt!) === 0 && E.revealStep(gs, gs.revealAt! + E.REVEAL_STEP_MS * P.length) === 'board', 'reveal steps on the clock');
check(!E.isDue(gs, gs.revealAt! + 1000, P) && E.isDue(gs, gs.phaseEndsAt!, P), 'reveal ends on time only');

section('rounds and the end');
gs = E.toRoundEnd(gs, gs.phaseEndsAt!);
check(gs.phase === 'roundEnd' && E.roundsPlayed(gs) === 1, 'round recorded');
const g2 = E.nextRound(gs, P, gs.phaseEndsAt!, rng);
check(g2.phase === 'answer' && g2.round === 2 && g2.questionId !== gs.questionId && Object.keys(g2.answers).length === 0, 'next round: new question, clean slate');
check(E.nextRound(gs, ['a', 'b'], 0, rng).phase === 'over', 'below 3 players: game over');
check(E.standings(E.endEarly(gs)).every((s) => s.points === 0), 'ended after 1 round: no points');
check(E.endEarly(g2).history!.length === 1, 'a round still being answered is dropped');
const fin = { ...gs, round: 3, history: [res, res, res] } as MtfGameState;
const over = E.nextRound(fin, P, 0, rng);
const st = E.standings(over);
check(over.phase === 'over' && st[0].playerId === 'b' && st[0].points === 10, 'most right lines wins');
check(E.standings(over, ['a', 'c', 'd']).every((s) => s.playerId !== 'b'), 'someone who left isn’t ranked');
const aw = E.awards(over);
check(!!aw.pokerFace && !!aw.openBook, 'Poker Face and Open Book awarded');

section('big groups');
{
    const many = Array.from({ length: 10 }, (_, i) => `p${i}`);
    let g = E.newGame(many, 3, 'wholesome', 0, rng);
    for (const id of many) g = ok(E.submitAnswer(g, id, { preset: 1 }, 1), 'ans');
    g = E.toMatch(g, 10, rng);
    check(many.every((v) => g.targets[v].length === E.BOARD_MAX), `10 players: each board holds ${E.BOARD_MAX} names`);
    check(many.every((v) => [...g.targets[v]].sort().join() === [...g.order[v]].sort().join()), 'the names and answers on a board belong together');
    const appearances = Object.fromEntries(many.map((id) => [id, many.filter((v) => g.targets[v].includes(id)).length]));
    check(many.every((id) => appearances[id] === E.BOARD_MAX), `10 players: every answer is on exactly ${E.BOARD_MAX} boards (none left out)`);
    check(many.every((v) => !g.targets[v].includes(v)), 'nobody gets their own name');
    for (const size of [8, 9, 12]) {
        const ps = Array.from({ length: size }, (_, i) => `q${i}`);
        let h = E.newGame(ps, 3, 'wholesome', 0, rng);
        for (const id of ps) h = ok(E.submitAnswer(h, id, { preset: 0 }, 1), 'ans');
        h = E.toMatch(h, 10, rng);
        check(ps.every((id) => ps.filter((v) => h.targets[v].includes(id)).length === E.BOARD_MAX), `${size} players: every answer covered evenly`);
    }
}

section('board saves');
{
    let g = E.newGame(P, 3, 'wholesome', 0, rng);
    for (const id of P) g = ok(E.submitAnswer(g, id, { preset: 1 }, 1), 'ans');
    g = E.toMatch(g, 10, rng);
    const [n1, n2] = g.targets.a;
    const [a1, a2] = g.order.a;
    g = ok(E.submitBoard(g, 'a', { [n1]: a1, [n2]: a2 }, false, 200), 'newer save');
    check(!E.submitBoard(g, 'a', { [n1]: a1 }, false, 100).ok, 'an older save arriving late is ignored');
    check(Object.keys(g.lines.a).length === 2, 'the newer board stays');
    check(!E.submitBoard(g, 'a', {}, false, NaN).ok, 'a bad save number is refused');
    g = ok(E.submitBoard(g, 'a', { [n1]: a2 }, false, 300), 'newest save');
    check(g.lines.a[n1] === a2 && g.boardRev!.a === 300, 'newer saves apply');
    const g2 = E.toRoundEnd(E.toReveal(g, 1e6, rng), 2e6);
    check(Object.keys(E.toMatch(E.nextRound(g2, P, 3e6, rng), 4e6, rng).boardRev ?? {}).length === 0, 'save numbers reset each round');
}

section('reveal length');
check(E.revealStepMs(4) === E.REVEAL_STEP_MS, 'small groups: 6.5 s per answer');
check(E.revealStepMs(10) * 10 <= E.REVEAL_BUDGET_MS, '10 players: the reveal fits the budget');
check(E.revealStepMs(30) === E.REVEAL_MIN_STEP_MS, 'never quicker than the minimum');
{
    const ten = Array.from({ length: 10 }, (_, i) => `r${i}`);
    let g = E.newGame(ten, 3, 'wholesome', 0, rng);
    for (const id of ten) g = ok(E.submitAnswer(g, id, { preset: 0 }, 1), 'ans');
    g = E.toReveal(E.toMatch(g, 10, rng), 1000, rng);
    check(g.phaseEndsAt! - 1000 <= 50000 && g.revealStepMs === E.revealStepMs(10), `10-player reveal is ${(g.phaseEndsAt! - 1000) / 1000} s (was 74 s)`);
    check(E.revealStep(g, 1000 + g.revealStepMs! * 3 + 10) === 3, 'reveal steps use the shorter time');
}

section('joining and leaving');
{
    let g = E.newGame(P, 3, 'wholesome', 0, rng);
    for (const id of P) g = ok(E.submitAnswer(g, id, { preset: 0 }, 1), 'ans');
    const left = E.toMatch(g, 10, rng, ['a', 'b', 'c']);
    check(!left.seats.includes('d') && ['a', 'b', 'c'].every((v) => !left.targets[v].includes('d') && !left.order[v].includes('d')), 'someone who left is taken off every board');
    let r = E.toRoundEnd(E.toReveal(left, 100, rng), 200);
    r = E.nextRound(r, ['a', 'b', 'c', 'newbie'], 300, rng);
    check(r.seats.includes('newbie') && r.score.newbie === 0, 'a late joiner comes in at the next question, from 0');
    check(!r.seats.includes('d'), 'and the leaver stays out');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
