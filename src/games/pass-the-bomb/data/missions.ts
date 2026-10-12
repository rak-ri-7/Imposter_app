import type { BombMission, PlayerMissions } from '../../../shared/types';

export type MissionTier = 'easy' | 'medium' | 'hard';

export type MissionEvent =
    | {
        kind: 'pass';
        fromId: string;
        toId: string;
        activePlayerIds: string[];
        duringPanic: boolean;
        heldMs: number; // how long the passer held the bomb before this pass
    }
    | { kind: 'wrong-pass'; playerId: string }
    | { kind: 'survived-hold'; playerId: string }
    | { kind: 'defused'; playerId: string; usedRevealer: boolean; betsAgainst: number }
    | { kind: 'wire-cut'; playerId: string }
    | { kind: 'caused-explosion'; passerId: string; eliminated: boolean }
    | { kind: 'bought-item'; playerId: string }
    | { kind: 'callout-passed'; voterIds: string[] }
    | { kind: 'penalty-survived'; playerId: string }
    | { kind: 'duel-won'; playerId: string }
    | { kind: 'round-end'; lostLife: boolean; isDuel: boolean };

type MissionDef = {
    id: string;
    tier: MissionTier;
    type: 'auto' | 'vote';
    conditionType: string;
    conditionValue?: number; // a fixed goal
    // A goal that depends on group size: [3–4 players, 5–6 players, 7+ players]
    goals?: [number, number, number];
    minPlayers?: number; // not dealt to smaller groups
    maxPlayers?: number; // not dealt to bigger groups
    // [TARGET] -> another player's name, {N} -> the goal, {s}/{es} -> plural endings
    text: string;
};

// Group size changes how hard a mission is. Missions aimed at one player get
// easier as the group shrinks (the target is a bigger share of your passes),
// while streaks, avoid-a-player and per-player totals get harder. So goals
// are set per size band, and some missions are only dealt at sizes where they
// make sense. Tune the numbers in the pool below after real play.
export const sizeBand = (playerCount: number): 0 | 1 | 2 =>
    playerCount <= 4 ? 0 : playerCount <= 6 ? 1 : 2;

// Placeholder amounts — tune after real play.
export const MISSION_FP: Record<MissionTier, number> = { easy: 15, medium: 25, hard: 25 };
export const LIFE_CONVERTED_FP = 40; // a life mission completed at full lives pays this instead
export const MAX_LIVES = 3;

// Timing thresholds for the hold-time missions.
export const QUICK_PASS_MS = 2000; // "Hot Hands" — passed within this long of catching it
export const LONG_HOLD_MS = 8000;  // "Daredevil" — held at least this long, then passed

