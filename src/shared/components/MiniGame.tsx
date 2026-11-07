// src/shared/components/MiniGame.tsx
// 🔽 The minimised game: a small card in the bottom-right corner of the game
// menu and lobby (like a video shrunk to a corner). Tap it to go straight
// back into the game; ✕ closes it the game's own way.
import { useEffect, useRef } from "react";
import { Alert, Animated, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation, useNavigationState } from "@react-navigation/native";
import type { Group } from "../types";
import { games } from "../../games/registry";
import { POSTER_BY_GAME } from "../assets/posters";
import { getGameCloser, routeForGame } from "../hooks/useMinimizableGame";
import { returnToMenu } from "../firebase/groups";
import { displaySemi } from "../theme/fonts";

type Props = { group: Group; playerId: string; bottom?: number };

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

  const poster = POSTER_BY_GAME[def.id];
  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <TouchableOpacity style={styles.card} onPress={open} activeOpacity={0.85} accessibilityLabel={`Back to ${def.name}`}>
        {poster ? (
          <Image source={poster} style={styles.poster} resizeMode="cover" />
        ) : (
          <View style={[styles.poster, styles.posterEmpty]}>
            <Text style={{ fontSize: 22 }}>{def.emoji}</Text>
          </View>
        )}
        <View style={styles.info}>
          <View style={styles.liveRow}>
            <Animated.View style={[styles.liveDot, { opacity: pulse }]} />
            <Text style={styles.live}>LIVE</Text>
          </View>
          <Text style={styles.name} numberOfLines={2}>
            {def.emoji} {def.name}
          </Text>
          <Text style={styles.tap}>Tap to go back ↗</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.x} onPress={close} hitSlop={10} accessibilityLabel={`Close ${def.name}`}>
        <Text style={styles.xText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", right: 14, zIndex: 50 },
  card: {
    flexDirection: "row",
    width: 210,
    backgroundColor: "#121420",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#2E3350",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  poster: { width: 58, height: 86 },
  posterEmpty: { backgroundColor: "#1A1A2E", alignItems: "center", justifyContent: "center" },
  info: { flex: 1, padding: 9, paddingRight: 22, justifyContent: "center", gap: 2 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#E63946" },
  live: { color: "#E63946", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  name: { color: "#fff", fontSize: 13, ...displaySemi, lineHeight: 17 },
  tap: { color: "#9AA0BC", fontSize: 11 },
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
