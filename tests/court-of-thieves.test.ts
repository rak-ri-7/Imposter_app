// ⚖️ Court of Thieves: tests for the rules engine (pure functions, no
// Firestore). Run with:  npm run test:cot
// Plain console output and a thrown error on failure, so it needs no test
// framework and nothing from Node's own types.
import * as E from '../src/games/court-of-thieves/logic/engine';
import type { CotGameState } from '../src/shared/types';

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

// A fixed random sequence, so every run deals the same game.
let seed = 7;
const rng = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
};
const players = ['p1', 'p2', 'p3', 'p4', 'p5'];
const roleOf = (gs: CotGameState, r: string) => Object.keys(gs.roles).find((k) => gs.roles[k] === r)!;
const tot = (gs: CotGameState, id: string) => E.total(gs.purse[id]);
const ok = <T,>(r: { ok: true; gs: T } | { ok: false; reason: string }, what: string): T => {
    if (!r.ok) throw new Error(`${what}: ${r.reason}`);
    return r.gs;
};

// ── Money ─────────────────────────────────────────────────────────────
section('money');
check(JSON.stringify(E.fromMix({ real: 3000, fake: 1000 }, 400)) === JSON.stringify({ real: 300, fake: 100 }), 'fromMix takes in proportion');
check(E.total(E.fromMix({ real: 100, fake: 0 }, 500)) === 100, 'fromMix never takes more than the purse');
check(JSON.stringify(E.fromThief({ real: 2000, fake: 5000 }, 900)) === JSON.stringify({ real: 600, fake: 300 }), 'Thief pays 2:1 real:fake');
check(JSON.stringify(E.fromThief({ real: 300, fake: 5000 }, 900)) === JSON.stringify({ real: 300, fake: 600 }), 'Thief short of real tops up with fake');
check(JSON.stringify(E.fromThief({ real: 5000, fake: 100 }, 900)) === JSON.stringify({ real: 800, fake: 100 }), 'Thief short of fake tops up with real');

// ── A new game ────────────────────────────────────────────────────────
section('new game');
let gs = E.newGame(players, 3, 90000, 0, rng);
const thief = E.thiefOf(gs)!;
check(gs.purse[thief].fake === 5000 && gs.purse[thief].real === 0, "Thief's payday is fake");
check(players.filter((p) => p !== thief).every((p) => gs.purse[p].real === 5000), "everyone else's payday is real");
check(!E.isDue(gs, gs.phaseEndsAt! - 5000, players), 'role card not due early');
check(E.isDue(gs, gs.phaseEndsAt!, players), 'role card due on time');

// ── The heist ─────────────────────────────────────────────────────────
section('heist');
gs = E.toOutage(gs);
const victim = gs.seats.find((s) => s !== thief)!;
const target = gs.seats.find((s) => s !== thief && s !== victim)!;
let t = gs.outageAt! + 100;
const act = (g: CotGameState, input: E.HeistInput) => {
    const n = ok(E.heistAct(g, thief, input, t), 'heist');
    t = n.heist!.at(-1)!.until;
    return n;
};
check(!E.heistAct(gs, thief, { k: 'move', to: victim, mode: 'walk' }, gs.outageAt! - 10).ok, 'no moving before the lights go out');
check(!E.heistAct(gs, victim, { k: 'move', to: target, mode: 'walk' }, t).ok, 'only the Thief can act');
gs = act(gs, { k: 'move', to: victim, mode: 'walk' });
check(!E.heistAct(gs, thief, { k: 'take', amount: NaN }, t).ok, 'NaN amount refused');
check(!E.heistAct(gs, thief, { k: 'plant', amount: Infinity }, t).ok, 'Infinity amount refused');
check(!E.heistAct(gs, thief, { k: 'move', to: 'home', mode: 'run' as 'walk' }, t).ok, 'unknown move refused');
check(!E.heistAct(gs, thief, { k: 'take', amount: 99999 }, t).ok, "can't take more than the bag holds");
gs = act(gs, { k: 'take', amount: 1200 });
check(gs.heist![1].until - gs.heist![1].at === 2400, '₹1,200 takes 2.4 s at ₹500/s');
gs = act(gs, { k: 'move', to: target, mode: 'walk' });
gs = act(gs, { k: 'plant', amount: 1500 });
const sim = E.simulate(gs);
check(sim.glove.real === 0 && sim.purse[target].real === 6200 && sim.purse[target].fake === 300, 'planting uses the glove first, then the Thief’s own (fake) purse');
gs = act(gs, { k: 'move', to: 'home', mode: 'tiptoe' });
const heistDone = gs;

