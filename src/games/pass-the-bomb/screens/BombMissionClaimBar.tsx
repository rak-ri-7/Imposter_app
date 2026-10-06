import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Group, BombGameState } from "../../../shared/types";
import { voteOnMissionClaim } from "../logic/missionEngine";

type Props = { group: Group; playerId: string };

// A slim, non-blocking bar: someone says they completed a social mission
// and everyone else votes. Renders nothing for the claimer, for anyone who
// already voted, or when no claim is open.
export default function BombMissionClaimBar({ group, playerId }: Props) {
  const gameState = group.gameState as BombGameState;
  const claim = gameState.missionClaim;
  const [busy, setBusy] = useState(false);

  if (!claim) return null;
  if (claim.claimerId === playerId) return null;
  if (claim.yesIds.includes(playerId) || claim.noIds.includes(playerId)) {
    return null;
  }

  const claimerName =
    group.players.find((p) => p.id === claim.claimerId)?.name ?? "Someone";

  const vote = async (approve: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await voteOnMissionClaim(group.id, playerId, approve);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.bar}>
      <View style={styles.textCol}>
        <Text style={styles.title}>
          🎯 {claimerName} says they completed a mission
        </Text>
        <Text style={styles.mission} numberOfLines={2}>
          "{claim.text}"
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.btn, styles.yes]}
        onPress={() => vote(true)}
        disabled={busy}
      >
        <Text style={styles.btnText}>👍</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.btn, styles.no]}
        onPress={() => vote(false)}
        disabled={busy}
      >
        <Text style={styles.btnText}>👎</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1A1A1A",
    borderTopWidth: 1,
    borderTopColor: "#FFD700",
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  textCol: { flex: 1 },
  title: { color: "#FFD700", fontSize: 12, fontWeight: "700" },
  mission: { color: "#aaa", fontSize: 11, fontStyle: "italic", marginTop: 2 },
  btn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  yes: { backgroundColor: "#0A1E0A", borderColor: "#4CAF50" },
  no: { backgroundColor: "#2D0A0E", borderColor: "#E63946" },
  btnText: { fontSize: 18 },
});
