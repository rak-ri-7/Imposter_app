import { doc, updateDoc, deleteField, runTransaction } from 'firebase/firestore';
import { db } from '../../../../shared/firebase/config';
import { Group, BombGameState, BombMission, MissionClaim } from '../../../../shared/types';
import {
    MissionEvent,
    evaluateMission,
    drawMission,
    MISSION_FP,
    LIFE_CONVERTED_FP,
    MAX_LIVES,
} from '../../data/missions';
import { applyFusePoints, applyLifeGain } from './bombHelpers';
import { applyAchievementEvent, AchievementEvent } from './achievementEngine';

type MissionKey = 'mission1' | 'mission2' | 'lifeMission';
type Roster = { id: string; name: string }[];

const MISSION_KEYS: MissionKey[] = ['mission1', 'mission2', 'lifeMission'];
const missionPath = (ownerId: string, key: MissionKey) =>
    `gameState.missions.${ownerId}.${key}`;

// Prefers a change already waiting in `updates` over the snapshot, so two
// events handled in the same write see each other's results.
const readMission = (
    updates: Record<string, unknown>,
    gameState: BombGameState,
    ownerId: string,
    key: MissionKey
): BombMission | undefined =>
    (updates[missionPath(ownerId, key)] as BombMission | undefined) ??
    gameState.missions?.[ownerId]?.[key];

const drawLifeMission = (
    updates: Record<string, unknown>,
    gameState: BombGameState,
    players: Roster,
    ownerId: string
): BombMission | null => {
    const held = (['mission1', 'mission2'] as MissionKey[])
        .map((k) => readMission(updates, gameState, ownerId, k))
        .filter((m): m is BombMission => !!m);
    const others = players.filter(
        (p) => p.id !== ownerId && !gameState.ghosts.includes(p.id)
    );
    return drawMission(
        'hard',
        true,
        others,
        held.map((m) => m.conditionType),
        held.map((m) => m.targetId).filter((id): id is string => !!id)
    );
};

// Marks a mission complete, pays it out, and — for a normal mission —
// unlocks the player's one life mission.
const finishMission = (
    updates: Record<string, unknown>,
    gameState: BombGameState,
    players: Roster,
    ownerId: string,
    key: MissionKey,
    mission: BombMission
): void => {
    let rewardText: string;

    if (mission.isLifeMission) {
        const pendingLives = updates['gameState.lives'] as Record<string, number> | undefined;
        const lives = (pendingLives ?? gameState.lives)[ownerId] ?? 0;
        if (lives < MAX_LIVES) {
            applyLifeGain(updates, gameState, ownerId);
            rewardText = '+1 life ❤️';
        } else {
            applyFusePoints(updates, gameState, ownerId, LIFE_CONVERTED_FP, 'Life mission complete (life converted)');
            rewardText = `+${LIFE_CONVERTED_FP} FP (already at full lives)`;
        }
    } else {
        const fp = MISSION_FP[mission.tier] ?? MISSION_FP.medium;
        applyFusePoints(updates, gameState, ownerId, fp, 'Mission complete!');
        rewardText = `+${fp} FP`;
    }

    updates[missionPath(ownerId, key)] = { ...mission, completed: true, rewardText };

    if (!mission.isLifeMission && !readMission(updates, gameState, ownerId, 'lifeMission')) {
        const life = drawLifeMission(updates, gameState, players, ownerId);
        if (life) updates[missionPath(ownerId, 'lifeMission')] = life;
    }
};

// The single entry point for mission progress. Mutates `updates` (like
// applyFusePoints/applyLifeGain) so progress, FP and lives all land in the
// caller's one write.
export const applyMissionEvent = (
    updates: Record<string, unknown>,
    gameState: BombGameState,
    players: Roster,
    ownerId: string,
    event: AchievementEvent
): void => {
    // Missions are retired; the same events now feed hidden achievements.
    applyAchievementEvent(updates, gameState, ownerId, event);
    if (event.kind === 'vest-saved' || event.kind === 'bomb-fled' || event.kind === 'toxic-boom') return;

    if (gameState.ghosts.includes(ownerId)) return;
    const owned = gameState.missions?.[ownerId];
    if (!owned) return;

    for (const key of MISSION_KEYS) {
        // A life mission unlocked during this same write starts at zero.
        if (key === 'lifeMission' && !owned.lifeMission) continue;

        const mission = readMission(updates, gameState, ownerId, key);
        if (!mission || mission.completed) continue;

        const next = evaluateMission(mission, ownerId, event);
        if (!next) continue;

        if (next.completed) finishMission(updates, gameState, players, ownerId, key, next);
        else updates[missionPath(ownerId, key)] = next;
    }
};

