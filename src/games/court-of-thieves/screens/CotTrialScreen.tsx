// ⚖️ The trial, then the verdict. The app holds the floor: one speaker at
// a time on a timer (the Police, then the Advocate, the accused always
// last), so a quiet player can't be shouted down. Then the Judge rules.
import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import type { CotGameState, CotSpeaker, Group } from "../../../shared/types";
import { JUDGE_REWARD } from "../logic/engine";
import { cotDecide, cotEndTurn } from "../logic/game";
import { CT, seatColor } from "../theme";
import { useServerNow } from "../../../shared/hooks/useServerNow";
import { padBottom, useBottomInset } from "../../../shared/hooks/useSafeBottom";

type Props = { group: Group; gs: CotGameState; playerId: string };

const AS: Record<CotSpeaker["as"], { emoji: string; label: string; job: string }> = {
  police: { emoji: "🚓", label: "The Police", job: "makes the case" },
  advocate: { emoji: "💼", label: "The Advocate", job: "defends" },
  accused: { emoji: "🙋", label: "The accused", job: "has the final word" },
};

export default function CotTrialScreen({ group, gs, playerId }: Props) {
  const bottomInset = useBottomInset(); // clear of the phone's bottom bar
  const now = useServerNow(250);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const trial = gs.trial;
  if (!trial) return <View style={styles.container} />;
  const name = (id: string) => (id === playerId ? "You" : group.players.find((p) => p.id === id)?.name ?? "Someone");
  const secs = Math.max(0, Math.ceil(((gs.phaseEndsAt ?? now) - now) / 1000));
  const verdict = gs.phase === "verdict";
  const speaker = trial.speakers[trial.turn];
  const mySpeech = !verdict && speaker?.id === playerId;
  const iJudge = trial.judgeId === playerId;
  const standIn = gs.roles[trial.judgeId] !== "judge";
  const accusedName = trial.accused === playerId ? "you" : name(trial.accused);

  const run = async (fn: () => Promise<{ success: boolean; reason?: string }>) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fn();
      if (!r.success && r.reason && r.reason !== "stale") setErr(r.reason);
    } finally {
      setBusy(false);
    }
  };

  const Person = ({ id, tag }: { id: string; tag: string }) => (
    <View style={styles.person}>
      <View style={[styles.dot, { backgroundColor: seatColor(gs.seats, id) }]} />
      <Text style={styles.personText}>
        {tag} <Text style={styles.personName}>{name(id)}</Text>
      </Text>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, padBottom(styles.content, bottomInset)]}>
      <Text style={styles.kicker}>ROUND {gs.round} · THE COURT</Text>
      <Text style={styles.title}>⚖️ The trial of {accusedName}</Text>
      <View style={styles.cast}>
        <Person id={trial.policeId} tag="🚓 Police:" />
        <Person id={trial.judgeId} tag={standIn ? "⚖️ Judge (standing in):" : "⚖️ Judge:"} />
        {trial.speakers
          .filter((s) => s.as === "advocate")
          .map((s) => (
            <Person key={s.id} id={s.id} tag="💼 Advocate:" />
          ))}
        <Person id={trial.accused} tag="🙋 Accused:" />
      </View>

      {!verdict && speaker ? (
        <View style={[styles.floor, mySpeech && styles.floorMine]}>
          <Text style={[styles.floorKicker, mySpeech && { color: CT.ink }]}>ON THE FLOOR</Text>
          <Text style={[styles.floorName, mySpeech && { color: CT.ink }]}>
            {AS[speaker.as].emoji} {mySpeech ? "You" : name(speaker.id)}
          </Text>
          <Text style={[styles.floorJob, mySpeech && { color: CT.ink }]}>
            {AS[speaker.as].label} {AS[speaker.as].job}
          </Text>
          <Text style={[styles.floorTime, mySpeech && { color: CT.ink }, secs <= 10 && !mySpeech && { color: CT.bad }]}>{secs}s</Text>
          <Text style={[styles.floorRule, mySpeech && { color: CT.ink }]}>
            {mySpeech ? "You have the floor. Nobody else talks." : `Only ${name(speaker.id)} talks now.`}
          </Text>
          {mySpeech && (
            <TouchableOpacity
              style={[styles.doneBtn, busy && styles.dim]}
              disabled={busy}
              onPress={() => run(() => cotEndTurn(group.id, gs.seq, trial.turn, playerId))}
            >
              <Text style={styles.doneText}>I'm done</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.floor}>
          <Text style={styles.floorKicker}>THE VERDICT</Text>
          {iJudge ? (
            <>
              <Text style={styles.floorName}>Your ruling</Text>
              <Text style={styles.floorJob}>
                Is {accusedName} the Thief? A right verdict earns ₹{JUDGE_REWARD}. {secs}s left (no ruling = not guilty).
              </Text>
              <View style={styles.verdictRow}>
                <TouchableOpacity style={[styles.guilty, busy && styles.dim]} disabled={busy} onPress={() => run(() => cotDecide(group.id, playerId, true))}>
                  <Text style={styles.verdictText}>🔨 Guilty</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.notGuilty, busy && styles.dim]} disabled={busy} onPress={() => run(() => cotDecide(group.id, playerId, false))}>
                  <Text style={styles.verdictText}>🕊️ Not guilty</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.floorName}>⚖️ {name(trial.judgeId)} is deciding…</Text>
              <Text style={styles.floorTime}>{secs}s</Text>
              <Text style={styles.floorRule}>Silence in court.</Text>
            </>
          )}
        </View>
      )}

      <Text style={styles.label}>ORDER</Text>
      <View style={styles.order}>
        {trial.speakers.map((s, i) => {
          const done = verdict || i < trial.turn;
          const now_ = !verdict && i === trial.turn;
          return (
            <View key={`${s.id}-${i}`} style={styles.orderRow}>
              <Text style={styles.orderMark}>{done ? "✓" : now_ ? "▶" : `${i + 1}`}</Text>
              <Text style={[styles.orderText, now_ && { color: CT.gold }]}>
                {AS[s.as].emoji} {name(s.id)} · {AS[s.as].job}
              </Text>
            </View>
          );
        })}
        <View style={styles.orderRow}>
          <Text style={styles.orderMark}>{verdict ? "▶" : "⚖️"}</Text>
          <Text style={[styles.orderText, verdict && { color: CT.gold }]}>{name(trial.judgeId)} rules</Text>
        </View>
      </View>
      {err && <Text style={styles.err}>{err}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CT.bg },
  content: { padding: 20, paddingTop: 56, paddingBottom: 40, gap: 12 },
  kicker: { color: CT.textMuted, fontSize: 12, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: CT.gold, fontSize: 28, fontWeight: "900" },
  cast: { backgroundColor: CT.panel, borderRadius: 16, padding: 14, gap: 8 },
  person: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  personText: { color: CT.textMuted, fontSize: 14, fontWeight: "700" },
  personName: { color: CT.text, fontWeight: "900" },
  floor: { backgroundColor: CT.panelHi, borderRadius: 24, padding: 22, alignItems: "center", gap: 6, borderWidth: 1, borderColor: CT.line },
  floorMine: { backgroundColor: CT.gold, borderColor: CT.gold },
  floorKicker: { color: CT.textMuted, fontSize: 12, fontWeight: "800", letterSpacing: 1.5 },
  floorName: { color: CT.text, fontSize: 26, fontWeight: "900", textAlign: "center" },
  floorJob: { color: CT.textMuted, fontSize: 15, fontWeight: "700", textAlign: "center", lineHeight: 21 },
  floorTime: { color: CT.gold, fontSize: 48, fontWeight: "900" },
  floorRule: { color: CT.textMuted, fontSize: 14, fontWeight: "700" },
  doneBtn: { marginTop: 8, backgroundColor: CT.ink, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 28 },
  doneText: { color: CT.gold, fontSize: 16, fontWeight: "900" },
  verdictRow: { flexDirection: "row", gap: 10, marginTop: 10, alignSelf: "stretch" },
  guilty: { flex: 1, backgroundColor: CT.bad, borderRadius: 16, paddingVertical: 18, alignItems: "center" },
  notGuilty: { flex: 1, backgroundColor: CT.good, borderRadius: 16, paddingVertical: 18, alignItems: "center" },
  verdictText: { color: CT.ink, fontSize: 18, fontWeight: "900" },
  label: { color: CT.textMuted, fontSize: 12, fontWeight: "800", letterSpacing: 1.2, marginTop: 6 },
  order: { backgroundColor: CT.panel, borderRadius: 16, padding: 14, gap: 8 },
  orderRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  orderMark: { color: CT.textMuted, fontSize: 14, fontWeight: "900", width: 22, textAlign: "center" },
  orderText: { color: CT.text, fontSize: 14, fontWeight: "700", flexShrink: 1 },
  err: { color: CT.gold, textAlign: "center", fontWeight: "800" },
  dim: { opacity: 0.45 },
});
