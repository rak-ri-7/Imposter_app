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
import BombDuelScreen from "../screens/BombDuelScreen";
import BombPenaltyScreen from "../screens/BombPenaltyScreen";
import { returnToMenu } from "../../../shared/firebase/groups";
import BombFastestFingerScreen from "../screens/FastestFingerScreen";
import BombDuelFastestFingerScreen from "../screens/BombDuelFastestFingerScreen";
import BombGhostTournamentScreen from "../screens/BombGhostTournamentScreen";
import {
  triggerPanic,
  explodeBomb,
  syncBombTimer,
  endPersonalityReveal,
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

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, "BombFlow">;
  route: RouteProp<RootStackParamList, "BombFlow">;
};

export default function BombFlowScreen({ navigation, route }: Props) {
  const { groupId, playerId } = route.params;
  const { group, loading } = useGroup(groupId);
  const [endingGame, setEndingGame] = useState(false);
  const timerRef = useRef<any>(null);
  const panicTriggeredRef = useRef(false);
  const lastSyncedSecondRef = useRef<number | null>(null);
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
  const isHost = group?.hostId === playerId;

  // ── Missions: one global button, one modal, one change-detector ──────
  const [showMissions, setShowMissions] = useState(false);
  const myMissions = gameState?.missions?.[playerId];
  const { unseen, flashKey, toast, markSeen } = useMissionAlerts(myMissions);

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
    if (showMissions) markSeen();
  }, [showMissions, flashKey]);

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
        if (!endingGame) {
          setEndingGame(true);
          returnToMenu(group.id).finally(() => setEndingGame(false));
        }
        return true;
      },
    );

    return () => backHandler.remove();
  }, [endingGame, group, playerId]);

  useEffect(() => {
    if (!isHost || !gameState?.revealEndsAt) return;
    const msLeft = Math.max(0, gameState.revealEndsAt - Date.now());
    const timeout = setTimeout(() => endPersonalityReveal(group!.id), msLeft);
    return () => clearTimeout(timeout);
  }, [isHost, gameState?.revealEndsAt]);

  // ── Single authoritative timer loop for the whole app ─────────────
  // Lives here (not in BombPlayScreen) specifically because this
  // component is the only one guaranteed mounted for the ENTIRE
  // "playing" phase, regardless of which child screen (normal pass UI
  // vs. Fastest Finger quiz) is currently showing. Do not duplicate this
  // effect inside BombPlayScreen — two independent tickers risk
  // explodeBomb() firing twice for the same bomb.
  useEffect(() => {
    if (!group || !gameState || phase !== "playing" || !isHost) return;

    panicTriggeredRef.current = false;
    lastSyncedSecondRef.current = null;

    const tick = () => {
      const currentGroup = groupRef.current;
      if (!currentGroup) return;
      if (gameState.isPaused) return;

      const now = Date.now();
      const elapsed =
        ((now - gameState.timerStartedAt) / 1000) * gameState.speedMultiplier;
      const remaining = Math.max(0, gameState.timerDuration - elapsed);

      const displayedSecond = Math.ceil(remaining);
      if (lastSyncedSecondRef.current !== displayedSecond) {
        lastSyncedSecondRef.current = displayedSecond;
        void syncBombTimer(currentGroup.id, remaining);
      }

      if (remaining <= 5 && !panicTriggeredRef.current) {
        panicTriggeredRef.current = true;
        triggerPanic(currentGroup.id);
      }

      if (remaining <= 0) {
        clearInterval(timerRef.current);
        explodeBomb(currentGroup);
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
        <BombDuelScreen group={group} playerId={playerId} />
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
              onPress={() => {
                Alert.alert(
                  "Leave game?",
                  "This will end Pass the Bomb and return everyone to the Game Menu.",
                  [
                    { text: "Stay", style: "cancel" },
                    {
                      text: "Leave Game",
                      style: "destructive",
                      onPress: async () => {
                        setEndingGame(true);
                        try {
                          await returnToMenu(group.id);
                        } finally {
                          setEndingGame(false);
                        }
                      },
                    },
                  ],
                );
              }}
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
});
