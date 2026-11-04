// The situation. Type your answer (max 50 characters, spelling and all).
// Typing is the point, so the 4 preset answers stay hidden until a player
// asks for them ("Stuck?"). You can change your answer until time's up.
import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import type { Group, MtfGameState } from "../../../shared/types";
import { MAX_CHARS } from "../logic/engine";
import { mtfAnswer } from "../logic/game";
import Paper, { clock } from "../components/Paper";
import { HAND, MF } from "../theme";
import { useServerNow } from "../useServerNow";

type Props = { group: Group; gs: MtfGameState; playerId: string };

export default function MtfAnswerScreen({ group, gs, playerId }: Props) {
  const now = useServerNow();
  const mine = gs.answers[playerId];
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const left = (gs.phaseEndsAt ?? now) - now;
  const done = gs.seats.filter((id) => !!gs.answers[id]).length;
  const chars = [...text].length;
  const showForm = !mine || editing;

  const send = async (input: { text: string } | { preset: number }) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await mtfAnswer(group.id, playerId, input);
      if (!r.success) setErr(r.reason && r.reason !== "stale" ? r.reason : "Couldn't send. Try again.");
      else {
        setEditing(false);
        setShowPresets(false);
        setText("");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper kicker={`Q${gs.round} of ${gs.roundsTotal}`} right={clock(left)} urgent={left < 10000}>
      <Text style={styles.prompt}>{gs.prompt}</Text>

      {showForm ? (
        <>
          <View style={styles.inputBox}>
            <TextInput
              autoFocus
              style={styles.input}
              value={text}
              onChangeText={(t) => setText([...t].slice(0, MAX_CHARS).join(""))}
              placeholder="Write what you'd do…"
              placeholderTextColor={MF.faint}
              maxLength={MAX_CHARS * 2}
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={() => chars > 0 && send({ text })}
            />
            <Text style={[styles.count, chars >= MAX_CHARS && { color: MF.wrong }]}>
              {chars >= MAX_CHARS ? `That's the limit: ${MAX_CHARS} characters · ` : ""}
              {chars}/{MAX_CHARS}
            </Text>
          </View>
          <TouchableOpacity style={[styles.sendBtn, (chars === 0 || busy) && styles.dim]} disabled={chars === 0 || busy} onPress={() => send({ text })}>
            <Text style={styles.sendText}>{busy ? "Sending…" : "Submit answer"}</Text>
          </TouchableOpacity>

          <Text style={styles.nudge}>✍️ Your own words are harder to match, and way funnier at the reveal.</Text>

          {showPresets ? (
            <>
              <Text style={styles.or}>— quick answers —</Text>
              <View style={{ gap: 8 }}>
                {gs.presets.map((p, i) => (
                  <TouchableOpacity key={i} style={[styles.preset, busy && styles.dim]} disabled={busy} onPress={() => send({ preset: i })}>
                    <Text style={styles.presetLetter}>{String.fromCharCode(97 + i)})</Text>
                    <Text style={styles.presetText}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.presetWarn}>Heads up: quick answers are easy to spot.</Text>
            </>
          ) : (
            <TouchableOpacity onPress={() => setShowPresets(true)}>
              <Text style={styles.stuck}>Stuck? Show quick answers</Text>
            </TouchableOpacity>
          )}
          {mine && (
            <TouchableOpacity onPress={() => setEditing(false)}>
              <Text style={styles.link}>Keep my answer</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <View style={styles.doneCard}>
          <Text style={styles.doneLabel}>YOUR ANSWER</Text>
          <Text style={styles.doneText}>{mine.text}</Text>
          {mine.preset && <Text style={styles.doneNote}>(a preset)</Text>}
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Text style={styles.link}>Change it</Text>
          </TouchableOpacity>
        </View>
      )}
      {err && <Text style={styles.err}>{err}</Text>}
      <Text style={styles.progress}>
        ✏️ {done} of {gs.seats.length} answered
      </Text>
    </Paper>
  );
}

const styles = StyleSheet.create({
  prompt: { color: MF.ink, fontSize: 24, fontWeight: "800", lineHeight: 32, fontFamily: HAND },
  inputBox: { backgroundColor: MF.card, borderRadius: 14, borderWidth: 2, borderColor: MF.ink, paddingHorizontal: 14, paddingVertical: 6 },
  input: { color: MF.pencil, fontSize: 18, fontWeight: "600", paddingVertical: 8 },
  count: { color: MF.faint, fontSize: 12, fontWeight: "700", textAlign: "right" },
  sendBtn: { backgroundColor: MF.ink, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  sendText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  nudge: { color: MF.muted, fontSize: 13, fontWeight: "700", textAlign: "center" },
  stuck: { color: MF.faint, fontSize: 13, fontWeight: "700", textAlign: "center", textDecorationLine: "underline", paddingVertical: 6 },
  presetWarn: { color: MF.faint, fontSize: 12, textAlign: "center" },
  or: { color: MF.faint, textAlign: "center", fontSize: 13, fontWeight: "700" },
  preset: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: MF.card, borderRadius: 12, borderWidth: 1.5, borderColor: MF.cardLine, paddingVertical: 12, paddingHorizontal: 14 },
  presetLetter: { color: MF.ink, fontSize: 15, fontWeight: "900", fontFamily: HAND },
  presetText: { color: MF.pencil, fontSize: 15, fontWeight: "600", flexShrink: 1 },
  doneCard: { backgroundColor: MF.card, borderRadius: 16, borderWidth: 2, borderColor: MF.cardLine, padding: 18, gap: 6, alignItems: "center" },
  doneLabel: { color: MF.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1.5 },
  doneText: { color: MF.pencil, fontSize: 20, fontWeight: "700", textAlign: "center" },
  doneNote: { color: MF.faint, fontSize: 12 },
  link: { color: MF.ink, fontSize: 14, fontWeight: "800", textAlign: "center", textDecorationLine: "underline", paddingVertical: 6 },
  err: { color: MF.wrong, fontWeight: "800", textAlign: "center" },
  progress: { color: MF.muted, fontSize: 14, fontWeight: "700", textAlign: "center", marginTop: 4 },
  dim: { opacity: 0.45 },
});
