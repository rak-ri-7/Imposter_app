import { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Animated,
  Alert,
  Vibration,
  Modal,
} from "react-native";
import { Group, BombGameState } from "../../../shared/types";
import {
  passBomb,
  pauseTimer,
  resumeTimer,
  getLiarHint,
  forceEndRound,
} from "../logic/game";
import BombAlleyScreen from "./BombAlleyScreen";
import MissionsButton from "./MissionsButton";

type Props = {
  group: Group;
  playerId: string;
};

export default function BombPlayScreen({ group, playerId }: Props) {
  const gameState = group.gameState as BombGameState;
  const isHost = group.hostId === playerId;
  const isHolder = gameState.currentHolderId === playerId;
  const isGhost = gameState.ghosts.includes(playerId);
  const myLives = gameState.lives[playerId] ?? 0;
  const myInstruction = gameState.instructions[playerId] ?? "";
  const myFallback = gameState.instructionFallbacks?.[playerId] ?? "";

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [passing, setPassing] = useState(false);

  const [instructionSlide, setInstructionSlide] = useState<0 | 1>(0);
  const [pulseAnim] = useState(new Animated.Value(1));
  const [shakeAnim] = useState(new Animated.Value(0));
  const [liarHint, setLiarHint] = useState<string>("");

  const [clingyRemaining, setClingyRemaining] = useState(0);
  const isClingyLocked =
    gameState.clingy?.holderId === playerId && clingyRemaining > 0;
  const lastAlertedClingyUntilRef = useRef<number | null>(null);
  const [showAlley, setShowAlley] = useState(false);

  const canSeeTimer =
    gameState.timerMode === "on" ||
    (gameState.timerMode === "mixed" && myLives > 1);

  // ── TIMER DISPLAY — purely a mirror of gameState.timerRemaining, which
  // BombFlowScreen's single authoritative tick loop keeps fresh. This
  // component never computes elapsed time or calls triggerPanic/
  // explodeBomb/syncBombTimer itself.
  useEffect(() => {
    if (gameState.phase !== "playing") return;
    setTimeLeft(gameState.timerRemaining);
  }, [gameState.phase, gameState.timerRemaining]);

  useEffect(() => {
    // Reset to the main instruction slide whenever the instruction changes
    setInstructionSlide(0);
  }, [myInstruction]);

  useEffect(() => {
    if (
      gameState.personalityEffect === "liar" &&
      isHolder &&
      gameState.correctWire
    ) {
      setLiarHint(getLiarHint(gameState.correctWire));
    }
  }, [gameState.currentHolderId, gameState.personalityEffect]);

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
        `That wasn't the right answer. The bomb will cling to you for ${gameState.clingy.penaltySeconds}s — no passing, no cutting!`,
      );
    }
  }, [gameState.clingy, playerId]);

  useEffect(() => {
    if (
      gameState.personalityEffect !== "calm" ||
      !isHost ||
      gameState.phase !== "playing" ||
      gameState.isPaused
    )
      return;
    const randomDelay = Math.random() * 8000 + 4000;
    const pauseTimeout = setTimeout(() => {
      pauseTimer(group.id);
    }, randomDelay);
    return () => clearTimeout(pauseTimeout);
  }, [
    gameState.personalityEffect,
    gameState.isPaused,
    gameState.phase,
    isHost,
  ]);

  useEffect(() => {
    if (
      gameState.personalityEffect !== "calm" ||
      !isHost ||
      gameState.phase !== "playing" ||
      !gameState.isPaused ||
      !gameState.pausedAt
    )
      return;
    const resumeDelay = Math.random() * 2000 + 2000;
    const resumeTimeout = setTimeout(() => {
      resumeTimer(
        group.id,
        gameState.pausedAt!,
        gameState.timerStartedAt,
        gameState.timerDuration,
      );
    }, resumeDelay);
    return () => clearTimeout(resumeTimeout);
  }, [
    gameState.personalityEffect,
    gameState.isPaused,
    gameState.pausedAt,
    gameState.phase,
    isHost,
  ]);

  useEffect(() => {
    if (isHolder) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.06,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isHolder]);

  useEffect(() => {
    if (isHolder) {
      Vibration.vibrate(200);
      Animated.sequence([
        Animated.timing(shakeAnim, {
          toValue: 8,
          duration: 60,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: -8,
          duration: 60,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: 8,
          duration: 60,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: 0,
          duration: 60,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [gameState.currentHolderId]);

  useEffect(() => {
    setInstructionSlide(0);
  }, [myInstruction, gameState.currentHolderId]);

  const handlePass = async (toId: string) => {
    if (!isHolder || passing) return;
    if (isClingyLocked) {
      Alert.alert(
        "Still stuck! 🔒",
        `The bomb won't leave your hands for ${Math.ceil(clingyRemaining)}s more.`,
      );
      return;
    }
    if (
      gameState.personalityEffect === "chain" &&
      gameState.chainPassed.includes(toId)
    ) {
      return Alert.alert(
        "Chain Bomb!",
        `${getPlayerName(toId)} has already had the bomb this round!`,
      );
    }
    setPassing(true);
    try {
      await passBomb(
        group,
        playerId,
        toId,
        instructionSlide === 1 && myFallback !== "",
      );
    } finally {
      setPassing(false);
    }
  };

  const getPlayerName = (id: string) =>
    group.players.find((p) => p.id === id)?.name ?? "Unknown";
  const getHolderName = () => getPlayerName(gameState.currentHolderId);

  const activePlayers = group.players.filter(
    (p) => !gameState.ghosts.includes(p.id),
  );

  const canPassTo = (pid: string) => {
    if (pid === playerId) return false;
    if (gameState.ghosts.includes(pid)) return false;
    if (
      gameState.personalityEffect === "chain" &&
      gameState.chainPassed.includes(pid)
    )
      return false;
    return true;
  };

  const renderLives = (lives: number, ghost: boolean) => {
    if (ghost) return <Text style={styles.gridGhost}>👻</Text>;
    return (
      <View style={styles.gridLivesRow}>
        {[1, 2, 3].map((i) => (
          <Text
            key={i}
            style={[styles.gridHeart, i > lives && styles.gridHeartLost]}
          >
            {i <= lives ? "❤️" : "🖤"}
          </Text>
        ))}
      </View>
    );
  };

  const handleForceEnd = () => {
    Alert.alert(
      "Force end this round?",
      "This skips straight to the replay screen. No lives will be lost or gained.",
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

  const showBombInfo = () => {
    const hasLiarTip =
      gameState.personalityEffect === "liar" && isHolder && liarHint !== "";
    Alert.alert(
      gameState.personalityName,
      gameState.personalityDescription +
        (hasLiarTip ? `\n\n🎭 Insider tip: ${liarHint}` : ""),
    );
  };

  const timerLabel =
    canSeeTimer && timeLeft !== null
      ? `${Math.ceil(timeLeft)}s`
      : gameState.timerMode === "off"
        ? "???"
        : myLives === 1
          ? "💀"
          : "???";

  return (
    <View style={styles.container}>
      {/* Slim icon row — missions + host controls only, no reserved space when unused */}
      <View style={styles.iconRow}>
        <View style={{ flex: 1 }} />
        <MissionsButton />
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => setShowAlley(true)}
        >
          <Text style={styles.iconBtnText}>🕯️</Text>
        </TouchableOpacity>
        {isHost && (
          <TouchableOpacity style={styles.iconBtn} onPress={handleForceEnd}>
            <Text style={styles.iconBtnText}>⏹</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Compact status strip — personality, round, holder, timer all in one line */}
      <TouchableOpacity
        style={styles.statusStrip}
        onPress={showBombInfo}
        activeOpacity={0.7}
      >
        <Animated.View
          style={[
            styles.bombIconWrap,
            isHolder && styles.bombIconWrapHolder,
            { transform: [{ scale: pulseAnim }, { translateX: shakeAnim }] },
          ]}
        >
          <Text style={styles.statusBombEmoji}>💣</Text>
        </Animated.View>
        <View style={styles.statusMiddle}>
          <Text style={styles.statusPersonality} numberOfLines={1}>
            {gameState.personalityEmoji} {gameState.personalityName} · Round{" "}
            {gameState.roundNumber}
          </Text>
          <Text style={styles.statusHolder} numberOfLines={1}>
            {isHolder ? "YOU HAVE THE BOMB" : `${getHolderName()} has it`}
          </Text>
        </View>
        <View style={styles.statusTimerBox}>
          <Text
            style={[
              styles.statusTimerText,
              canSeeTimer &&
                timeLeft !== null &&
                timeLeft <= 10 &&
                styles.statusTimerUrgent,
            ]}
          >
            {timerLabel}
          </Text>
          {gameState.isPaused && gameState.personalityEffect === "calm" && (
            <Text style={styles.statusPausedTag}>⏸ paused</Text>
          )}
        </View>
      </TouchableOpacity>

      {isClingyLocked && (
        <View style={styles.clingyBox}>
          <Text style={styles.clingyText}>
            🔒 Clingy Bomb! Stuck for {Math.ceil(clingyRemaining)}s
          </Text>
        </View>
      )}

      {/* Instruction — 2-slide card: main instruction, then fallback */}
      {isHolder && !isGhost && (
        <View style={styles.instructionBox}>
          <View style={styles.instructionHeader}>
            <Text style={styles.instructionLabel}>YOUR INSTRUCTION</Text>
            {myFallback !== "" && (
              <Text style={styles.instructionPage}>
                {instructionSlide === 0 ? "1/2" : "2/2"}
              </Text>
            )}
          </View>

          <Text style={styles.instructionText}>
            {instructionSlide === 0 ? myInstruction : myFallback}
          </Text>
          {instructionSlide === 1 && myFallback !== "" && (
            <Text style={styles.fallbackHint}>
              Passing from this card is logged as using the fallback.
            </Text>
          )}

          {myFallback !== "" && (
            <View style={styles.instructionNav}>
              <TouchableOpacity
                style={[
                  styles.instructionNavBtn,
                  instructionSlide === 0 && styles.instructionNavBtnDisabled,
                ]}
                onPress={() => setInstructionSlide(0)}
                disabled={instructionSlide === 0}
              >
                <Text style={styles.instructionNavText}>← Main</Text>
              </TouchableOpacity>
              <View style={styles.instructionDots}>
                <View
                  style={[
                    styles.dot,
                    instructionSlide === 0 && styles.dotActive,
                  ]}
                />
                <View
                  style={[
                    styles.dot,
                    instructionSlide === 1 && styles.dotActive,
                  ]}
                />
              </View>
              <TouchableOpacity
                style={[
                  styles.instructionNavBtn,
                  instructionSlide === 1 && styles.instructionNavBtnDisabled,
                ]}
                onPress={() => setInstructionSlide(1)}
                disabled={instructionSlide === 1}
              >
                <Text style={styles.instructionNavTextFallback}>
                  Fallback →
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {gameState.personalityEffect === "boomerang" &&
            !gameState.boomerangUsed[playerId] &&
            gameState.passHistory.length > 0 && (
              <TouchableOpacity
                style={[
                  styles.boomerangBtn,
                  isClingyLocked && styles.disabledBtn,
                ]}
                onPress={() => {
                  const lastPasser =
                    gameState.passHistory[gameState.passHistory.length - 1]
                      .from;
                  if (lastPasser) handlePass(lastPasser);
                }}
                disabled={passing || isClingyLocked}
              >
                <Text style={styles.boomerangBtnText}>
                  🪃 Pass back to{" "}
                  {group.players.find(
                    (p) =>
                      p.id ===
                      gameState.passHistory[gameState.passHistory.length - 1]
                        ?.from,
                  )?.name ?? "previous player"}
                </Text>
              </TouchableOpacity>
            )}
        </View>
      )}

      {isGhost && (
        <View style={styles.ghostBox}>
          <Text style={styles.ghostTitle}>👻 You are a Ghost</Text>
          <Text style={styles.ghostDesc}>
            Eliminated — win a ghost challenge to come back.
          </Text>
        </View>
      )}

      {/* Player grid — claims the rest of the screen */}
      <Text style={styles.sectionLabel}>
        {isHolder && !isGhost ? "TAP TO PASS" : "PLAYERS"}
      </Text>
      <FlatList
        data={isHolder && !isGhost ? activePlayers : group.players}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        style={styles.grid}
        contentContainerStyle={styles.gridContent}
        renderItem={({ item }) => {
          const isMe = item.id === playerId;
          const hasBomb = item.id === gameState.currentHolderId;
          const showAsPassable = isHolder && !isGhost;
          const blocked = showAsPassable && !canPassTo(item.id);

          return (
            <TouchableOpacity
              style={[
                styles.gridCard,
                hasBomb && styles.gridCardHasBomb,
                isMe && styles.gridCardSelf,
                blocked && !isMe && styles.gridCardBlocked,
              ]}
              onPress={() => showAsPassable && handlePass(item.id)}
              disabled={
                !showAsPassable || isMe || blocked || passing || isClingyLocked
              }
              activeOpacity={showAsPassable ? 0.6 : 1}
            >
              {blocked && !isMe && (
                <Text style={styles.gridBlockedTag}>🔗</Text>
              )}
              {hasBomb && <Text style={styles.gridBombTag}>💣</Text>}
              {hasBomb && gameState.clingy?.holderId === item.id && (
                <Text style={styles.gridClingyTag}>🔒</Text>
              )}
              <View style={styles.gridAvatar}>
                <Text style={styles.gridAvatarText}>
                  {item.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.gridName} numberOfLines={1}>
                {item.name}
                {isMe ? " (you)" : ""}
              </Text>
              {renderLives(
                gameState.lives[item.id] ?? 0,
                gameState.ghosts.includes(item.id),
              )}
            </TouchableOpacity>
          );
        }}
      />

      {/* Alley — separate full-screen overlay, own Modal, independent of Missions */}
      <Modal
        visible={showAlley}
        animationType="slide"
        onRequestClose={() => setShowAlley(false)}
      >
        <BombAlleyScreen
          group={group}
          playerId={playerId}
          onClose={() => setShowAlley(false)}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D0D0D",
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  iconBtnText: { fontSize: 15 },
  statusStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: "#333",
  },
  statusBombEmoji: { fontSize: 26 },
  statusMiddle: { flex: 1, gap: 2 },
  statusPersonality: { color: "#888", fontSize: 11, fontWeight: "600" },
  statusHolder: { color: "#FF4500", fontSize: 14, fontWeight: "700" },
  statusTimerBox: { alignItems: "flex-end" },
  statusTimerText: { color: "#fff", fontSize: 22, fontWeight: "bold" },
  statusTimerUrgent: { color: "#E63946" },
  statusPausedTag: { color: "#4FC3F7", fontSize: 10, fontStyle: "italic" },
  clingyBox: {
    backgroundColor: "#2A0A0A",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: "#FF4500",
    alignItems: "center",
  },
  clingyText: { color: "#FF4500", fontSize: 13, fontWeight: "700" },
  instructionBox: {
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#FF4500",
  },
  instructionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  instructionLabel: { color: "#FF4500", fontSize: 10, letterSpacing: 2 },
  instructionPage: { color: "#888", fontSize: 10 },
  instructionText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
  },
  instructionNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  instructionNavBtn: { paddingVertical: 4, paddingHorizontal: 6 },
  instructionNavBtnDisabled: { opacity: 0.3 },
  instructionNavText: { color: "#888", fontSize: 12, fontWeight: "600" },
  instructionNavTextFallback: {
    color: "#FFD700",
    fontSize: 12,
    fontWeight: "600",
  },
  instructionDots: { flexDirection: "row", gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#444" },
  dotActive: { backgroundColor: "#FF4500" },
  boomerangBtn: {
    backgroundColor: "#1A2A1A",
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    borderWidth: 1.5,
    borderColor: "#4CAF50",
    alignItems: "center",
  },
  boomerangBtnText: { color: "#4CAF50", fontSize: 13, fontWeight: "600" },
  disabledBtn: { opacity: 0.35 },
  ghostBox: {
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#888",
    alignItems: "center",
  },
  ghostTitle: {
    color: "#888",
    fontSize: 15,
    fontWeight: "bold",
    marginBottom: 4,
  },
  ghostDesc: {
    color: "#555",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
  },
  sectionLabel: {
    color: "#888",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 8,
  },
  grid: { flex: 1 },
  gridContent: { paddingBottom: 12 },
  gridRow: { gap: 10, marginBottom: 10 },
  gridCard: {
    flex: 1,
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  gridCardHasBomb: { borderColor: "#FF4500", backgroundColor: "#2A0A0A" },
  gridCardSelf: { opacity: 0.45 },
  gridCardBlocked: { opacity: 0.35 },
  gridAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#2A2A2A",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  gridAvatarText: { color: "#fff", fontSize: 17, fontWeight: "bold" },
  gridName: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4,
    maxWidth: "90%",
  },
  gridLivesRow: { flexDirection: "row", gap: 2 },
  gridHeart: { fontSize: 11 },
  gridHeartLost: { opacity: 0.3 },
  gridGhost: { fontSize: 16 },
  gridBombTag: { position: "absolute", top: 6, right: 8, fontSize: 14 },
  gridClingyTag: { position: "absolute", top: 6, left: 8, fontSize: 12 },
  gridBlockedTag: { position: "absolute", top: 6, right: 8, fontSize: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#161616",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    gap: 10,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "bold",
    marginBottom: 4,
  },
  missionItem: {
    backgroundColor: "#2A2A2A",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#333",
  },
  missionItemDone: { borderColor: "#4CAF50", backgroundColor: "#0A1E0A" },
  missionText: { color: "#fff", fontSize: 13, lineHeight: 18, marginBottom: 6 },
  missionDone: { color: "#4CAF50", fontSize: 12, fontWeight: "600" },
  confirmBtn: {
    backgroundColor: "#4CAF50",
    borderRadius: 8,
    padding: 8,
    alignItems: "center",
  },
  confirmBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  modalCloseBtn: {
    marginTop: 6,
    backgroundColor: "#1A1A1A",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  modalCloseBtnText: { color: "#888", fontSize: 14, fontWeight: "600" },

  bombIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0D0D0D",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#333",
  },
  bombIconWrapHolder: {
    borderColor: "#FF4500",
    backgroundColor: "#2A0A0A",
  },

  fallbackHint: {
    color: "#888",
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 6,
  },
});