export const missionPool: MissionDef[] = [
    // ── EASY — happens with a little awareness ──────────────────────
    { id: 'ms-e1', tier: 'easy', type: 'auto', conditionType: 'pass-to-target-n', goals: [3, 2, 2], text: 'Give the bomb to [TARGET] {N} times' },
    { id: 'ms-e2', tier: 'easy', type: 'auto', conditionType: 'survive-holds-n', conditionValue: 3, text: 'Hold the bomb and live to pass it on {N} times' },
    { id: 'ms-e3', tier: 'easy', type: 'auto', conditionType: 'pass-distinct-n', goals: [3, 3, 4], minPlayers: 5, text: 'Pass the bomb to {N} different players' },
    { id: 'ms-e4', tier: 'easy', type: 'auto', conditionType: 'avoid-target-rounds', goals: [2, 3, 4], minPlayers: 4, text: "Don't give the bomb to [TARGET] for {N} rounds" },
    { id: 'ms-e5', tier: 'easy', type: 'auto', conditionType: 'quick-pass-n', goals: [3, 3, 2], text: 'Hot Hands — get rid of the bomb within 2 seconds of catching it, {N} time{s}' },
    { id: 'ms-e6', tier: 'easy', type: 'auto', conditionType: 'buy-item-n', conditionValue: 1, text: 'Window Shopper — buy anything from the Alley' },
    { id: 'ms-e7', tier: 'easy', type: 'auto', conditionType: 'callout-juror', conditionValue: 1, text: 'Jury Duty — vote in a callout that succeeds' },
    { id: 'ms-e8', tier: 'easy', type: 'auto', conditionType: 'wire-cut-n', conditionValue: 1, text: 'Snip Snip — cut a wire during panic, right or wrong' },

    // ── MEDIUM — takes deliberate play ──────────────────────────────
    { id: 'ms-m1', tier: 'medium', type: 'auto', conditionType: 'pass-to-target-n', goals: [5, 3, 3], text: 'Give the bomb to [TARGET] {N} times' },
    { id: 'ms-m2', tier: 'medium', type: 'auto', conditionType: 'defuse-n', conditionValue: 1, text: 'Defuse the bomb once' },
    { id: 'ms-m3', tier: 'medium', type: 'auto', conditionType: 'clutch-passes-n', goals: [1, 2, 2], text: 'Make {N} clutch pass{es} — pass the bomb in the final 5 seconds' },
    { id: 'ms-m4', tier: 'medium', type: 'auto', conditionType: 'pass-to-everyone', maxPlayers: 7, text: 'Give the bomb to every other player at least once' },
    { id: 'ms-m5', tier: 'medium', type: 'auto', conditionType: 'safe-rounds-streak-n', goals: [2, 3, 4], text: 'Go {N} rounds in a row without losing a life' },
    { id: 'ms-m6', tier: 'medium', type: 'vote', conditionType: 'claim-vote', text: 'Make someone accuse you of targeting them' },
    { id: 'ms-m7', tier: 'medium', type: 'vote', conditionType: 'claim-vote', text: 'Make the whole group laugh on one of your turns' },
    { id: 'ms-m8', tier: 'medium', type: 'auto', conditionType: 'long-hold-n', goals: [2, 2, 1], text: 'Daredevil — hold the bomb for 8+ seconds and still pass it on, {N} time{s} (not during panic)' },
    { id: 'ms-m9', tier: 'medium', type: 'auto', conditionType: 'clean-rounds-streak-n', goals: [2, 3, 3], text: 'Clean Hands — play {N} rounds in a row without a single wrong pass' },
    { id: 'ms-m10', tier: 'medium', type: 'auto', conditionType: 'revealer-defuse', conditionValue: 1, text: 'Inside Info — defuse the bomb after using a Wire Revealer' },
    { id: 'ms-m11', tier: 'medium', type: 'auto', conditionType: 'survive-penalty-n', conditionValue: 1, text: 'Not Guilty — get called out and survive the penalty' },
    { id: 'ms-m12', tier: 'medium', type: 'vote', conditionType: 'claim-vote', text: 'Poker Face — bluff about which wire you\'ll cut, and get someone to believe you' },
    { id: 'ms-m13', tier: 'medium', type: 'vote', conditionType: 'claim-vote', text: 'Sweet Talker — convince someone to pass you the bomb on purpose' },

    // ── HARD — only ever dealt as the life mission ──────────────────
    { id: 'ms-h1', tier: 'hard', type: 'auto', conditionType: 'defuse-n', goals: [2, 2, 3], minPlayers: 4, text: 'Defuse the bomb {N} times' },
    { id: 'ms-h2', tier: 'hard', type: 'auto', conditionType: 'assassin-n', goals: [2, 2, 3], text: 'Hand the bomb to someone who then explodes — {N} times' },
    { id: 'ms-h3', tier: 'hard', type: 'auto', conditionType: 'clutch-passes-n', goals: [2, 3, 4], text: 'Make {N} clutch passes — pass the bomb in the final 5 seconds' },
    { id: 'ms-h4', tier: 'hard', type: 'auto', conditionType: 'safe-rounds-streak-n', goals: [3, 4, 5], text: 'Go {N} rounds in a row without losing a life' },
    { id: 'ms-h5', tier: 'hard', type: 'auto', conditionType: 'pass-to-target-n', goals: [7, 5, 5], text: 'Give the bomb to [TARGET] {N} times' },
    { id: 'ms-h6', tier: 'hard', type: 'auto', conditionType: 'spoil-bets', conditionValue: 1, minPlayers: 4, text: 'Ghostbuster — defuse the bomb while at least one ghost is betting against you' },
    { id: 'ms-h7', tier: 'hard', type: 'auto', conditionType: 'ghost-maker-n', conditionValue: 1, text: 'Ghostmaker — hand the bomb to someone who then loses their last life' },
    { id: 'ms-h8', tier: 'hard', type: 'auto', conditionType: 'quick-pass-streak-n', goals: [3, 4, 4], text: 'Lightning Streak — pass within 2 seconds of catching it, {N} times in a row' },
    { id: 'ms-h9', tier: 'hard', type: 'auto', conditionType: 'long-hold-n', goals: [3, 3, 2], text: 'Iron Nerve — hold the bomb for 8+ seconds and still pass it on, {N} times (not during panic)' },
    { id: 'ms-h10', tier: 'hard', type: 'auto', conditionType: 'clean-rounds-streak-n', goals: [4, 5, 5], text: 'Clean Sheet — play {N} rounds in a row without a single wrong pass' },
    // Only dealt once the game is down to 3 or fewer — i.e. the duel is close.
    { id: 'ms-h11', tier: 'hard', type: 'auto', conditionType: 'duel-won-n', conditionValue: 2, maxPlayers: 3, text: 'Duelist — win {N} duel rounds' },
];

