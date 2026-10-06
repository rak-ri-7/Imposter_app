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
  getDuelFffHint,
  startTrialByCombat,
  tbcManualPass,
  resolveTbcTimeout,
  closeTrialByCombat,
  decideDuelFastestFinger,
} from "../logic/duelFastestFinger";

type Props = { group: Group; playerId: string };

export default function BombTbcDuelScreen({ group, playerId }: Props) {
  const gameState = group.gameState as BombGameState;
  const isHost = group.hostId === playerId;
  const challenge = gameState.tbcChallenge;
  const accusedId = challenge?.accusedId ?? "";
  const opponentId = challenge?.opponentId ?? "";

  const tbcHolderId = gameState.tbcHolderId;
  const isHolder = tbcHolderId === playerId;
  const otherCombatantId = tbcHolderId === accusedId ? opponentId : accusedId;
  const holderName =
    group.players.find((p) => p.id === tbcHolderId)?.name ?? "";
  const otherName =
    group.players.find((p) => p.id === otherCombatantId)?.name ?? "";

  const activeQuiz = gameState.activeQuiz;
  const lockedUntil = gameState.duelFffLockedUntil ?? null;
  const canPass = gameState.duelFffHolderCanPass ?? false;
  const lockReason = gameState.duelFffLockReason;
  const tbcLoserId = gameState.tbcLoserId;

  const [myAnswer, setMyAnswer] = useState<number | null>(null);
  const [lockRemaining, setLockRemaining] = useState(0);
  const [hint, setHint] = useState("");
  const [passing, setPassing] = useState(false);
  const timeoutResolvingRef = useRef(false);
  const startedRef = useRef(false);
  const passingRef = useRef(false);

  // Host-only, once: kick off the first question the moment this screen
  // mounts for a fresh challenge.
  useEffect(() => {
    if (!isHost || !challenge || startedRef.current) return;
    if (tbcHolderId) return; // already started
    startedRef.current = true;
    startTrialByCombat(group);
  }, [isHost, challenge, tbcHolderId]);

  // Hidden overall-timer — hint text only, never a number. On expiry,
  // the host resolves the loser via resolveTbcTimeout (NOT explodeBomb —
  // that would touch the main game's currentHolderId, not this side-duel).
  useEffect(() => {
    const startedAt = gameState.duelFffTimerStartedAt;
    const duration = gameState.duelFffTimerDuration;
    if (!startedAt || !duration || tbcLoserId) return;

    const tick = () => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const remaining = Math.max(0, duration - elapsed);
      setHint(getDuelFffHint(remaining / duration));
      if (remaining <= 0 && isHost && !timeoutResolvingRef.current) {
        timeoutResolvingRef.current = true;
        resolveTbcTimeout(group);
      }
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [
    gameState.duelFffTimerStartedAt,
    gameState.duelFffTimerDuration,
    isHost,
    tbcLoserId,
  ]);

  // Host: decide from the live snapshot, and only touch the network when
  // something has actually happened. (This used to run a Firestore
  // transaction every 150ms even with nobody answering.)
  useEffect(() => {
    if (
      !isHost ||
      !activeQuiz ||
      activeQuiz.resolved ||
      !tbcHolderId ||
      tbcLoserId
    )
      return;
    const startedAt = activeQuiz.startedAt;

    // A deciding answer is in: evaluate once. The retry is a safety net —
    // the transaction does nothing if the question is already resolved, and
    // this effect is cleaned up the moment the snapshot changes.
    if (decideDuelFastestFinger(activeQuiz, tbcHolderId, otherCombatantId)) {
      evaluateDuelFastestFinger(group, tbcHolderId, otherCombatantId);
      const retry = setTimeout(
        () => evaluateDuelFastestFinger(group, tbcHolderId, otherCombatantId),
        1500,
      );
      return () => clearTimeout(retry);
    }

    // Nobody has answered yet: let them think — no clock, no network.
    const stamps = [tbcHolderId, otherCombatantId]
      .map((id) => activeQuiz.answers?.[id]?.timestamp)
      .filter((ts): ts is number => ts !== undefined);
    if (stamps.length === 0) return;

    // Someone answered but it isn't decisive yet: the reset window runs from
    // that first answer. One timer, aimed at the question it belongs to.
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
  }, [isHost, activeQuiz, tbcHolderId, otherCombatantId, tbcLoserId]);

  // Host: when the lock runs out, roll the next question. One timer, then a
  // gentle retry in case that call was lost.
  useEffect(() => {
    if (!isHost || !lockedUntil || tbcLoserId) return;
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
  }, [isHost, lockedUntil, tbcLoserId]);

  // Live countdown for the short lock window.
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
    setMyAnswer(null);
  }, [activeQuiz?.startedAt]);

  useEffect(() => {
    if (isHolder && lockedUntil) Vibration.vibrate(150);
  }, [lockedUntil]);

  const isCombatant = playerId === accusedId || playerId === opponentId;

  const handleTap = async (index: number) => {
    if (myAnswer !== null || !activeQuiz || activeQuiz.resolved) return;
    setMyAnswer(index);
    await submitQuizAnswer(group, playerId, index);
  };

  const handleManualPass = async () => {
    if (!isHolder || !canPass || passingRef.current || !tbcHolderId) return;
    passingRef.current = true;
    setPassing(true);
    try {
      await tbcManualPass(group, tbcHolderId, otherCombatantId);
    } finally {
      passingRef.current = false;
      setPassing(false);
    }
  };

  const lockMessage = (): string => {
    if (isHolder) {
      return lockReason === "too-slow"
        ? `😬 ${otherName} beat you to it! Stuck for ${Math.ceil(lockRemaining)}s`
        : `❌ Wrong! Stuck for ${Math.ceil(lockRemaining)}s`;
    }
    return lockReason === "too-slow"
      ? `⚡ Nice reflexes! ${holderName} is sweating for ${Math.ceil(lockRemaining)}s`
      : `🔒 ${holderName} guessed wrong — stuck for ${Math.ceil(lockRemaining)}s`;
  };

  // ── Resolved — show who lost the duel ──────────────────────────────
  if (tbcLoserId) {
    const winnerId = tbcLoserId === accusedId ? opponentId : accusedId;
    const winnerName =
      group.players.find((p) => p.id === winnerId)?.name ?? "Someone";
    const loserName =
      group.players.find((p) => p.id === tbcLoserId)?.name ?? "Someone";
    const iLost = tbcLoserId === playerId;
    const iWon = winnerId === playerId;

    return (
      <View style={styles.container}>
        <Text style={styles.duelBanner}>⚔️ TRIAL BY COMBAT — DECIDED</Text>
        <Text style={styles.resultEmoji}>
          {iLost ? "💥" : iWon ? "🏆" : "⚔️"}
        </Text>
        <Text style={styles.resultTitle}>
          {iLost
            ? "You lost the duel!"
            : iWon
              ? "You won the duel!"
              : `${winnerName} defeated ${loserName}`}
        </Text>
        <Text style={styles.resultSubtitle}>
          {iLost
            ? "That cost you a life."
            : iWon
              ? `${loserName} pays the price instead.`
              : `${loserName} takes the life hit.`}
        </Text>
        {isHost && (
          <TouchableOpacity
            style={styles.continueBtn}
            onPress={() => closeTrialByCombat(group.id)}
          >
            <Text style={styles.continueBtnText}>Back to Replay →</Text>
          </TouchableOpacity>
        )}
        {!isHost && (
          <Text style={styles.waitingText}>
            Waiting for host to continue...
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.duelBanner}>⚔️ TRIAL BY COMBAT</Text>
      <Text style={styles.hint}>{hint}</Text>

      {tbcHolderId && (
        <Text style={styles.holderLine}>
          {isHolder ? "YOU HOLD THE RISK" : `${holderName} holds the risk`}
        </Text>
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
                <Text style={styles.passBtnText}>Pass to {otherName} →</Text>
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
          {isCombatant ? (
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
              👀 Watching {holderName} and {otherName} duel it out...
            </Text>
          )}
          {isCombatant && myAnswer !== null && (
            <Text style={styles.lockedInText}>✓ Locked in — waiting...</Text>
          )}
        </>
      ) : (
        <Text style={styles.loadingText}>Preparing the duel...</Text>
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
  resultEmoji: { fontSize: 72, textAlign: "center", marginBottom: 12 },
  resultTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
  },
  resultSubtitle: {
    color: "#888",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 20,
  },
  continueBtn: {
    backgroundColor: "#FF4500",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignSelf: "center",
  },
  continueBtnText: { color: "#fff", fontSize: 15, fontWeight: "bold" },
  waitingText: { color: "#888", fontSize: 13, textAlign: "center" },
});
