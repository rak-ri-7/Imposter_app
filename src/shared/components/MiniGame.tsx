// src/shared/components/MiniGame.tsx
// 🔽 The minimised game: a small card in the bottom-right corner of the game
// menu and lobby (like a video shrunk to a corner). Tap it to go straight
// back into the game; ✕ closes it the game's own way.
//
// It shows the game's own colour and emoji (not its poster, which you've
// already seen on the menu) and one live line about what's happening right
// now: whose turn it is, which round, who's holding the bomb.
import { useEffect, useRef } from "react";
import { Alert, Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Where you last dragged the player to (an offset from its corner), kept
// while the app is open so it stays put as you move between screens.
const dragged = { x: 0, y: 0 };
const EDGE = 8; // keep this far from the screen edges
import { useNavigation, useNavigationState } from "@react-navigation/native";
import type { Group } from "../types";
import { games } from "../../games/registry";
import { getGameCloser, routeForGame } from "../hooks/useMinimizableGame";
import { returnToMenu } from "../firebase/groups";
import { displaySemi } from "../theme/fonts";

type Props = { group: Group; playerId: string; bottom?: number };

// Each game's colour (picked from its poster).
export const GAME_COLOR: Record<string, string> = {
  "roof-race": "#B7791F",
  "match-the-following": "#4361EE",
  "court-of-thieves": "#6A3FA0",
  imposter: "#127F8C",
  "stop-the-timer": "#0096C7",
  "pass-the-bomb": "#D7263D",
  "quiz-board": "#B5179E",
  "card-clash": "#EF7A12",
  "clash-holdem": "#1B6B43",
};

// One line about where the game is right now. `mine` = it's about you.
export function liveLine(group: Group, playerId: string): { text: string; mine?: boolean } {
  const s: any = group.gameState ?? {};
  const nameOf = (id?: string | null) => {
    if (!id) return "Someone";
    const p = group.players.find((x) => x.id === id);
    if (p) return p.name;
    const side = (s.sides as any[] | undefined)?.find?.((x: any) => x.id === id);
    return side?.name ?? group.teams?.find((t) => t.id === id)?.name ?? "Someone";
  };
  const turn = (id: string | null | undefined, doing: string, yours = "Your turn!") =>
    id === playerId ? { text: yours, mine: true } : { text: `${nameOf(id)} ${doing}` };
  const of = (n?: number, total?: number, word = "Round") => (n ? `${word} ${n}${total ? `/${total}` : ""} · ` : "");

  switch (group.currentGame) {
    case "imposter": {
      if (group.status === "reveal") return { text: "Everyone's checking their word" };
      if (group.status === "describe") {
        const live = group.players.filter((p) => !(s.eliminatedPlayers ?? []).includes(p.id));
        const who = live[s.currentTurn ?? 0];
        return who ? turn(who.id, "is describing", "Your turn to describe!") : { text: "Describing the word" };
      }
      if (group.status === "vote") return { text: "Voting: who's the imposter?" };
      if (group.status === "result") return { text: "The imposter is revealed!" };
      return { text: "Getting ready" };
    }
    case "stop-the-timer": {
      const r = of(s.roundNumber);
      if (s.phase === "running" || group.status === "running" || group.status === "countdown") return { text: `${r}The timer's running!` };
      if (s.phase === "result") return { text: `${r}See who got closest` };
      if (s.phase === "penalty") return { text: `${r}Penalty time` };
      return { text: `${r}Reading the question` };
    }
    case "pass-the-bomb": {
      const holder = s.mode === "pass" ? s.holderId : s.currentHolderId;
      const mineHolder = s.mode === "pass" ? (s.sides as any[] | undefined)?.find?.((x: any) => x.id === holder)?.memberIds?.includes(playerId) || holder === playerId : holder === playerId;
      const r = of(s.round ?? s.roundNumber);
      if (s.phase === "exploded" || s.phase === "pass-exploded") return { text: `${r}💥 BOOM!` };
      if (s.phase === "playing" || s.phase === "panic" || s.phase === "pass-playing")
        return mineHolder ? { text: "You've got the bomb!", mine: true } : { text: `${r}💣 ${nameOf(holder)} has the bomb` };
      if (s.phase === "pass-result" || s.phase === "replay") return { text: "Final results" };
      return { text: `${r}Next round coming up` };
    }
    case "quiz-board": {
      const left = Array.isArray(s.tiles) ? s.tiles.filter((t: any) => !t.used).length : 0;
      const tail = left ? ` · ${left} tile${left === 1 ? "" : "s"} left` : "";
      if (s.phase === "board") return s.pickerId === playerId ? { text: `Your pick!${tail}`, mine: true } : { text: `${nameOf(s.pickerId)} is picking${tail}` };
      if (s.phase === "golden-wager") return { text: "⭐ Golden tile! Placing a bet" };
      if (s.phase === "question" || s.phase === "locking") return { text: s.current?.value ? `Question for ₹${s.current.value}` : "Question on the board" };
      if (s.phase === "judging") return { text: "The quizmaster is judging" };
      if (s.phase === "final") return { text: "Final scores" };
      return { text: `Scoring the round${tail}` };
    }
    case "card-clash": {
      if (s.phase === "over") return { text: "Final cards" };
      const r = of(s.round);
      if (s.phase === "calling") return s.callerId === playerId ? { text: "Your call!", mine: true } : { text: `${r}${nameOf(s.callerId)} is calling a stat` };
      return { text: `${r}Clash in progress` };
    }
    case "clash-holdem": {
      if (s.phase === "over") return { text: "Final chips" };
      const h = of(s.hand, s.handsTotal, "Hand");
      if (s.phase === "betting" && s.toAct) return s.toAct === playerId ? { text: "Your bet!", mine: true } : { text: `${h}${nameOf(s.toAct)} to bet` };
      if (s.phase === "showdown") return { text: `${h}Showdown!` };
      return { text: `${h}Picking cards` };
    }
    case "court-of-thieves": {
      const label: Record<string, string> = { roles: "Roles dealt", outage: "🌑 Lights out!", lights: "💡 Lights on", deals: "Making deals", arrest: "Arrests", trial: "⚖️ On trial", verdict: "The verdict", roundEnd: "Round over", over: "Final purses" };
      return { text: s.phase === "over" ? label.over : `${of(s.round, s.roundsTotal)}${label[s.phase] ?? "Playing"}` };
    }
    case "match-the-following": {
      const label: Record<string, string> = { answer: "Writing answers", match: "Matching friends to answers", reveal: "The reveal", roundEnd: "Round scores", over: "Final scores" };
      return { text: s.phase === "over" ? label.over : `${of(s.round, s.roundsTotal)}${label[s.phase] ?? "Playing"}` };
    }
    case "roof-race": {
      const label: Record<string, string> = { intro: "Getting ready", run: "Racing to the treasure", seal: "Grab the chest!", finalClaim: "Final claim", expeditionEnd: "Expedition over", over: "Final treasure" };
      return { text: s.phase === "over" ? label.over : `${of(s.expedition, s.expeditionsTotal, "Expedition")}${label[s.phase] ?? "Playing"}` };
    }
  }
  return { text: "Tap to go back" };
}

// Is the group's current game running underneath this screen?
export const useMinimizedRoute = (group: Group | null | undefined) => {
  const names = useNavigationState((s) => s?.routes?.map((r) => r.name) ?? []);
  const route = routeForGame(group?.currentGame);
  return route && names.includes(route) ? route : null;
};

export default function MiniGame({ group, playerId, bottom = 24 }: Props) {
  const navigation = useNavigation<any>();
  const route = useMinimizedRoute(group);
  const isHost = group.hostId === playerId;
  const def = games.find((g) => g.id === group.currentGame);

  // A soft "live" pulse.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // 🖐️ Drag it anywhere. A tap still opens the game; only a real move
  // (a few points) turns into a drag.
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const size = useRef({ w: 240, h: 90 });
  const pos = useRef(new Animated.ValueXY({ x: dragged.x, y: dragged.y })).current;
  const clamp = (x: number, y: number) => {
    const { w, h } = size.current;
    const minX = -(winW - w - 14 - EDGE);
    const maxX = 0; // its home corner is as far right as it goes
    const minY = -(winH - bottom - h - insets.top - EDGE - 9); // 9 = the ✕ poking out on top
    const maxY = bottom - insets.bottom - EDGE;
    return { x: Math.min(maxX, Math.max(minX, x)), y: Math.min(maxY, Math.max(minY, y)) };
  };
  const clampRef = useRef(clamp);
  clampRef.current = clamp; // the screen size can change (rotation, split screen)
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onPanResponderGrant: () => {
        pos.setOffset({ x: dragged.x, y: dragged.y });
        pos.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pos.x, dy: pos.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        pos.flattenOffset();
        const to = clampRef.current(dragged.x + g.dx, dragged.y + g.dy);
        dragged.x = to.x;
        dragged.y = to.y;
        Animated.spring(pos, { toValue: to, friction: 7, tension: 80, useNativeDriver: false }).start();
      },
      onPanResponderTerminate: () => {
        pos.flattenOffset();
        Animated.spring(pos, { toValue: { x: dragged.x, y: dragged.y }, useNativeDriver: false }).start();
      },
    }),
  ).current;
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    size.current = { w: width, h: height };
  };

  if (!route || !def) return null;

  const open = () => navigation.popTo(route, { groupId: group.id, playerId });
  const close = () => {
    // The game's own dialog (End & rank / Quit / "only the host can…").
    const own = getGameCloser(group.id);
    if (own) return own();
    if (!isHost)
      return Alert.alert("Game in progress", `Only the host can close ${def.name}. You can keep it minimised.`);
    Alert.alert(`Close ${def.name}?`, "This ends it for everyone. Rounds already scored keep their points.", [
      { text: "Keep it", style: "cancel" },
      { text: "Close game", style: "destructive", onPress: () => returnToMenu(group.id) },
    ]);
  };

  const color = GAME_COLOR[def.id] ?? "#2E3350";
  const line = liveLine(group, playerId);
  return (
    <Animated.View
      style={[styles.wrap, { bottom, transform: pos.getTranslateTransform() }]}
      onLayout={onLayout}
      {...pan.panHandlers}
    >
      <TouchableOpacity
        style={[styles.card, { borderColor: color }]}
        onPress={open}
        activeOpacity={0.85}
        accessibilityLabel={`Back to ${def.name}. ${line.text}`}
      >
        <View style={[styles.badge, { backgroundColor: color }]}>
          <Text style={styles.badgeEmoji}>{def.emoji}</Text>
          <Text style={styles.badgeGo}>↗</Text>
        </View>
        <View style={styles.info}>
          <View style={styles.liveRow}>
            <Animated.View style={[styles.liveDot, { opacity: pulse }]} />
            <Text style={styles.live}>LIVE</Text>
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {def.name}
          </Text>
          <Text style={[styles.line, line.mine && styles.lineMine]} numberOfLines={2}>
            {line.text}
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.x} onPress={close} hitSlop={10} accessibilityLabel={`Close ${def.name}`}>
        <Text style={styles.xText}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", right: 14, zIndex: 50 },
  card: {
    flexDirection: "row",
    width: 228,
    backgroundColor: "#121420",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1.5,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  badge: { width: 52, alignItems: "center", justifyContent: "center" },
  badgeEmoji: { fontSize: 26 },
  badgeGo: { position: "absolute", bottom: 4, right: 6, color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: "900" },
  info: { flex: 1, paddingVertical: 9, paddingLeft: 10, paddingRight: 20, justifyContent: "center", gap: 2, minHeight: 76 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#E63946" },
  live: { color: "#E63946", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  name: { color: "#fff", fontSize: 13, ...displaySemi, lineHeight: 17 },
  line: { color: "#C9CDE0", fontSize: 11.5, lineHeight: 15 },
  lineMine: { color: "#F2C66D", fontWeight: "800" },
  x: {
    position: "absolute",
    top: -9,
    right: -9,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#2A2F48",
    borderWidth: 2,
    borderColor: "#121420",
    alignItems: "center",
    justifyContent: "center",
  },
  xText: { color: "#fff", fontSize: 12, fontWeight: "900" },
});
