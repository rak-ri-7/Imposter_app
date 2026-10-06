import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Vibration,
} from "react-native";
import { Group, BombGameState } from "../../../shared/types";
import {
  submitHotSeatAnswer,
  continueHotSeatDuel,
  hotSeatManualPass,
} from "../logic/hotSeatDuel";
import { getDuelFffHint } from "../logic/duelFastestFinger";
import { explodeBomb } from "../logic/game";

type Props = { group: Group; playerId: string };

export default function BombHotSeatDuelScreen({ group, playerId }: Props) {
  const gameState = group.gameState as BombGameState;
  const isHost = group.hostId === playerId;
  const isHolder = gameState.currentHolderId === playerId;
  const opponent = group.players.find(
    (p) =>
      p.id !== gameState.currentHolderId && !gameState.ghosts.includes(p.id),
  );
  const holderName =
    group.players.find((p) => p.id === gameState.currentHolderId)?.name ?? "";

  const activeQuiz = gameState.activeQuiz;
  const lockedUntil = gameState.hotSeatLockedUntil ?? null;
  const canPass = gameState.duelFffHolderCanPass ?? false;
  const wrongCount = gameState.hotSeatWrongCount ?? 0;
  const eliminated = activeQuiz?.hotSeatEliminatedOptions ?? [];

  const [lockRemaining, setLockRemaining] = useState(0);
  const [hint, setHint] = useState("");
  const [passing, setPassing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Hidden overall-timer — hint text only, same shared engine as FFF duel.
  useEffect(() => {
    const startedAt = gameState.duelFffTimerStartedAt;
    const duration = gameState.duelFffTimerDuration;
    if (!startedAt || !duration) return;

    const tick = () => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const remaining = Math.max(0, duration - elapsed);
      setHint(getDuelFffHint(remaining / duration));
      if (remaining <= 0 && isHost) {
        explodeBomb(group);
      }
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [gameState.duelFffTimerStartedAt, gameState.duelFffTimerDuration, isHost]);

  // Host-only: once a lock expires, clear it so the holder can answer again.
  useEffect(() => {
    if (!isHost || !lockedUntil) return;
    const interval = setInterval(() => {
      if (Date.now() >= lockedUntil) continueHotSeatDuel(group.id);
    }, 150);
    return () => clearInterval(interval);
  }, [isHost, lockedUntil, group.id]);

  // Live countdown for the escalating lock window.
  useEffect(() => {
    if (!lockedUntil) {
      setLockRemaining(0);
      return;
    }
    const tick = () =>
      setLockRemaining(Math.max(0, (lockedUntil - Date.now()) / 1000));
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  useEffect(() => {
    if (isHolder && lockedUntil) Vibration.vibrate(150);
  }, [lockedUntil]);

  const handleTap = async (index: number) => {
    if (!isHolder || submitting || lockedUntil || canPass) return;
    if (eliminated.includes(index)) return;
    setSubmitting(true);
    try {
      await submitHotSeatAnswer(group, playerId, index);
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualPass = async () => {
    if (!isHolder || !canPass || passing || !opponent) return;
    setPassing(true);
    try {
      await hotSeatManualPass(group, playerId, opponent.id);
    } finally {
      setPassing(false);
    }
  };

  const optionsRemaining =
    (activeQuiz?.question.options.length ?? 4) - eliminated.length;

  return (
    <View style={styles.container}>
      <Text style={styles.duelBanner}>🪑 THE HOT SEAT</Text>
      <Text style={styles.hint}>{hint}</Text>

      {isHolder ? (
        <Text style={styles.holderLine}>YOU'RE IN THE HOT SEAT</Text>
      ) : (
        <Text style={styles.holderLine}>{holderName} is in the hot seat</Text>
      )}

      {lockedUntil ? (
        <View style={styles.lockedBox}>
          <Text style={styles.lockedText}>
            {isHolder
              ? `❌ Wrong! Locked for ${Math.ceil(lockRemaining)}s`
              : `🔒 ${holderName} guessed wrong — locked for ${Math.ceil(lockRemaining)}s`}
          </Text>
          <Text style={styles.lockedSub}>
            {optionsRemaining} option{optionsRemaining === 1 ? "" : "s"} left
          </Text>
        </View>
      ) : canPass ? (
        <View style={styles.canPassBox}>
          {isHolder ? (
            <>
              <Text style={styles.canPassText}>
                ✅ Correct! Pass whenever you're ready
              </Text>
              <TouchableOpacity
                style={styles.passBtn}
                onPress={handleManualPass}
                disabled={passing}
              >
                <Text style={styles.passBtnText}>
                  Pass to {opponent?.name ?? "opponent"} →
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.canPassText}>
              ✅ {holderName} got it — waiting for them to pass...
            </Text>
          )}
        </View>
      ) : activeQuiz ? (
        <>
          <Text style={styles.prompt}>{activeQuiz.question.prompt}</Text>
          {isHolder ? (
            <View style={styles.optionsGrid}>
              {activeQuiz.question.options.map((opt, index) => {
                const isEliminated = eliminated.includes(index);
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.optionBtn,
                      isEliminated && styles.optionBtnEliminated,
                    ]}
                    onPress={() => handleTap(index)}
                    disabled={isEliminated || submitting}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isEliminated && styles.optionTextEliminated,
                      ]}
                    >
                      {opt.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={styles.spectatorNote}>
              👀 Watching {holderName} work through the options...
            </Text>
          )}
          {wrongCount > 0 && (
            <Text style={styles.wrongCountNote}>
              {wrongCount} wrong so far — {optionsRemaining} option
              {optionsRemaining === 1 ? "" : "s"} left
            </Text>
          )}
        </>
      ) : (
        <Text style={styles.loadingText}>Loading question...</Text>
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
  duelBanner: {
    color: "#FFD700",
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
  },
  hint: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 20,
  },
  holderLine: {
    color: "#FF4500",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 20,
  },
  lockedBox: {
    backgroundColor: "#2A0A0A",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#FF4500",
    alignItems: "center",
    gap: 6,
  },
  lockedText: {
    color: "#FF4500",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  lockedSub: { color: "#888", fontSize: 12 },
  canPassBox: {
    backgroundColor: "#0A2A0A",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#4CAF50",
    alignItems: "center",
    gap: 12,
  },
  canPassText: {
    color: "#4CAF50",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  passBtn: {
    backgroundColor: "#FF4500",
    borderRadius: 14,
    padding: 16,
    width: "100%",
    alignItems: "center",
  },
  passBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  prompt: {
    color: "#fff",
    fontSize: 19,
    fontWeight: "700",
    marginBottom: 20,
    lineHeight: 26,
  },
  optionsGrid: { gap: 12 },
  optionBtn: {
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "#333",
  },
  optionBtnEliminated: { opacity: 0.3, borderColor: "#E63946" },
  optionText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  optionTextEliminated: { textDecorationLine: "line-through", color: "#888" },
  wrongCountNote: {
    color: "#555",
    fontSize: 12,
    textAlign: "center",
    marginTop: 16,
  },
  loadingText: {
    color: "#888",
    fontSize: 15,
    textAlign: "center",
    marginTop: 40,
  },
  spectatorNote: {
    color: "#555",
    fontSize: 14,
    textAlign: "center",
    marginTop: 20,
  },
});
