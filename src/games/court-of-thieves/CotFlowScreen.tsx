// src/games/court-of-thieves/CotFlowScreen.tsx
// ⚖️ Court of Thieves: picks the screen for the current phase and runs the
// timed steps (role card → blackout → lights on → deals → arrest → trial
// → verdict → round summary).
// The host's phone does them on time; every other phone steps in a little
// later as backup. Transactions (guarded by seq / round) make sure each
// happens once.
import { useEffect, useRef } from "react";
import { View, Text, StyleSheet, BackHandler, Alert } from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../../../App";
import { useGroup } from "../../shared/hooks/useGroup";
import { useHostFailover } from "../../shared/hooks/useHostFailover";
import { returnToMenu } from "../../shared/firebase/groups";
import { getServerNow, resyncServerTimeOffset, syncServerTimeOffset } from "../../shared/firebase/time";
import {
  cotCloseArrest,
  cotEndDeals,
  cotEndTurn,
  cotNextRound,
  cotResolveOutage,
  cotToDeals,
  cotToOutage,
  cotVerdictTimeout,
  endCotEarly,
  isCotState,
} from "./logic/game";
import { actorGone, allPicked } from "./logic/engine";
import CotLobbyScreen from "./screens/CotLobbyScreen";
import CotRoleScreen from "./screens/CotRoleScreen";
import CotHeistScreen from "./screens/CotHeistScreen";
import CotLightsScreen from "./screens/CotLightsScreen";
import CotDealScreen from "./screens/CotDealScreen";
import CotArrestScreen from "./screens/CotArrestScreen";
import CotTrialScreen from "./screens/CotTrialScreen";
import CotRoundEndScreen from "./screens/CotRoundEndScreen";
import CotOverScreen from "./screens/CotOverScreen";
import { CT } from "./theme";

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, "CotFlow">;
  route: RouteProp<RootStackParamList, "CotFlow">;
};

const BACKUP_GRACE_MS = 3000;
const RETRY_MS = 1500;
const RESOLVE_AFTER_MS = 400; // let the Thief's last write land before the lights come on

export default function CotFlowScreen({ navigation, route }: Props) {
  const { groupId, playerId } = route.params;
  const { group, loading } = useGroup(groupId);
  useHostFailover(group, playerId);
  const gs = group && isCotState(group.gameState) ? group.gameState : null;
  const isHost = group?.hostId === playerId;
  const groupIdRef = useRef(groupId);

  useEffect(() => {
    syncServerTimeOffset(groupId);
  }, [groupId]);
  // Re-measure the clock once a round, during the role card (nothing is
  // timed to the split second then). Rate-limited to once per 30 s.
  useEffect(() => {
    if (gs?.phase === "roles") resyncServerTimeOffset(groupId);
  }, [gs?.round, gs?.phase === "roles"]);

  useEffect(() => {
    if (group?.currentGame === "menu") navigation.replace("GameMenu", { groupId, playerId });
  }, [group?.currentGame]);

  // ── Timed steps, on the server clock ─────────────────────────────
  const stepKey = gs ? `${gs.phase}:${gs.round}:${gs.seq}:${gs.trial?.turn ?? ""}` : "";
  useEffect(() => {
    if (!gs) return;
    const { phase, seq, round } = gs;
    let due: number | undefined;
    if (phase === "roles" || phase === "lights" || phase === "deals" || phase === "arrest" || phase === "trial" || phase === "verdict" || phase === "roundEnd")
      due = gs.phaseEndsAt;
    else if (phase === "outage") due = (gs.lightsAt ?? 0) + RESOLVE_AFTER_MS;
    if (!due) return;
    // The person this phase waits for has left: go on now.
    // (From now, so the host still goes first and the others keep their backup delay.)
    if (group && actorGone(gs, group.players.map((p) => p.id))) due = Math.min(due, getServerNow());
    const fireAt = due + (isHost ? 0 : BACKUP_GRACE_MS);
    let lastTry = 0;
    const check = () => {
      const now = getServerNow();
      if (now < fireAt || Date.now() - lastTry < RETRY_MS) return;
      lastTry = Date.now();
      const id = groupIdRef.current;
      if (phase === "roles") cotToOutage(id, seq);
      else if (phase === "outage") cotResolveOutage(id, round);
      else if (phase === "lights") cotToDeals(id, seq);
      else if (phase === "deals") cotEndDeals(id, seq);
      else if (phase === "arrest") cotCloseArrest(id, seq);
      else if (phase === "trial") cotEndTurn(id, seq, gs.trial?.turn ?? 0);
      else if (phase === "verdict") cotVerdictTimeout(id, seq);
      else if (phase === "roundEnd") cotNextRound(id, round);
    };
    const t = setInterval(check, 200);
    return () => clearInterval(t);
  }, [stepKey, isHost, group?.players.length]);

  // Everyone has locked in a suspect: don't wait for the clock.
  const everyonePicked = !!gs && gs.phase === "arrest" && !!group && allPicked(gs, group.players.map((p) => p.id));
  useEffect(() => {
    if (!gs || !everyonePicked || !isHost) return;
    cotCloseArrest(groupIdRef.current, gs.seq, true);
  }, [everyonePicked, isHost, gs?.seq]);

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
          "End Court of Thieves?",
          "End now and rank everyone by real money (a heist in progress is called off), or quit with no points.",
          [
            { text: "Keep playing", style: "cancel", onPress: done },
            {
              text: "End & count",
              onPress: async () => {
                done();
                await endCotEarly(group.id);
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
  if (!gs) return <CotLobbyScreen group={group} playerId={playerId} />;
  const inGame = gs.seats.includes(playerId);
  if (gs.phase === "over") return <CotOverScreen group={group} gs={gs} playerId={playerId} />;
  if (!inGame) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>A round is in progress. You'll join the next game.</Text>
      </View>
    );
  }
  switch (gs.phase) {
    case "roles":
      return <CotRoleScreen group={group} gs={gs} playerId={playerId} />;
    case "outage":
      return <CotHeistScreen group={group} gs={gs} playerId={playerId} />;
    case "lights":
      return <CotLightsScreen group={group} gs={gs} playerId={playerId} />;
    case "deals":
      return <CotDealScreen group={group} gs={gs} playerId={playerId} />;
    case "arrest":
      return <CotArrestScreen group={group} gs={gs} playerId={playerId} />;
    case "trial":
    case "verdict":
      return <CotTrialScreen group={group} gs={gs} playerId={playerId} />;
    case "roundEnd":
      return <CotRoundEndScreen group={group} gs={gs} playerId={playerId} />;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: CT.bg, alignItems: "center", justifyContent: "center", padding: 24 },
  loading: { color: CT.text, fontSize: 16, textAlign: "center" },
});
