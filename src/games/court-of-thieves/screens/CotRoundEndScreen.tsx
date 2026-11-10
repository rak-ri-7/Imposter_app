// The round's end: the verdict (or the red-handed catch), who the Thief
// was, every payout the court made, and every purse as it stands (fake
// money still looks real until the final count).
import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import type { CotGameState, Group } from "../../../shared/types";
import { shown, thiefOf } from "../logic/engine";
import { cotNextRound } from "../logic/game";
import { CT, rupees, seatColor } from "../theme";
import { useServerNow } from "../../../shared/hooks/useServerNow";
import { padBottom, useBottomInset } from "../../../shared/hooks/useSafeBottom";

type Props = { group: Group; gs: CotGameState; playerId: string };

export default function CotRoundEndScreen({ group, gs, playerId }: Props) {
  const bottomInset = useBottomInset(); // clear of the phone's bottom bar
  const isHost = group.hostId === playerId;
  const [busy, setBusy] = useState(false);
  const clock = useServerNow(500);
  const secs = Math.max(0, Math.ceil(((gs.phaseEndsAt ?? clock) - clock) / 1000));
  const last = gs.last;
  const thief = last?.thiefId ?? thiefOf(gs) ?? "";
  const name = (id: string) => (id === playerId ? "You" : group.players.find((p) => p.id === id)?.name ?? "Someone");
  const now = shown(gs);
  const rows = [...gs.seats].sort((a, b) => (now[b] ?? 0) - (now[a] ?? 0));
  const lastRound = gs.round >= gs.roundsTotal;
  const loot = last ? last.loot.real + last.loot.fake : 0;
  const deals = (gs.threads ?? []).reduce((n, t) => n + t.msgs.filter((m) => m.offer && (m.offer.status === "now" || m.offer.status === "later")).length, 0);
  const payouts = last?.payouts ?? [];
  const thiefName = name(thief);
  const was = thief === playerId ? "were" : "was";
  const lootLine = loot > 0 ? `${rupees(loot)} stolen in the blackout` : "Nothing stolen this time";
  const dealLine = deals > 0 ? ` · ${deals} deal${deals === 1 ? "" : "s"} struck` : "";
  const accused = last?.accused ?? null;
  const headline: { emoji: string; title: string; body: string } = !accused
    ? { emoji: "🧤", title: "No arrest", body: `${thiefName} ${was} the Thief and walk${thief === playerId ? "" : "s"} free. ${lootLine}${dealLine}.` }
    : accused === thief && last?.guilty
      ? { emoji: "🔨", title: "Guilty!", body: `${thiefName} ${was} the Thief. The stash is seized. ${lootLine}${dealLine}.` }
      : accused === thief
        ? { emoji: "🕊️", title: "Acquitted…", body: `…but ${thiefName} ${was} the Thief, and walk${thief === playerId ? "" : "s"} free. ${lootLine}${dealLine}.` }
        : last?.guilty
          ? { emoji: "😬", title: "Wrong person convicted", body: `${name(accused)} ${accused === playerId ? "were" : "was"} innocent. The Thief was ${thiefName}. ${lootLine}${dealLine}.` }
          : { emoji: "🕊️", title: `${name(accused)} cleared`, body: `Right call: ${name(accused)} ${accused === playerId ? "were" : "was"} innocent. The Thief was ${thiefName}. ${lootLine}${dealLine}.` };

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, padBottom(styles.content, bottomInset)]}>
      <Text style={styles.round}>
        Round {gs.round} of {gs.roundsTotal}
      </Text>
      {last?.caught ? (
        <>
          <Text style={styles.big}>🚨</Text>
          <Text style={styles.title}>Caught red-handed!</Text>
          <Text style={styles.body}>
            {name(thief)} {thief === playerId ? "were" : "was"} still out when the lights came on. Every rupee went back, and the Thief pays a fine.
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.big}>{headline.emoji}</Text>
          <Text style={styles.title}>{headline.title}</Text>
          <Text style={styles.body}>{headline.body}</Text>
        </>
      )}

      {payouts.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>THE COURT PAYS OUT</Text>
          {payouts.map((p, i) => (
            <View key={i} style={styles.row}>
              <View style={[styles.dot, { backgroundColor: seatColor(gs.seats, p.id) }]} />
              <Text style={[styles.payName, p.id === playerId && { color: CT.gold }]} numberOfLines={2}>
                {name(p.id)} <Text style={styles.payWhy}>· {p.why}</Text>
              </Text>
              <Text style={[styles.rowAmt, { color: p.amount < 0 ? CT.bad : CT.good }]}>
                {p.amount < 0 ? "−" : "+"}
                {rupees(Math.abs(p.amount))}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardLabel}>PURSES (fake money still hidden)</Text>
        {rows.map((id) => (
          <View key={id} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: seatColor(gs.seats, id) }]} />
            <Text style={[styles.rowName, id === playerId && { color: CT.gold }]}>{name(id)}</Text>
            <Text style={styles.rowAmt}>{rupees(now[id] ?? 0)}</Text>
          </View>
        ))}
      </View>

      {isHost ? (
        <TouchableOpacity
          style={[styles.btn, busy && styles.dim]}
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await cotNextRound(group.id, gs.round, playerId);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Text style={styles.btnText}>
            {lastRound ? "The final count 💸" : "Next round"} ({secs}s)
          </Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.waiting}>{lastRound ? "The final count" : "Next round"} in {secs}s…</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CT.bg },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40, gap: 10, alignItems: "stretch" },
  round: { color: CT.textMuted, fontSize: 13, fontWeight: "800", letterSpacing: 1, textAlign: "center" },
  big: { fontSize: 60, textAlign: "center" },
  title: { color: CT.gold, fontSize: 28, fontWeight: "900", textAlign: "center" },
  body: { color: CT.text, fontSize: 15, lineHeight: 22, textAlign: "center" },
  card: { backgroundColor: CT.panel, borderRadius: 18, padding: 14, gap: 10, marginTop: 10 },
  cardLabel: { color: CT.textMuted, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  rowName: { color: CT.text, fontSize: 16, fontWeight: "800", flex: 1 },
  rowAmt: { color: CT.text, fontSize: 16, fontWeight: "900" },
  payName: { color: CT.text, fontSize: 14, fontWeight: "800", flex: 1 },
  payWhy: { color: CT.textMuted, fontWeight: "600" },
  btn: { marginTop: 18, backgroundColor: CT.gold, borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  btnText: { color: CT.ink, fontSize: 17, fontWeight: "900" },
  waiting: { color: CT.textMuted, textAlign: "center", marginTop: 18 },
  dim: { opacity: 0.45 },
});
