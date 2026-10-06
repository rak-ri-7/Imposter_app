import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
import { Group, ImposterGameState } from "../../../shared/types";
import { useImposterGame } from "../logic/useImposterGame";
import TimerBar from "../../../shared/components/TimerBar";

type Props = {
  group: Group;
  playerId: string;
};

export default function DescribeScreen({ group, playerId }: Props) {
  const {
    isHost,
    isImposter,
    isMyTurn,
    currentPlayer,
    handleNextTurn,
    hintsEnabled,
    hintUsed,
    hint,
    handleUseHint,
    loading,
    activePlayers,
  } = useImposterGame(group, playerId);

  const [pulse] = useState(new Animated.Value(1));
  const gameState = group.gameState as ImposterGameState;
  const { players } = group;

  useEffect(() => {
    if (isMyTurn) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1.05,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      pulse.setValue(1);
    }
  }, [isMyTurn]);

  const turnNumber = gameState.currentTurn + 1;
  const totalPlayers = players.length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.turnLabel}>TURN</Text>
        <Text style={styles.turnCount}>
          {turnNumber} / {totalPlayers}
        </Text>
      </View>

      <View style={styles.progressRow}>
        {players.map((p, i) => (
          <View
            key={p.id}
            style={[
              styles.progressDot,
              i < turnNumber && styles.progressDotDone,
              i === gameState.currentTurn && styles.progressDotActive,
            ]}
          />
        ))}
      </View>

      <TimerBar
        running={isMyTurn}
        duration={30}
        onExpire={() => {
          if (isHost) handleNextTurn();
        }}
      />

      {isMyTurn ? (
        <Animated.View
          style={[styles.myTurnBox, { transform: [{ scale: pulse }] }]}
        >
          <Text style={styles.myTurnEmoji}>🎤</Text>
          <Text style={styles.myTurnTitle}>Your Turn!</Text>
          {isImposter ? (
            <View style={styles.imposterHintBox}>
              <Text style={styles.myTurnHint}>
                You don't know the word.{"\n"}
                Give a vague but convincing clue!
              </Text>
              {hintsEnabled &&
                isMyTurn &&
                (hintUsed ? (
                  <View style={styles.hintReveal}>
                    <Text style={styles.hintRevealText}>
                      💡 {hint ?? gameState?.currentHint ?? "Getting hint..."}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.hintBtn}
                    onPress={handleUseHint}
                    disabled={loading}
                  >
                    <Text style={styles.hintBtnText}>💡 Get a Hint</Text>
                  </TouchableOpacity>
                ))}
            </View>
          ) : (
            <>
              <Text style={styles.wordReminder}>The word is</Text>
              <Text style={styles.wordText}>{gameState.word}</Text>
              <Text style={styles.myTurnHint}>
                Describe it without saying the word directly.
              </Text>
            </>
          )}
        </Animated.View>
      ) : (
        <View style={styles.waitingBox}>
          <Text style={styles.listeningEmoji}>👂</Text>
          <Text style={styles.waitingTitle}>
            {currentPlayer?.name} is describing...
          </Text>
          {!isImposter && (
            <View style={styles.wordPeek}>
              <Text style={styles.wordPeekLabel}>The word is</Text>
              <Text style={styles.wordPeekText}>{gameState.word}</Text>
            </View>
          )}
          {isImposter && (
            <Text style={styles.imposterHint}>
              Listen carefully...{"\n"}try to guess the word!
            </Text>
          )}
        </View>
      )}

      <View style={styles.playerList}>
        {players.map((p, i) => (
          <View key={p.id} style={styles.playerChip}>
            <View
              style={[
                styles.chipDot,
                i < gameState.currentTurn && styles.chipDotDone,
                i === gameState.currentTurn && styles.chipDotActive,
              ]}
            />
            <Text
              style={[
                styles.chipName,
                i === gameState.currentTurn && styles.chipNameActive,
              ]}
            >
              {p.name}
              {p.id === playerId ? " (you)" : ""}
            </Text>
          </View>
        ))}
      </View>

      {isHost && (
        <TouchableOpacity
          style={[styles.nextBtn, !isMyTurn && styles.nextBtnOutline]}
          onPress={handleNextTurn}
        >
          <Text
            style={[styles.nextBtnText, !isMyTurn && styles.nextBtnTextOutline]}
          >
            {gameState.currentTurn + 1 >= totalPlayers
              ? "Start Voting →"
              : "Next Player →"}
          </Text>
        </TouchableOpacity>
      )}

      {!isHost && (
        <View style={styles.hostWaiting}>
          <Text style={styles.hostWaitingText}>Host controls the turns</Text>
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
  },
  header: { alignItems: "center", marginBottom: 16 },
  turnLabel: { color: "#888", fontSize: 12, letterSpacing: 3 },
  turnCount: { color: "#fff", fontSize: 32, fontWeight: "bold" },
  progressRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#16213E",
    borderWidth: 1,
    borderColor: "#0F3460",
  },
  progressDotDone: { backgroundColor: "#4CAF50", borderColor: "#4CAF50" },
  progressDotActive: {
    backgroundColor: "#E63946",
    borderColor: "#E63946",
    transform: [{ scale: 1.3 }],
  },
  myTurnBox: {
    flex: 1,
    backgroundColor: "#16213E",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#E63946",
    marginBottom: 20,
  },
  myTurnEmoji: { fontSize: 56, marginBottom: 16 },
  myTurnTitle: {
    color: "#E63946",
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 16,
  },
  wordReminder: {
    color: "#888",
    fontSize: 13,
    letterSpacing: 2,
    marginBottom: 6,
  },
  wordText: {
    color: "#FFD700",
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 16,
  },
  myTurnHint: {
    color: "#888",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  waitingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  listeningEmoji: { fontSize: 56, marginBottom: 16 },
  waitingTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  wordPeek: {
    backgroundColor: "#16213E",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#0F3460",
  },
  wordPeekLabel: {
    color: "#888",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 4,
  },
  wordPeekText: { color: "#FFD700", fontSize: 24, fontWeight: "bold" },
  imposterHint: {
    color: "#888",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  playerList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  playerChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16213E",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  chipDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#0F3460" },
  chipDotDone: { backgroundColor: "#4CAF50" },
  chipDotActive: { backgroundColor: "#E63946" },
  chipName: { color: "#888", fontSize: 13 },
  chipNameActive: { color: "#fff", fontWeight: "600" },
  nextBtn: {
    backgroundColor: "#E63946",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
  },
  nextBtnOutline: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "#E63946",
  },
  nextBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  nextBtnTextOutline: { color: "#E63946" },
  hostWaiting: { padding: 18, alignItems: "center" },
  hostWaitingText: { color: "#888", fontSize: 14 },

  imposterHintBox: {
    alignItems: "center",
    gap: 12,
  },
  hintBtn: {
    backgroundColor: "#FFD700",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 12,
  },
  hintBtnText: {
    color: "#1A1A2E",
    fontSize: 14,
    fontWeight: "600",
  },
  hintReveal: {
    backgroundColor: "#16213E",
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  hintRevealText: {
    color: "#FFD700",
    fontSize: 14,
    textAlign: "center",
  },
});