// ── Lights on ─────────────────────────────────────────────────────────
section('lights on');
let r = E.resolveOutage({ ...heistDone, lightsAt: t + 10000 }, t + 10000);
check(r.phase === 'lights' && !r.last!.caught && !r.last!.seen, 'home in time, long before the window: not caught, not seen');
check(r.purse[victim].real === 3800 && r.purse[thief].fake === 4700, 'money moved');
const midTiptoe = heistDone.heist![4].at + 200;
const caught = E.resolveOutage({ ...heistDone, lightsAt: midTiptoe }, midTiptoe);
check(caught.last!.caught && caught.phase === 'roundEnd', 'still tiptoeing at lights-on: caught red-handed');
check(caught.purse[victim].real === 5000, 'caught: money goes back');
check(caught.purse[caught.witnessIds![0]].real >= 5500, 'caught: witness earns ₹500');
check(caught.phaseEndsAt === midTiptoe + E.ROUND_END_MS, 'caught: summary moves on by itself');
{
    // a Thief with real money (from an earlier round) pays the fine from it
    const rich = { ...heistDone, purse: { ...heistDone.purse, [thief]: { real: 3000, fake: 5000 } } };
    const c2 = E.resolveOutage({ ...rich, lightsAt: midTiptoe }, midTiptoe);
    check(c2.purse[thief].real === 3000 - E.CAUGHT_FINE && c2.purse[thief].fake === 5000, 'caught: fine comes from real money only');
}
check(caught.purse[thief].real === 0, 'caught with no real money: no fine to pay');
{
    const late = { ...heistDone, heist: heistDone.heist!.slice(0, 4).concat([{ k: 'move', from: target, to: 'home', mode: 'walk', at: heistDone.heist![3].until, until: heistDone.heist![3].until + 400 }]) } as CotGameState;
    const lightsAt = late.heist![4].until + 4000;
    check(E.resolveOutage({ ...late, lightsAt }, lightsAt).last!.seen, 'seen by footprints still fading in the witness window');
}

// ── Deals ─────────────────────────────────────────────────────────────
section('deals');
let d = E.toDeals(r, r.phaseEndsAt!);
const w = r.witnessIds![0];
const adv = roleOf(d, 'advocate');
let now = d.phaseEndsAt! - 80000;
const send = (g: CotGameState, from: string, target: E.CotTarget, input: E.SendInput) => {
    now += 6000;
    return ok(E.sendNew(g, from, target, input, now), 'send');
};
const answer = (g: CotGameState, who: string, choice: E.OfferChoice) => {
    const th = g.threads!.find((x) => (x.a === who || x.b === who) && x.msgs.some((m) => m.offer?.status === 'open' && m.from !== who))!;
    const m = th.msgs.find((m) => m.offer?.status === 'open' && m.from !== who)!;
    return ok(E.respond(g, who, th.id, m.id, choice), 'respond');
};
const wBefore = { ...d.purse[w] };
d = send(d, thief, { kind: 'witness' }, { tpl: 'hush', amount: 900 });
d = answer(d, w, 'now');
check(d.purse[w].fake - wBefore.fake === 900, 'Thief with no real money pays hush money in fake');
check(d.supporters![w], 'taking the Thief’s money marks you');
check(!E.sendNew(d, thief, { kind: 'role', role: 'judge' }, { tpl: 'talk' }, now + 1000).ok, '5-second cooldown');
d = send(d, adv, { kind: 'role', role: 'thief' }, { tpl: 'reveal' });
d = answer(d, thief, 'now');
check(d.threads!.find((x) => x.a === adv)!.aKnowsB, 'paying ₹500 reveals who the Thief is');
const third = d.seats.find((x) => ![thief, w, adv].includes(x))!;
check(!E.sendNew(d, thief, { kind: 'player', id: third }, { tpl: 'talk' }, now + 10000).ok, 'Thief can deal with only 2 people');

