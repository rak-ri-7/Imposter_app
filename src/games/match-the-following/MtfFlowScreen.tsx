// src/games/match-the-following/MtfFlowScreen.tsx
// ✏️ Match the Following: picks the screen for the current phase and runs
// the timed steps (answer → match → reveal → round summary → next round).
// The host's phone does them on time; every other phone steps in a little
// later as backup. Each step re-checks the server clock in its transaction.
import { useEffect, useRef } from "react";
import { View, Text, StyleSheet, BackHandler, Alert } from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../../../App";
import { useGroup } from "../../shared/hooks/useGroup";
import { useHostFailover } from "../../shared/hooks/useHostFailover";
import { returnToMenu } from "../../shared/firebase/groups";
import { getServerNow, resyncServerTimeOffset, syncServerTimeOffset } from "../../shared/firebase/time";
import { allAnswered, allLocked } from "./logic/engine";
import { endMtfEarly, isMtfState, mtfNextRound, mtfToMatch, mtfToReveal, mtfToRoundEnd } from "./logic/game";
import MtfLobbyScreen from "./screens/MtfLobbyScreen";
import MtfAnswerScreen from "./screens/MtfAnswerScreen";
import MtfMatchScreen from "./screens/MtfMatchScreen";
import MtfRevealScreen from "./screens/MtfRevealScreen";
import MtfRoundEndScreen from "./screens/MtfRoundEndScreen";
import MtfOverScreen from "./screens/MtfOverScreen";
import { MF } from "./theme";

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, "MtfFlow">;
  route: RouteProp<RootStackParamList, "MtfFlow">;
};

const BACKUP_GRACE_MS = 3000;
const RETRY_MS = 1500;

export default function MtfFlowScreen({ navigation, route }: Props) {
  const { groupId, playerId } = route.params;
  const { group, loading } = useGroup(groupId);
  useHostFailover(group, playerId);
  const gs = group && isMtfState(group.gameState) ? group.gameState : null;
  const isHost = group?.hostId === playerId;
  const groupIdRef = useRef(groupId);

  useEffect(() => {
    syncServerTimeOffset(groupId);
  }, [groupId]);
  // Re-measure the clock once a round, at the start (rate-limited to 30 s).
  useEffect(() => {
    if (gs?.phase === "answer") resyncServerTimeOffset(groupId);
  }, [gs?.round]);

  useEffect(() => {
    if (group?.currentGame === "menu") navigation.replace("GameMenu", { groupId, playerId });
  }, [group?.currentGame]);

  // ── Timed steps, on the server clock ─────────────────────────────
  const present = group?.players.map((p) => p.id) ?? [];
  const everyoneDone =
    !!gs && ((gs.phase === "answer" && allAnswered(gs, present)) || (gs.phase === "match" && allLocked(gs, present)));
  const stepKey = gs ? `${gs.phase}:${gs.round}:${gs.seq}:${everyoneDone}` : "";
  useEffect(() => {
    if (!gs || gs.phase === "over") return;
    const { phase, seq, round } = gs;
    // Everyone's done: go now (from now, so the host still goes first and the
    // others keep their backup delay instead of all firing at once).
    const due = everyoneDone ? Math.min(gs.phaseEndsAt ?? Infinity, getServerNow()) : gs.phaseEndsAt;
    if (due === undefined) return;
    const fireAt = due + (isHost ? 0 : BACKUP_GRACE_MS);
    let lastTry = 0;
    const check = () => {
      if (getServerNow() < fireAt || Date.now() - lastTry < RETRY_MS) return;
      lastTry = Date.now();
      const id = groupIdRef.current;
      if (phase === "answer") mtfToMatch(id, seq);
      else if (phase === "match") mtfToReveal(id, seq);
      else if (phase === "reveal") mtfToRoundEnd(id, seq);
      else if (phase === "roundEnd") mtfNextRound(id, round);
    };
    const t = setInterval(check, 250);
    return () => clearInterval(t);
  }, [stepKey, isHost]);

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
          "End Match the Following?",
          "End now and rank everyone (a round still being answered is dropped), or quit with no points.",
          [
            { text: "Keep playing", style: "cancel", onPress: done },
            {
              text: "End & rank",
              onPress: async () => {
                done();
                await endMtfEarly(group.id);
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
  if (!gs) return <MtfLobbyScreen group={group} playerId={playerId} />;
  if (gs.phase === "over") return <MtfOverScreen group={group} gs={gs} playerId={playerId} />;
  if (!gs.seats.includes(playerId)) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>A game is in progress. You're in from the next question ✏️</Text>
      </View>
    );
  }
  switch (gs.phase) {
    case "answer":
      return <MtfAnswerScreen group={group} gs={gs} playerId={playerId} />;
    case "match":
      return <MtfMatchScreen group={group} gs={gs} playerId={playerId} />;
    case "reveal":
      return <MtfRevealScreen group={group} gs={gs} playerId={playerId} />;
    case "roundEnd":
      return <MtfRoundEndScreen group={group} gs={gs} playerId={playerId} />;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: MF.paper, alignItems: "center", justifyContent: "center", padding: 24 },
  loading: { color: MF.ink, fontSize: 16, textAlign: "center" },
});
