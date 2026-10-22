// Everyone's pile: a little card stack with a count (and ★ golds). The caller is marked;
// a pile that grows bumps; a player with no cards left cracks and fades.
// Each chip reports where it is on screen so flying cards can land on it.
import { useEffect, useRef } from "react";
import { View, Text, ScrollView, StyleSheet, Animated, Easing } from "react-native";
import type { ClashGameState, Group } from "../../../shared/types";
import { CC, SERIF } from "../theme";

export type Rect = { x: number; y: number; w: number; h: number };

type Props = {
  group: Group;
  gs: ClashGameState;
  playerId: string;
  counts?: Record<string, number>; // shown instead of the real counts (mid-animation)
  gold?: Record<string, boolean>;   // likewise for the ★ golds
  onChipRect?: (pid: string, rect: Rect) => void;
};

function Chip({
  name,
  count,
  golds,
  me,
  calling,
  onRect,
}: {
  name: string;
  count: number;
  golds: number;
  me: boolean;
  calling: boolean;
  onRect?: (r: Rect) => void;
}) {
  const ref = useRef<View>(null);
  const bump = useRef(new Animated.Value(1)).current;
  const crack = useRef(new Animated.Value(count > 0 ? 0 : 1)).current;
  const prev = useRef(count);
  useEffect(() => {
    if (count > prev.current) {
      bump.setValue(1.22);
      Animated.spring(bump, { toValue: 1, friction: 3, useNativeDriver: true }).start();
    }
    if (count === 0 && prev.current > 0) {
      Animated.timing(crack, { toValue: 1, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    }
    prev.current = count;
  }, [count]);
  const out = count === 0;
  return (
    <Animated.View
      ref={ref as any}
      onLayout={() => ref.current?.measureInWindow((x, y, w, h) => onRect?.({ x, y, w, h }))}
      style={[
        styles.chip,
        calling && styles.chipCaller,
        {
          opacity: crack.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }),
          transform: [
            { scale: bump },
            { rotate: crack.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-6deg"] }) },
          ],
        },
      ]}
    >
      {/* a tiny stack of card backs */}
      <View style={styles.stack}>
        {[2, 1, 0].map((i) => (
          <View key={i} style={[styles.mini, { left: i * 3, top: -i * 2, opacity: count > i ? 1 : 0.15 }]} />
        ))}
      </View>
      <View>
        <Text style={[styles.name, me && styles.me]} numberOfLines={1}>
          {calling ? "📣 " : ""}
          {me ? "You" : name}
        </Text>
        <Text style={[styles.count, out && styles.countOut]}>
          {out ? "💀 out" : `${count} cards`}
          {!out && golds > 0 ? <Text style={styles.golds}>{`  ★${golds > 1 ? golds : ""}`}</Text> : null}
        </Text>
      </View>
    </Animated.View>
  );
}

export default function PileBar({ group, gs, playerId, counts, gold, onChipRect }: Props) {
  const goldMap = gold ?? gs.gold ?? {};
  const players = group.players.filter((p) => gs.piles[p.id] !== undefined);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {players.map((p) => (
        <Chip
          key={p.id}
          name={p.name}
          count={counts?.[p.id] ?? gs.piles[p.id]?.length ?? 0}
          golds={(gs.piles[p.id] ?? []).filter((c) => goldMap[c]).length}
          me={p.id === playerId}
          calling={gs.phase === "calling" && gs.callerId === p.id}
          onRect={(r) => onChipRect?.(p.id, r)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 8, paddingHorizontal: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: CC.panel,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: CC.line,
    paddingVertical: 6,
    paddingLeft: 8,
    paddingRight: 12,
  },
  chipCaller: { borderColor: CC.gold, borderWidth: 2 },
  stack: { width: 22, height: 26 },
  mini: {
    position: "absolute",
    width: 15,
    height: 21,
    borderRadius: 3,
    backgroundColor: CC.backB,
    borderWidth: 1.5,
    borderColor: CC.backTrim,
  },
  name: { color: CC.text, fontSize: 12, fontWeight: "800", maxWidth: 90 },
  me: { color: CC.gold },
  count: { color: CC.textMuted, fontSize: 12, fontWeight: "800", fontFamily: SERIF },
  countOut: { color: CC.lose },
  golds: { color: CC.gold, fontWeight: "900" },
});
