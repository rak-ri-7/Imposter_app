// Live duel bets, on the duel screen before each duel round. Knocked-out
// players bet FP on who loses a life this round (2x), or keep their FP:
// at the end of the game it's cashed in at FP_PER_POINT FP = 1 point.
import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Group, BombGameState } from "../../../../shared/types";
import { placeDuelBet } from "../../logic/timer/betEngine";
import {
  DUEL_BET_MULTIPLIER,
  FP_PER_POINT,
  MIN_STAKE,
} from "../../data/betOdds";

type Props = { group: Group; playerId: string };

const REASONS: Record<string, string> = {
  "duel-started": "Too late, the duel has started.",
  "already-bet": "You've already bet on this round.",
  "not-enough-fp": "Not enough FP.",
  "stake-too-low": `The smallest bet is ${MIN_STAKE} FP.`,
  "spectators-only": "Only knocked-out players can bet on the duel.",
};

export default function DuelBetCard({ group, playerId }: Props) {
  const gameState = group.gameState as BombGameState;
  const duellists = group.players.filter(
    (p) => !gameState.ghosts.includes(p.id),
  );
  const isSpectator =
    group.players.some((p) => p.id === playerId) &&
    !duellists.some((p) => p.id === playerId);
  const nameOf = (id: string) =>
    group.players.find((p) => p.id === id)?.name ?? "Someone";

  const fp = Math.floor(gameState.fusePoints?.[playerId] ?? 0);
  const round = gameState.roundNumber;
  const roundBets = (gameState.matchBets ?? []).filter(
    (b) => b.market === "duel-loser" && b.forRound === round,
  );
  const myBet = roundBets.find((b) => b.bettorId === playerId);

  const [pick, setPick] = useState<string | null>(null);
  const [stake, setStake] = useState(Math.min(10, fp));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // keep the stake inside what the bag can pay
  useEffect(() => {
    setStake((s) => Math.max(Math.min(s, fp), Math.min(MIN_STAKE, fp)));
  }, [fp]);

  const canBet = isSpectator && !myBet && fp >= MIN_STAKE;
  if (!canBet && roundBets.length === 0 && !isSpectator) return null;

  const bump = (d: number) =>
    setStake((s) => Math.max(MIN_STAKE, Math.min(fp, s + d)));

  const place = async () => {
    if (!pick || busy) return;
    setBusy(true);
    setError(null);
    const res = await placeDuelBet(group.id, playerId, pick, stake);
    if (!res.success) setError(REASONS[res.reason ?? ""] ?? "Couldn't place that bet.");
    setBusy(false);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>🎲 DUEL BETS · WHO LOSES A LIFE?</Text>

      {isSpectator && (
        <Text style={styles.bag}>
          Your bag: {fp} FP · worth {Math.floor(fp / FP_PER_POINT)} pts if you
          keep it
        </Text>
      )}

      {canBet && (
        <>
          <View style={styles.row}>
            {duellists.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.pick, pick === p.id && styles.pickOn]}
                onPress={() => setPick(p.id)}
              >
                <Text style={styles.pickName}>💀 {p.name}</Text>
                <Text style={styles.pickOdds}>×{DUEL_BET_MULTIPLIER.toFixed(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.row}>
            <TouchableOpacity style={styles.step} onPress={() => bump(-5)}>
              <Text style={styles.stepText}>−5</Text>
            </TouchableOpacity>
            <Text style={styles.stake}>{stake} FP</Text>
            <TouchableOpacity style={styles.step} onPress={() => bump(5)}>
              <Text style={styles.stepText}>+5</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.step} onPress={() => setStake(fp)}>
              <Text style={styles.stepText}>All in</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.placeBtn, (!pick || busy) && styles.placeOff]}
            onPress={place}
            disabled={!pick || busy}
          >
            <Text style={styles.placeText}>
              {pick
                ? `Bet ${stake} FP on ${nameOf(pick)} → win ${Math.floor(stake * DUEL_BET_MULTIPLIER)} FP`
                : "Pick who loses a life"}
            </Text>
          </TouchableOpacity>
          {error && <Text style={styles.error}>{error}</Text>}
        </>
      )}

      {isSpectator && !myBet && fp < MIN_STAKE && (
        <Text style={styles.note}>Not enough FP to bet (min {MIN_STAKE}).</Text>
      )}

      {roundBets.length > 0 ? (
        <View style={styles.list}>
          {roundBets.map((b) => (
            <Text key={b.id} style={styles.line}>
              {b.bettorId === playerId ? "You" : nameOf(b.bettorId)}:{" "}
              {b.stake} FP on 💀 {nameOf(b.pick)}
            </Text>
          ))}
        </View>
      ) : (
        !canBet && <Text style={styles.note}>No bets on this round yet.</Text>
      )}
      <Text style={styles.note}>
        Bets close when the host starts the duel. Leftover FP becomes
        leaderboard points at the end ({FP_PER_POINT} FP = 1 pt).
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    backgroundColor: "#12101A",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#7B61FF",
    padding: 14,
    marginBottom: 12,
    gap: 8,
  },
  title: {
    color: "#B9A8FF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.5,
    textAlign: "center",
  },
  bag: { color: "#FFD700", fontSize: 13, fontWeight: "700", textAlign: "center" },
  row: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  pick: {
    flex: 1,
    backgroundColor: "#1E1A2E",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#333",
    padding: 10,
    alignItems: "center",
  },
  pickOn: { borderColor: "#B9A8FF", backgroundColor: "#2A2244" },
  pickName: { color: "#fff", fontSize: 14, fontWeight: "700" },
  pickOdds: { color: "#B9A8FF", fontSize: 12, marginTop: 2 },
  step: {
    backgroundColor: "#1E1A2E",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  stepText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  stake: { color: "#fff", fontSize: 18, fontWeight: "900", minWidth: 70, textAlign: "center" },
  placeBtn: {
    backgroundColor: "#7B61FF",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  placeOff: { backgroundColor: "#2A2A2A" },
  placeText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  error: { color: "#FF6B6B", fontSize: 12, textAlign: "center" },
  list: { gap: 2 },
  line: { color: "#ccc", fontSize: 13 },
  note: { color: "#777", fontSize: 11, textAlign: "center" },
});
