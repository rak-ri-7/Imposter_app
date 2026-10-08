import { useEffect, useState, useRef } from "react";
import {
  BackHandler,
  Alert,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../../../../App";
import { useGroup } from "../../../shared/hooks/useGroup";
import { BombGameState } from "../../../shared/types";
import BombLobbyScreen from "../screens/BombLobbyScreen";
import BombPlayScreen from "../screens/BombPlayScreen";
import BombPanicScreen from "../screens/BombPanicScreen";
import BombExplodedScreen from "../screens/BombExplodedScreen";
import BombReplayScreen from "../screens/BombReplayScreen";
import BombResultScreen from "../screens/BombResultScreen";
import BombDuelIntroScreen from "../screens/BombDuelIntroScreen";
import BombPenaltyScreen from "../screens/BombPenaltyScreen";
import { returnToMenu } from "../../../shared/firebase/groups";
import BombFastestFingerScreen from "../screens/FastestFingerScreen";
import BombDuelFastestFingerScreen from "../screens/BombDuelFastestFingerScreen";
import BombGhostTournamentScreen from "../screens/BombGhostTournamentScreen";
import BombHotPotatoScreen from "../screens/BombHotPotatoScreen";
import {
  triggerPanic,
  endPersonalityReveal,
  resumeTimer,
  PANIC_THRESHOLD,
  FAILSAFE_GRACE_MS,
  FAILSAFE_RETRY_MS,
} from "../logic/game";
import BombTbcDuelScreen from "../screens/BombTbcDuelScreen";
import BombHotSeatDuelScreen from "../screens/BombHotSeatDuelScreen";
import BombPersonalityRevealScreen from "../screens/BombPersonalityRevealScreen";
import {
  preloadSounds,
  unloadSounds,
} from "../../../shared/sounds/soundManager";
import { useMissionAlerts } from "../logic/useMissionAlerts";
import BombMissionsModal from "../screens/BombMissionsModal";
import BombMissionClaimBar from "../screens/BombMissionClaimBar";
import { MissionsContext } from "./MissionsButton";
import { useHostFailover } from "../../../shared/hooks/useHostFailover";

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, "BombFlow">;
  route: RouteProp<RootStackParamList, "BombFlow">;
};

