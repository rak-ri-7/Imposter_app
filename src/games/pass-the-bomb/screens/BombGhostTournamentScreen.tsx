import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Group, BombGameState } from "../../../shared/types";
import { submitQuizAnswer } from "../logic/Fastestfinger";
import {
  advanceTournamentStage,
  resolveTournamentQuestion,
  closeGhostTournament,
} from "../logic/ghostTournament";
import { playSound } from "../../../shared/sounds/soundManager";

type Props = { group: Group; playerId: string };

export default function BombGhostTournamentScreen({ group, playerId }: Props) {
  const gameState = group.gameState as BombGameState;
  const tournament = gameState.ghostTournament;
  const activeQuiz = gameState.activeQuiz;
  const isHost = group.hostId === playerId;
  const stage = tournament?.stage;
  const nextStageAt = tournament?.nextStageAt;

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [myAnswer, setMyAnswer] = useState<number | null>(null);
  const resolvingRef = useRef(false);

  const getName = (id: string) =>
    group.players.find((p) => p.id === id)?.name ?? "Unknown";
  const inPool = !!tournament?.poolIds.includes(playerId);
  const wasEliminated = !!tournament?.eliminatedIds.includes(playerId);

  useEffect(() => {
    playSound("tbc-start");
  }, []);

  // Host: move 'intro' / 'between' on to the next question once its
  // timer has passed. The function is idempotent, so a retry is harmless.
  useEffect(() => {
    if (!isHost || !nextStageAt) return;
    if (stage !== "intro" && stage !== "between") return;
    const interval = setInterval(() => {
      if (Date.now() >= nextStageAt) advanceTournamentStage(group.id);
    }, 400);
    return () => clearInterval(interval);
  }, [isHost, stage, nextStageAt, group.id]);

  // Host: resolve the question once every contender has answered, or the
  // window since the FIRST answer has run out. Nothing happens while nobody
  // has answered — same "let them think" rule as the other quiz modes.
  useEffect(() => {
    if (!isHost || stage !== "question" || !activeQuiz || !tournament) return;
    const poolIds = tournament.poolIds;
    const startedAt = activeQuiz.startedAt;

    const check = () => {
      if (resolvingRef.current) return;
      const stamps = poolIds
        .map((id) => activeQuiz.answers[id]?.timestamp)
        .filter((ts): ts is number => ts !== undefined);
      if (stamps.length === 0) return;

      const everyoneIn = stamps.length === poolIds.length;
      const windowOver =
        Date.now() - Math.min(...stamps) >= activeQuiz.durationMs;
      if (!everyoneIn && !windowOver) return;

      resolvingRef.current = true;
      resolveTournamentQuestion(group.id, startedAt).finally(() => {
        resolvingRef.current = false;
      });
    };

    check();
    const interval = setInterval(check, 250);
    return () => clearInterval(interval);
  }, [isHost, stage, activeQuiz, tournament?.poolIds, group.id]);

  // Countdown display — blank until someone has answered.
  useEffect(() => {
    if (stage !== "question" || !activeQuiz) {
      setTimeLeft(null);
      return;
    }
    const tick = () => {
      const stamps = Object.values(activeQuiz.answers).map((a) => a.timestamp);
      if (stamps.length === 0) {
        setTimeLeft(null);
        return;
      }
      const elapsed = (Date.now() - Math.min(...stamps)) / 1000;
      setTimeLeft(Math.max(0, activeQuiz.durationMs / 1000 - elapsed));
    };
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [stage, activeQuiz?.answers, activeQuiz?.durationMs]);

  useEffect(() => {
    setMyAnswer(null);
  }, [activeQuiz?.startedAt]);

  const handleTap = async (index: number) => {
    if (myAnswer !== null || !inPool) return;
    setMyAnswer(index);
    await submitQuizAnswer(group, playerId, index);
  };

  if (!tournament) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.waitingText}>Wrapping up the challenge...</Text>
      </View>
    );
  }

  const renderPool = () => (
    <View style={styles.poolRow}>
      {tournament.poolIds.map((id) => {
        const answered = stage === "question" && !!activeQuiz?.answers[id];
        return (
          <View key={id} style={[styles.chip, answered && styles.chipDone]}>
            <Text style={[styles.chipText, answered && styles.chipTextDone]}>
              {getName(id)}
              {id === tournament.wireCutterId ? " 🛡️" : " 👻"}
            </Text>
          </View>
        );
      })}
    </View>
  );

  // ── Intro ─────────────────────────────────────────────────────────
  if (tournament.stage === "intro") {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.title}>👻 GHOST CHALLENGE</Text>
        <Text style={styles.subtitle}>
          The shadows demand a duel for a life.
        </Text>
        <View style={styles.card}>
          {tournament.contenderIds.map((id) => (
            <View key={id} style={styles.contenderRow}>
              <Text style={styles.contenderName}>
                {getName(id)}
                {id === playerId ? " (you)" : ""}
              </Text>
              <Text
                style={
                  id === tournament.wireCutterId
                    ? styles.tagDefender
                    : styles.tagChallenger
                }
              >
                {id === tournament.wireCutterId
                  ? "🛡️ Defending"
                  : "👻 Challenger"}
              </Text>
            </View>
          ))}
        </View>
        <Text style={styles.rules}>
          Everyone answers at once. The weakest answer is out each round. Last
          one standing wins the life.
        </Text>
        {tournament.debug && (
          <Text style={styles.debugTag}>🧪 Test run — nothing will change</Text>
        )}
      </View>
    );
  }

  // ── Between questions ─────────────────────────────────────────────
  if (tournament.stage === "between") {
    const outId = tournament.lastEliminatedId;
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.bigEmoji}>💥</Text>
        <Text style={styles.title}>
          {outId
            ? outId === playerId
              ? "You're out!"
              : `${getName(outId)} is out!`
            : "Someone is out!"}
        </Text>
        <Text style={styles.subtitle}>
          {tournament.poolIds.length} still standing
        </Text>
        {renderPool()}
      </View>
    );
  }

  // ── Result ────────────────────────────────────────────────────────
  if (tournament.stage === "result") {
    const winnerId = tournament.winnerId;
    const winnerName = winnerId ? getName(winnerId) : "Nobody";
    const cutterName = getName(tournament.wireCutterId);
    const winnerIsCutter = winnerId === tournament.wireCutterId;

    return (
      <View style={styles.centerContainer}>
        <Text style={styles.bigEmoji}>{winnerIsCutter ? "🛡️" : "👻"}</Text>
        <Text style={styles.title}>
          {winnerIsCutter
            ? `${winnerName} defended!`
            : `${winnerName} wins their life back!`}
        </Text>
        <Text style={styles.subtitle}>
          {tournament.debug
            ? "🧪 Test run — nothing was changed."
            : winnerIsCutter
              ? "The explosion is undone — they get their life back."
              : `They rejoin the game. ${cutterName} stays down the life they lost.`}
        </Text>
        {winnerId === playerId && !tournament.debug && (
          <Text style={styles.youWon}>That's you! 🎉</Text>
        )}

        {isHost ? (
          <TouchableOpacity
            style={styles.continueBtn}
            onPress={() => closeGhostTournament(group.id)}
          >
            <Text style={styles.continueBtnText}>Continue to Replay →</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.waitingText}>
            Waiting for host to continue...
          </Text>
        )}
      </View>
    );
  }

  // ── Question ──────────────────────────────────────────────────────
  if (!activeQuiz) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.waitingText}>Next question loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>👻 GHOST CHALLENGE</Text>
      {renderPool()}

      {inPool ? (
        <>
          <View style={styles.timerRow}>
            {timeLeft === null ? (
              <Text style={styles.waitingFirst}>
                ⏳ Waiting for first answer...
              </Text>
            ) : (
              <Text
                style={[styles.timerText, timeLeft <= 2 && styles.timerUrgent]}
              >
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
                  style={[
                    styles.optionBtn,
                    selected && styles.optionBtnSelected,
                  ]}
                  onPress={() => handleTap(index)}
                  disabled={myAnswer !== null}
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
        </>
      ) : (
        <View style={styles.watchBox}>
          <Text style={styles.watchEmoji}>{wasEliminated ? "💥" : "👀"}</Text>
          <Text style={styles.watchText}>
            {wasEliminated
              ? "You're out of the challenge."
              : "Watching the ghost challenge..."}
          </Text>
          <Text style={styles.watchSub}>
            {tournament.poolIds.length} still fighting
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D0D0D",
    padding: 20,
    paddingTop: 20,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: "#0D0D0D",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    color: "#FFD700",
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    color: "#888",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  bigEmoji: { fontSize: 72, marginBottom: 12 },
  card: {
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    padding: 16,
    width: "100%",
    borderWidth: 1,
    borderColor: "#FFD700",
    marginBottom: 20,
    gap: 10,
  },
  contenderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  contenderName: { color: "#fff", fontSize: 16, fontWeight: "600" },
  tagDefender: { color: "#4FC3F7", fontSize: 13, fontWeight: "700" },
  tagChallenger: { color: "#B388FF", fontSize: 13, fontWeight: "700" },
  rules: {
    color: "#666",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  debugTag: { color: "#FF4500", fontSize: 12, marginTop: 16 },
  poolRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    backgroundColor: "#1A1A1A",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#333",
  },
  chipDone: { borderColor: "#4CAF50", backgroundColor: "#0A1E0A" },
  chipText: { color: "#888", fontSize: 12 },
  chipTextDone: { color: "#4CAF50", fontWeight: "600" },
  timerRow: { alignItems: "center", marginBottom: 16, minHeight: 34 },
  waitingFirst: {
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
  optionBtnSelected: { borderColor: "#FFD700", backgroundColor: "#2A2200" },
  optionText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  optionTextSelected: { color: "#FFD700" },
  lockedInText: {
    color: "#4CAF50",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 16,
  },
  watchBox: { flex: 1, alignItems: "center", justifyContent: "center" },
  watchEmoji: { fontSize: 64, marginBottom: 12 },
  watchText: {
    color: "#aaa",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 6,
  },
  watchSub: { color: "#555", fontSize: 13 },
  youWon: {
    color: "#4CAF50",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 20,
  },
  continueBtn: {
    backgroundColor: "#FF4500",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    marginTop: 12,
  },
  continueBtnText: { color: "#fff", fontSize: 15, fontWeight: "bold" },
  waitingText: { color: "#888", fontSize: 14, textAlign: "center" },
});
