// The reveal, on everyone's phone at once. One answer at a time: who
// everyone joined it to, then (after a drumroll) who really wrote it. Then
// your own board, marked right and wrong. Steps get shorter in big groups
// (the engine sets revealStepMs), and the host can skip ahead.
import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { Group, MtfGameState } from "../../../shared/types";
import { REVEAL_STEP_MS, isRight, revealStep } from "../logic/engine";
import { mtfToRoundEnd } from "../logic/game";
import MatchBoard from "../components/MatchBoard";
import Paper from "../components/Paper";
import { HAND, MF, penOf } from "../theme";
import { useServerNow } from "../useServerNow";

type Props = { group: Group; gs: MtfGameState; playerId: string };


export default function MtfRevealScreen({ group, gs, playerId }: Props) {
  const now = useServerNow(150);
  const last = gs.last;
  const step = revealStep(gs, now);
  const nameOf = (id: string) => (id === playerId ? "You" : group.players.find((p) => p.id === id)?.name ?? "Someone");
  const stepMs = gs.revealStepMs ?? REVEAL_STEP_MS;
  const drumrollMs = Math.min(2600, Math.round(stepMs * 0.45));
  const isHost = group.hostId === playerId;
  const [skipping, setSkipping] = useState(false);
  const skip = isHost ? (
    <TouchableOpacity
      style={[styles.skipBtn, skipping && { opacity: 0.45 }]}
      disabled={skipping}
      onPress={async () => {
        setSkipping(true);
        try {
          await mtfToRoundEnd(group.id, gs.seq, playerId);
        } finally {
          setSkipping(false);
        }
      }}
    >
      <Text style={styles.skipText}>Skip to the marks ⏭</Text>
    </TouchableOpacity>
  ) : undefined;

  if (!last) return <Paper kicker="The reveal">{null}</Paper>;

  if (step === "board") {
    const names = gs.targets[playerId] ?? [];
    const board = gs.lines[playerId] ?? {};
    const marks = Object.fromEntries(names.filter((n) => board[n]).map((n) => [n, isRight(gs, n, board[n])]));
    return (
      <Paper kicker={`Q${gs.round} · Your paper, marked`} footer={skip}>
        <Text style={styles.score}>
          {last.correct[playerId] ?? 0}/{last.lines[playerId] ?? names.length}
        </Text>
        <Text style={styles.scoreSub}>right lines this round</Text>
        <MatchBoard
          names={names.map((id) => ({ id, label: nameOf(id), color: penOf(gs.seats, id) }))}
          answers={(gs.order[playerId] ?? []).map((id) => ({ id, text: gs.answers[id]?.text ?? "", empty: !gs.answers[id] }))}
          lines={board}
          marks={marks}
        />
      </Paper>
    );
  }

  const author = last.revealOrder[step];
  const answer = gs.answers[author];
  const into = now - (gs.revealAt ?? now) - step * stepMs;
  const shown = into >= drumrollMs;
  // Everyone whose board had this answer: which name they joined it to.
  const guesses: { viewer: string; name?: string }[] = gs.seats
    .filter((v) => (gs.order[v] ?? []).includes(author))
    .map((v) => ({ viewer: v, name: Object.entries(gs.lines[v] ?? {}).find(([, a]) => a === author)?.[0] }));
  const byName = new Map<string, string[]>();
  for (const g of guesses) {
    const key = g.name ?? "—";
    byName.set(key, [...(byName.get(key) ?? []), g.viewer]);
  }
  const rightCount = guesses.filter((g) => g.name && isRight(gs, g.name, author)).length;

  return (
    <Paper kicker={`Q${gs.round} · Answer ${step + 1} of ${last.revealOrder.length}`} footer={skip}>
      <Text style={styles.prompt}>{gs.prompt}</Text>
      <View style={styles.answerCard}>
        <Text style={[styles.answerText, !answer && styles.empty]}>{answer ? `“${answer.text}”` : "…(no answer)"}</Text>
      </View>

      <Text style={styles.label}>YOU ALL SAID…</Text>
      <View style={{ gap: 8 }}>
        {[...byName.entries()]
          .sort((a, b) => b[1].length - a[1].length)
          .map(([name, viewers]) => {
            const right = shown && name !== "—" && isRight(gs, name, author);
            return (
              <View key={name} style={[styles.guessRow, right && styles.guessRight]}>
                <Text style={[styles.guessName, { color: name === "—" ? MF.faint : penOf(gs.seats, name) }]}>
                  {name === "—" ? "No line" : nameOf(name)}
                </Text>
                <Text style={styles.guessBy} numberOfLines={2}>
                  ← {viewers.map(nameOf).join(", ")}
                </Text>
              </View>
            );
          })}
      </View>

      <View style={styles.stamp}>
        {shown ? (
          <>
            <Text style={styles.stampSmall}>WRITTEN BY</Text>
            <Text style={[styles.stampName, { color: penOf(gs.seats, author) }]}>{nameOf(author)}</Text>
            <Text style={styles.stampNote}>
              {guesses.length === 0
                ? "Nobody had this one this round"
                : rightCount === 0
                  ? "🎭 Fooled everyone!"
                  : rightCount === guesses.length
                    ? "📖 Everyone saw it coming"
                    : `${rightCount} of ${guesses.length} got it`}
            </Text>
          </>
        ) : (
          <Text style={styles.drum}>🥁 And it was written by…</Text>
        )}
      </View>
    </Paper>
  );
}

const styles = StyleSheet.create({
  skipBtn: { borderWidth: 2, borderColor: MF.ink, borderRadius: 14, paddingVertical: 12, alignItems: "center" },
  skipText: { color: MF.ink, fontSize: 15, fontWeight: "900" },
  prompt: { color: MF.muted, fontSize: 15, fontWeight: "700", fontFamily: HAND },
  answerCard: { backgroundColor: MF.card, borderRadius: 18, borderWidth: 2, borderColor: MF.ink, padding: 20, alignItems: "center" },
  answerText: { color: MF.pencil, fontSize: 22, fontWeight: "800", textAlign: "center", lineHeight: 30 },
  empty: { color: MF.faint, fontStyle: "italic" },
  label: { color: MF.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1.5 },
  guessRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: MF.card, borderRadius: 12, borderWidth: 1.5, borderColor: MF.cardLine, padding: 12 },
  guessRight: { borderColor: MF.right, backgroundColor: "#EAF7EF" },
  guessName: { fontSize: 16, fontWeight: "900", minWidth: 80 },
  guessBy: { color: MF.muted, fontSize: 14, fontWeight: "600", flexShrink: 1 },
  stamp: { marginTop: 6, alignItems: "center", paddingVertical: 16, borderWidth: 3, borderStyle: "dashed", borderColor: MF.stamp, borderRadius: 18, gap: 4 },
  stampSmall: { color: MF.stamp, fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  stampName: { fontSize: 34, fontWeight: "900", fontFamily: HAND },
  stampNote: { color: MF.pencil, fontSize: 14, fontWeight: "800" },
  drum: { color: MF.stamp, fontSize: 20, fontWeight: "900", fontFamily: HAND },
  score: { color: MF.ink, fontSize: 54, fontWeight: "900", textAlign: "center", fontFamily: HAND },
  scoreSub: { color: MF.muted, fontSize: 14, fontWeight: "700", textAlign: "center", marginTop: -8 },
});
