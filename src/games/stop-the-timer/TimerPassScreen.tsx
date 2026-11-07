// src/games/stop-the-timer/TimerPassScreen.tsx
// ⏱️ Stop the Timer, pass-the-phone version. One phone goes round: each
// player gets their own question (same difficulty for everyone that round,
// so nobody can work theirs out while waiting), counts in their head, and
// stops the hidden timer. Nobody sees a time until everyone has played;
// then the round's results show on the one screen.
import { useEffect, useRef, useState } from "react";
import { Alert, Animated, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../../App";
import { generateQuestionForRound, type Question } from "./data/questions";
import { MAX_TIMER_MS, countdownSecondsFor } from "./logic/game";
import { useDistractions } from "./hooks/useDistractions";
import { useRunningDistractions } from "./hooks/useRunningDistractions";
import { useAmbientSounds } from "./hooks/useAmbientSounds";
import DistractionWrapper from "./components/DistractionWrapper";
import DistractionOverlay from "./components/DistractionOverlay";
import HandOff from "../../shared/passPhone/HandOff";
import { addLocalPoints, rotate, useLocalPlayers } from "../../shared/passPhone/useLocalPlayers";

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, "TimerPass"> };

type Turn = { name: string; q: Question; stoppedAt: number | null };
type Row = Turn & { diff: number; place: number; points: number };
type Phase = "intro" | "cover" | "question" | "running" | "stopped" | "result" | "over";

// Same scoring as the online game: closest first; points = players beaten.
// Equal distances share a place. Not stopping in time scores nothing.
const rankTurns = (turns: Turn[]): Row[] => {
  const n = turns.length;
  const rows: Row[] = turns.map((t) => ({
    ...t,
    diff: t.stoppedAt === null ? Infinity : Math.abs(t.stoppedAt - t.q.answer * 1000),
    place: 0,
    points: 0,
  }));
  const stopped = rows.filter((r) => r.stoppedAt !== null).sort((a, b) => a.diff - b.diff);
  let position = 0;
  stopped.forEach((r, i) => {
    const prev = stopped[i - 1];
    const tied = !!prev && prev.diff === r.diff;
    if (!tied) position = i + 1;
    r.place = tied ? prev.place : prev ? prev.place + 1 : 1;
    r.points = Math.max(0, n - position);
  });
  const missed = rows.filter((r) => r.stoppedAt === null);
  const lastPlace = stopped.length ? stopped[stopped.length - 1].place : 0;
  missed.forEach((r) => (r.place = lastPlace + 1));
  return [...stopped, ...missed];
};

const secs = (ms: number) => `${(ms / 1000).toFixed(2)}s`;
const medal = (place: number, missed: boolean) =>
  missed ? "—" : place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : `${place}.`;