export default function BombFlowScreen({ navigation, route }: Props) {
  const { groupId, playerId } = route.params;
  const { group, loading } = useGroup(groupId);
  const [endingGame, setEndingGame] = useState(false);
  const timerRef = useRef<any>(null);
  const groupRef = useRef(group);
  useEffect(() => {
    groupRef.current = group;
  }, [group]);

  // Computed unconditionally, BEFORE any hook that depends on them — safe
  // even while `group` is still loading (optional chaining), since hooks
  // must run in the same order every render and can't be declared after
  // an early return. This is what was missing before: `gameState`/`phase`
  // were declared further down the function (after the early returns),
  // which made referencing them inside the effect above a temporal-dead-
  // zone crash, and `isHost` wasn't declared anywhere at all.
  const gameState = group?.gameState as BombGameState | undefined;
  const phase = gameState?.phase;
  // "The jury has spoken" — shown on every phone for a moment when a
  // callout reaches a guilty verdict and the game moves to the penalty.
  const [verdictFor, setVerdictFor] = useState<string | null>(null);
  const prevPhaseRef = useRef(phase);
  const isHost = group?.hostId === playerId;
  useHostFailover(group, playerId);

  // ── Missions: one global button, one modal, one change-detector ──────
  const [showMissions, setShowMissions] = useState(false);
  const myMissions = gameState?.missions?.[playerId];
  const { unseen, flashKey, toast, markSeen } = useMissionAlerts(myMissions);

  // One confirmation for both the on-screen button and Android's back
  // button. The ref stops repeated back presses stacking several alerts.
  const leaveAlertOpenRef = useRef(false);

  const confirmLeave = () => {
    if (!group || endingGame || leaveAlertOpenRef.current) return;
    leaveAlertOpenRef.current = true;
    Alert.alert(
      "Leave game?",
      "This will end Pass the Bomb and return everyone to the Game Menu.",
      [
        {
          text: "Stay",
          style: "cancel",
          onPress: () => {
            leaveAlertOpenRef.current = false;
          },
        },
        {
          text: "Leave Game",
          style: "destructive",
          onPress: async () => {
            leaveAlertOpenRef.current = false;
            setEndingGame(true);
            try {
              await returnToMenu(group.id);
            } finally {
              setEndingGame(false);
            }
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          leaveAlertOpenRef.current = false;
        },
      },
    );
  };

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (
      prev === "replay" &&
      phase === "penalty" &&
      gameState?.penaltyPlayerId
    ) {
      setVerdictFor(gameState.penaltyPlayerId);
      const t = setTimeout(() => setVerdictFor(null), 2500);
      return () => clearTimeout(t);
    }
  }, [phase]);

  useEffect(() => {
    if (showMissions) markSeen();
  }, [showMissions, flashKey]);

  const missionsUi = {
    available: !!myMissions,
    unseen,
    flashKey,
    open: () => setShowMissions(true),
  };

  useEffect(() => {
    if (group?.currentGame === "menu") {
      navigation.replace("GameMenu", { groupId, playerId });
    }
  }, [group?.currentGame]);

  useEffect(() => {
    if (!group) return;

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        confirmLeave();
        return true; // always handled — never let Android pop the screen silently
      },
    );

    return () => backHandler.remove();
  }, [endingGame, group?.id]);

  // Reveal → playing. Host acts on time; everyone else is a backup.
  useEffect(() => {
    if (!group || !gameState?.revealEndsAt) return;
    const fireAt = gameState.revealEndsAt + (isHost ? 0 : FAILSAFE_GRACE_MS);
    let lastAttempt = 0;
    const check = () => {
      const now = Date.now();
      if (now < fireAt || now - lastAttempt < FAILSAFE_RETRY_MS) return;
      lastAttempt = now;
      endPersonalityReveal(group.id);
    };
    check();
    const interval = setInterval(check, 250);
    return () => clearInterval(interval);
  }, [isHost, group?.id, gameState?.revealEndsAt]);

  // ── Single authoritative timer loop for the whole app ─────────────
  // Lives here (not in BombPlayScreen) specifically because this
  // component is the only one guaranteed mounted for the ENTIRE
  // "playing" phase, regardless of which child screen (normal pass UI
  // vs. Fastest Finger quiz) is currently showing. Do not duplicate this
  // effect inside BombPlayScreen — two independent tickers risk
  // explodeBomb() firing twice for the same bomb.
  useEffect(() => {
    if (!group || !gameState || phase !== "playing") return;

    let lastAttempt = 0;

    const tick = () => {
      const currentGroup = groupRef.current;
      if (!currentGroup) return;
      if (gameState.isPaused) return;

      const now = Date.now();

      // Real-time moment the timer hits the panic threshold.
      const panicAt =
        gameState.timerStartedAt +
        ((gameState.timerDuration - PANIC_THRESHOLD) /
          gameState.speedMultiplier) *
          1000;
      const fireAt = panicAt + (isHost ? 0 : FAILSAFE_GRACE_MS);

      if (now >= fireAt && now - lastAttempt >= FAILSAFE_RETRY_MS) {
        lastAttempt = now;
        triggerPanic(currentGroup.id);
      }
    };

    tick();
    timerRef.current = setInterval(tick, 100);
    return () => clearInterval(timerRef.current);
  }, [
    group?.id,
    phase,
    isHost,
    gameState?.timerStartedAt,
    gameState?.timerDuration,
    gameState?.speedMultiplier,
    gameState?.isPaused,
  ]);

  // ── Calm bomb resume: host on time, every other phone as backup ─────
  // The resume time was decided when the pause started, so every phone
  // knows when it's due. resumeTimer is guarded, so extra calls are harmless.
  useEffect(() => {
    if (!group || phase !== "playing") return;
    if (!gameState?.isPaused || !gameState.pauseResumeAt) return;

    const fireAt = gameState.pauseResumeAt + (isHost ? 0 : FAILSAFE_GRACE_MS);
    let lastAttempt = 0;
    const check = () => {
      const now = Date.now();
      if (now < fireAt || now - lastAttempt < FAILSAFE_RETRY_MS) return;
      lastAttempt = now;
      resumeTimer(group.id);
    };
    check();
    const interval = setInterval(check, 250);
    return () => clearInterval(interval);
  }, [isHost, group?.id, phase, gameState?.isPaused, gameState?.pauseResumeAt]);

  useEffect(() => {
    preloadSounds();
    return () => unloadSounds();
  }, []);

  if (loading || !group) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (group.currentGame === "menu") return null;

  let content;

  if (!phase || phase === "lobby") {
    content = <BombLobbyScreen group={group} playerId={playerId} />;
  } else if (phase === "reveal") {
    content = <BombPersonalityRevealScreen group={group} playerId={playerId} />;
  } else if (phase === "playing") {
    content =
      gameState!.activeQuiz ||
      (gameState!.personalityEffect === "quiz" &&
        !gameState!.fffAwaitingManualPass) ? (
        <BombFastestFingerScreen group={group} playerId={playerId} />
      ) : (
        <BombPlayScreen group={group} playerId={playerId} />
      );
  } else if (phase === "panic") {
    content = <BombPanicScreen group={group} playerId={playerId} />;
  } else if (phase === "exploded") {
    content = <BombExplodedScreen group={group} playerId={playerId} />;
  } else if (phase === "replay") {
    content = <BombReplayScreen group={group} playerId={playerId} />;
  } else if (phase === "result") {
    content = <BombResultScreen group={group} playerId={playerId} />;
  } else if (phase === "duel-intro") {
    content = <BombDuelIntroScreen group={group} playerId={playerId} />;
  } else if (phase === "penalty") {
    content = gameState!.tbcChallenge ? (
      <BombTbcDuelScreen group={group} playerId={playerId} />
    ) : (
      <BombPenaltyScreen group={group} playerId={playerId} />
    );
  } else if (phase === "duel") {
    content =
      gameState!.duelMode === "fastest-finger" ? (
        <BombDuelFastestFingerScreen group={group} playerId={playerId} />
      ) : gameState!.duelMode === "hot-seat" ? (
        <BombHotSeatDuelScreen group={group} playerId={playerId} />
      ) : (
        <BombHotPotatoScreen group={group} playerId={playerId} />
      );
  } else if (phase === "ghost-tournament") {
    content = <BombGhostTournamentScreen group={group} playerId={playerId} />;
  } else {
    return null;
  }

  return (
    <MissionsContext.Provider value={missionsUi}>
      <View style={styles.flowContainer}>
        {phase !== "result" && (
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.backToMenuBtn}
              disabled={endingGame}
              onPress={confirmLeave}
            >
              <Text style={styles.backToMenuText}>
                {endingGame ? "Leaving game..." : "← Leave Game"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.gameContent}>{content}</View>

        {myMissions && phase !== "panic" && (
          <BombMissionClaimBar group={group} playerId={playerId} />
        )}

        {toast && (
          <View pointerEvents="none" style={styles.toast}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}

        {verdictFor && (
          <View pointerEvents="none" style={styles.verdictOverlay}>
            <Text style={styles.verdictEmoji}>⚖️</Text>
            <Text style={styles.verdictTitle}>The jury has spoken</Text>
            <Text style={styles.verdictSub}>
              {verdictFor === playerId
                ? "You've been found guilty."
                : `${group.players.find((p) => p.id === verdictFor)?.name ?? "Someone"} has been found guilty.`}
            </Text>
          </View>
        )}

        {myMissions && (
          <BombMissionsModal
            visible={showMissions}
            onClose={() => setShowMissions(false)}
            group={group}
            playerId={playerId}
          />
        )}
      </View>
    </MissionsContext.Provider>
  );
}

const styles = StyleSheet.create({
  flowContainer: {
    flex: 1,
    backgroundColor: "#0D0D0D",
  },
  topBar: {
    height: 48,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  gameContent: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "#0D0D0D",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: { color: "#fff", fontSize: 16 },
  backToMenuBtn: {
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  backToMenuText: {
    color: "#aaa",
    fontSize: 14,
    fontWeight: "600",
  },

  toast: {
    position: "absolute",
    top: 52,
    left: 16,
    right: 16,
    backgroundColor: "rgba(26,26,26,0.96)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FFD700",
    paddingVertical: 10,
    paddingHorizontal: 14,
    zIndex: 20,
  },
  toastText: {
    color: "#FFD700",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },

  verdictOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(13,13,13,0.92)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 30,
  },
  verdictEmoji: { fontSize: 64, marginBottom: 14 },
  verdictTitle: {
    color: "#FFD700",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 6,
  },
  verdictSub: { color: "#ddd", fontSize: 15 },
});
