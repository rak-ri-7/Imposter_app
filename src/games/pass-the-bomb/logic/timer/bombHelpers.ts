import { BombGameState, PassDispute } from '../../../../shared/types';

export const MAX_POINT_EVENTS = 10;

export const FUSE_POINTS = {
    WIRE_DEFUSED: 15,
    WIRE_EXPLODED_SELF: -5,
    SURVIVED_HOLD_AND_PASSED: 2,
    // DUEL_WIN: 25,
    // DUEL_LOSS: 5,
    LIFE_MISSION: 10,
    NON_LIFE_MISSION: 20,
    CLINGY_WRONG_PASS: -5,
    CALLOUT_VOTED_OUT: -10,
    // CALLOUT_SURVIVED: 5,
    GAME_WIN: 30,

} as const;

export const ROUND_WIN_SCORE = 3;       // defusing, or a ghost reclaiming their life
export const GAME_WIN_SCORE_BONUS = 15;
export const RUNNER_UP_SCORE_BONUS = 5;

export const applyLifeGain = (
    updates: Record<string, unknown>,
    gameState: BombGameState,
    playerId: string
) => {
    const pendingLives = updates['gameState.lives'] as Record<string, number> | undefined;
    const livesMap = pendingLives ?? { ...gameState.lives };
    livesMap[playerId] = Math.min((livesMap[playerId] ?? 0) + 1, 3);
    updates['gameState.lives'] = livesMap;

    if (gameState.ghosts.includes(playerId) && livesMap[playerId] > 0) {
        const pendingGhosts = updates['gameState.ghosts'] as string[] | undefined;
        const ghostsList = pendingGhosts ?? gameState.ghosts;
        updates['gameState.ghosts'] = ghostsList.filter((id) => id !== playerId);
    }
};

export const applyFusePoints = (
    updates: Record<string, unknown>,
    gameState: BombGameState,
    playerId: string,
    amount: number,
    reason: string
) => {
    const pendingMap = updates['gameState.fusePoints'] as Record<string, number> | undefined;
    const currentMap = pendingMap ?? { ...(gameState.fusePoints ?? {}) };
    currentMap[playerId] = (currentMap[playerId] ?? 0) + amount;
    updates['gameState.fusePoints'] = currentMap;

    const pendingEvents = updates['gameState.pointEvents'] as
        | BombGameState['pointEvents']
        | undefined;
    const currentEvents = pendingEvents ?? (gameState.pointEvents ?? []);
    const newEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        playerId,
        amount,
        reason,
        timestamp: Date.now(),
    };
    updates['gameState.pointEvents'] = [...currentEvents, newEvent].slice(-MAX_POINT_EVENTS);
};

// Records how a guilty verdict played out on the dispute itself, so the
// replay still shows it after the penalty / TBC fields are cleared.
export const markDisputeOutcome = (
    updates: Record<string, unknown>,
    gameState: BombGameState,
    accusedId: string,
    outcome: NonNullable<PassDispute['outcome']>,
    extra: Partial<PassDispute> = {}
): void => {
    const disputes = gameState.disputes ?? [];
    // The verdict being settled: the latest guilty one for this player with no outcome yet.
    let idx = -1;
    disputes.forEach((d, i) => {
        if (d.guilty && d.accusedId === accusedId && !d.outcome) idx = i;
    });
    if (idx < 0) return;
    updates['gameState.disputes'] = disputes.map((d, i) =>
        i === idx ? { ...d, outcome, ...extra } : d
    );
};