// A mission aimed at a player who is now a ghost can never finish — point it
// at a living player instead. Progress is kept.
const retargetMissions = (
    updates: Record<string, unknown>,
    gameState: BombGameState,
    players: Roster
): void => {
    const alive = players.filter((p) => !gameState.ghosts.includes(p.id));
    for (const owner of alive) {
        for (const key of MISSION_KEYS) {
            const m = readMission(updates, gameState, owner.id, key);
            if (!m || m.completed || !m.targetId) continue;
            if (!gameState.ghosts.includes(m.targetId)) continue;

            const taken = MISSION_KEYS.filter((k) => k !== key)
                .map((k) => readMission(updates, gameState, owner.id, k)?.targetId)
                .filter((id): id is string => !!id);
            const pool = alive.filter((p) => p.id !== owner.id && !taken.includes(p.id));
            if (pool.length === 0) continue;

            const t = pool[Math.floor(Math.random() * pool.length)];
            updates[missionPath(owner.id, key)] = {
                ...m,
                targetId: t.id,
                targetName: t.name,
                text: m.targetName ? m.text.replace(m.targetName, t.name) : m.text,
                roundFlag: false,
            };
        }
    }
};

// Host calls this as a round is closed out (start of startNextRound).
export const applyRoundEndMissions = async (group: Group): Promise<void> => {
    const gameState = group.gameState as BombGameState;
    // Once per round: a retried Next Round mustn't count the round twice.
    if (gameState.roundEndMissionsRound === gameState.roundNumber) return;
    const updates: Record<string, unknown> = {
        'gameState.roundEndMissionsRound': gameState.roundNumber,
    };

    retargetMissions(updates, gameState, group.players);

    if (gameState.explodedPlayerId) { // nothing resolved if force-ended
        const isDuel = !gameState.personality; // duels clear the personality
        for (const player of group.players) {
            const startLives = gameState.roundStartLives?.[player.id];
            const lostLife = startLives !== undefined
                ? (gameState.lives[player.id] ?? 0) < startLives
                : gameState.explodedPlayerId === player.id && !gameState.defused;
            applyMissionEvent(updates, gameState, group.players, player.id, {
                kind: 'round-end',
                lostLife,
                isDuel,
            });
        }
    }
    if (Object.keys(updates).length === 0) return;
    await updateDoc(doc(db, 'groups', group.id), updates);
};;

// ── GROUP-VOTE CLAIMS (social missions) ───────────────────────────────
export const startMissionClaim = async (
    groupId: string,
    playerId: string,
    missionKey: 'mission1' | 'mission2'
): Promise<{ success: boolean; reason?: string }> => {
    const groupRef = doc(db, 'groups', groupId);
    let result: { success: boolean; reason?: string } = { success: false, reason: 'error' };

    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(groupRef);
            if (!snap.exists()) {
                result = { success: false, reason: 'not-found' };
                return;
            }
            const gameState = snap.data().gameState as BombGameState;
            const mission = gameState.missions?.[playerId]?.[missionKey];

            if (!mission || mission.type !== 'vote' || mission.completed) {
                result = { success: false, reason: 'not-claimable' };
                return;
            }
            if (gameState.ghosts.includes(playerId)) {
                result = { success: false, reason: 'ghost' };
                return;
            }
            if (gameState.missionClaim) {
                result = { success: false, reason: 'claim-open' };
                return;
            }

            const claim: MissionClaim = {
                claimerId: playerId,
                missionKey,
                text: mission.text,
                yesIds: [],
                noIds: [],
                startedAt: Date.now(),
            };
            transaction.update(groupRef, { 'gameState.missionClaim': claim });
            result = { success: true };
        });
    } catch {
        result = { success: false, reason: 'error' };
    }
    return result;
};

export const cancelMissionClaim = async (
    groupId: string,
    playerId: string
): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const claim = (snap.data().gameState as BombGameState).missionClaim;
            if (!claim || claim.claimerId !== playerId) return;
            transaction.update(groupRef, { 'gameState.missionClaim': deleteField() });
        });
    } catch {
        // transient contention — the player can tap again
    }
};

export const voteOnMissionClaim = async (
    groupId: string,
    voterId: string,
    approve: boolean
): Promise<void> => {
    const groupRef = doc(db, 'groups', groupId);
    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(groupRef);
            if (!snap.exists()) return;
            const data = snap.data();
            const gameState = data.gameState as BombGameState;
            const claim = gameState.missionClaim;
            if (!claim || claim.claimerId === voterId) return;
            if (claim.yesIds.includes(voterId) || claim.noIds.includes(voterId)) return;

            const players = (data.players ?? []) as Roster;
            const eligible = players.filter((p) => p.id !== claim.claimerId).length;
            const needed = Math.floor(eligible / 2) + 1;

            const yesIds = approve ? [...claim.yesIds, voterId] : claim.yesIds;
            const noIds = approve ? claim.noIds : [...claim.noIds, voterId];

            if (yesIds.length >= needed) {
                const updates: Record<string, unknown> = {
                    'gameState.missionClaim': deleteField(),
                };
                const mission = gameState.missions?.[claim.claimerId]?.[claim.missionKey];
                if (mission && !mission.completed) {
                    finishMission(updates, gameState, players, claim.claimerId, claim.missionKey, mission);
                }
                transaction.update(groupRef, updates);
                return;
            }

            // Not enough "yes" votes left to ever reach a majority — rejected.
            if (noIds.length > eligible - needed) {
                transaction.update(groupRef, { 'gameState.missionClaim': deleteField() });
                return;
            }

            transaction.update(groupRef, {
                'gameState.missionClaim': { ...claim, yesIds, noIds },
            });
        });
    } catch {
        // transient contention — the voter can tap again
    }
};