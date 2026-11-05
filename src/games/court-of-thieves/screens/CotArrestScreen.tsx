// 🚨 Who did it? Everyone secretly points at a suspect, on the same
// screen, so nobody can tell who the Police is from looking at phones.
// Only the Police's pick is an arrest. Anyone else who picks the Thief
// earns a small hunch reward.
import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import type { CotGameState, Group } from "../../../shared/types";
import { HUNCH_REWARD, WRONG_ARREST_FINE } from "../logic/engine";
import { cotPick } from "../logic/game";
import { CT, rupees, seatColor } from "../theme";
import { useServerNow } from "../../../shared/hooks/useServerNow";

type Props = { group: Group; gs: CotGameState; playerId: string };

export default function CotArrestScreen({ group, gs, playerId }: Props) {
  const now = useServerNow(250);
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const locked = gs.picks?.[playerId];
  const secs = Math.max(0, Math.ceil(((gs.phaseEndsAt ?? now) - now) / 1000));
  const name = (id: string) => group.players.find((p) => p.id === id)?.name ?? "Someone";
  const pickedCount = gs.seats.filter((id) => !!gs.picks?.[id]).length;
  const others = gs.seats.filter((id) => id !== playerId);

  const lockIn = async () => {
    if (!choice || busy) return;
    setBusy(true);
    try {
      const r = await cotPick(group.id, playerId, choice);
      if (!r.success && r.reason && r.reason !== "stale") setErr(r.reason);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <Text style={styles.title}>🚨 Who did it?</Text>
        <View style={styles.timer}>
          <Text style={[styles.timerText, secs <= 10 && { color: CT.bad }]}>{secs}s</Text>
        </View>
      </View>
      <Text style={styles.body}>
        Point at your suspect. It's secret. Only the Police's pick is an arrest (and reveals them). Guess the Thief right and earn{" "}
        {rupees(HUNCH_REWARD)}.
      </Text>
      <Text style={styles.small}>Police: arresting an innocent person costs {rupees(WRONG_ARREST_FINE)}. You can also arrest nobody.</Text>

      {locked ? (
        <View style={styles.lockedCard}>
          <Text style={styles.lockedEmoji}>🔒</Text>
          <Text style={styles.lockedTitle}>Locked in: {locked === "none" ? "nobody" : name(locked)}</Text>
          <Text style={styles.lockedSub}>
            Waiting for everyone… {pickedCount}/{gs.seats.length}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.grid}>
            {others.map((id) => {
              const on = choice === id;
              return (
                <TouchableOpacity key={id} style={[styles.card, on && styles.cardOn]} onPress={() => setChoice(id)}>
                  <View style={[styles.avatar, { backgroundColor: seatColor(gs.seats, id) }]}>
                    <Text style={styles.avatarText}>{name(id).slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <Text style={[styles.cardName, on && { color: CT.ink }]} numberOfLines={1}>
                    {name(id)}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={[styles.card, choice === "none" && styles.cardOn]} onPress={() => setChoice("none")}>
              <View style={[styles.avatar, { backgroundColor: CT.line }]}>
                <Text style={styles.avatarText}>🤷</Text>
              </View>
              <Text style={[styles.cardName, choice === "none" && { color: CT.ink }]}>Nobody</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.btn, (!choice || busy) && styles.dim]} disabled={!choice || busy} onPress={lockIn}>
            <Text style={styles.btnText}>{busy ? "Locking…" : choice ? `Lock in ${choice === "none" ? "nobody" : name(choice)}` : "Pick someone"}</Text>
          </TouchableOpacity>
          {err && <Text style={styles.err}>{err}</Text>}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CT.bg },
  content: { padding: 20, paddingTop: 56, paddingBottom: 40, gap: 12 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: CT.text, fontSize: 30, fontWeight: "900" },
  timer: { backgroundColor: CT.panel, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12 },
  timerText: { color: CT.gold, fontSize: 20, fontWeight: "900" },
  body: { color: CT.text, fontSize: 15, lineHeight: 22 },
  small: { color: CT.textDim, fontSize: 12, lineHeight: 17 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  card: { width: "31%", flexGrow: 1, backgroundColor: CT.panel, borderRadius: 16, paddingVertical: 14, alignItems: "center", gap: 8, borderWidth: 2, borderColor: CT.line },
  cardOn: { backgroundColor: CT.gold, borderColor: CT.gold },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  avatarText: { color: CT.ink, fontSize: 20, fontWeight: "900" },
  cardName: { color: CT.text, fontSize: 14, fontWeight: "800", paddingHorizontal: 6 },
  btn: { marginTop: 8, backgroundColor: CT.gold, borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  btnText: { color: CT.ink, fontSize: 17, fontWeight: "900" },
  err: { color: CT.gold, textAlign: "center", fontWeight: "800" },
  dim: { opacity: 0.45 },
  lockedCard: { marginTop: 16, backgroundColor: CT.panel, borderRadius: 20, padding: 24, alignItems: "center", gap: 8 },
  lockedEmoji: { fontSize: 44 },
  lockedTitle: { color: CT.text, fontSize: 20, fontWeight: "900" },
  lockedSub: { color: CT.textMuted, fontSize: 14, fontWeight: "700" },
});
