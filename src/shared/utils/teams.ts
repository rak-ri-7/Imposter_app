// src/shared/utils/teams.ts
// 👥 Team mode helpers shared by the games that can be played as teams
// (Stop the Timer, Quiz Board). Teams come from the game menu's
// "Play as Teams"; players not on a team watch.
import type { Group, TeamSide } from '../types';

// The session teams as this game would play them, or null when there
// aren't at least 2 teams with someone in the game.
export const sessionTeamSides = (group: Group): TeamSide[] | null => {
    if (!group.teamsEnabled || !group.teams?.length) return null;
    const inGame = new Set(group.players.map((p) => p.id));
    const sides = group.teams
        .map((t) => ({
            id: t.id,
            name: t.name,
            color: t.color,
            memberIds: t.playerIds.filter((id) => inGame.has(id)),
        }))
        .filter((s) => s.memberIds.length > 0);
    return sides.length >= 2 ? sides : null;
};

export const teamOfPlayer = (teams: TeamSide[] | null | undefined, playerId: string): TeamSide | null =>
    teams?.find((t) => t.memberIds.includes(playerId)) ?? null;

export type TeamPlace<T> = { item: T; score: number; place: number; points: number };

// Ranks teams by a score (ties share a place: 1, 1, 3). Every member of a
// team earns that team's points: 1st = number of teams, then one less per
// place (2 teams: 2 / 1; 3 teams: 3 / 2 / 1).
export const rankTeams = <T>(items: T[], scoreOf: (t: T) => number, higherIsBetter: boolean): TeamPlace<T>[] => {
    const rows = items
        .map((item) => ({ item, score: scoreOf(item), place: 0, points: 0 }))
        .sort((a, b) => (higherIsBetter ? b.score - a.score : a.score - b.score));
    rows.forEach((r, i) => {
        const prev = rows[i - 1];
        r.place = prev && prev.score === r.score ? prev.place : i + 1;
        r.points = Math.max(0, rows.length - r.place + 1);
    });
    return rows;
};
