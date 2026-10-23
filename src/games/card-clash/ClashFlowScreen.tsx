// src/games/card-clash/ClashFlowScreen.tsx
// 🃏 Clash Cards: picks the screen for the current phase and runs the
// automatic steps (caller or gold defender out of time → random stat;
// answer beat out of time → reveal; reveal → Gold Defence or next clash).
// The host's phone does them on time; every other phone steps in a little
// later as backup. Transactions make sure each happens once.
import { useEffect, useRef } from "react";
import { View, Text, StyleSheet, BackHandler, Alert } from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../../../App";
import { useGroup } from "../../shared/hooks/useGroup";
import { useHostFailover } from "../../shared/hooks/useHostFailover";
import { returnToMenu } from "../../shared/firebase/groups";
import {
  ANSWER_MS,
  CALL_MS,
  alivePlayers,
  callDefence,
  callStat,
  endClashEarly,
  isClashState,
  nextClash,
  resolveAnswers,
} from "./logic/game";
import { timelineFor } from "./logic/timeline";
import ClashLobbyScreen from "./screens/ClashLobbyScreen";
import ClashCallScreen from "./screens/ClashCallScreen";
import ClashRevealScreen from "./screens/ClashRevealScreen";
import ClashDefenceScreen from "./screens/ClashDefenceScreen";
import ClashAnswerScreen from "./screens/ClashAnswerScreen";
import ClashOverScreen from "./screens/ClashOverScreen";
import { CC } from "./theme";

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, "ClashFlow">;
  route: RouteProp<RootStackParamList, "ClashFlow">;
};

const BACKUP_GRACE_MS = 3000;
const RETRY_MS = 1500;

export default function ClashFlowScreen({ navigation, route }: Props) {
  const { groupId, playerId } = route.params;
  const { group, loading } = useGroup(groupId);
  useHostFailover(group, playerId);
  const gs = group && isClashState(group.gameState) ? group.gameState : null;
  const isHost = group?.hostId === playerId;
  const groupIdRef = useRef(groupId);

  useEffect(() => {
    if (group?.currentGame === "menu") {
      navigation.replace("GameMenu", { groupId, playerId });
    }
  }, [group?.currentGame]);

  // ── Automatic steps, timed from when this phone saw each phase ────
  const stage = gs?.last?.stage ?? "clash";
  const callStage = gs?.called?.stage ?? "clash";
  // The calling key includes the caller, so a 🎁 passed call gets a fresh timer.
  const phaseKey = gs
    ? `${gs.phase}:${gs.round}:${
        gs.phase === "reveal" ? stage : gs.phase === "answering" ? callStage : gs.phase === "calling" ? gs.callerId : ""
      }`
    : "";
  const seenAt = useRef<{ key: string; at: number } | null>(null);
  if (phaseKey && seenAt.current?.key !== phaseKey) seenAt.current = { key: phaseKey, at: Date.now() };
  useEffect(() => {
    if (!gs || gs.phase === "over") return;
    if (gs.phase === "reveal" && !gs.last) return;
    const round = gs.round;
    // A caller / defender who has left the group can't call: go at once.
    const pickerId = gs.phase === "defending" ? gs.defence?.defenderId : gs.callerId;
    // Or only one player left holding cards: callStat ends the game.
    const pickerGone =
      (gs.phase === "calling" || gs.phase === "defending") &&
      (!group?.players.some((p) => p.id === pickerId) ||
        (gs.phase === "calling" && alivePlayers(gs, group?.players ?? []).length < 2));
    const wait =
      gs.phase === "reveal"
        ? timelineFor(gs.last!).total
        : gs.phase === "answering"
          ? ANSWER_MS
          : pickerGone
            ? 0
            : CALL_MS;
    const fireAt = (seenAt.current?.at ?? Date.now()) + wait + (isHost ? 0 : BACKUP_GRACE_MS);
    let lastTry = 0;
    const phase = gs.phase;
    const check = () => {
      const now = Date.now();
      if (now < fireAt || now - lastTry < RETRY_MS) return;
      lastTry = now;
      if (phase === "calling") callStat(groupIdRef.current, playerId, round, { auto: true });
      else if (phase === "defending") callDefence(groupIdRef.current, playerId, round, { auto: true });
      else if (phase === "answering") resolveAnswers(groupIdRef.current, round, callStage);
      else nextClash(groupIdRef.current, round, stage);
    };
    const t = setInterval(check, 250);
    return () => clearInterval(t);
  }, [phaseKey, isHost, group?.players.length]);

  // ── Android back: the host can end the game ──────────────────────
  const alertOpen = useRef(false);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!group || alertOpen.current) return true;
      alertOpen.current = true;
      const done = () => {
        alertOpen.current = false;
      };
      if (isHost && gs && gs.phase !== "over") {
        Alert.alert(
          "End Clash Cards?",
          "End now and rank everyone by the cards they hold, or quit with no points.",
          [
            { text: "Keep playing", style: "cancel", onPress: done },
            {
              text: "End & rank",
              onPress: async () => {
                done();
                await endClashEarly(group.id);
              },
            },
            {
              text: "Quit, no points",
              style: "destructive",
              onPress: async () => {
                done();
                await returnToMenu(group.id);
              },
            },
          ],
          { cancelable: true, onDismiss: done },
        );
      } else if (isHost && !gs) {
        done();
        returnToMenu(group.id);
      } else {
        Alert.alert("Game in progress", "Only the host can end the game.", [{ text: "OK", onPress: done }]);
      }
      return true;
    });
    return () => sub.remove();
  }, [group?.id, isHost, gs?.phase]);

  if (loading || !group) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>Loading…</Text>
      </View>
    );
  }
  if (group.currentGame === "menu") return null;
  if (!gs) return <ClashLobbyScreen group={group} playerId={playerId} />;

  if (gs.phase === "calling") return <ClashCallScreen group={group} gs={gs} playerId={playerId} />;
  if (gs.phase === "reveal" && gs.last)
    return <ClashRevealScreen key={`${gs.round}:${stage}`} group={group} gs={gs} playerId={playerId} />;
  if (gs.phase === "answering" && gs.called)
    return <ClashAnswerScreen key={`${gs.round}:${callStage}`} group={group} gs={gs} playerId={playerId} />;
  if (gs.phase === "defending" && gs.defence)
    return <ClashDefenceScreen key={gs.round} group={group} gs={gs} playerId={playerId} />;
  if (gs.phase === "over") return <ClashOverScreen group={group} gs={gs} playerId={playerId} />;
  return null;
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: CC.bg, alignItems: "center", justifyContent: "center" },
  loading: { color: CC.text, fontSize: 16 },
});
