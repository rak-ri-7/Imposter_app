import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Vibration,
  ScrollView,
  Alert,
} from "react-native";
import { Group, BombGameState } from "../../../shared/types";
import {
  lockInWire,
  resolvePanicOutcome,
  startPanicCountdown,
  endGhostWindow,
  passBomb,
  syncBombTimer,
  forceEndRound,
  placeBet,
  declineBet,
} from "../logic/game";
import {
  playSound,
  pickPanicStartSound,
  pickGhostPresenceSound,
  stopSound,
} from "../../../shared/sounds/soundManager";

type Props = {
  group: Group;
  playerId: string;
};

const GHOST_WINDOW_MAX_MS = 5000;
const GHOST_WINDOW_MIN_MS = 3000;
const GONE_AWAY_DISPLAY_MS = 1500;

function TypewriterText({ text, style }: { text: string; style?: any }) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    setShown("");
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(interval);
    }, 25);
    return () => clearInterval(interval);
  }, [text]);
  return <Text style={style}>{shown}</Text>;
}

export default function BombPanicScreen({ group, playerId }: Props) {
  const gameState = group.gameState as BombGameState;
  const isHolder = gameState.currentHolderId === playerId;
  const isHost = group.hostId === playerId;
  const isGhost = gameState.ghosts.includes(playerId);
  const [locking, setLocking] = useState(false);
  const [passing, setPassing] = useState(false);
  const [betting, setBetting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(5);
  const lastSyncedSecondRef = useRef<number | null>(null);
  const [flashAnim] = useState(new Animated.Value(0));
  const holderName =
    group.players.find((p) => p.id === gameState.currentHolderId)?.name ??
    "Someone";

  const [clingyRemaining, setClingyRemaining] = useState(0);
  const isClingyLocked =
    gameState.clingy?.holderId === playerId && clingyRemaining > 0;
  const lastAlertedClingyUntilRef = useRef<number | null>(null);

  // ── GHOST WINDOW STATE ──────────────────────────────────────────
  const ghostWindowActive =
    !!gameState.ghostWindowEndsAt && Date.now() < gameState.ghostWindowEndsAt;
  const [ghostWindowRemaining, setGhostWindowRemaining] = useState(0);
  const countdownStartedRef = useRef(false);
  const goneAwayStartedRef = useRef(false);
  const myBet = gameState.activeBets?.[playerId];
  const myBettingTickets = gameState.bettingTickets?.[playerId] ?? 0;
  const myResponded = (gameState.ghostResponded ?? []).includes(playerId);
  const acceptedGhostCount = Object.keys(gameState.activeBets ?? {}).length;

  // "Gone away" / bet-confirmation beat — true only in the real gap
  // between the ghost window ending and the actual 5s countdown
  // starting. Driven by both fields being absent, not a local timer, so
  // it's genuinely in sync across every device rather than an
  // approximation that could drift from what the host is actually doing.
  const showGoneAway =
    !gameState.ghostWindowEndsAt && !gameState.panicStartedAt;

  const activePlayers = group.players.filter(
    (player) => !gameState.ghosts.includes(player.id),
  );
  const canPassTo = (id: string) =>
    id !== playerId &&
    !gameState.ghosts.includes(id) &&
    !(
      gameState.personalityEffect === "chain" &&
      gameState.chainPassed.includes(id)
    );

  // ── Ghost window countdown display, everyone — display only, no
  // side effects here. Ending the window and starting the real
  // countdown are both handled by separate host-only effects below. ───
  useEffect(() => {
    if (!gameState.ghostWindowEndsAt) {
      setGhostWindowRemaining(0);
      return;
    }
    const endsAt = gameState.ghostWindowEndsAt;
    const tick = () => {
      setGhostWindowRemaining(Math.max(0, (endsAt - Date.now()) / 1000));
    };
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [gameState.ghostWindowEndsAt]);

  // ── Host-only: end the ghost window — early (floor) once every
  // eligible ghost has responded, otherwise at the full cap. ───────────
  useEffect(() => {
    if (!isHost || !gameState.ghostWindowEndsAt) {
      countdownStartedRef.current = false;
      return;
    }
    const endsAt = gameState.ghostWindowEndsAt;
    const floorAt = endsAt - (GHOST_WINDOW_MAX_MS - GHOST_WINDOW_MIN_MS);

    const eligibleGhostIds = group.players
      .filter(
        (p) =>
          gameState.ghosts.includes(p.id) &&
          (gameState.bettingTickets?.[p.id] ?? 0) > 0,
      )
      .map((p) => p.id);
    const responded = gameState.ghostResponded ?? [];
    const allResponded = eligibleGhostIds.every((id) => responded.includes(id));

    const tryEnd = () => {
      if (countdownStartedRef.current) return;
      countdownStartedRef.current = true;
      endGhostWindow(group.id);
    };

    const target = allResponded ? floorAt : endsAt;
    const msLeft = Math.max(0, target - Date.now());
    const timeout = setTimeout(tryEnd, msLeft);
    return () => clearTimeout(timeout);
  }, [
    isHost,
    gameState.ghostWindowEndsAt,
    gameState.ghostResponded,
    gameState.ghosts,
    gameState.bettingTickets,
    group.id,
    group.players,
  ]);

  // ── Host-only: once the ghost window has ended (gone) but before the
  // real countdown has begun, wait out a guaranteed display window for
  // "gone away" / bet-confirmation, THEN start the real 5s countdown.
  // This is deliberately a separate step and a separate write from
  // ending the window — doing both in one write would mean the real
  // clock is secretly already running while the message is showing,
  // silently eating into the holder's 5 seconds. ───────────────────────
  useEffect(() => {
    if (!isHost) return;
    if (gameState.ghostWindowEndsAt) {
      goneAwayStartedRef.current = false;
      return;
    }
    if (gameState.panicStartedAt) return; // real countdown already running
    if (goneAwayStartedRef.current) return;
    goneAwayStartedRef.current = true;
    const timeout = setTimeout(
      () => startPanicCountdown(group.id),
      GONE_AWAY_DISPLAY_MS,
    );
    return () => clearTimeout(timeout);
  }, [isHost, gameState.ghostWindowEndsAt, gameState.panicStartedAt, group.id]);

  // True only once the real 5s countdown is running (ghost window over).
  const countdownRunning =
    !gameState.ghostWindowEndsAt && !!gameState.panicStartedAt;

  // ── Flash — every player, one loop for the whole countdown. Keyed on
  // countdownRunning (not panicStartedAt), so passes during panic don't
  // stack extra loops on the same value. Stopped on unmount. ───────────
  useEffect(() => {
    if (!countdownRunning) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flashAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false, // backgroundColor can't use the native driver
        }),
        Animated.timing(flashAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      flashAnim.setValue(0);
    };
  }, [countdownRunning]);

  // ── Buzz — every player, once per countdown start (including the fresh
  // 5s after each pass). Cancelled if the screen leaves mid-buzz. ──────
  useEffect(() => {
    if (!countdownRunning) return;
    Vibration.vibrate([200, 100, 200, 100, 200]);
    return () => Vibration.cancel();
  }, [gameState.panicStartedAt, countdownRunning]);

  // ── Host-only: drive the 5s countdown and resolve when it ends. ───────
  useEffect(() => {
    if (!isHost || !countdownRunning) return;

    const startedAt = gameState.panicStartedAt!;
    const remainingMs = Math.max(0, 5000 - (Date.now() - startedAt));

    const updateCountdown = () => {
      const remaining = Math.max(0, 5 - (Date.now() - startedAt) / 1000);
      setTimeLeft(remaining);
      const displayedSecond = Math.ceil(remaining);
      if (lastSyncedSecondRef.current !== displayedSecond) {
        lastSyncedSecondRef.current = displayedSecond;
        void syncBombTimer(group.id, displayedSecond);
      }
    };

    updateCountdown();
    const countdown = setInterval(updateCountdown, 100);
    const timeout = setTimeout(() => {
      resolvePanicOutcome(group);
    }, remainingMs);

    return () => {
      clearInterval(countdown);
      clearTimeout(timeout);
    };
  }, [isHost, countdownRunning, gameState.panicStartedAt, group.id]);

  useEffect(() => {
    if (isHost) return;
    setTimeLeft(gameState.timerRemaining);
  }, [gameState.timerRemaining, isHost]);

  useEffect(() => {
    if (!gameState.clingy || gameState.clingy.holderId !== playerId) {
      setClingyRemaining(0);
      return;
    }
    const clingyTick = () => {
      const remaining = Math.max(
        0,
        (gameState.clingy!.until - Date.now()) / 1000,
      );
      setClingyRemaining(remaining);
    };
    clingyTick();
    const interval = setInterval(clingyTick, 100);
    return () => clearInterval(interval);
  }, [gameState.clingy]);

  useEffect(() => {
    if (
      gameState.clingy &&
      gameState.clingy.holderId === playerId &&
      lastAlertedClingyUntilRef.current !== gameState.clingy.until
    ) {
      lastAlertedClingyUntilRef.current = gameState.clingy.until;
      Alert.alert(
        "Oh no, Clingy Bomb! 🔒",
        `Wrong guess — the bomb clings to you for ${gameState.clingy.penaltySeconds}s. No passing, no cutting, even now!`,
      );
    }
  }, [gameState.clingy, playerId]);

  useEffect(() => {
    if (gameState.ghostWindowEndsAt) playSound(pickGhostPresenceSound());
  }, [gameState.ghostWindowEndsAt]);

  useEffect(() => {
    if (!gameState.panicStartedAt || !isHolder) return;
    playSound(pickPanicStartSound());
    return () => {
      stopSound("panic-start1");
      stopSound("panic-start2");
    };
  }, [gameState.panicStartedAt, isHolder]);
  const prevAcceptedCountRef = useRef(0);
  useEffect(() => {
    if (acceptedGhostCount > prevAcceptedCountRef.current)
      playSound("ghost-bet-placed");
    prevAcceptedCountRef.current = acceptedGhostCount;
  }, [acceptedGhostCount]);

  const handleLockIn = async (wire: "red" | "blue") => {
    if (!isHolder || locking || gameState.wireChoice) return;
    if (isClingyLocked) {
      Alert.alert(
        "Still stuck! 🔒",
        `The bomb won't let you commit for ${Math.ceil(clingyRemaining)}s more.`,
      );
      return;
    }
    setLocking(true);
    try {
      const result = await lockInWire(group, playerId, wire);
      if (!result.blocked) playSound("wire-lock-in");
      if (result.blocked) {
        Alert.alert(
          "Still stuck! 🔒",
          "The bomb is clingy — try again in a moment.",
        );
      }
    } finally {
      setLocking(false);
    }
  };

  const handlePass = async (toId: string) => {
    if (!isHolder || passing || gameState.wireChoice || !canPassTo(toId))
      return;
    if (isClingyLocked) {
      Alert.alert(
        "Still stuck! 🔒",
        `The bomb won't leave your hands for ${Math.ceil(clingyRemaining)}s more.`,
      );
      return;
    }
    setPassing(true);
    try {
      await passBomb(group, playerId, toId);
    } finally {
      setPassing(false);
    }
  };

  const handleBet = async (wire: "red" | "blue") => {
    if (betting || myBet || myResponded) return;
    setBetting(true);
    try {
      const result = await placeBet(group, playerId, wire);
      if (!result.success && result.reason !== "window-closed") {
        Alert.alert("Couldn't place bet", "Try again quickly!");
      }
    } finally {
      setBetting(false);
    }
  };

  const handleDecline = () => {
    if (myResponded || myBet) return;
    declineBet(group, playerId);
  };

  const showBombInfo = () => {
    Alert.alert(gameState.personalityName, gameState.personalityDescription);
  };

  const handleForceEnd = () => {
    Alert.alert(
      "Force end this round?",
      "This skips straight to the replay screen. No lives will be lost or gained — you can start the next round right after.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End Round",
          style: "destructive",
          onPress: () => forceEndRound(group),
        },
      ],
    );
  };

  const lockedWire = gameState.wireChoice;
  const getDialogContent = (): {
    title: string;
    subtitle: string;
    showBet: boolean;
  } => {
    if (showGoneAway) {
      const myBetNow = gameState.activeBets?.[playerId];
      if (isGhost && myBetNow) {
        return {
          title: "Bet placed 👻",
          subtitle: `You guessed ${myBetNow.guessedWire === "red" ? "🔴 RED" : "🔵 BLUE"}. Let's see what happens...`,
          showBet: false,
        };
      }
      return { title: "Oh... it's gone away.", subtitle: "", showBet: false };
    }
    if (isGhost && myBettingTickets > 0 && !myResponded) {
      return {
        title: "A spectral shadow looms nearby...",
        subtitle: `Bet a ticket on which wire is actually safe. Guess right, and if ${holderName} guesses wrong, you can challenge your way back in.`,
        showBet: true,
      };
    }
    if (isGhost && myBet) {
      return {
        title: "Bet placed 👻",
        subtitle: `You guessed ${myBet.guessedWire === "red" ? "🔴 RED" : "🔵 BLUE"}. Let's see what happens...`,
        showBet: false,
      };
    }
    if (isGhost && myResponded) {
      return {
        title: "Alright, sitting this one out 👻",
        subtitle:
          acceptedGhostCount > 0
            ? acceptedGhostCount === 1
              ? "One other spirit couldn't resist, though..."
              : `${acceptedGhostCount} other spirits are circling...`
            : "No ticket spent — maybe next time.",
        showBet: false,
      };
    }
    if (isHolder) {
      if (acceptedGhostCount === 0)
        return {
          title: "A spectral shadow looms nearby you...",
          subtitle: "let's see what it wants.",
          showBet: false,
        };
      if (acceptedGhostCount === 1)
        return {
          title: "A hungry shadow has taken interest in you...",
          subtitle: "it wants a part of your soul. 👻",
          showBet: false,
        };
      return {
        title: "Several shadows have smelled blood...",
        subtitle: "they're circling you now. 👻👻👻",
        showBet: false,
      };
    }
    if (acceptedGhostCount === 0)
      return {
        title: "Something stirs...",
        subtitle: "The shadows are restless tonight.",
        showBet: false,
      };
    if (acceptedGhostCount === 1)
      return {
        title: "One spirit made its move...",
        subtitle: "couldn't resist the temptation.",
        showBet: false,
      };
    return {
      title: "A gaggle of ghosts joined in...",
      subtitle: "the shadows are getting crowded.",
      showBet: false,
    };
  };

  const dialogVisible = ghostWindowActive || showGoneAway;
  const dialog = dialogVisible ? getDialogContent() : null;
  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: flashAnim.interpolate({
            inputRange: [0, 1],
            outputRange: ["#0D0D0D", "#2A0000"],
          }),
        },
      ]}
    >
      {/* Compact header — much smaller footprint than before */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.warning}>⚠️ FUSE CRITICAL</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {isHolder
              ? lockedWire
                ? "Locked in — holding our breath..."
                : gameState.panicStartedAt
                  ? "Make your move!"
                  : "Hold tight..."
              : `${holderName} is deciding...`}
          </Text>
        </View>
        <Text style={[styles.timer, timeLeft <= 2 && styles.timerUrgent]}>
          {gameState.panicStartedAt ? `${Math.ceil(timeLeft)}s` : "⏳"}
        </Text>
        {isHost && (
          <TouchableOpacity style={styles.iconBtn} onPress={handleForceEnd}>
            <Text style={styles.iconBtnText}>⏹</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.iconBtn} onPress={showBombInfo}>
          <Text style={styles.iconBtnText}>ℹ️</Text>
        </TouchableOpacity>
      </View>

      {isClingyLocked && (
        <View style={styles.clingyBox}>
          <Text style={styles.clingyText}>
            🔒 Clingy Bomb! Stuck for {Math.ceil(clingyRemaining)}s
          </Text>
        </View>
      )}

      {isHolder ? (
        <>
          {/* Instruction — compact, single line-ish, not a huge block */}
          <View style={styles.instructionBox}>
            <Text style={styles.instructionText} numberOfLines={2}>
              {gameState.instructions[playerId] ?? "Pass the bomb quickly!"}
            </Text>
          </View>

          {!gameState.panicStartedAt ? (
            <View style={styles.waitingBox}>
              <Text style={styles.waitingText}>Hold tight...</Text>
            </View>
          ) : lockedWire ? (
            <View style={styles.lockedInBox}>
              <Text style={styles.lockedInEmoji}>
                {lockedWire === "red" ? "🔴" : "🔵"}
              </Text>
              <Text style={styles.lockedInText}>
                Locked in {lockedWire === "red" ? "RED" : "BLUE"} — no take
                backs. Waiting for the clock...
              </Text>
            </View>
          ) : (
            <>
              {/* Equal-priority split: pass list left, wires right */}
              <View style={styles.actionSplit}>
                <View style={styles.passColumn}>
                  <Text style={styles.actionLabel}>PASS TO</Text>
                  <ScrollView
                    style={styles.passList}
                    contentContainerStyle={styles.passListContent}
                    showsVerticalScrollIndicator={false}
                  >
                    {activePlayers
                      .filter((player) => player.id !== playerId)
                      .map((player) => {
                        const blocked = !canPassTo(player.id);
                        return (
                          <TouchableOpacity
                            key={player.id}
                            style={[
                              styles.passBtn,
                              (blocked || isClingyLocked) &&
                                styles.passBtnDisabled,
                            ]}
                            onPress={() => handlePass(player.id)}
                            disabled={blocked || passing || isClingyLocked}
                          >
                            <Text style={styles.passBtnText} numberOfLines={1}>
                              {player.name}
                              {blocked ? " 🔗" : ""}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                  </ScrollView>
                </View>

                <View style={styles.wireColumn}>
                  <Text style={styles.actionLabel}>CUT A WIRE</Text>
                  <View style={styles.wireStack}>
                    <TouchableOpacity
                      style={[
                        styles.wire,
                        styles.wireRed,
                        isClingyLocked && styles.wireDisabled,
                      ]}
                      onPress={() => handleLockIn("red")}
                      disabled={locking || isClingyLocked}
                    >
                      <Text style={styles.wireText}>🔴</Text>
                      <Text style={styles.wireLabelText}>RED</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.wire,
                        styles.wireBlue,
                        isClingyLocked && styles.wireDisabled,
                      ]}
                      onPress={() => handleLockIn("blue")}
                      disabled={locking || isClingyLocked}
                    >
                      <Text style={styles.wireText}>🔵</Text>
                      <Text style={styles.wireLabelText}>BLUE</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <Text style={styles.panicHint}>
                {isClingyLocked
                  ? "The clock is still running — you're just stuck holding it."
                  : "Locking in a wire doesn't reveal the outcome until the clock runs out."}
              </Text>
            </>
          )}
        </>
      ) : (
        <View style={styles.watcherBox}>
          {gameState.personalityEffect === "liar" && (
            <Text style={styles.liarWarning}>
              🎭 The lying stops here — these last 5 seconds are real.
            </Text>
          )}
          <Text style={styles.watchingEmoji}>👀</Text>
          <Text style={styles.watcherSubtitle}>
            {lockedWire
              ? `${holderName} locked in a wire. Hold your breath...`
              : gameState.panicStartedAt
                ? "Hold your breath..."
                : "Hold tight..."}
          </Text>
        </View>
      )}

      {dialog && (
        <View style={styles.bottomDialog}>
          <Text style={styles.dialogIcon}>👻</Text>
          <View style={styles.dialogTextArea}>
            <TypewriterText text={dialog.title} style={styles.dialogTitle} />
            {dialog.subtitle !== "" && (
              <TypewriterText
                text={dialog.subtitle}
                style={styles.dialogSubtitle}
              />
            )}
            {dialog.showBet && (
              <View style={styles.dialogBetRow}>
                <TouchableOpacity
                  style={styles.dialogBetBtnRed}
                  onPress={() => handleBet("red")}
                  disabled={betting}
                >
                  <Text style={styles.dialogBetBtnText}>🔴 Bet Red</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dialogBetBtnBlue}
                  onPress={() => handleBet("blue")}
                  disabled={betting}
                >
                  <Text style={styles.dialogBetBtnText}>🔵 Bet Blue</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dialogDeclineBtn}
                  onPress={handleDecline}
                >
                  <Text style={styles.dialogDeclineBtnText}>✋</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          {ghostWindowActive && (
            <Text style={styles.dialogTimer}>
              {ghostWindowRemaining.toFixed(1)}s
            </Text>
          )}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    paddingTop: 50,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  headerLeft: { flex: 1 },
  warning: {
    color: "#FF4500",
    fontSize: 15,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  headerSub: {
    color: "#888",
    fontSize: 11,
    marginTop: 1,
  },
  timer: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "bold",
  },
  timerUrgent: { color: "#FF0000" },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#2A2A2A",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnText: { fontSize: 13 },

  clingyBox: {
    backgroundColor: "#2A0A0A",
    borderRadius: 10,
    padding: 8,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: "#FF4500",
    alignItems: "center",
  },
  clingyText: {
    color: "#FF4500",
    fontSize: 13,
    fontWeight: "700",
  },

  instructionBox: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FF4500",
    padding: 10,
    marginBottom: 8,
  },
  instructionText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19,
  },

  lockedInBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  lockedInEmoji: { fontSize: 64 },
  lockedInText: {
    color: "#FFD700",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
    paddingHorizontal: 20,
  },

  // Equal-priority split — this is the core layout change
  actionSplit: {
    flex: 1,
    flexDirection: "row",
    gap: 10,
  },
  passColumn: {
    flex: 1,
  },
  wireColumn: {
    flex: 1,
  },
  actionLabel: {
    color: "#aaa",
    fontSize: 11,
    fontWeight: "bold",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  passList: { flex: 1 },
  passListContent: { gap: 8 },
  passBtn: {
    backgroundColor: "#1A1A1A",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#555",
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  passBtnDisabled: { opacity: 0.35 },
  passBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },

  wireStack: {
    flex: 1,
    gap: 10,
    justifyContent: "flex-start",
  },
  wire: {
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    paddingVertical: 18,
    elevation: 6,
  },
  wireDisabled: { opacity: 0.3 },
  wireRed: {
    backgroundColor: "#3A0000",
    borderColor: "#FF0000",
    shadowColor: "#FF0000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  wireBlue: {
    backgroundColor: "#00003A",
    borderColor: "#0000FF",
    shadowColor: "#0000FF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  wireText: { fontSize: 30, marginBottom: 2 },
  wireLabelText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 1,
  },

  panicHint: {
    color: "#555",
    fontSize: 11,
    textAlign: "center",
    fontStyle: "italic",
    marginTop: 10,
  },

  watcherBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  liarWarning: {
    color: "#9B59B6",
    fontSize: 13,
    textAlign: "center",
    fontStyle: "italic",
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  watchingEmoji: { fontSize: 64, marginBottom: 12 },
  watcherSubtitle: { color: "#888", fontSize: 14, textAlign: "center" },

  // ── Ghost window styles ──────────────────────────────────────────
  waitingBox: { flex: 1, alignItems: "center", justifyContent: "center" },
  waitingText: { color: "#555", fontSize: 14, fontStyle: "italic" },

  bottomDialog: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(10,10,10,0.95)",
    borderTopWidth: 2,
    borderColor: "#333",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 14,
    paddingBottom: 24,
    gap: 10,
  },
  dialogIcon: { fontSize: 28 },
  dialogTextArea: { flex: 1 },
  dialogTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 2,
  },
  dialogSubtitle: { color: "#aaa", fontSize: 12, lineHeight: 17 },
  dialogTimer: { color: "#555", fontSize: 11, fontWeight: "600" },
  dialogBetRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  dialogBetBtnRed: {
    backgroundColor: "#3A0000",
    borderWidth: 1,
    borderColor: "#FF0000",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  dialogBetBtnBlue: {
    backgroundColor: "#00003A",
    borderWidth: 1,
    borderColor: "#0000FF",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  dialogBetBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  dialogDeclineBtn: { padding: 8 },
  dialogDeclineBtnText: { fontSize: 16, opacity: 0.5 },
  ghostTimer: {
    color: "#888",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 20,
  },
  ghostTitle: {
    color: "#fff",
    fontSize: 19,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  ghostSubtitle: {
    color: "#888",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  ghostHint: {
    color: "#555",
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 18,
    textAlign: "center",
  },
  betWireContainer: { flexDirection: "row", gap: 20 },
  betWire: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
  },
  betWireRed: { backgroundColor: "#3A0000", borderColor: "#FF0000" },
  betWireBlue: { backgroundColor: "#00003A", borderColor: "#0000FF" },
  betWireText: { fontSize: 26, marginBottom: 2 },
  betWireLabelText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  declineBtn: { marginTop: 16, padding: 10 },
  declineBtnText: { color: "#555", fontSize: 12, fontStyle: "italic" },
});
