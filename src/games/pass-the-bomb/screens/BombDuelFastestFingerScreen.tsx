import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Vibration,
} from "react-native";
import { Group, BombGameState } from "../../../shared/types";
import { submitQuizAnswer } from "../logic/Fastestfinger";
import {
  evaluateDuelFastestFinger,
  skipIdleDuelQuestion,
  continueDuelFastestFinger,
  duelFffManualPass,
  getDuelFffHint,
  decideDuelFastestFinger,
} from "../logic/duelFastestFinger";
import { explodeBomb } from "../logic/game";

type Props = { group: Group; playerId: string };

export default function BombDuelFastestFingerScreen({
  group,
  playerId,
}: Props) {
  const gameState = group.gameState as BombGameState;
  const isHost = group.hostId === playerId;
  const isHolder = gameState.currentHolderId === playerId;
  const nonHolder = group.players.find(
    (p) =>
      p.id !== gameState.currentHolderId && !gameState.ghosts.includes(p.id),
  );
  const holderName =
    group.players.find((p) => p.id === gameState.currentHolderId)?.name ?? "";

  const activeQuiz = gameState.activeQuiz;
  const lockedUntil = gameState.duelFffLockedUntil ?? null;
  const canPass = gameState.duelFffHolderCanPass ?? false;
  const lockReason = gameState.duelFffLockReason;

  const [myAnswer, setMyAnswer] = useState<number | null>(null);
  const [lockRemaining, setLockRemaining] = useState(0);
  const [hint, setHint] = useState("");
  const [passing, setPassing] = useState(false);

  // Hidden overall-explosion-risk timer — hint text only, never a number.
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

  // Host-only: evaluate every answer change + check the 6s idle skip.
  useEffect(() => {
    if (!isHost || !activeQuiz || activeQuiz.resolved || !nonHolder) return;
    const holderId = gameState.currentHolderId;
    const opponentId = nonHolder.id;
    const startedAt = activeQuiz.startedAt;

    if (decideDuelFastestFinger(activeQuiz, holderId, opponentId)) {
      evaluateDuelFastestFinger(group, holderId, opponentId);
      const retry = setTimeout(
        () => evaluateDuelFastestFinger(group, holderId, opponentId),
        1500,
      );
      return () => clearTimeout(retry);
    }

    const stamps = [holderId, opponentId]
      .map((id) => activeQuiz.answers?.[id]?.timestamp)
      .filter((ts): ts is number => ts !== undefined);
    if (stamps.length === 0) return;

    const msLeft = Math.max(
      0,
      Math.min(...stamps) + activeQuiz.durationMs - Date.now(),
    );
    let retry: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      skipIdleDuelQuestion(group, startedAt);
      retry = setInterval(() => skipIdleDuelQuestion(group, startedAt), 2000);
    }, msLeft);
    return () => {
      clearTimeout(timeout);
      if (retry) clearInterval(retry);
    };
  }, [isHost, activeQuiz, nonHolder?.id, gameState.currentHolderId]);

  useEffect(() => {
    if (!isHost || !lockedUntil) return;
    let retry: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(
      () => {
        continueDuelFastestFinger(group);
        retry = setInterval(() => continueDuelFastestFinger(group), 1000);
      },
      Math.max(0, lockedUntil - Date.now()),
    );
    return () => {
      clearTimeout(timeout);
      if (retry) clearInterval(retry);
    };
  }, [isHost, lockedUntil]);

  // Live countdown display for the 3s lock (small/short, fine to show a
  // number here — this is separate from the hidden overall duel timer).
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

  // Reset local per-question state whenever a genuinely new question lands.
  useEffect(() => {
    setMyAnswer(null);
  }, [activeQuiz?.startedAt]);

  useEffect(() => {
    if (isHolder && lockedUntil) Vibration.vibrate(150);
  }, [lockedUntil]);

  const isFinalist =
    playerId === gameState.currentHolderId || playerId === nonHolder?.id;

  const handleTap = async (index: number) => {
    if (myAnswer !== null || !activeQuiz || activeQuiz.resolved) return;
    setMyAnswer(index);
    await submitQuizAnswer(group, playerId, index);
  };

  const handleManualPass = async () => {
    if (!isHolder || !canPass || passing || !nonHolder) return;
    setPassing(true);
    try {
      await duelFffManualPass(group, playerId, nonHolder.id);
    } finally {
      setPassing(false);
    }
  };

  const lockMessage = (): string => {
    if (isHolder) {
      return lockReason === "too-slow"
        ? `😬 ${nonHolder?.name ?? "Your opponent"} beat you to it! Bomb's stuck with you for ${Math.ceil(lockRemaining)}s`
        : `❌ Wrong! The bomb doesn't forgive — stuck for ${Math.ceil(lockRemaining)}s`;
    }
    return lockReason === "too-slow"
      ? `⚡ Nice reflexes! ${holderName} is sweating for ${Math.ceil(lockRemaining)}s`
      : `🔒 ${holderName} guessed wrong — stuck for ${Math.ceil(lockRemaining)}s`;
  };
  return (
    <View style={styles.container}>
      <Text style={styles.duelBanner}>⚡ FASTEST FINGER DUEL</Text>
      <Text style={styles.hint}>{hint}</Text>

      {isHolder ? (
        <Text style={styles.holderLine}>YOU HAVE THE BOMB</Text>
      ) : (
        <Text style={styles.holderLine}>{holderName} has the bomb</Text>
      )}

      {lockedUntil ? (
        <View style={styles.lockedBox}>
          <Text style={styles.lockedText}>{lockMessage()}</Text>
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
                  Pass to {nonHolder?.name ?? "opponent"} →
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.canPassText}>
              ✅ {holderName} answered correctly — waiting for them to pass...
            </Text>
          )}
        </View>
      ) : activeQuiz ? (
        <>
          <Text style={styles.prompt}>{activeQuiz.question.prompt}</Text>
          {isFinalist ? (
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
          ) : (
            <Text style={styles.spectatorNote}>
              👀 Watching the finalists battle it out...
            </Text>
          )}
          {isFinalist && myAnswer !== null && (
            <Text style={styles.lockedInText}>✓ Locked in — waiting...</Text>
          )}
        </>
      ) : (
        <Text style={styles.loadingText}>Next question loading...</Text>
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
    color: "#FF4500",
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
    color: "#FFD700",
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
  },
  lockedText: { color: "#FF4500", fontSize: 14, fontWeight: "700" },
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
  optionBtnSelected: { borderColor: "#FFD700", backgroundColor: "#2A2200" },
  optionText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  optionTextSelected: { color: "#FFD700" },
  lockedInText: {
    color: "#4CAF50",
    fontSize: 13,
    textAlign: "center",
    marginTop: 12,
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
