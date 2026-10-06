import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
} from "react-native";
import { Group, BombGameState, BombMission } from "../../../shared/types";
import { returnToMenu } from "../../../shared/firebase/groups";
import BombWinnerBetResults from "./BombWinnerBetResults";

type Props = {
  group: Group;
  playerId: string;
};

export default function BombResultScreen({ group, playerId }: Props) {
  const gameState = group.gameState as BombGameState;
  const isHost = group.hostId === playerId;
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.8));

  const activePlayers = group.players.filter(
    (p) => !gameState.ghosts.includes(p.id),
  );
  const winner = activePlayers[0];
  const isWinner = winner?.id === playerId;

  const myMissions = gameState.missions[playerId];
  const completedMissions = myMissions
    ? [myMissions.mission1, myMissions.mission2].filter((m) => m.completed)
    : [];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.winnerCard,
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Text style={styles.winnerEmoji}>🏆</Text>
        <Text style={styles.winnerLabel}>WINNER</Text>
        <Text style={styles.winnerName}>{winner?.name ?? "Nobody"}</Text>
        {isWinner && <Text style={styles.youWon}>That's you! 🎉</Text>}
      </Animated.View>

      <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Final standings */}
          <Text style={styles.sectionLabel}>FINAL STANDINGS</Text>
          <View style={styles.standingsCard}>
            {group.players
              .sort((a, b) => {
                const aGhost = gameState.ghosts.includes(a.id);
                const bGhost = gameState.ghosts.includes(b.id);
                if (!aGhost && bGhost) return -1;
                if (aGhost && !bGhost) return 1;
                return (
                  (gameState.lives[b.id] ?? 0) - (gameState.lives[a.id] ?? 0)
                );
              })
              .map((player, index) => {
                const isElim = gameState.ghosts.includes(player.id);
                const lives = gameState.lives[player.id] ?? 0;
                const isThisWinner = player.id === winner?.id;
                return (
                  <View
                    key={player.id}
                    style={[
                      styles.standingRow,
                      isThisWinner && styles.standingRowWinner,
                    ]}
                  >
                    <Text style={styles.standingRank}>
                      {isThisWinner ? "🏆" : isElim ? "💀" : `${index + 1}.`}
                    </Text>
                    <Text style={styles.standingName}>
                      {player.name}
                      {player.id === playerId ? " (you)" : ""}
                    </Text>
                    {isElim ? (
                      <Text style={styles.eliminatedTag}>Eliminated</Text>
                    ) : (
                      <View style={styles.livesRow}>
                        {[1, 2, 3].map((i) => (
                          <Text key={i} style={styles.heart}>
                            {i <= lives ? "❤️" : "🖤"}
                          </Text>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
          </View>

          {/* Mission reveals */}
          <Text style={styles.sectionLabel}>MISSION REVEALS</Text>
          <View style={styles.missionsCard}>
            {group.players.map((player) => {
              const pm = gameState.missions[player.id];
              if (!pm) return null;
              return (
                <View key={player.id} style={styles.playerMissions}>
                  <Text style={styles.missionPlayerName}>{player.name}</Text>
                  {[pm.mission1, pm.mission2, pm.lifeMission]
                    .filter((m): m is BombMission => !!m)
                    .map((m, i) => (
                      <View
                        key={i}
                        style={[
                          styles.missionRow,
                          m.completed && styles.missionRowDone,
                        ]}
                      >
                        <Text style={styles.missionIcon}>
                          {m.completed ? "✅" : "❌"}
                        </Text>
                        <View style={styles.missionContent}>
                          <Text style={styles.missionText}>{m.text}</Text>
                          {m.completed && m.rewardText ? (
                            <Text style={styles.lifeMissionTag}>
                              {m.isLifeMission ? "❤️ Life mission — " : "🎯 "}
                              {m.rewardText}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                </View>
              );
            })}
          </View>
        </ScrollView>
      </Animated.View>
      <BombWinnerBetResults group={group} playerId={playerId} />

      {isHost && (
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={() => returnToMenu(group.id)}
        >
          <Text style={styles.menuBtnText}>Back to Game Menu 🎮</Text>
        </TouchableOpacity>
      )}

      {!isHost && (
        <Text style={styles.waitingText}>
          Waiting for host to return to menu...
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D0D0D",
    padding: 20,
    paddingTop: 60,
  },
  winnerCard: {
    alignItems: "center",
    marginBottom: 20,
  },
  winnerEmoji: { fontSize: 64, marginBottom: 8 },
  winnerLabel: {
    color: "#888",
    fontSize: 12,
    letterSpacing: 3,
    marginBottom: 4,
  },
  winnerName: {
    color: "#FFD700",
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 4,
  },
  youWon: { color: "#4CAF50", fontSize: 16 },
  sectionLabel: {
    color: "#888",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 10,
  },
  standingsCard: {
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  standingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#2A2A2A",
  },
  standingRowWinner: { backgroundColor: "#1A1500" },
  standingRank: { fontSize: 18, width: 28 },
  standingName: { color: "#fff", fontSize: 14, flex: 1 },
  eliminatedTag: { color: "#E63946", fontSize: 11 },
  livesRow: { flexDirection: "row", gap: 2 },
  heart: { fontSize: 12 },
  missionsCard: {
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    gap: 12,
  },
  playerMissions: { gap: 6 },
  missionPlayerName: {
    color: "#FF4500",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  missionRow: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#2A2A2A",
    borderRadius: 8,
    padding: 8,
  },
  missionRowDone: { backgroundColor: "#0A1E0A" },
  missionIcon: { fontSize: 14 },
  missionContent: { flex: 1 },
  missionText: { color: "#aaa", fontSize: 11, lineHeight: 16 },
  lifeMissionTag: { color: "#E63946", fontSize: 10, marginTop: 4 },
  menuBtn: {
    backgroundColor: "#FF4500",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    marginTop: 8,
  },
  menuBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  waitingText: { color: "#888", fontSize: 14, textAlign: "center" },
});
