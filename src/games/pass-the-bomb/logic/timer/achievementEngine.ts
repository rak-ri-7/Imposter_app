// Tracks hidden achievements from the same events the game already emits
// (applyMissionEvent forwards every one here), plus a few quirk/vest hooks.
// Mutates `updates` like applyFusePoints, so unlocks land in the caller's write.
import { BombGameState, AchievementRecord, AchievementUnlock } from '../../../../shared/types';
import type { MissionEvent } from '../../data/missions';
import {
    ACHIEVEMENTS,
    AchievementId,
    HOT_HANDS_MS,
    HOT_HANDS_PASSES,
    ICE_COLD_MS,
    LIFE_ACHIEVEMENT_FP_IF_FULL,
    SERIAL_EXPLOSIONS,
    SQUAD_DEFUSES,
    UNTOUCHABLE_ROUNDS,
    UNTOUCHABLE_MIN_HOLDS,
} from '../../data/achievements';
import { applyFusePoints, applyLifeGain } from './bombHelpers';

export type AchievementEvent =
    | MissionEvent
    | { kind: 'vest-saved'; playerId: string }
    | { kind: 'bomb-fled'; playerId: string }
    | { kind: 'toxic-boom'; playerId: string };

const FEED_LIMIT = 8;
const pathOf = (pid: string) => `gameState.achievements.${pid}`;

const readRecord = (
    updates: Record<string, unknown>,
    gs: BombGameState,
    pid: string
): AchievementRecord =>
    JSON.parse(
        JSON.stringify(
            (updates[pathOf(pid)] as AchievementRecord | undefined) ??
            gs.achievements?.[pid] ??
            { earned: {}, p: {} }
        )
    );

const unlock = (
    updates: Record<string, unknown>,
    gs: BombGameState,
    pid: string,
    rec: AchievementRecord,
    id: AchievementId
) => {
    if (rec.earned[id] !== undefined) return;
    const a = ACHIEVEMENTS[id];
    let gotLife: boolean | undefined;
    if (a.life) {
        const lives = ((updates['gameState.lives'] as Record<string, number> | undefined) ?? gs.lives)[pid] ?? 0;
        gotLife = lives < 3;
        if (gotLife) applyLifeGain(updates, gs, pid);
        else applyFusePoints(updates, gs, pid, LIFE_ACHIEVEMENT_FP_IF_FULL, `${a.name} (already at full lives)`);
    } else {
        applyFusePoints(updates, gs, pid, a.fp ?? 0, `Achievement: ${a.name}`);
    }
    rec.earned[id] = gs.roundNumber;
    const entry: AchievementUnlock = {
        id: `${Date.now()}-${pid}-${id}`,
        playerId: pid,
        achievement: id,
        round: gs.roundNumber,
        ...(gotLife !== undefined ? { gotLife } : {}),
    };
    const feed = (updates['gameState.achFeed'] as AchievementUnlock[] | undefined) ?? gs.achFeed ?? [];
    updates['gameState.achFeed'] = [...feed, entry].slice(-FEED_LIMIT);
};

export const applyAchievementEvent = (
    updates: Record<string, unknown>,
    gs: BombGameState,
    ownerId: string,
    event: AchievementEvent
): void => {
    const rec = readRecord(updates, gs, ownerId);
    const p = rec.p;
    const before = JSON.stringify(rec);
    const isGhost = gs.ghosts.includes(ownerId);

    switch (event.kind) {
        case 'pass': {
            if (event.fromId !== ownerId) break;
            // ⚡ 5 lightning passes in one round
            if (event.heldMs < HOT_HANDS_MS) {
                const n = p.hhRound === gs.roundNumber ? (p.hh ?? 0) + 1 : 1;
                p.hh = n;
                p.hhRound = gs.roundNumber;
                if (n >= HOT_HANDS_PASSES) unlock(updates, gs, ownerId, rec, 'hothands');
            }
            // 🧊 a 10s+ hold, passed safely
            if (event.heldMs >= ICE_COLD_MS) unlock(updates, gs, ownerId, rec, 'icecold');
            break;
        }
        case 'defused': {
            if (event.playerId !== ownerId) break;
            // 🧯 two rounds in a row
            if (p.lastDefuse === gs.roundNumber - 1) unlock(updates, gs, ownerId, rec, 'whisperer');
            p.lastDefuse = gs.roundNumber;
            // 🧯🧯🧯 three in a game
            p.defuses = (p.defuses ?? 0) + 1;
            if (p.defuses >= SQUAD_DEFUSES) unlock(updates, gs, ownerId, rec, 'squad');
            break;
        }
        case 'caused-explosion': {
            if (event.passerId !== ownerId) break;
            unlock(updates, gs, ownerId, rec, 'assassin'); // 🎯
            p.booms = (p.booms ?? 0) + 1;
            if (p.booms >= SERIAL_EXPLOSIONS) unlock(updates, gs, ownerId, rec, 'serial'); // 🦹
            break;
        }
        case 'round-end': {
            if (isGhost) break;
            // 👑 rounds in a row without losing a life
            // (only rounds where you really were in it: held the bomb 2+ times)
            const holds = gs.chainPassed.filter((id) => id === ownerId).length;
            if (event.lostLife) p.safe = 0;
            else if (holds >= UNTOUCHABLE_MIN_HOLDS) p.safe = (p.safe ?? 0) + 1;
            if ((p.safe ?? 0) >= UNTOUCHABLE_ROUNDS) unlock(updates, gs, ownerId, rec, 'untouchable');
            // 🪦 back from the dead
            if ((gs.everGhosted ?? []).includes(ownerId)) unlock(updates, gs, ownerId, rec, 'comeback');
            // 💘 its crush, and still alive
            if (gs.bombQuirks?.crushes?.[ownerId] && !event.lostLife) {
                unlock(updates, gs, ownerId, rec, 'heartbreaker');
            }
            break;
        }
        case 'vest-saved':
            if (event.playerId === ownerId) unlock(updates, gs, ownerId, rec, 'vest');
            break;
        case 'bomb-fled':
            if (event.playerId === ownerId) unlock(updates, gs, ownerId, rec, 'unwanted');
            break;
        case 'toxic-boom':
            if (event.playerId === ownerId) unlock(updates, gs, ownerId, rec, 'bear');
            break;
        default:
            break;
    }

    if (JSON.stringify(rec) !== before) updates[pathOf(ownerId)] = rec;
};
