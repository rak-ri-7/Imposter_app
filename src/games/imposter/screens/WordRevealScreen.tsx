import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Group, ImposterGameState } from "../../../shared/types";
import { useImposterGame } from "../logic/useImposterGame";

type Props = {
  group: Group;
  playerId: string;
};

export default function WordRevealScreen({ group, playerId }: Props) {
  const { isHost, isImposter, handleBeginDescribe } = useImposterGame(
    group,
    playerId,
  );
  const [revealed, setRevealed] = useState(false);
  const gameState = group.gameState as ImposterGameState;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Role</Text>

      <View style={styles.roleBox}>
        {isImposter ? (
          <>
            <Text style={styles.roleEmoji}>🕵️</Text>
            <Text style={styles.roleLabel}>YOU ARE THE</Text>
            <Text style={[styles.roleName, styles.imposterColor]}>
              IMPOSTER
            </Text>
            <Text style={styles.roleHint}>
              Blend in! You don't know the word.{"\n"}
              Try to guess it from others' clues.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.roleEmoji}>👤</Text>
            <Text style={styles.roleLabel}>YOU ARE A</Text>
            <Text style={[styles.roleName, styles.playerColor]}>PLAYER</Text>
            {revealed ? (
              <View style={styles.wordBox}>
                <Text style={styles.wordLabel}>THE WORD IS</Text>
                <Text style={styles.word}>{gameState.word}</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.revealBtn}
                onPress={() => setRevealed(true)}
              >
                <Text style={styles.revealBtnText}>Tap to reveal word</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.roleHint}>
              Describe the word without saying it directly.{"\n"}
              Find the imposter!
            </Text>
          </>
        )}
      </View>

      {isHost && (
        <TouchableOpacity style={styles.startBtn} onPress={handleBeginDescribe}>
          <Text style={styles.startBtnText}>Everyone's Ready → Start</Text>
        </TouchableOpacity>
      )}

      {!isHost && (
        <View style={styles.waitingBox}>
          <Text style={styles.waitingText}>
            Waiting for host to start the round...
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1A1A2E",
    padding: 24,
    paddingTop: 60,
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 32,
  },
  roleBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  roleEmoji: {
    fontSize: 72,
    marginBottom: 16,
  },
  roleLabel: {
    color: "#888",
    fontSize: 13,
    letterSpacing: 3,
    marginBottom: 8,
  },
  roleName: {
    fontSize: 36,
    fontWeight: "bold",
    letterSpacing: 4,
    marginBottom: 24,
  },
  imposterColor: {
    color: "#E63946",
  },
  playerColor: {
    color: "#4CAF50",
  },
  wordBox: {
    backgroundColor: "#16213E",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#4CAF50",
    width: "100%",
  },
  wordLabel: {
    color: "#888",
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 8,
  },
  word: {
    color: "#4CAF50",
    fontSize: 36,
    fontWeight: "bold",
  },
  revealBtn: {
    backgroundColor: "#16213E",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#4CAF50",
    width: "100%",
  },
  revealBtnText: {
    color: "#4CAF50",
    fontSize: 16,
    fontWeight: "600",
  },
  roleHint: {
    color: "#888",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  startBtn: {
    backgroundColor: "#E63946",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    width: "100%",
    marginTop: 16,
  },
  startBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  waitingBox: {
    padding: 18,
    alignItems: "center",
  },
  waitingText: {
    color: "#888",
    fontSize: 14,
    textAlign: "center",
  },
});
