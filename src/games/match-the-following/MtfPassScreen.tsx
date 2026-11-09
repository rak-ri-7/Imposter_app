// src/games/match-the-following/MtfPassScreen.tsx
// ✏️ Match the Following, pass-the-phone version. Same rules and scoring as
// online (it runs on the same engine, with names as ids):
//   1. Everyone reads the situation together.
//   2. The phone goes round: each player writes their answer privately.
//   3. The phone goes round again: each player draws their lines.
//   4. The reveal plays on the one screen, one answer at a time.
// No timers: the phone in your hand is the clock.
import { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../../App";
import type { MtfDeck, MtfGameState } from "../../shared/types";
import {
  DEFAULT_ROUNDS,
  MAX_CHARS,
  MIN_PLAYERS,
  ROUND_OPTIONS,
  awards,
  endEarly,
  isRight,
  newGame,
  nextRound,
  standings,
  submitAnswer,
  submitBoard,
  toMatch,
  toReveal,
  toRoundEnd,
} from "./logic/engine";
import MatchBoard from "./components/MatchBoard";
import Paper from "./components/Paper";
import { HAND, MF, penOf } from "./theme";
import HandOff, { type HandOffTheme } from "../../shared/passPhone/HandOff";
import { addLocalPoints, useLocalPlayers } from "../../shared/passPhone/useLocalPlayers";
import { EndPodium, type PodiumEntry } from "../../shared/components/WinnerPodium";

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, "MtfPass"> };

type Step =
  | { at: "setup" }
  | { at: "prompt" }
  | { at: "answerCover"; i: number }
  | { at: "answer"; i: number }
  | { at: "matchCover"; i: number }
  | { at: "match"; i: number }
  | { at: "reveal"; i: number; shown: boolean }
  | { at: "roundEnd" }
  | { at: "over" };

const DECKS: { id: MtfDeck; title: string; sub: string }[] = [
  { id: "wholesome", title: "😇 Wholesome", sub: "Safe for everyone, family included" },
  { id: "cheeky", title: "😏 Cheeky", sub: "Friends and colleagues (plus the wholesome ones)" },
  { id: "tricky", title: "🧠 Tricky", sub: "Only real dilemmas: hardest to match" },
];

const PAPER_HANDOFF: HandOffTheme = { bg: MF.paper, text: MF.ink, muted: MF.muted, accent: MF.ink, accentText: "#FFFFFF" };

