// src/games/quiz-board/QuizBoardFlowScreen.tsx
import { useEffect, useRef } from "react";
import { View, Text, StyleSheet, BackHandler, Alert } from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../../../App";
import { useGroup } from "../../shared/hooks/useGroup";
import { useHostFailover } from "../../shared/hooks/useHostFailover";
import { getServerNow, syncServerTimeOffset } from "../../shared/firebase/time";
import { returnToMenu } from "../../shared/firebase/groups";
import { preloadSounds } from "../../shared/sounds/soundManager";
import { useQuizBoard } from "./logic/useQuizBoard";
import { QB_CLIENT_VERSION } from "./logic/board";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../shared/firebase/config";
import { usePresence } from "../../shared/hooks/usePresence";
import AwayOverlay from "../../shared/components/AwayOverlay";
import {
  continueWithoutAwayQuiz,
  pauseQuestion,
  resumeQuestion,
} from "./logic/game";
import { QB, displayText } from "./theme";
import QuizLobbyScreen from "./screens/QuizLobbyScreen";
import QuizBoardScreen from "./screens/QuizBoardScreen";
import QuizQuestionScreen from "./screens/QuizQuestionScreen";
import QuizFinalScreen from "./screens/QuizFinalScreen";
import QuizGoldenWagerScreen from "./screens/QuizGoldenWagerScreen";

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, "QuizBoardFlow">;
  route: RouteProp<RootStackParamList, "QuizBoardFlow">;
};

export default function QuizBoardFlowScreen({ navigation, route }: Props) {
  const { groupId, playerId } = route.params;
  const { group, loading } = useGroup(groupId);
  const ctx = useQuizBoard(group, playerId);
  useHostFailover(group, playerId);

  // ── When a player drops out ───────────────────────────────────────
  // On the board and during a question, everyone waits for them. A live
  // question is paused automatically (timer stopped, question hidden) and
  // resumes by itself once they're back. The locking pause, judging and
  // the result screen need nobody's input, so they carry on.
  const gs = ctx.gs;
  const waitPhase =
    ctx.phase === "board" ||
    ctx.phase === "golden-wager" ||
    ctx.phase === "question";
  const presence = usePresence(
    group?.id ?? groupId,
    playerId,
    waitPhase && group ? group.players.map((p) => p.id) : [],
    gs?.awayIgnored,
  );
  const away = presence.awayIds;

  // One phone runs the automatic pause/resume: the host, or, if the host
  // is the one who dropped, the first other player still here.
  const actorId = group
    ? away.includes(group.hostId)
      ? group.players.find((p) => !away.includes(p.id))?.id
      : group.hostId
    : undefined;
  const iAct = actorId === playerId && !presence.meOffline;
  const awayKey = away.join(",");
  useEffect(() => {
    if (!group || !gs || !iAct || ctx.phase !== "question") return;
    if (away.length > 0 && !gs.isPaused) {
      pauseQuestion(group.id, getServerNow(), "away").catch(console.error);
    } else if (away.length === 0 && gs.isPaused && gs.pauseReason === "away") {
      resumeQuestion(group.id, getServerNow(), "away").catch(console.error);
    }
  }, [iAct, ctx.phase, awayKey, gs?.isPaused, gs?.pauseReason, group?.id]);

  useEffect(() => {
    syncServerTimeOffset(groupId);
    preloadSounds();
  }, [groupId]);

  // Tell the lobby which code version this phone runs (see QB_CLIENT_VERSION).
  useEffect(() => {
    updateDoc(doc(db, "groups", groupId), {
      [`quizClientVersions.${playerId}`]: QB_CLIENT_VERSION,
    }).catch(() => {});
  }, [groupId, playerId]);

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

  const { phase } = ctx;
  if (!gs) return <QuizLobbyScreen group={group} playerId={playerId} />;

  const screen =
    phase === "board" ? (
      <QuizBoardScreen group={group} playerId={playerId} ctx={ctx} />
    ) : phase === "final" ? (
      <QuizFinalScreen group={group} playerId={playerId} ctx={ctx} />
    ) : phase === "golden-wager" ? (
      <QuizGoldenWagerScreen group={group} playerId={playerId} ctx={ctx} />
    ) : (
      <QuizQuestionScreen group={group} playerId={playerId} ctx={ctx} />
    );

  return (
    <View style={styles.flex}>
      {screen}
      {waitPhase && (
        <AwayOverlay
          awayIds={away}
          lastSeen={presence.lastSeen}
          meOffline={presence.meOffline}
          isHost={ctx.isHost}
          nameOf={ctx.nameOf}
          onContinueWithout={(ids) =>
            continueWithoutAwayQuiz(
              group.id,
              playerId,
              Object.fromEntries(
                ids.map((id) => [id, presence.lastSeen[id] ?? 0]),
              ),
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: QB.bg },
  center: {
    flex: 1,
    backgroundColor: QB.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});
