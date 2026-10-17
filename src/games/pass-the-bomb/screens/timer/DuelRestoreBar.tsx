// src/games/pass-the-bomb/screens/timer/DuelRestoreBar.tsx
// After a duel explosion: if a duelist's connection dropped during the duel,
// the trusted player (host, or a spectator / the opponent) can give the lost
// life back. Honour system — the players settle it between themselves.
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import type { BombGameState, Group } from "../../../../shared/types";
import {
  canRestoreDuelLife,
  restorableDuelLife,
  restoreDuelLife,
} from "../../logic/timer/game";

type Props = {
  group: Group;
  playerId: string;
  // Duelists this phone saw drop out during this round's duel.
  droppedDuringDuel: string[];
};

export default function DuelRestoreBar({ group, playerId, droppedDuringDuel }: Props) {
  const gs = group.gameState as BombGameState;
  const nameOf = (id: string) =>
    group.players.find((p) => p.id === id)?.name ?? "A player";

  // Already restored this round: tell everyone who did it.
  if (gs.lifeRestored && gs.lifeRestored.round === gs.roundNumber) {
    return (
      <View style={styles.bar}>
        <Text style={styles.text}>
          💚 {nameOf(gs.lifeRestored.playerId)}'s life was restored by{" "}
          {gs.lifeRestored.byPlayerId === playerId
            ? "you"
            : nameOf(gs.lifeRestored.byPlayerId)}{" "}
          (connection drop)
        </Text>
      </View>
    );
  }

  const victim = restorableDuelLife(gs);
  if (!victim || droppedDuringDuel.length === 0) return null;
  if (!canRestoreDuelLife(gs, group.players, group.hostId, playerId)) return null;

  const droppedNames = droppedDuringDuel.map(nameOf).join(" and ");
  const confirm = () =>
    Alert.alert(
      `Restore ${nameOf(victim)}'s life?`,
      `${droppedNames} lost connection during the duel. Only do this if both duelists agree the explosion was down to the connection.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Restore life", onPress: () => restoreDuelLife(group, playerId) },
      ],
    );

  return (
    <View style={styles.bar}>
      <Text style={styles.text}>
        📶 {droppedNames} lost connection during the duel
      </Text>
      <TouchableOpacity style={styles.btn} onPress={confirm}>
        <Text style={styles.btnText}>💚 Restore {nameOf(victim)}'s life</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(26,26,46,0.95)",
    borderWidth: 1,
    borderColor: "#2BD576",
    gap: 8,
  },
  text: { color: "#fff", fontSize: 13, textAlign: "center" },
  btn: {
    backgroundColor: "#2BD576",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  btnText: { color: "#0B2A17", fontSize: 15, fontWeight: "700" },
});