export default function MtfPassScreen({ navigation }: Props) {
  const players = useLocalPlayers();
  const [step, setStep] = useState<Step>({ at: "setup" });
  const [rounds, setRounds] = useState<number>(DEFAULT_ROUNDS);
  const [deck, setDeck] = useState<MtfDeck>("wholesome");
  const [gs, setGs] = useState<MtfGameState | null>(null);
  const saved = useRef(false);

  const quit = () => navigation.popTo("QuickPlay");
  const runId = useRef(Math.random().toString(36).slice(2)).current; // this game, for the podium
  const finish = async (state: MtfGameState) => {
    setGs(state);
    if (!saved.current) {
      saved.current = true;
      const pts = Object.fromEntries(standings(state).map((r) => [r.playerId, r.points]));
      await addLocalPoints(pts).catch(() => {});
    }
    setStep({ at: "over" });
  };
  const confirmEnd = () =>
    Alert.alert("End the game?", "Finished rounds still count (2 or more are needed for points).", [
      { text: "Keep playing", style: "cancel" },
      {
        text: "End game",
        style: "destructive",
        onPress: () => (gs ? finish(endEarly(gs)) : quit()),
      },
    ]);

  // Back (Android button, or anything else that would pop this screen)
  // mid-game asks first. Done with beforeRemove so it can't be skipped,
  // whichever back handler gets the press first.
  useEffect(
    () =>
      navigation.addListener("beforeRemove", (e) => {
        if (step.at === "setup" || step.at === "over") return;
        const t = e.data.action.type;
        if (t !== "GO_BACK" && t !== "POP") return;
        e.preventDefault();
        confirmEnd();
      }),
    [navigation, step.at, gs],
  );

  if (!players) return <View style={{ flex: 1, backgroundColor: MF.paper }} />;
  const seats = gs?.seats ?? players;
  const pen = (id: string) => penOf(seats, id);

  // ── Setup ─────────────────────────────────────────────────────────
  if (step.at === "setup") {
    const tooFew = players.length < MIN_PLAYERS;
    return (
      <Paper
        kicker="Pass the phone"
        footer={
          <>
            <TouchableOpacity
              style={[styles.primary, tooFew && styles.off]}
              disabled={tooFew}
              onPress={() => {
                setGs(newGame(players, rounds, deck, Date.now()));
                setStep({ at: "prompt" });
              }}
            >
              <Text style={styles.primaryText}>{tooFew ? `Needs ${MIN_PLAYERS}+ players` : "Start →"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.link} onPress={quit}>
              <Text style={styles.linkText}>Back to menu</Text>
            </TouchableOpacity>
          </>
        }
      >
        <Text style={styles.title}>Match the Following</Text>
        <Text style={styles.sub}>{players.length} players, one phone. Everyone answers the same situation, then matches the answers to the names.</Text>
        <Text style={styles.label}>QUESTIONS</Text>
        {DECKS.map((d) => (
          <TouchableOpacity key={d.id} style={[styles.choice, deck === d.id && styles.choiceOn]} onPress={() => setDeck(d.id)}>
            <Text style={styles.choiceTitle}>{d.title}</Text>
            <Text style={styles.choiceSub}>{d.sub}</Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.label}>ROUNDS</Text>
        <View style={styles.row}>
          {ROUND_OPTIONS.map((n) => (
            <TouchableOpacity key={n} style={[styles.pill, rounds === n && styles.pillOn]} onPress={() => setRounds(n)}>
              <Text style={[styles.pillText, rounds === n && { color: "#fff" }]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Paper>
    );
  }

  if (!gs) return null;
  const kicker = `Q${gs.round} of ${gs.roundsTotal}`;
  const n = gs.seats.length;

  // ── Everyone reads the situation ──────────────────────────────────
  if (step.at === "prompt") {
    return (
      <Paper
        kicker={kicker}
        footer={
          <TouchableOpacity style={styles.primary} onPress={() => setStep({ at: "answerCover", i: 0 })}>
            <Text style={styles.primaryText}>Start answering →</Text>
          </TouchableOpacity>
        }
      >
        <Text style={styles.label}>READ IT OUT LOUD</Text>
        <View style={styles.promptCard}>
          <Text style={styles.prompt}>{gs.prompt}</Text>
        </View>
        <Text style={styles.sub}>
          The phone goes round and each of you writes how you'd really react, in private. Spelling, emojis and style all count: they're clues.
        </Text>
      </Paper>
    );
  }

  // ── Answers, one player at a time ─────────────────────────────────
  if (step.at === "answerCover") {
    const who = gs.seats[step.i];
    return (
      <HandOff
        theme={PAPER_HANDOFF}
        emoji="✏️"
        name={who}
        step={`ANSWERS · ${step.i + 1} OF ${n}`}
        hint="Write your answer where nobody can see."
        button="Write my answer →"
        onReady={() => setStep({ at: "answer", i: step.i })}
        onQuit={confirmEnd}
      />
    );
  }
  if (step.at === "answer") {
    const who = gs.seats[step.i];
    return (
      <AnswerPage
        key={who}
        gs={gs}
        who={who}
        kicker={kicker}
        onDone={(next) => {
          setGs(next);
          if (step.i + 1 < n) setStep({ at: "answerCover", i: step.i + 1 });
          else {
            setGs(toMatch(next, Date.now()));
            setStep({ at: "matchCover", i: 0 });
          }
        }}
      />
    );
  }

  // ── Matching, one player at a time ────────────────────────────────
  if (step.at === "matchCover") {
    const who = gs.seats[step.i];
    return (
      <HandOff
        theme={PAPER_HANDOFF}
        emoji="〰️"
        name={who}
        step={`MATCHING · ${step.i + 1} OF ${n}`}
        hint="Everyone's answers are in. Draw a line from each name to the answer you think they wrote."
        button="Draw my lines →"
        onReady={() => setStep({ at: "match", i: step.i })}
        onQuit={confirmEnd}
      />
    );
  }
  if (step.at === "match") {
    const who = gs.seats[step.i];
    return (
      <MatchPage
        key={who}
        gs={gs}
        who={who}
        kicker={kicker}
        pen={pen}
        onDone={(next) => {
          if (step.i + 1 < n) {
            setGs(next);
            setStep({ at: "matchCover", i: step.i + 1 });
          } else {
            setGs(toReveal(next, Date.now()));
            setStep({ at: "reveal", i: 0, shown: false });
          }
        }}
      />
    );
  }

  // ── The reveal, on the one screen ─────────────────────────────────
  if (step.at === "reveal" && gs.last) {
    const order = gs.last.revealOrder;
    const author = order[step.i];
    const answer = gs.answers[author];
    const guesses = gs.seats
      .filter((v) => (gs.order[v] ?? []).includes(author))
      .map((v) => ({ viewer: v, name: Object.entries(gs.lines[v] ?? {}).find(([, a]) => a === author)?.[0] }));
    const byName = new Map<string, string[]>();
    for (const g of guesses) byName.set(g.name ?? "—", [...(byName.get(g.name ?? "—") ?? []), g.viewer]);
    const rightCount = guesses.filter((g) => g.name && isRight(gs, g.name, author)).length;
    const last = step.i + 1 >= order.length;
    return (
      <Paper
        kicker={`${kicker} · Answer ${step.i + 1} of ${order.length}`}
        footer={
          step.shown ? (
            <TouchableOpacity
              style={styles.primary}
              onPress={() => {
                if (!last) setStep({ at: "reveal", i: step.i + 1, shown: false });
                else {
                  setGs(toRoundEnd(gs, Date.now()));
                  setStep({ at: "roundEnd" });
                }
              }}
            >
              <Text style={styles.primaryText}>{last ? "See the marks →" : "Next answer →"}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.primary, { backgroundColor: MF.stamp }]} onPress={() => setStep({ ...step, shown: true })}>
              <Text style={styles.primaryText}>🥁 Who wrote it?</Text>
            </TouchableOpacity>
          )
        }
      >
        <Text style={styles.promptSmall}>{gs.prompt}</Text>
        <View style={styles.answerCard}>
          <Text style={[styles.answerText, !answer && styles.empty]}>{answer ? `“${answer.text}”` : "…(no answer)"}</Text>
        </View>
        <Text style={styles.label}>YOU ALL SAID…</Text>
        <View style={{ gap: 8 }}>
          {[...byName.entries()]
            .sort((a, b) => b[1].length - a[1].length)
            .map(([name, viewers]) => {
              const right = step.shown && name !== "—" && isRight(gs, name, author);
              return (
                <View key={name} style={[styles.guessRow, right && styles.guessRight]}>
                  <Text style={[styles.guessName, { color: name === "—" ? MF.faint : pen(name) }]}>{name === "—" ? "No line" : name}</Text>
                  <Text style={styles.guessBy} numberOfLines={2}>
                    ← {viewers.join(", ")}
                  </Text>
                </View>
              );
            })}
        </View>
        {step.shown && (
          <View style={styles.stamp}>
            <Text style={styles.stampSmall}>WRITTEN BY</Text>
            <Text style={[styles.stampName, { color: pen(author) }]}>{author}</Text>
            <Text style={styles.stampNote}>
              {guesses.length === 0
                ? "Nobody had this one this round"
                : rightCount === 0
                  ? "🎭 Fooled everyone!"
                  : rightCount === guesses.length
                    ? "📖 Everyone saw it coming"
                    : `${rightCount} of ${guesses.length} got it`}
            </Text>
          </View>
        )}
      </Paper>
    );
  }

  // ── Marks for the round ───────────────────────────────────────────
  if (step.at === "roundEnd" && gs.last) {
    const last = gs.last;
    const table = standings(gs);
    const final = gs.round >= gs.roundsTotal;
    return (
      <Paper
        kicker={`${kicker} · Marks`}
        footer={
          <>
            <TouchableOpacity
              style={styles.primary}
              onPress={() => {
                const next = nextRound(gs, gs.seats, Date.now());
                if (next.phase === "over") finish(next);
                else {
                  setGs(next);
                  setStep({ at: "prompt" });
                }
              }}
            >
              <Text style={styles.primaryText}>{final ? "Final results →" : "Next question →"}</Text>
            </TouchableOpacity>
            {!final && (
              <TouchableOpacity style={styles.link} onPress={confirmEnd}>
                <Text style={styles.linkText}>End game</Text>
              </TouchableOpacity>
            )}
          </>
        }
      >
        <Text style={styles.label}>THIS ROUND · TOTAL</Text>
        {table.map((r) => (
          <View key={r.playerId} style={styles.scoreRow}>
            <Text style={styles.scoreRank}>{r.rank}.</Text>
            <Text style={[styles.scoreName, { color: pen(r.playerId) }]}>{r.playerId}</Text>
            <Text style={styles.scoreRound}>
              +{last.correct[r.playerId] ?? 0}/{last.lines[r.playerId] ?? 0}
            </Text>
            <Text style={styles.scoreTotal}>{r.score}</Text>
          </View>
        ))}
      </Paper>
    );
  }

  // ── Final results ─────────────────────────────────────────────────
  const table = standings(gs);
  const prize = awards(gs);
  const podium: PodiumEntry[] = table[0]?.score > 0 ? table.filter((r) => r.rank <= 3 && r.score > 0).map((r) => ({ id: r.playerId, name: r.playerId, rank: r.rank, score: `${r.score} right` })) : [];
  return (
    <Paper
      kicker="Final results"
      footer={
        <TouchableOpacity style={styles.primary} onPress={quit}>
          <Text style={styles.primaryText}>Back to Quick Play</Text>
        </TouchableOpacity>
      }
    >
      <EndPodium id={`mtf-pass:${runId}:${table.map((r) => r.playerId + r.score).join(",")}`} subtitle="MATCH THE FOLLOWING · FINAL" entries={podium} />
      <Text style={styles.title}>{table[0] && table[0].score > 0 ? `${table.filter((r) => r.rank === 1).map((r) => r.playerId).join(" & ")} top${table.filter((r) => r.rank === 1).length > 1 ? "" : "s"} the class!` : "Pens down!"}</Text>
      {table.map((r) => (
        <View key={r.playerId} style={styles.scoreRow}>
          <Text style={styles.scoreRank}>{r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : `${r.rank}.`}</Text>
          <Text style={[styles.scoreName, { color: pen(r.playerId) }]}>{r.playerId}</Text>
          <Text style={styles.scoreTotal}>{r.score}</Text>
          {r.points > 0 && <Text style={styles.pts}>+{r.points} pts</Text>}
        </View>
      ))}
      {table.every((r) => r.points === 0) && (
        <Text style={styles.sub}>Ended before 2 rounds were finished, so no Quick Play points this time.</Text>
      )}
      {(prize.pokerFace || prize.openBook) && (
        <View style={{ gap: 6, marginTop: 8 }}>
          {prize.pokerFace && <Text style={styles.award}>🎭 Poker Face: {prize.pokerFace}</Text>}
          {prize.openBook && <Text style={styles.award}>📖 Open Book: {prize.openBook}</Text>}
        </View>
      )}
    </Paper>
  );
}

// ── One player's answer ───────────────────────────────────────────────
function AnswerPage({ gs, who, kicker, onDone }: { gs: MtfGameState; who: string; kicker: string; onDone: (gs: MtfGameState) => void }) {
  const [text, setText] = useState("");
  const [presets, setPresets] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const send = (input: { text: string } | { preset: number }) => {
    const r = submitAnswer(gs, who, input, Date.now());
    if (!r.ok) return setErr(r.reason);
    onDone(r.gs);
  };
  return (
    <Paper
      kicker={`${kicker} · ${who}`}
      footer={
        <TouchableOpacity style={[styles.primary, !text.trim() && styles.off]} disabled={!text.trim()} onPress={() => send({ text })}>
          <Text style={styles.primaryText}>Hand it in & pass →</Text>
        </TouchableOpacity>
      }
    >
      <View style={styles.promptCard}>
        <Text style={styles.prompt}>{gs.prompt}</Text>
      </View>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={(t) => setText([...t].slice(0, MAX_CHARS).join(""))}
        placeholder="I would…"
        placeholderTextColor={MF.faint}
        multiline
        autoFocus
      />
      <Text style={styles.chars}>
        {[...text].length}/{MAX_CHARS}
      </Text>
      {err && <Text style={styles.err}>{err}</Text>}
      {presets ? (
        <View style={{ gap: 8 }}>
          {gs.presets.map((p, i) => (
            <TouchableOpacity key={i} style={styles.preset} onPress={() => send({ preset: i })}>
              <Text style={styles.presetText}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <TouchableOpacity onPress={() => setPresets(true)}>
          <Text style={styles.linkText}>Stuck? Show quick answers (easy to spot!)</Text>
        </TouchableOpacity>
      )}
    </Paper>
  );
}

// ── One player's board ────────────────────────────────────────────────
function MatchPage({
  gs,
  who,
  kicker,
  pen,
  onDone,
}: {
  gs: MtfGameState;
  who: string;
  kicker: string;
  pen: (id: string) => string;
  onDone: (gs: MtfGameState) => void;
}) {
  const [lines, setLines] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const names = gs.targets[who] ?? [];
  const complete = names.length > 0 && names.every((nm) => !!lines[nm]);
  return (
    <Paper
      kicker={`${kicker} · ${who}`}
      footer={
        <TouchableOpacity
          style={[styles.primary, !complete && styles.off]}
          disabled={!complete}
          onPress={() => {
            const r = submitBoard(gs, who, lines, true);
            if (!r.ok) return setErr(r.reason);
            onDone(r.gs);
          }}
        >
          <Text style={styles.primaryText}>{complete ? "Lock in & pass →" : `Draw all ${names.length} lines`}</Text>
        </TouchableOpacity>
      }
    >
      <Text style={styles.promptSmall}>{gs.prompt}</Text>
      <Text style={styles.sub}>Tap a name, then the answer you think they wrote.</Text>
      <MatchBoard
        names={names.map((id) => ({ id, label: id, color: pen(id) }))}
        answers={(gs.order[who] ?? []).map((id) => ({ id, text: gs.answers[id]?.text ?? "", empty: !gs.answers[id] }))}
        lines={lines}
        onChange={setLines}
      />
      {err && <Text style={styles.err}>{err}</Text>}
    </Paper>
  );
}

const styles = StyleSheet.create({
  title: { color: MF.ink, fontSize: 28, fontWeight: "900", fontFamily: HAND },
  sub: { color: MF.muted, fontSize: 14, lineHeight: 20 },
  label: { color: MF.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1.5, marginTop: 6 },
  choice: { backgroundColor: MF.card, borderRadius: 14, borderWidth: 2, borderColor: MF.cardLine, padding: 12 },
  choiceOn: { borderColor: MF.ink },
  choiceTitle: { color: MF.pencil, fontSize: 16, fontWeight: "800" },
  choiceSub: { color: MF.muted, fontSize: 13, marginTop: 2 },
  row: { flexDirection: "row", gap: 10 },
  pill: { flex: 1, borderRadius: 12, borderWidth: 2, borderColor: MF.ink, paddingVertical: 10, alignItems: "center" },
  pillOn: { backgroundColor: MF.ink },
  pillText: { color: MF.ink, fontSize: 18, fontWeight: "900" },
  primary: { backgroundColor: MF.ink, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  off: { opacity: 0.4 },
  link: { alignItems: "center", paddingTop: 12 },
  linkText: { color: MF.ink, fontSize: 14, fontWeight: "700", textAlign: "center" },
  promptCard: { backgroundColor: MF.card, borderRadius: 18, borderWidth: 2, borderColor: MF.ink, padding: 18 },
  prompt: { color: MF.ink, fontSize: 22, fontWeight: "800", fontFamily: HAND, lineHeight: 30 },
  promptSmall: { color: MF.muted, fontSize: 15, fontWeight: "700", fontFamily: HAND },
  input: { backgroundColor: MF.card, borderRadius: 14, borderWidth: 1.5, borderColor: MF.cardLine, padding: 14, fontSize: 18, color: MF.pencil, minHeight: 90, textAlignVertical: "top" },
  chars: { color: MF.faint, fontSize: 12, textAlign: "right", marginTop: -6 },
  err: { color: MF.wrong, fontWeight: "700" },
  preset: { backgroundColor: MF.paperDeep, borderRadius: 12, padding: 12 },
  presetText: { color: MF.pencil, fontSize: 15 },
  answerCard: { backgroundColor: MF.card, borderRadius: 18, borderWidth: 2, borderColor: MF.ink, padding: 20, alignItems: "center" },
  answerText: { color: MF.pencil, fontSize: 22, fontWeight: "800", textAlign: "center", lineHeight: 30 },
  empty: { color: MF.faint, fontStyle: "italic" },
  guessRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: MF.card, borderRadius: 12, borderWidth: 1.5, borderColor: MF.cardLine, padding: 12 },
  guessRight: { borderColor: MF.right, backgroundColor: "#EAF7EF" },
  guessName: { fontSize: 16, fontWeight: "900", minWidth: 80 },
  guessBy: { color: MF.muted, fontSize: 14, fontWeight: "600", flexShrink: 1 },
  stamp: { marginTop: 6, alignItems: "center", paddingVertical: 16, borderWidth: 3, borderStyle: "dashed", borderColor: MF.stamp, borderRadius: 18, gap: 4 },
  stampSmall: { color: MF.stamp, fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  stampName: { fontSize: 34, fontWeight: "900", fontFamily: HAND },
  stampNote: { color: MF.pencil, fontSize: 14, fontWeight: "800" },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: MF.card, borderRadius: 12, borderWidth: 1.5, borderColor: MF.cardLine, padding: 12 },
  scoreRank: { width: 30, fontSize: 18, fontWeight: "900", color: MF.muted, textAlign: "center" },
  scoreName: { flex: 1, fontSize: 17, fontWeight: "900" },
  scoreRound: { color: MF.right, fontSize: 14, fontWeight: "800" },
  scoreTotal: { color: MF.ink, fontSize: 20, fontWeight: "900", minWidth: 30, textAlign: "right" },
  pts: { color: MF.right, fontSize: 13, fontWeight: "900" },
  award: { color: MF.pencil, fontSize: 15, fontWeight: "800" },
});
