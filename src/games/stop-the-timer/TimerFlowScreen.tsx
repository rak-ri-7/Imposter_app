// src/games/timer/screens/TimerFlowScreen.tsx
import { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../../../App";
import { useGroup } from "../../shared/hooks/useGroup";
import { TimerGameState } from "../../shared/types";
import { syncServerTimeOffset } from "../../shared/firebase/time";
import { usePresence } from "../../shared/hooks/usePresence";
import AwayOverlay from "../../shared/components/AwayOverlay";
import {
  continueWithoutAwayTimerGame,
  voidTimerRound,
} from "./logic/game";
import TimerLobbyScreen from "./screens/TimerLobbyScreen";
import TimerQuestionScreen from "./screens/TimerQuestionScreen";
import TimerRunningScreen from "./screens/TimerRunningScreen";
import TimerResultScreen from "./screens/TimerResultScreen";

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, "TimerFlow">;
  route: RouteProp<RootStackParamList, "TimerFlow">;
};

export default function TimerFlowScreen({ navigation, route }: Props) {
  const { groupId, playerId } = route.params;
  const { group, loading } = useGroup(groupId);

  // ── When a player drops out ───────────────────────────────────────
  // Countdown or running timer: ask the host whether to void the round.
  // Result screen: everyone waits for them before the next round.
  const timerGs =
    group?.gameState && "phase" in group.gameState
      ? (group.gameState as TimerGameState)
      : undefined;
  const timerPhase = group?.currentGame === "stop-the-timer" ? timerGs?.phase : undefined;
  const awayMode: "end-round" | "pause" | null =
    timerPhase === "question" || timerPhase === "running"
      ? "end-round"
      : timerPhase === "result"
        ? "pause"
        : null;
  const presence = usePresence(
    group?.id ?? groupId,
    playerId,
    awayMode && group ? group.players.map((p) => p.id) : [],
    timerGs?.awayIgnored,
  );

  useEffect(() => {
    syncServerTimeOffset(groupId);
  }, [groupId]);

  useEffect(() => {
    if (group?.currentGame === "menu") {
      navigation.replace("GameMenu", { groupId, playerId });
    }
  }, [group?.currentGame]);

  if (loading || !group) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (group.currentGame === "menu") return null;

  const gameState = group.gameState as TimerGameState;
  const phase = gameState?.phase;

  if (phase === "lobby" || !phase) {
    return <TimerLobbyScreen group={group} playerId={playerId} />;
  }

  const content =
    phase === "question" ? (
      <TimerQuestionScreen group={group} playerId={playerId} />
    ) : phase === "running" ? (
      <TimerRunningScreen group={group} playerId={playerId} />
    ) : phase === "result" ? (
      <TimerResultScreen group={group} playerId={playerId} />
    ) : null;
  if (!content) return null;

  const nameOf = (id: string) =>
    group.players.find((p) => p.id === id)?.name ?? "a player";

  return (
    <View style={styles.flex}>
      {content}
      {awayMode && (
        <AwayOverlay
          mode={awayMode}
          endRoundText={{
            body: "Void this round? Nobody gets points for it, and everyone waits on the results screen until they're back.",
            button: "Void round",
          }}
          onEndRound={() =>
            voidTimerRound(group.id, playerId, presence.awayIds).catch(
              console.error,
            )
          }
          awayIds={presence.awayIds}
          lastSeen={presence.lastSeen}
          meOffline={presence.meOffline}
          isHost={group.hostId === playerId}
          nameOf={nameOf}
          onContinueWithout={(ids) =>
            continueWithoutAwayTimerGame(
              group.id,
              playerId,
              Object.fromEntries(
                ids.map((id) => [id, presence.lastSeen[id] ?? 0]),
              ),
            ).catch(console.error)
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: "#0D1B2A",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#fff",
    fontSize: 16,
  },
});