const buildMission = (
    def: MissionDef,
    isLife: boolean,
    playerCount: number,
    target?: { id: string; name: string }
): BombMission => {
    const goal = def.goals ? def.goals[sizeBand(playerCount)] : def.conditionValue;

    let text = def.text
        .replace(/\{N\}/g, String(goal ?? ''))
        .replace(/\{s\}/g, goal === 1 ? '' : 's')
        .replace(/\{es\}/g, goal === 1 ? '' : 'es');
    if (target) text = text.replace('[TARGET]', target.name);

    // Firestore rejects undefined, so optional keys are only added when set.
    const mission: BombMission = {
        id: def.id,
        text,
        tier: def.tier,
        type: def.type,
        conditionType: def.conditionType,
        isLifeMission: isLife,
        completed: false,
    };
    if (goal !== undefined) mission.conditionValue = goal;
    if (target) {
        mission.targetId = target.id;
        mission.targetName = target.name;
    }
    return mission;
};

// Draws one mission of a tier. A player never holds two missions of the same
// kind, and never two aimed at the same target (that would let a "give to X"
// and a "don't give to X" mission contradict each other). `playerCount` is
// how many players are in the game right now; it defaults to the other
// players plus you, which for the life mission is the number still alive.
export const drawMission = (
    tier: MissionTier,
    isLife: boolean,
    others: { id: string; name: string }[],
    takenKinds: string[],
    takenTargetIds: string[],
    playerCount: number = others.length + 1
): BombMission | null => {
    const freeTargets = others.filter((o) => !takenTargetIds.includes(o.id));
    const candidates = missionPool.filter((d) => {
        if (d.tier !== tier) return false;
        if (takenKinds.includes(d.conditionType)) return false;
        if (d.minPlayers !== undefined && playerCount < d.minPlayers) return false;
        if (d.maxPlayers !== undefined && playerCount > d.maxPlayers) return false;
        if (d.text.includes('[TARGET]') && freeTargets.length === 0) return false;
        return true;
    });
    if (candidates.length === 0) return null;

    const def = candidates[Math.floor(Math.random() * candidates.length)];
    const target = def.text.includes('[TARGET]')
        ? freeTargets[Math.floor(Math.random() * freeTargets.length)]
        : undefined;
    return buildMission(def, isLife, playerCount, target);
};

// Everyone starts with two normal missions: one easy, one medium. The life
// mission is not dealt here — completing a normal mission unlocks it.
export const assignMissions = (
    players: { id: string; name: string }[]
): Record<string, PlayerMissions> => {
    const result: Record<string, PlayerMissions> = {};
    const count = players.length;

    for (const player of players) {
        const others = players.filter((p) => p.id !== player.id);

        const easy =
            drawMission('easy', false, others, [], [], count) ??
            drawMission('easy', false, [], [], [], count)!;
        const medium =
            drawMission(
                'medium',
                false,
                others,
                [easy.conditionType],
                easy.targetId ? [easy.targetId] : [],
                count
            ) ?? drawMission('medium', false, [], [easy.conditionType], [], count)!;

        result[player.id] = { mission1: easy, mission2: medium };
    }

    return result;
};

