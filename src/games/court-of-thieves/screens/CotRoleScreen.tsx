// The secret role card. It's shown once, here, and never again this round:
// nothing later on the screen says what you are, so holding up your phone
// proves nothing.
import { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import type { CotGameState, Group } from "../../../shared/types";
import { ROLE_INFO, total } from "../logic/engine";
import { CT, rupees, seatColor } from "../theme";
import { useServerNow } from "../../../shared/hooks/useServerNow";

type Props = { group: Group; gs: CotGameState; playerId: string };

export default function CotRoleScreen({ gs, playerId }: Props) {
  const now = useServerNow(250);
  const [hidden, setHidden] = useState(false);
  const role = gs.roles[playerId];
  const info = role ? ROLE_INFO[role] : null;
  const secs = Math.max(0, Math.ceil(((gs.phaseEndsAt ?? now) - now) / 1000));
  const col = seatColor(gs.seats, playerId);

  return (
    <View style={styles.container}>
      <Text style={styles.round}>
        Round {gs.round} of {gs.roundsTotal}
      </Text>
      <View style={styles.youRow}>
        <View style={[styles.dot, { backgroundColor: col }]} />
        <Text style={styles.youText}>Your colour</Text>
      </View>
      <Pressable style={styles.card} onPress={() => setHidden(true)} accessibilityLabel="Your secret role. Tap to hide.">
        {hidden || !info ? (
          <>
            <Text style={styles.hiddenEmoji}>🤫</Text>
            <Text style={styles.hiddenText}>Hidden</Text>
          </>
        ) : (
          <>
            <Text style={styles.small}>YOUR SECRET ROLE</Text>
            <Text style={styles.emoji}>{info.emoji}</Text>
            <Text style={styles.role}>{info.name}</Text>
            <Text style={styles.goal}>{info.goal}</Text>
            <Text style={styles.tapHide}>Tap to hide</Text>
          </>
        )}
      </Pressable>
      <Text style={styles.payday}>
        💵 Payday: +₹5,000 · your purse shows {rupees(total(gs.purse[playerId]))}
      </Text>
      <Text style={styles.warn}>This card won't show again. Remember it.</Text>
      <Text style={styles.count}>Lights out in {secs + 3}…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CT.bg, alignItems: "center", justifyContent: "center", padding: 24, gap: 14 },
  round: { color: CT.textMuted, fontSize: 14, fontWeight: "800", letterSpacing: 1 },
  youRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 16, height: 16, borderRadius: 8 },
  youText: { color: CT.textMuted, fontSize: 13, fontWeight: "700" },
  card: {
    width: "100%",
    maxWidth: 340,
    minHeight: 300,
    backgroundColor: CT.panel,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: CT.gold,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  small: { color: CT.gold, fontSize: 12, fontWeight: "800", letterSpacing: 1.5 },
  emoji: { fontSize: 64 },
  role: { color: CT.text, fontSize: 34, fontWeight: "900" },
  goal: { color: CT.textMuted, fontSize: 14, lineHeight: 20, textAlign: "center" },
  tapHide: { color: CT.textDim, fontSize: 12, marginTop: 6 },
  hiddenEmoji: { fontSize: 56 },
  hiddenText: { color: CT.textMuted, fontSize: 18, fontWeight: "800" },
  payday: { color: CT.text, fontSize: 14, fontWeight: "700" },
  warn: { color: CT.gold, fontSize: 13, fontWeight: "700" },
  count: { color: CT.textMuted, fontSize: 16, fontWeight: "800", marginTop: 8 },
});