// ── Court ─────────────────────────────────────────────────────────────
// A fresh round each time: the Thief steals ₹2,000 from a citizen and is seen.
const courtRound = () => {
    let g = E.toOutage(E.newGame(players, 3, 90000, 0, rng));
    const th = E.thiefOf(g)!;
    const v = roleOf(g, 'citizen');
    let tt = g.outageAt! + 100;
    for (const input of [
        { k: 'move', to: v, mode: 'walk' },
        { k: 'take', amount: 2000 },
        { k: 'move', to: 'home', mode: 'tiptoe' },
    ] as E.HeistInput[]) {
        g = ok(E.heistAct(g, th, input, tt), 'heist');
        tt = g.heist!.at(-1)!.until;
    }
    g = E.resolveOutage({ ...g, lightsAt: tt + 500 }, tt + 500);
    g = E.toDeals(g, tt + 600);
    return { g, th, v, police: roleOf(g, 'police'), judge: roleOf(g, 'judge'), adv: roleOf(g, 'advocate'), wit: g.witnessIds![0] };
};
const toTrial = (g: CotGameState, picks: Record<string, string>) => {
    g = E.endDeals(g, now);
    for (const [k, v] of Object.entries(picks)) g = ok(E.pickSuspect(g, k, v), 'pick');
    return E.closeArrest(g, now);
};
const runTrial = (g: CotGameState) => {
    for (let i = 0; i < 5 && g.phase === 'trial'; i++) g = E.endTurn(g, g.trial!.turn, now);
    return g;
};
const has = (g: CotGameState, id: string, why: string) => (g.last?.payouts ?? []).some((p) => p.id === id && p.why.includes(why));

section('court: Thief convicted');
{
    let { g, th, v, police, judge, adv: a, wit } = courtRound();
    g = send(g, th, { kind: 'witness' }, { tpl: 'hush', amount: 900 });
    g = answer(g, wit, 'now');
    const tipster = [v, a].find((x) => x !== wit)!;
    g = send(g, tipster, { kind: 'role', role: 'police' }, { tpl: 'itwas', about: th });
    const hunch = players.find((p) => ![th, police].includes(p))!;
    g = toTrial(g, { [police]: th, [hunch]: th });
    check(g.phase === 'trial' && g.trial!.speakers[0].as === 'police' && g.trial!.speakers.at(-1)!.id === th, 'Police speaks first, the accused last');
    g = runTrial(g);
    check(g.phase === 'verdict', 'after the turns: the verdict');
    check(!E.decide(g, police, true, now).ok, 'only the Judge rules');
    const pBefore = tot(g, police);
    g = ok(E.decide(g, judge, true, now), 'decide');
    check(g.last!.convicted && g.phase === 'roundEnd', 'convicted');
    check(tot(g, police) - pBefore >= 500, 'Police: half the stash + ₹500');
    check(has(g, v, 'back'), 'victim gets money back');
    check(has(g, judge, 'Right verdict'), 'Judge paid for the right verdict');
    check(has(g, wit, 'returned') && has(g, wit, 'Fine'), 'bribed witness returns the money and pays a fine');
    check(!has(g, wit, 'Saw the heist'), 'bribed witness gets no witness reward');
    check(has(g, tipster, 'tip'), 'right tip rewarded');
    check(has(g, hunch, 'hunch'), 'right hunch rewarded');
    check(g.phaseEndsAt === now + E.ROUND_END_MS, 'summary moves on by itself');
}

section('court: tips');
{
    let { g, th, police, judge, adv: a } = courtRound();
    for (const id of players.filter((p) => p !== a && p !== police)) g = send(g, a, { kind: 'role', role: 'police' }, { tpl: 'itwas', about: id });
    const first = E.firstTips(g, police).get(a);
    g = ok(E.decide(runTrial(toTrial(g, { [police]: th })), judge, true, now), 'decide');
    check(has(g, a, 'tip') === (first === th), 'naming everyone in turn: only the first tip counts');
    let c = courtRound();
    c.g = send(c.g, c.th, { kind: 'role', role: 'police' }, { tpl: 'itwas', about: c.th });
    c.g = ok(E.decide(runTrial(toTrial(c.g, { [c.police]: c.th })), c.judge, true, now), 'decide');
    check(!has(c.g, c.th, 'tip'), 'the Thief can’t earn a tip reward on themselves');
}