// Pure: returns the updated mission if this event moved it, else null.
export const evaluateMission = (
    mission: BombMission,
    ownerId: string,
    event: MissionEvent
): BombMission | null => {
    if (mission.completed) return null;
    const goal = mission.conditionValue ?? 1;

    const bump = (): BombMission => {
        const progress = (mission.progress ?? 0) + 1;
        return { ...mission, progress, completed: progress >= goal };
    };
    const isOwnPass = event.kind === 'pass' && event.fromId === ownerId;

    switch (mission.conditionType) {
        case 'pass-to-target-n':
            if (event.kind !== 'pass' || event.fromId !== ownerId) return null;
            if (event.toId !== mission.targetId) return null;
            return bump();

        case 'survive-holds-n':
            if (event.kind !== 'survived-hold' || event.playerId !== ownerId) return null;
            return bump();

        case 'defuse-n':
            if (event.kind !== 'defused' || event.playerId !== ownerId) return null;
            return bump();

        case 'clutch-passes-n':
            if (event.kind !== 'pass' || event.fromId !== ownerId || !event.duringPanic) return null;
            return bump();

        case 'assassin-n':
            if (event.kind !== 'caused-explosion' || event.passerId !== ownerId) return null;
            return bump();

        case 'pass-distinct-n': {
            if (event.kind !== 'pass' || event.fromId !== ownerId) return null;
            const set = new Set(mission.progressSet ?? []);
            if (set.has(event.toId)) return null;
            set.add(event.toId);
            return { ...mission, progressSet: Array.from(set), completed: set.size >= goal };
        }

        case 'pass-to-everyone': {
            if (event.kind !== 'pass' || event.fromId !== ownerId) return null;
            const previousSize = mission.progressSet?.length ?? 0;
            const set = new Set(mission.progressSet ?? []);
            set.add(event.toId);
            const targets = event.activePlayerIds.filter((id) => id !== ownerId);
            const completed = targets.length > 0 && targets.every((id) => set.has(id));
            if (set.size === previousSize && !completed) return null;
            return { ...mission, progressSet: Array.from(set), completed };
        }

        // Counts rounds survived without giving the bomb to the target. A
        // pass to the target resets the streak and marks the round as spoiled.
        // Duel rounds don't count — duel passes aren't tracked.
        case 'avoid-target-rounds': {
            if (event.kind === 'pass') {
                if (event.fromId !== ownerId || event.toId !== mission.targetId) return null;
                if (mission.roundFlag) return null;
                return { ...mission, progress: 0, roundFlag: true };
            }
            if (event.kind === 'round-end') {
                if (event.isDuel) return null;
                if (mission.roundFlag) return { ...mission, roundFlag: false };
                const progress = (mission.progress ?? 0) + 1;
                return { ...mission, progress, completed: progress >= goal };
            }
            return null;
        }

        case 'safe-rounds-streak-n': {
            if (event.kind !== 'round-end') return null;
            if (event.lostLife) {
                if ((mission.progress ?? 0) === 0) return null;
                return { ...mission, progress: 0 };
            }
            const progress = (mission.progress ?? 0) + 1;
            return { ...mission, progress, completed: progress >= goal };
        }

        // ── Hold-time missions ───────────────────────────────────────
        case 'quick-pass-n':
            if (!isOwnPass || event.kind !== 'pass') return null;
            if (event.heldMs > QUICK_PASS_MS) return null;
            return bump();

        // Any slow pass or wrong pass breaks the streak.
        case 'quick-pass-streak-n': {
            const broke =
                (event.kind === 'wrong-pass' && event.playerId === ownerId) ||
                (isOwnPass && event.kind === 'pass' && event.heldMs > QUICK_PASS_MS);
            if (broke) {
                if ((mission.progress ?? 0) === 0) return null;
                return { ...mission, progress: 0 };
            }
            if (!isOwnPass) return null;
            return bump();
        }

        case 'long-hold-n':
            if (!isOwnPass || event.kind !== 'pass') return null;
            if (event.duringPanic || event.heldMs < LONG_HOLD_MS) return null;
            return bump();

        // Rounds in a row without a wrong pass. A round only counts if you
        // actually passed the bomb in it (roundTouched); a wrong pass resets
        // the streak and spoils the round. Duel rounds are skipped.
        case 'clean-rounds-streak-n': {
            if (event.kind === 'wrong-pass') {
                if (event.playerId !== ownerId) return null;
                if (mission.roundFlag && (mission.progress ?? 0) === 0) return null;
                return { ...mission, progress: 0, roundFlag: true, roundTouched: false };
            }
            if (isOwnPass) {
                if (mission.roundTouched || mission.roundFlag) return null;
                return { ...mission, roundTouched: true };
            }
            if (event.kind === 'round-end') {
                if (event.isDuel) return null;
                if (mission.roundFlag) return { ...mission, roundFlag: false, roundTouched: false };
                if (!mission.roundTouched) return null; // sat this round out — no change
                const progress = (mission.progress ?? 0) + 1;
                return { ...mission, progress, roundTouched: false, completed: progress >= goal };
            }
            return null;
        }

        // ── Feature missions ─────────────────────────────────────────
        case 'wire-cut-n':
            if (event.kind !== 'wire-cut' || event.playerId !== ownerId) return null;
            return bump();

        case 'revealer-defuse':
            if (event.kind !== 'defused' || event.playerId !== ownerId) return null;
            if (!event.usedRevealer) return null;
            return bump();

        case 'spoil-bets':
            if (event.kind !== 'defused' || event.playerId !== ownerId) return null;
            if (event.betsAgainst <= 0) return null;
            return bump();

        case 'ghost-maker-n':
            if (event.kind !== 'caused-explosion' || event.passerId !== ownerId) return null;
            if (!event.eliminated) return null;
            return bump();

        case 'buy-item-n':
            if (event.kind !== 'bought-item' || event.playerId !== ownerId) return null;
            return bump();

        case 'callout-juror':
            if (event.kind !== 'callout-passed' || !event.voterIds.includes(ownerId)) return null;
            return bump();

        case 'survive-penalty-n':
            if (event.kind !== 'penalty-survived' || event.playerId !== ownerId) return null;
            return bump();

        case 'duel-won-n':
            if (event.kind !== 'duel-won' || event.playerId !== ownerId) return null;
            return bump();

        // 'claim-vote' missions only complete through an approved claim.
        default:
            return null;
    }
};