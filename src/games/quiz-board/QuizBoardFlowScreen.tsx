// src/games/quiz-board/QuizBoardFlowScreen.tsx
import { useEffect, useRef } from "react";
import { View, Text, StyleSheet, BackHandler, Alert } from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../../../App";
import { useGroup } from "../../shared/hooks/useGroup";
import { useHostFailover } from "../../shared/hooks/useHostFailover";
import { syncServerTimeOffset } from "../../shared/firebase/time";
import { returnToMenu } from "../../shared/firebase/groups";
import { preloadSounds } from "../../shared/sounds/soundManager";
import { useQuizBoard } from "./logic/useQuizBoard";
import { QB, displayText } from "./theme";
import QuizLobbyScreen from "./screens/QuizLobbyScreen";
import QuizBoardScreen from "./screens/QuizBoardScreen";
import QuizQuestionScreen from "./screens/QuizQuestionScreen";
import QuizFinalScreen from "./screens/QuizFinalScreen";

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, "QuizBoardFlow">;
  route: RouteProp<RootStackParamList, "QuizBoardFlow">;
};

export default function QuizBoardFlowScreen({ navigation, route }: Props) {
  const { groupId, playerId } = route.params;
  const { group, loading } = useGroup(groupId);
  const ctx = useQuizBoard(group, playerId);
  useHostFailover(group, playerId);

  useEffect(() => {
    syncServerTimeOffset(groupId);
    preloadSounds();
  }, [groupId]);

  useEffect(() => {
    if (group?.currentGame === "menu") {
      navigation.replace("GameMenu", { groupId, playerId });
    }
  }, [group?.currentGame]);

  // Android back: the host can end the game; others are told to ask.
  const alertOpen = useRef(false);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!group || alertOpen.current) return true;
      alertOpen.current = true;
      const done = () => {
        alertOpen.current = false;
      };
      if (ctx.isHost) {
        Alert.alert(
          "End Quiz Board?",
          "Everyone goes back to the Game Menu. No leaderboard points are added.",
          [
            { text: "Stay", style: "cancel", onPress: done },
            {
              text: "End Game",
              style: "destructive",
              onPress: async () => {
                done();
                await returnToMenu(group.id);
              },
            },
          ],
          { cancelable: true, onDismiss: done },
        );
      } else {
        Alert.alert("Game in progress", "Only the host can end the game.", [
          { text: "OK", onPress: done },
        ]);
      }
      return true;
    });
    return () => sub.remove();
  }, [group?.id, ctx.isHost]);

  if (loading || !group) {
    return (
      <View style={styles.center}>
        <Text style={displayText(18)}>Loading…</Text>
      </View>
    );
  }
  if (group.currentGame === "menu") return null;

  const { gs, phase } = ctx;
  if (!gs) return <QuizLobbyScreen group={group} playerId={playerId} />;

  if (phase === "board") {
    return <QuizBoardScreen group={group} playerId={playerId} ctx={ctx} />;
  }
  if (phase === "final") {
    return <QuizFinalScreen group={group} playerId={playerId} ctx={ctx} />;
  }
  return <QuizQuestionScreen group={group} playerId={playerId} ctx={ctx} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: QB.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});
