// 💡 Lights on: the lit room with everyone's balance (red = lost money,
// green = gained), footprints still fading if the Thief walked late, and
// how many people saw the heist. Then the deals open.
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from "react-native";
import type { CotGameState, Group } from "../../../shared/types";
import Room from "../components/Room";
import { CT, rupees } from "../theme";
import { useServerNow } from "../useServerNow";

type Props = { group: Group; gs: CotGameState; playerId: string };

export default function CotLightsScreen({ group, gs, playerId }: Props) {
  const { width } = useWindowDimensions();
  const now = useServerNow(80);
  const size = Math.min(width, 430);
  const last = gs.last;
  const nameOf = (id: string) => (id === playerId ? "Your" : `${group.players.find((p) => p.id === id)?.name ?? "Someone"}'s`);
  const secs = Math.max(0, Math.ceil(((gs.phaseEndsAt ?? now) - now) / 1000));
  const witnesses = last?.witnessIds.length ?? 0;
  const deltas: Record<string, number> = {};
  for (const id of gs.seats) deltas[id] = (last?.after[id] ?? 0) - (last?.before[id] ?? 0);
  const changed = gs.seats.filter((id) => deltas[id] !== 0);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: CT.lit }} contentContainerStyle={styles.content}>
      <Text style={styles.title}>💡 Lights on!</Text>
      <View style={styles.pill}>
        <Text style={styles.pillText}>
          {last?.seen
            ? `👀 ${witnesses} ${witnesses === 1 ? "person" : "people"} saw the heist`
            : "🙈 Nobody saw a thing"}
        </Text>
      </View>
      <View style={{ alignItems: "center" }}>
        <Room gs={gs} group={group} playerId={playerId} size={size} look="lit" now={now} balances={last?.after} deltas={deltas} />
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>DURING THE OUTAGE</Text>
        {changed.length === 0 ? (
          <Text style={styles.line}>Every bag looks untouched…</Text>
        ) : (
          changed.map((id) => (
            <View key={id} style={styles.row}>
              <Text style={styles.line}>{nameOf(id)} bag</Text>
              <Text style={[styles.amount, { color: deltas[id] < 0 ? CT.litBad : CT.litGood }]}>
                {deltas[id] > 0 ? "+" : "−"}
                {rupees(Math.abs(deltas[id]))}
              </Text>
            </View>
          ))
        )}
      </View>
      <Text style={styles.next}>Deals open in {secs}… Talk it out!</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 52, paddingBottom: 32, gap: 12 },
  title: { color: CT.litText, fontSize: 32, fontWeight: "900", paddingHorizontal: 20 },
  pill: { alignSelf: "flex-start", marginHorizontal: 20, backgroundColor: CT.litText, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16 },
  pillText: { color: CT.lit, fontSize: 14, fontWeight: "800" },
  card: { marginHorizontal: 20, padding: 16, backgroundColor: CT.litCard, borderColor: CT.litLine, borderWidth: 1, borderRadius: 20, gap: 10 },
  cardLabel: { color: CT.litMuted, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  line: { color: CT.litText, fontSize: 15, fontWeight: "700" },
  amount: { fontSize: 15, fontWeight: "900" },
  next: { color: CT.litMuted, fontSize: 15, fontWeight: "800", textAlign: "center", marginTop: 4 },
});
