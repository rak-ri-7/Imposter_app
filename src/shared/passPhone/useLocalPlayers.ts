// src/shared/passPhone/useLocalPlayers.ts
// The pass-the-phone players (set up in Quick Play), by name. Names are the
// ids in these games: Quick Play keeps one score per name.
import { useEffect, useState } from "react";
import { getLocalSession, updateLocalScores } from "../utils/localSession";

export const useLocalPlayers = (): string[] | null => {
  const [names, setNames] = useState<string[] | null>(null);
  useEffect(() => {
    getLocalSession()
      .then((s) => setNames((s?.players ?? []).map((p) => p.name)))
      .catch(() => setNames([]));
  }, []);
  return names;
};

// Adds a finished game's points to the Quick Play leaderboard (once).
export const addLocalPoints = (points: Record<string, number>) => {
  const clean = Object.fromEntries(Object.entries(points).filter(([, v]) => v > 0));
  return Object.keys(clean).length ? updateLocalScores(clean) : Promise.resolve();
};

// A fresh turn order each round, so the same person isn't always first.
export const rotate = <T,>(list: T[], by: number): T[] =>
  list.length ? list.map((_, i) => list[(i + by) % list.length]) : list;
