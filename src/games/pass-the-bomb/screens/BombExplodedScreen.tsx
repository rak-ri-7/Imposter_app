import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Vibration,
} from "react-native";
import { Group, BombGameState } from "../../../shared/types";
import { startReplay } from "../logic/game";
import {
  playSound,
  explosionSoundForRound,
  pickDefuseSound,
} from "../../../shared/sounds/soundManager";
import { beginGhostTournament } from "../logic/ghostTournament";

type Props = {
  group: Group;
  playerId: string;
};

export default function BombExplodedScreen({ group, playerId }: Props) {
  const gameState = group.gameState as BombGameState;
  const isHost = group.hostId === playerId;
  const [scaleAnim] = useState(new Animated.Value(0));
  const [fadeAnim] = useState(new Animated.Value(0));

  const explodedPlayer = group.players.find(
    (p) => p.id === gameState.explodedPlayerId,
  );
  const isMe = gameState.explodedPlayerId === playerId;
  const isGhost = gameState.ghosts.includes(gameState.explodedPlayerId ?? "");
  const livesLeft = gameState.lives[gameState.explodedPlayerId ?? ""] ?? 0;
  const wasImmune = gameState.ghostImmunePlayers.includes(
    gameState.explodedPlayerId ?? "",
  );
  const pendingTournament = gameState.pendingGhostTournament;
  const shieldSaved =
    !!gameState.shieldAbsorbedPlayerId &&
    gameState.shieldAbsorbedPlayerId === gameState.explodedPlayerId;

  useEffect(() => {
    Vibration.vibrate(500);
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 3,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Plays once as the screen mounts — every device hears this
  // independently, since the outcome (defused/immune/exploded) and
  // round number are already synced via gameState by the time this
  // screen shows. Explosion intensity scales with roundNumber; defuse
  // and ghost-immunity both use the same "survived" sound.
  useEffect(() => {
    if (gameState.defused || wasImmune || shieldSaved) {
      playSound(pickDefuseSound());
    } else {
      playSound(explosionSoundForRound(gameState.roundNumber));
    }
  }, []);
  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.content,
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        {shieldSaved ? (
          <>
            <Text style={styles.emoji}>🛡️</Text>
            <Text style={[styles.title, { color: "#5FD38D" }]}>SHIELD UP!</Text>
            <Text style={styles.subtitle}>
              {isMe
                ? "It blew up in your hands — but the armour took the impact."
                : `It blew up on ${explodedPlayer?.name} — but they were wearing an armour!`}
            </Text>
            {gameState.wireChoice && (
              <View style={styles.wireReveal}>
                <Text style={styles.wireRevealLabel}>They cut</Text>
                <Text style={styles.wireRevealText}>
                  {gameState.wireChoice === "red" ? "🔴 RED" : "🔵 BLUE"}
                </Text>
                <Text style={styles.wireRevealLabel}>
                  {gameState.correctWire === "red" ? "🔴 RED" : "🔵 BLUE"} was
                  correct
                </Text>
              </View>
            )}
            <Text style={styles.immuneDesc}>No life lost.</Text>
          </>
        ) : wasImmune ? (
          <>
            <Text style={styles.emoji}>👻</Text>
            <Text style={styles.title}>GHOST IMMUNITY!</Text>
            <Text style={styles.subtitle}>
              {explodedPlayer?.name} was secretly immune this round
            </Text>
            <Text style={styles.immuneDesc}>
              The bomb had no effect on them
            </Text>
          </>
        ) : gameState.defused ? (
          <>
            <Text style={styles.emoji}>🧯</Text>
            <Text style={[styles.title, { color: "#4CAF50" }]}>DEFUSED!</Text>
            <Text style={styles.subtitle}>
              {isMe
                ? "You cut the right wire!"
                : `${explodedPlayer?.name} cut the right wire!`}
            </Text>
            {gameState.wireChoice && (
              <View style={styles.wireReveal}>
                <Text style={styles.wireRevealText}>
                  {gameState.wireChoice === "red" ? "🔴 RED" : "🔵 BLUE"} was
                  correct
                </Text>
              </View>
            )}
            {isMe && livesLeft > (gameState.lives[playerId] ?? 0) - 1 && (
              <Text style={styles.lifeRegained}>❤️ Life restored!</Text>
            )}
          </>
        ) : (
          <>
            <Text style={styles.emoji}>💥</Text>
            <Text style={styles.title}>BOOM!</Text>
            <Text style={styles.subtitle}>
              {isMe
                ? "The bomb exploded in your hands!"
                : `The bomb exploded on ${explodedPlayer?.name}!`}
            </Text>

            {gameState.wireChoice && (
              <View style={styles.wireReveal}>
                <Text style={styles.wireRevealLabel}>They cut</Text>
                <Text style={styles.wireRevealText}>
                  {gameState.wireChoice === "red" ? "🔴 RED" : "🔵 BLUE"}
                </Text>
                <Text style={styles.wireRevealLabel}>
                  {gameState.correctWire === "red" ? "🔴 RED" : "🔵 BLUE"} was
                  correct
                </Text>
              </View>
            )}

            <View style={styles.livesBox}>
              <Text style={styles.livesLabel}>
                {isGhost
                  ? `${explodedPlayer?.name} is eliminated! 👻`
                  : `${explodedPlayer?.name} has ${livesLeft} ${livesLeft === 1 ? "life" : "lives"} left`}
              </Text>
              {!isGhost && (
                <View style={styles.livesRow}>
                  {[1, 2, 3].map((i) => (
                    <Text key={i} style={styles.heart}>
                      {i <= livesLeft ? "❤️" : "🖤"}
                    </Text>
                  ))}
                </View>
              )}
            </View>
            {pendingTournament && (
              <View style={styles.challengeBox}>
                <Text style={styles.challengeTitle}>
                  👻{" "}
                  {pendingTournament.ghostIds.length === 1
                    ? "A ghost"
                    : `${pendingTournament.ghostIds.length} ghosts`}{" "}
                  won their bet
                  {pendingTournament.ghostIds.length === 1 ? "" : "s"}!
                </Text>
                <Text style={styles.challengeNames}>
                  {pendingTournament.ghostIds
                    .map(
                      (id) =>
                        group.players.find((p) => p.id === id)?.name ??
                        "Someone",
                    )
                    .join(", ")}{" "}
                  will challenge for a life.
                </Text>
              </View>
            )}
          </>
        )}
      </Animated.View>

      {isHost && (
        <TouchableOpacity
          style={styles.replayBtn}
          onPress={() =>
            pendingTournament
              ? beginGhostTournament(group.id)
              : startReplay(group.id)
          }
        >
          <Text style={styles.replayBtnText}>
            {pendingTournament
              ? "⚔️ Start the Ghost Challenge"
              : "See the Replay 🎬"}
          </Text>
        </TouchableOpacity>
      )}

      {!isHost && (
        <Text style={styles.waitingText}>
          {pendingTournament
            ? "A ghost challenge is coming..."
            : "Waiting for host to continue..."}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D0D0D",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  content: { alignItems: "center", width: "100%" },
  emoji: { fontSize: 96, marginBottom: 16 },
  title: {
    color: "#FF4500",
    fontSize: 40,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    color: "#888",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 24,
  },
  immuneDesc: {
    color: "#4FC3F7",
    fontSize: 14,
    textAlign: "center",
  },
  wireReveal: {
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#333",
    width: "100%",
  },
  wireRevealLabel: { color: "#888", fontSize: 12, marginBottom: 4 },
  wireRevealText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 4,
  },
  lifeRegained: {
    color: "#4CAF50",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 8,
  },
  livesBox: {
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    width: "100%",
    borderWidth: 1,
    borderColor: "#333",
    marginBottom: 20,
  },
  livesLabel: { color: "#888", fontSize: 14, marginBottom: 8 },
  livesRow: { flexDirection: "row", gap: 8 },
  heart: { fontSize: 24 },
  replayBtn: {
    backgroundColor: "#FF4500",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    width: "100%",
    position: "absolute",
    bottom: 40,
  },
  replayBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  waitingText: {
    color: "#888",
    fontSize: 14,
    position: "absolute",
    bottom: 40,
  },
  challengeBox: {
    backgroundColor: "#1A1230",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    width: "100%",
    borderWidth: 1,
    borderColor: "#B388FF",
    marginBottom: 20,
  },
  challengeTitle: {
    color: "#B388FF",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  challengeNames: { color: "#aaa", fontSize: 12, textAlign: "center" },
});
