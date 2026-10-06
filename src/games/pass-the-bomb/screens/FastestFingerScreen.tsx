import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
} from "react-native";
import { Group, BombGameState } from "../../../shared/types";
import {
  submitQuizAnswer,
  resolveFastestFingerQuestion,
  chooseFastestFingerLoser,
} from "../logic/Fastestfinger";

type Props = {
  group: Group;
  playerId: string;
};

export default function BombFastestFingerScreen({ group, playerId }: Props) {
  const gameState = group.gameState as BombGameState;
  const isHost = group.hostId === playerId;
  const activeQuiz = gameState.activeQuiz;

  const [timeLeft, setTimeLeft] = useState<number | null>(5);
  const [myAnswer, setMyAnswer] = useState<number | null>(null);
  const resolvingRef = useRef(false);

  const activePlayers = group.players.filter(
    (p) => !gameState.ghosts.includes(p.id),
  );
  const isGhost = gameState.ghosts.includes(playerId);
  const isHolder = gameState.currentHolderId === playerId;
  const holderName =
    group.players.find((p) => p.id === gameState.currentHolderId)?.name ??
    "Someone";

  // Countdown display, everyone
  useEffect(() => {
    if (!activeQuiz || activeQuiz.resolved) return;

    const tick = () => {
      const timestamps = Object.values(activeQuiz.answers).map(
        (a) => a.timestamp,
      );
      if (timestamps.length === 0) {
        setTimeLeft(null); // no pressure yet — nobody's answered
        return;
      }
      const firstAnswerAt = Math.min(...timestamps);
      const elapsed = (Date.now() - firstAnswerAt) / 1000;
      setTimeLeft(Math.max(0, activeQuiz.durationMs / 1000 - elapsed));
    };

    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [activeQuiz?.answers, activeQuiz?.resolved, activeQuiz?.durationMs]);

  // Host-only: decide when to resolve — either everyone active has
  // answered, or the window has fully elapsed.
  useEffect(() => {
    if (!isHost || !activeQuiz || activeQuiz.resolved) return;

    const check = async () => {
      if (resolvingRef.current) return;

      const answeredTimestamps = activePlayers
        .map((p) => activeQuiz.answers[p.id]?.timestamp)
        .filter((ts): ts is number => ts !== undefined);

      if (answeredTimestamps.length === activePlayers.length) {
        resolvingRef.current = true;
        await resolveFastestFingerQuestion(group);
        return;
      }

      // Nobody's answered yet — no countdown pressure at all, let them think.
      if (answeredTimestamps.length === 0) return;

      // Someone's answered — the reset window starts counting from THAT
      // moment, not from when the question first appeared.
      const firstAnswerAt = Math.min(...answeredTimestamps);
      const elapsedSinceFirstAnswer = Date.now() - firstAnswerAt;
      if (elapsedSinceFirstAnswer >= activeQuiz.durationMs) {
        resolvingRef.current = true;
        await resolveFastestFingerQuestion(group);
      }
    };

    check();
    const interval = setInterval(check, 150);
    return () => clearInterval(interval);
  }, [isHost, activeQuiz, activePlayers.length]);

  // Reset local "I already answered" state whenever a new question comes in
  useEffect(() => {
    setMyAnswer(null);
    resolvingRef.current = false;
  }, [activeQuiz?.startedAt]);

  const handleTap = async (index: number) => {
    if (myAnswer !== null || isGhost) return;
    setMyAnswer(index);
    await submitQuizAnswer(group, playerId, index);
  };

  const getPlayerName = (id: string) =>
    group.players.find((p) => p.id === id)?.name ?? "Unknown";

  // ── Persistent holder banner — rendered in EVERY state of this screen
  // (no question yet, mid-question, awaiting a chooser's pick) so it never
  // depends on flickering over to a different screen to show up. ─────────
  const HolderBanner = () => (
    <View style={styles.holderBanner}>
      <Text style={styles.holderBombEmoji}>💣</Text>
      <Text style={styles.holderText}>
        {isHolder ? "YOU HAVE THE BOMB" : `${holderName} has the bomb`}
      </Text>
    </View>
  );

  // ── No question yet (round just started, or between chained questions
  // for the brief moment before the next one lands) ──────────────────────
  if (!activeQuiz) {
    return (
      <View style={styles.container}>
        <HolderBanner />
        <Text style={styles.loadingText}>Next question loading...</Text>
      </View>
    );
  }

  // ── Chooser sub-view ────────────────────────────────────────────
  if (activeQuiz.awaitingChoice) {
    const { chooserId, choosablePlayerIds } = activeQuiz.awaitingChoice;
    const isChooser = chooserId === playerId;

    if (isChooser) {
      return (
        <View style={styles.container}>
          <HolderBanner />
          <Text style={styles.choiceTitle}>⚡ You call it</Text>
          <Text style={styles.choiceSubtitle}>Pick who takes the bomb</Text>
          <FlatList
            data={choosablePlayerIds}
            keyExtractor={(id) => id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.choiceRow}
                onPress={() => chooseFastestFingerLoser(group, item)}
              >
                <Text style={styles.choiceRowText}>{getPlayerName(item)}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <HolderBanner />
        <Text style={styles.waitingBig}>
          {getPlayerName(chooserId)} is deciding who takes the bomb...
        </Text>
      </View>
    );
  }

  // ── Normal question view ────────────────────────────────────────
  return (
    <View style={styles.container}>
      <HolderBanner />

      <View style={styles.header}>
        {timeLeft === null ? (
          <Text style={styles.headerTitle}>⏳ Waiting for first answer...</Text>
        ) : (
          <Text style={[styles.timerText, timeLeft <= 2 && styles.timerUrgent]}>
            {timeLeft.toFixed(1)}s
          </Text>
        )}
      </View>

      <Text style={styles.prompt}>{activeQuiz.question.prompt}</Text>

      <View style={styles.optionsGrid}>
        {activeQuiz.question.options.map((opt, index) => {
          const selected = myAnswer === index;
          return (
            <TouchableOpacity
              key={index}
              style={[styles.optionBtn, selected && styles.optionBtnSelected]}
              onPress={() => handleTap(index)}
              disabled={myAnswer !== null || isGhost}
            >
              <Text
                style={[
                  styles.optionText,
                  selected && styles.optionTextSelected,
                ]}
              >
                {opt.text}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {myAnswer !== null && (
        <Text style={styles.lockedInText}>
          ✓ Locked in — waiting on the others...
        </Text>
      )}

      {isGhost && (
        <Text style={styles.lockedInText}>
          👻 You're a ghost — just watch this one
        </Text>
      )}

      <Text style={styles.sectionLabel}>WHO'S ANSWERED</Text>
      <View style={styles.answeredRow}>
        {activePlayers.map((p) => {
          const answered = !!activeQuiz.answers[p.id];
          return (
            <View
              key={p.id}
              style={[styles.answeredChip, answered && styles.answeredChipDone]}
            >
              <Text
                style={[
                  styles.answeredChipText,
                  answered && styles.answeredChipTextDone,
                ]}
              >
                {p.name}
              </Text>
            </View>
          );
        })}
      </View>
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
  loadingText: {
    color: "#888",
    fontSize: 15,
    textAlign: "center",
    marginTop: 40,
  },
  holderBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: "#FF4500",
  },
  holderBombEmoji: { fontSize: 20 },
  holderText: { color: "#FF4500", fontSize: 14, fontWeight: "700" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  headerTitle: {
    color: "#FFD700",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
  },
  timerText: { color: "#fff", fontSize: 28, fontWeight: "bold" },
  timerUrgent: { color: "#E63946" },
  prompt: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 24,
    lineHeight: 28,
  },
  optionsGrid: { gap: 12, marginBottom: 16 },
  optionBtn: {
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "#333",
  },
  optionBtnSelected: {
    borderColor: "#FFD700",
    backgroundColor: "#2A2200",
  },
  optionText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  optionTextSelected: { color: "#FFD700" },
  lockedInText: {
    color: "#4CAF50",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 16,
  },
  sectionLabel: {
    color: "#888",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 10,
  },
  answeredRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  answeredChip: {
    backgroundColor: "#1A1A1A",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#333",
  },
  answeredChipDone: {
    borderColor: "#4CAF50",
    backgroundColor: "#0A1E0A",
  },
  answeredChipText: { color: "#888", fontSize: 12 },
  answeredChipTextDone: { color: "#4CAF50", fontWeight: "600" },
  choiceTitle: {
    color: "#FFD700",
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 6,
  },
  choiceSubtitle: {
    color: "#888",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 24,
  },
  choiceRow: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#333",
  },
  choiceRowText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  waitingBig: {
    color: "#888",
    fontSize: 16,
    textAlign: "center",
    marginTop: 60,
    lineHeight: 24,
  },
});