export default function TimerPassScreen({ navigation }: Props) {
  const players = useLocalPlayers();
  const [phase, setPhase] = useState<Phase>("intro");
  const [distractions, setDistractions] = useState(true);
  const [round, setRound] = useState(1);
  const [order, setOrder] = useState<string[]>([]);
  const [turnIdx, setTurnIdx] = useState(0);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [roundsScored, setRoundsScored] = useState(0);
  const recent = useRef<string[]>([]);
  const saved = useRef(false);

  // Timing for the player holding the phone.
  const [countdown, setCountdown] = useState(0);
  const startAt = useRef(0);
  const current = turns[turnIdx];

  const quit = () => navigation.popTo("QuickPlay");
  const finish = async () => {
    if (!saved.current) {
      saved.current = true;
      await addLocalPoints(totals).catch(() => {});
    }
    setPhase("over");
  };
  const confirmEnd = () =>
    Alert.alert(
      "End the game?",
      roundsScored > 0
        ? "Points from finished rounds are kept. The round in progress doesn't count."
        : "Nothing has been scored yet.",
      [
        { text: "Keep playing", style: "cancel" },
        { text: "End game", style: "destructive", onPress: () => (Object.keys(totals).length ? finish() : quit()) },
      ],
    );

  // Android back: ask first, never just drop the game.
  // Back (Android button, or anything else that would pop this screen)
  // mid-game asks first. Done with beforeRemove so it can't be skipped,
  // whichever back handler gets the press first.
  useEffect(
    () =>
      navigation.addListener("beforeRemove", (e) => {
        if (phase === "intro" || phase === "over") return;
        const t = e.data.action.type;
        if (t !== "GO_BACK" && t !== "POP") return;
        e.preventDefault();
        confirmEnd();
      }),
    [navigation, phase, totals, roundsScored],
  );

  const startRound = (r: number) => {
    if (!players) return;
    const ord = rotate(players, r - 1);
    // One difficulty for the whole round, so it's fair.
    let level: Question["difficulty"] | undefined;
    const qs: Turn[] = ord.map((name) => {
      const q = generateQuestionForRound(r, recent.current, level);
      level = q.difficulty;
      recent.current = [...recent.current, q.templateId].slice(-12);
      return { name, q, stoppedAt: null };
    });
    setRound(r);
    setOrder(ord);
    setTurns(qs);
    setTurnIdx(0);
    setPhase("cover");
  };

  // Question: count down, then start the hidden timer.
  useEffect(() => {
    if (phase !== "question" || !current) return;
    const total = countdownSecondsFor(current.q.difficulty) * 1000;
    const until = Date.now() + total;
    setCountdown(Math.ceil(total / 1000));
    const t = setInterval(() => {
      const left = until - Date.now();
      if (left <= 0) {
        clearInterval(t);
        startAt.current = Date.now();
        setPhase("running");
      } else setCountdown(Math.ceil(left / 1000));
    }, 100);
    return () => clearInterval(t);
  }, [phase, turnIdx]);

  // Running: out of time after the longest possible answer.
  useEffect(() => {
    if (phase !== "running") return;
    const t = setTimeout(() => record(null), MAX_TIMER_MS);
    return () => clearTimeout(t);
  }, [phase, turnIdx]);

  const record = (stoppedAt: number | null) => {
    setTurns((prev) => prev.map((t, i) => (i === turnIdx ? { ...t, stoppedAt } : t)));
    setPhase("stopped");
  };
  const stop = () => {
    const elapsed = Date.now() - startAt.current;
    record(elapsed < MAX_TIMER_MS ? elapsed : null);
  };

  const next = () => {
    if (turnIdx + 1 < order.length) {
      setTurnIdx(turnIdx + 1);
      setPhase("cover");
    } else {
      // Everyone's played: score the round.
      const rows = rankTurns(turns);
      setTotals((prev) => {
        const out = { ...prev };
        for (const r of rows) out[r.name] = (out[r.name] ?? 0) + r.points;
        return out;
      });
      setRoundsScored((n) => n + 1);
      setPhase("result");
    }
  };

  // Distractions, exactly as online.
  const q = useDistractions({ enabled: distractions, active: phase === "question", roundKey: `${round}:${turnIdx}` });
  const run = useRunningDistractions({
    enabled: distractions,
    active: phase === "running",
    timerStartedAt: startAt.current,
    answer: current?.q.answer ?? 0,
  });
  useAmbientSounds({ enabled: distractions, active: phase === "running" });

  // A gentle pulse on the STOP button.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (phase !== "running") return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase]);

  if (!players) return <View style={styles.container} />;

  // ── Intro ─────────────────────────────────────────────────────────
  if (phase === "intro") {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>⏱️ Stop the Timer</Text>
          <Text style={styles.subtitle}>Pass the phone · {players.length} players</Text>
          <View style={styles.box}>
            <Text style={styles.boxTitle}>How it works</Text>
            {[
              "The phone goes round. Each of you gets your own question (same difficulty for everyone).",
              "Work out the answer before the countdown ends. Then a hidden timer starts.",
              "Count in your head and tap STOP when you think it's reached your answer.",
              "Don't say your time! Results show once everyone has played.",
              "Closest to their answer wins the round.",
            ].map((r, i) => (
              <Text key={i} style={styles.rule}>
                {i + 1}. {r}
              </Text>
            ))}
          </View>
          <View style={[styles.box, styles.switchRow]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.boxTitle}>😱 Distractions</Text>
              <Text style={styles.rule}>Flashes, wobbles and noises while you count.</Text>
            </View>
            <Switch value={distractions} onValueChange={setDistractions} />
          </View>
        </ScrollView>
        <TouchableOpacity style={styles.primary} onPress={() => startRound(1)}>
          <Text style={styles.primaryText}>Start round 1 →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.link} onPress={quit}>
          <Text style={styles.linkText}>Back to menu</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Hand-off ──────────────────────────────────────────────────────
  if (phase === "cover" && current) {
    return (
      <HandOff
        name={current.name}
        emoji="⏱️"
        step={`ROUND ${round} · ${turnIdx + 1} OF ${order.length}`}
        hint="Your question appears as soon as you tap. Work it out fast, then count in your head!"
        button="Show my question →"
        onReady={() => setPhase("question")}
        onQuit={confirmEnd}
      />
    );
  }

  // ── Question + countdown ──────────────────────────────────────────
  if (phase === "question" && current) {
    const text = current.q.question;
    const size = text.length <= 20 ? 48 : text.length <= 45 ? 34 : text.length <= 80 ? 26 : 22;
    const color = { easy: "#4CAF50", medium: "#FFD700", hard: "#E63946" }[current.q.difficulty];
    return (
      <View style={[styles.container, styles.center]}>
        <View style={styles.header}>
          <Text style={styles.roundLabel}>{current.name.toUpperCase()} · ROUND {round}</Text>
          <View style={[styles.diffBadge, { borderColor: color }]}>
            <Text style={[styles.diffText, { color }]}>{current.q.difficulty.toUpperCase()}</Text>
          </View>
        </View>
        <DistractionWrapper distraction={q.current}>
          <View style={styles.questionBox}>
            <Text style={styles.questionLabel}>CALCULATE</Text>
            <Text style={[styles.question, { fontSize: size, lineHeight: Math.round(size * 1.25) }]} adjustsFontSizeToFit numberOfLines={6}>
              {text}
            </Text>
          </View>
        </DistractionWrapper>
        <Text style={styles.countdownLabel}>Timer starts in</Text>
        <Text style={[styles.countdown, countdown <= 3 && { color: "#E63946" }]}>{countdown}</Text>
        <DistractionOverlay distraction={q.current} />
      </View>
    );
  }

  // ── Hidden timer ──────────────────────────────────────────────────
  if (phase === "running") {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.tapHint}>Tap when you think the timer matches your answer!</Text>
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <TouchableOpacity style={styles.stopBtn} onPress={stop}>
            <Text style={styles.stopText}>STOP</Text>
          </TouchableOpacity>
        </Animated.View>
        <Text style={styles.subHint}>The timer is running…{"\n"}count in your head!</Text>
        <DistractionOverlay distraction={run.current} />
      </View>
    );
  }

  // ── Stopped: hide it and pass on ──────────────────────────────────
  if (phase === "stopped" && current) {
    const last = turnIdx + 1 >= order.length;
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={{ fontSize: 64 }}>{current.stoppedAt === null ? "⏰" : "✋"}</Text>
        <Text style={styles.stoppedTitle}>{current.stoppedAt === null ? "Out of time!" : "Stopped!"}</Text>
        <Text style={styles.subHint}>Keep your time to yourself. All the results show at the end of the round.</Text>
        <TouchableOpacity style={[styles.primary, { alignSelf: "stretch", marginTop: 28 }]} onPress={next}>
          <Text style={styles.primaryText}>{last ? "See the results →" : `Pass to ${order[turnIdx + 1]} →`}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Round results ─────────────────────────────────────────────────
  if (phase === "result") {
    const rows = rankTurns(turns);
    const winners = rows.filter((r) => r.place === 1 && r.stoppedAt !== null);
    return (
      <View style={styles.container}>
        <Text style={styles.roundTitle}>ROUND {round} RESULTS</Text>
        {winners.length > 0 ? (
          <View style={styles.winnerBox}>
            <Text style={{ fontSize: 24 }}>{winners.length > 1 ? "🤝" : "🏆"}</Text>
            <Text style={styles.winnerText}>
              <Text style={styles.winnerName}>{winners.map((w) => w.name).join(" & ")}</Text>
              {winners.length > 1 ? " tied for closest!" : ` closest, ${secs(winners[0].diff)} off!`}
            </Text>
          </View>
        ) : (
          <View style={styles.winnerBox}>
            <Text style={styles.winnerText}>⏰ Nobody stopped in time. No points this round.</Text>
          </View>
        )}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
          {rows.map((r) => (
            <View key={r.name} style={[styles.row, r.place === 1 && r.stoppedAt !== null && styles.rowWin]}>
              <Text style={styles.rowPlace}>{medal(r.place, r.stoppedAt === null)}</Text>
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowName}>{r.name}</Text>
                  {r.points > 0 && <Text style={styles.pts}>+{r.points}</Text>}
                </View>
                <Text style={styles.rowQ} numberOfLines={2}>
                  {r.q.question}
                </Text>
                <Text style={styles.rowQ}>
                  Answer: <Text style={styles.rowAns}>{r.q.answer}</Text>
                </Text>
                <Text style={r.stoppedAt === null ? styles.rowMiss : styles.rowTime}>
                  {r.stoppedAt === null
                    ? "Ran out of time ⏰"
                    : `Stopped at ${secs(r.stoppedAt)} · ${r.diff < 100 ? "exact! 🎯" : `${secs(r.diff)} ${r.stoppedAt > r.q.answer * 1000 ? "late" : "early"}`}`}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.primary} onPress={() => startRound(round + 1)}>
          <Text style={styles.primaryText}>Next round →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} onPress={finish}>
          <Text style={styles.secondaryText}>End game</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Game over ─────────────────────────────────────────────────────
  const board = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🏁 Game over</Text>
      <Text style={styles.subtitle}>
        {roundsScored} round{roundsScored === 1 ? "" : "s"} played · points added to the Quick Play board
      </Text>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8 }}>
        {board.map(([name, pts], i) => (
          <View key={name} style={[styles.row, i === 0 && styles.rowWin]}>
            <Text style={styles.rowPlace}>{medal(board.findIndex(([, p]) => p === pts) + 1, false)}</Text>
            <Text style={[styles.rowName, { flex: 1 }]}>{name}</Text>
            <Text style={styles.pts}>+{pts}</Text>
          </View>
        ))}
      </ScrollView>
      <TouchableOpacity style={styles.primary} onPress={quit}>
        <Text style={styles.primaryText}>Back to Quick Play</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1B2A", padding: 24, paddingTop: 60 },
  center: { alignItems: "center", justifyContent: "center" },
  scroll: { gap: 16, paddingBottom: 16 },
  title: { color: "#fff", fontSize: 30, fontWeight: "900", textAlign: "center" },
  subtitle: { color: "#4FC3F7", fontSize: 14, textAlign: "center", marginTop: -8 },
  box: { backgroundColor: "#1B2A3B", borderRadius: 16, padding: 16, gap: 6, borderWidth: 1, borderColor: "#2A3A4B" },
  boxTitle: { color: "#4FC3F7", fontSize: 15, fontWeight: "800", marginBottom: 2 },
  rule: { color: "#C8D1DB", fontSize: 14, lineHeight: 20 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  primary: { backgroundColor: "#4FC3F7", borderRadius: 14, padding: 18, alignItems: "center", marginTop: 12 },
  primaryText: { color: "#0D1B2A", fontSize: 17, fontWeight: "900" },
  secondary: { borderRadius: 14, padding: 14, alignItems: "center", marginTop: 8, borderWidth: 1, borderColor: "#E63946" },
  secondaryText: { color: "#E63946", fontSize: 15, fontWeight: "700" },
  link: { alignItems: "center", padding: 14 },
  linkText: { color: "#888", fontSize: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 28 },
  roundLabel: { color: "#888", fontSize: 13, letterSpacing: 2, fontWeight: "700" },
  diffBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  diffText: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  questionBox: { backgroundColor: "#1B2A3B", borderRadius: 20, padding: 24, alignItems: "center", alignSelf: "stretch", marginBottom: 32 },
  questionLabel: { color: "#888", fontSize: 12, letterSpacing: 3, marginBottom: 12 },
  question: { color: "#fff", fontWeight: "900", textAlign: "center" },
  countdownLabel: { color: "#888", fontSize: 14 },
  countdown: { color: "#4FC3F7", fontSize: 80, fontWeight: "900" },
  tapHint: { color: "#C8D1DB", fontSize: 16, textAlign: "center", marginBottom: 36 },
  stopBtn: { width: 220, height: 220, borderRadius: 110, backgroundColor: "#E63946", alignItems: "center", justifyContent: "center", borderWidth: 6, borderColor: "#FF6B76" },
  stopText: { color: "#fff", fontSize: 44, fontWeight: "900", letterSpacing: 4 },
  subHint: { color: "#888", fontSize: 14, textAlign: "center", marginTop: 28, lineHeight: 21, maxWidth: 300 },
  stoppedTitle: { color: "#fff", fontSize: 30, fontWeight: "900", marginTop: 8 },
  roundTitle: { color: "#888", fontSize: 14, letterSpacing: 2, textAlign: "center", marginBottom: 14 },
  winnerBox: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#1B2A3B", borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: "#FFD700" },
  winnerText: { color: "#C8D1DB", fontSize: 14, flex: 1, lineHeight: 20 },
  winnerName: { color: "#FFD700", fontWeight: "900", fontSize: 15 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#1B2A3B", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "transparent" },
  rowWin: { borderColor: "#FFD700", backgroundColor: "#1E2D1A" },
  rowPlace: { fontSize: 22, width: 40, textAlign: "center", color: "#888" },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowName: { color: "#fff", fontSize: 16, fontWeight: "800" },
  rowQ: { color: "#9AA7B5", fontSize: 13, marginTop: 2 },
  rowAns: { color: "#4FC3F7", fontWeight: "900" },
  rowTime: { color: "#C8D1DB", fontSize: 12, marginTop: 2 },
  rowMiss: { color: "#E63946", fontSize: 12, marginTop: 2 },
  pts: { color: "#4FC3F7", fontSize: 14, fontWeight: "900" },
});