section('court: promises');
{
    // Thief acquitted: the Judge's "on acquittal" bribe pays.
    let { g, th, police, judge } = courtRound();
    g = send(g, th, { kind: 'role', role: 'judge' }, { tpl: 'acquit', amount: 600 });
    g = answer(g, judge, 'later');
    const jBefore = tot(g, judge);
    g = ok(E.decide(runTrial(toTrial(g, { [police]: th })), judge, false, now), 'decide');
    check(tot(g, judge) - jBefore === 600, 'Thief acquitted: promise paid, no salary for a wrong verdict');
    check(!has(g, police, 'wrong'), 'no fine for arresting the right person');

    // An innocent who promised the Judge is convicted anyway: no payment.
    let c = courtRound();
    c.g = send(c.g, c.v, { kind: 'role', role: 'judge' }, { tpl: 'acquit', amount: 700 });
    c.g = answer(c.g, c.judge, 'later');
    const vBefore = tot(c.g, c.v);
    c.g = ok(E.decide(runTrial(toTrial(c.g, { [c.police]: c.v })), c.judge, true, now), 'decide');
    check(tot(c.g, c.v) - vBefore === E.WRONG_ARREST_FINE, 'convicted innocent doesn’t pay their promise (and gets the Police’s fine)');

    // Thief convicted: their promise is off.
    let k = courtRound();
    k.g = send(k.g, k.th, { kind: 'role', role: 'judge' }, { tpl: 'acquit', amount: 500 });
    k.g = answer(k.g, k.judge, 'later');
    k.g = ok(E.decide(runTrial(toTrial(k.g, { [k.police]: k.th })), k.judge, true, now), 'decide');
    check(!has(k.g, k.judge, 'Promises'), 'Thief convicted: their promise isn’t paid');
}

section('court: edge cases');
{
    let { g, police, judge, v } = courtRound();
    const pBefore = tot(g, police);
    g = ok(E.decide(runTrial(toTrial(g, { [police]: v })), judge, true, now), 'decide');
    check(pBefore - tot(g, police) === E.WRONG_ARREST_FINE, 'wrong arrest: Police pays the accused');
    check(!has(g, judge, 'Right verdict'), 'wrong verdict: no Judge salary');

    let j = courtRound();
    j.g = toTrial(j.g, { [j.police]: j.judge });
    check(j.g.trial!.judgeId === j.adv && j.g.trial!.speakers.length === 2, 'Judge on trial: the Advocate stands in');

    let a = courtRound();
    a.g = toTrial(a.g, { [a.police]: a.adv });
    check(a.g.trial!.speakers.map((s) => s.as).join() === 'police,accused', 'Advocate on trial: speaks once, last');

    let n = courtRound();
    n.g = toTrial(n.g, { [n.police]: 'none' });
    check(n.g.phase === 'roundEnd' && n.g.last!.accused === null, 'no arrest: round ends');
    check(!E.pickSuspect({ ...n.g, phase: 'arrest', picks: {} }, n.th, n.th).ok, "can't pick yourself");

    let o = courtRound();
    o.g = ok(E.decide(runTrial(toTrial(o.g, { [o.police]: o.th })), null, false, now), 'timeout');
    check(o.g.last!.guilty === false, 'Judge out of time: not guilty');
    check(!E.isDue(o.g, now + 1000, players) && E.isDue(o.g, now + E.ROUND_END_MS, players), 'summary not due early, due on time');
    o.g = E.nextRound(o.g, players, now, rng);
    check(o.g.phase === 'roles' && !o.g.trial && Object.keys(o.g.picks ?? {}).length === 0, 'next round starts clean');

    // Someone a phase waits for leaves: it can go on at once.
    let l = courtRound();
    l.g = runTrial(toTrial(l.g, { [l.police]: l.th }));
    check(E.isDue(l.g, now, players.filter((p) => p !== l.judge)), 'Judge left: the verdict is due now');
}

// ── Ending ────────────────────────────────────────────────────────────
section('ending');
{
    const e = E.newGame(players, 5, 90000, 0, rng);
    const off = E.endEarly(E.toOutage(e));
    check(players.every((p) => tot(off, p) === 0), 'ended mid-round: that round’s paydays are undone');
    check(E.standings(off).every((s) => s.points === 0), 'ended before 2 rounds: no points');
    const one = E.endEarly({ ...e, phase: 'roundEnd', last: { round: 1 } } as CotGameState);
    check(E.standings(one).every((s) => s.points === 0), '1 finished round, ended early: no points');
    const two = E.endEarly({ ...e, phase: 'roundEnd', history: [{ round: 1 }], last: { round: 2 } } as CotGameState);
    check(E.standings(two).some((s) => s.points === 10), '2 finished rounds, ended early: points');
    const four = E.standings(two, players.slice(0, 4));
    check(four.length === 4 && !four.some((s) => s.playerId === 'p5'), 'someone who left isn’t ranked');
    const full = E.nextRound({ ...e, phase: 'roundEnd', round: 5 } as CotGameState, players, 0, rng);
    check(full.phase === 'over', 'after the last round: the final count');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
