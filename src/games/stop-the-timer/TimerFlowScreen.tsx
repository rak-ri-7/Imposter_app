// src/games/timer/screens/TimerFlowScreen.tsx
import { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../../../App";
import { useGroup } from "../../shared/hooks/useGroup";
import { TimerGameState } from "../../shared/types";
import { syncServerTimeOffset } from "../../shared/firebase/time";
import TimerLobbyScreen from "./screens/TimerLobbyScreen";
import TimerQuestionScreen from "./screens/TimerQuestionScreen";
import TimerCountdownScreen from "./screens/TimerCountdownScreen";
import TimerRunningScreen from "./screens/TimerRunningScreen";
import TimerResultScreen from "./screens/TimerResultScreen";

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, "TimerFlow">;
  route: RouteProp<RootStackParamList, "TimerFlow">;
};

export default function TimerFlowScreen({ navigation, route }: Props) {
  const { groupId, playerId } = route.params;
  const { group, loading } = useGroup(groupId);

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

  if (phase === "question" || phase === "countdown") {
    return <TimerQuestionScreen group={group} playerId={playerId} />;
  }

  if (phase === "running") {
    return <TimerRunningScreen group={group} playerId={playerId} />;
  }

  if (phase === "result") {
    return <TimerResultScreen group={group} playerId={playerId} />;
  }

  return null;
}

const styles = StyleSheet.create({
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
