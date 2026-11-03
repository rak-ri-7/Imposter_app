// src/games/clash-holdem/HoldemFlowScreen.tsx
// 💰 Clash Hold'em: picks the screen for the current phase and runs the
// automatic steps (dealer out of time → Draw; betting turn out of time →
// check or fold; showdown → next hand). The host's phone does them on time;
// every other phone steps in a little later as backup. Transactions (with
// the seq guard) make sure each happens once.
import { useEffect, useRef } from "react";
import { View, Text, StyleSheet, BackHandler, Alert } from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../../../App";
import { useGroup } from "../../shared/hooks/useGroup";
import { useHostFailover } from "../../shared/hooks/useHostFailover";
import { returnToMenu } from "../../shared/firebase/groups";
import {
  CHOOSE_MS,
  TURN_MS,
  chooseHoldemMode,
  endHoldemEarly,
  holdemAct,
  holdemNextHand,
  isHoldemState,
  showdownMs,
} from "./logic/game";
import HoldemLobbyScreen from "./screens/HoldemLobbyScreen";
import HoldemTableScreen from "./screens/HoldemTableScreen";
import HoldemOverScreen from "./screens/HoldemOverScreen";
import { CC } from "../card-clash/theme";

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, "HoldemFlow">;
  route: RouteProp<RootStackParamList, "HoldemFlow">;
};

const BACKUP_GRACE_MS = 3000;
const RETRY_MS = 1500;

export default function HoldemFlowScreen({ navigation, route }: Props) {
  const { groupId, playerId } = route.params;
  const { group, loading } = useGroup(groupId);
  useHostFailover(group, playerId);
  const gs = group && isHoldemState(group.gameState) ? group.gameState : null;
  const isHost = group?.hostId === playerId;
  const groupIdRef = useRef(groupId);

  useEffect(() => {
    if (group?.currentGame === "menu") navigation.replace("GameMenu", { groupId, playerId });
  }, [group?.currentGame]);

  // ── Automatic steps, timed from when this phone saw each step ──────
  const stepKey = gs ? `${gs.phase}:${gs.hand}:${gs.seq}` : "";
  const seenAt = useRef<{ key: string; at: number } | null>(null);
  if (stepKey && seenAt.current?.key !== stepKey) seenAt.current = { key: stepKey, at: Date.now() };
  useEffect(() => {
    if (!gs || gs.phase === "over") return;
    const { hand, seq, phase } = gs;
    // Someone who left can't act: don't wait for them.
    const actor = phase === "choosing" ? gs.dealerId : phase === "betting" ? gs.toAct : undefined;
    const actorGone = !!actor && !group?.players.some((p) => p.id === actor);
    const wait = actorGone ? 0 : phase === "choosing" ? CHOOSE_MS : phase === "betting" ? TURN_MS : showdownMs(gs);
    const fireAt = (seenAt.current?.at ?? Date.now()) + wait + (isHost ? 0 : BACKUP_GRACE_MS);
    let lastTry = 0;
    const check = () => {
      const now = Date.now();
      if (now < fireAt || now - lastTry < RETRY_MS) return;
      lastTry = now;
      if (phase === "choosing") chooseHoldemMode(groupIdRef.current, playerId, hand, "auto");
      else if (phase === "betting") holdemAct(groupIdRef.current, playerId, seq, "auto");
      else if (phase === "showdown") holdemNextHand(groupIdRef.current, hand);
    };
    const t = setInterval(check, 250);
    return () => clearInterval(t);
  }, [stepKey, isHost, group?.players.length]);

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
          "End Clash Hold'em?",
          "End now and rank everyone by chips (a hand in progress is called off), or quit with no points.",
          [
            { text: "Keep playing", style: "cancel", onPress: done },
            {
              text: "End & rank",
              onPress: async () => {
                done();
                await endHoldemEarly(group.id);
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
  if (!gs) return <HoldemLobbyScreen group={group} playerId={playerId} />;
  if (gs.phase === "over") return <HoldemOverScreen group={group} gs={gs} playerId={playerId} />;
  return <HoldemTableScreen group={group} gs={gs} playerId={playerId} stepSeenAt={seenAt.current?.at ?? Date.now()} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: CC.bg, alignItems: "center", justifyContent: "center" },
  loading: { color: CC.text, fontSize: 16 },
});
