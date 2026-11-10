// src/games/quiz-board/QuizPassScreen.tsx
// 📺 Quiz Board, one-screen version. The phone sits on the table as the
// board; whoever holds it is the quizmaster for that question. Pick a tile,
// read the question out, everyone shouts (hands up / first to speak), then
// show the answer and mark who was right and who was wrong. Same board,
// same money rules as the online Buzzer mode: right wins the tile, every
// wrong answer loses it. Golden tiles and Double Money work too.
import { useEffect, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../../App";
import type { QuizBoardCurrent, QuizBoardSize, QuizBoardTile } from "../../shared/types";
import { QUIZ_CATEGORIES, formatRupees, type QuizCategory } from "../../shared/quiz";
import {
  BOARD_CATEGORIES,
  BOARD_SIZES,
  DEFAULT_WINDOW_MS,
  GOLDEN_MIN_WAGER,
  appendSeen,
  buildBoard,
  doubleMoneyActive,
  goldenMaxWager,
  instanceForTile,
  randomCategories,
} from "./logic/board";
import { RetroButton } from "./components";
import { QB, bevel, digitText, displayText } from "./theme";
import { addLocalPoints, useLocalPlayers } from "../../shared/passPhone/useLocalPlayers";
import HandOff from "../../shared/passPhone/HandOff";
import { EndPodium, type PodiumEntry } from "../../shared/components/WinnerPodium";
import { padBottom, useBottomInset } from "../../shared/hooks/useSafeBottom";

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, "QuizPass"> };

type Phase = "setup" | "board" | "golden" | "handoff" | "question" | "judge" | "final";
type Mark = "right" | "wrong";
type Live = Omit<QuizBoardCurrent, "golden"> & { value: number; double: boolean; isGolden: boolean };

const SEEN_KEY = "quizPassSeenIds"; // questions this phone has shown, so boards don't repeat
const GAP = 4;
const SIDE = 10;

export default function QuizPassScreen({ navigation }: Props) {
  const bottomInset = useBottomInset(); // clear of the phone's bottom bar
  const players = useLocalPlayers();
  const { width } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>("setup");
  const [size, setSize] = useState<QuizBoardSize>("quick");
  const [cats, setCats] = useState<QuizCategory[]>(() => randomCategories(BOARD_SIZES.quick.categories));
  const [tiles, setTiles] = useState<QuizBoardTile[]>([]);
  const [money, setMoney] = useState<Record<string, number>>({});
  const [picker, setPicker] = useState("");
  const [live, setLive] = useState<Live | null>(null);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [lastNote, setLastNote] = useState<string | null>(null);
  const [rounds, setRounds] = useState(0);
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const seen = useRef<string[]>([]);
  const saved = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY)
      .then((v) => (seen.current = v ? JSON.parse(v) : []))
      .catch(() => {});
  }, []);

  const quit = () => navigation.popTo("QuickPlay");
  const runId = useRef(Math.random().toString(36).slice(2)).current; // this game, for the podium
  const need = BOARD_SIZES[size].categories;

  // Final standings: by money, ties share a place; Quick Play points follow
  // the place, like online (players − place).
  const standings = (m = money, played = rounds) => {
    const rows = (players ?? []).map((p) => ({ name: p, money: m[p] ?? 0, rank: 0, points: 0 })).sort((a, b) => b.money - a.money);
    rows.forEach((r, i) => {
      r.rank = i > 0 && rows[i - 1].money === r.money ? rows[i - 1].rank : i + 1;
      r.points = played > 0 ? Math.max(0, rows.length - r.rank) : 0;
    });
    return rows;
  };
  const finish = async (m = money, played = rounds) => {
    setPhase("final");
    if (!saved.current) {
      saved.current = true;
      await addLocalPoints(Object.fromEntries(standings(m, played).map((r) => [r.name, r.points]))).catch(() => {});
    }
  };
  const confirmEnd = () =>
    Alert.alert("End the board now?", "Final standings use the money so far.", [
      { text: "Keep playing", style: "cancel" },
      { text: "End board", style: "destructive", onPress: () => finish() },
    ]);

  // Back (Android button, or anything else that would pop this screen)
  // mid-game asks first. Done with beforeRemove so it can't be skipped,
  // whichever back handler gets the press first.
  useEffect(
    () =>
      navigation.addListener("beforeRemove", (e) => {
        if (phase === "setup" || phase === "final") return;
        const t = e.data.action.type;
        if (t !== "GO_BACK" && t !== "POP") return;
        e.preventDefault();
        confirmEnd();
      }),
    [navigation, phase, money, rounds],
  );

  // The question's 30-second clock (just a guide: the quizmaster decides).
  useEffect(() => {
    if (phase !== "question") return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [phase]);

  if (!players) return <View style={styles.container} />;

  const start = () => {
    try {
      const board = buildBoard(cats, seen.current, size, "buzzer");
      setTiles(board);
      setMoney(Object.fromEntries(players.map((p) => [p, 0])));
      setPicker(players[Math.floor(Math.random() * players.length)]);
      setPhase("board");
    } catch (e) {
      Alert.alert("Couldn't build the board", String((e as Error)?.message ?? e));
    }
  };

  const pick = (index: number) => {
    const tile = tiles[index];
    if (!tile || tile.used) return;
    const double = doubleMoneyActive(tiles, size);
    const base = instanceForTile(tile, index);
    seen.current = appendSeen(seen.current, [tile.questionId]);
    AsyncStorage.setItem(SEEN_KEY, JSON.stringify(seen.current)).catch(() => {});
    setLive({ ...base, value: tile.value * (double ? 2 : 1), double, isGolden: !!tile.golden });
    setMarks({});
    setPhase(tile.golden ? "golden" : "handoff");
  };

  const applyMarks = () => {
    if (!live) return;
    const right = Object.entries(marks).find(([, m]) => m === "right")?.[0] ?? null;
    const wrong = Object.entries(marks).filter(([, m]) => m === "wrong").map(([p]) => p);
    const nextMoney = { ...money };
    if (right) nextMoney[right] = (nextMoney[right] ?? 0) + live.value;
    for (const p of wrong) nextMoney[p] = (nextMoney[p] ?? 0) - live.value;
    setMoney(nextMoney);
    const used = tiles.map((t, i) => (i === live.tileIndex ? { ...t, used: true } : t));
    setTiles(used);
    if (right) setPicker(right);
    setRounds(rounds + 1);
    setLastNote(
      [right ? `${right} +${formatRupees(live.value)}` : "Nobody got it", ...wrong.map((p) => `${p} −${formatRupees(live.value)}`)].join(" · "),
    );
    setLive(null);
    if (used.every((t) => t.used)) finish(nextMoney, rounds + 1);
    else setPhase("board");
  };

  // ── Setup ─────────────────────────────────────────────────────────
  if (phase === "setup") {
    const toggle = (c: QuizCategory) =>
      setCats((cur) => {
        if (cur.includes(c)) return cur.filter((x) => x !== c);
        const kept = cur.length >= need ? cur.slice(cur.length - need + 1) : cur;
        return [...kept, c];
      });
    return (
      <View style={[styles.container, padBottom(styles.container, bottomInset)]}>
        <ScrollView contentContainerStyle={styles.pad}>
          <View style={styles.marquee}>
            <Text style={displayText(36, QB.gold)}>Quiz Board</Text>
            <Text style={displayText(13)}>One phone · {players.length} players</Text>
          </View>
          <Text style={styles.label}>HOW IT WORKS</Text>
          <View style={styles.rules}>
            {[
              "The phone is the board. Whoever's picking chooses a tile; the quizmaster reads the question out.",
              "Anyone shouts the answer (hands up first if you like). The quizmaster shows the answer and marks who was right and who was wrong.",
              "Right wins the tile's rupees and picks next. Every wrong answer LOSES them, so don't guess blindly!",
              "🌟 Golden tiles: the picker bets first and answers alone. 💰 The last few tiles pay double.",
            ].map((r, i) => (
              <Text key={i} style={styles.rule}>
                {i + 1}. {r}
              </Text>
            ))}
          </View>
          <Text style={styles.label}>SHOW LENGTH</Text>
          <View style={styles.modeRow}>
            {(["quick", "full"] as QuizBoardSize[]).map((k) => (
              <TouchableOpacity
                key={k}
                style={[styles.mode, size === k && styles.modeOn]}
                onPress={() => {
                  setSize(k);
                  setCats(randomCategories(BOARD_SIZES[k].categories));
                }}
              >
                <Text style={displayText(16, size === k ? QB.gold : QB.white)}>
                  {BOARD_SIZES[k].emoji} {BOARD_SIZES[k].label}
                </Text>
                <Text style={styles.modeDesc}>{BOARD_SIZES[k].blurb}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.catHead}>
            <Text style={styles.label}>
              CATEGORIES ({cats.length}/{need})
            </Text>
            <TouchableOpacity onPress={() => setCats(randomCategories(need))}>
              <Text style={displayText(13, QB.gold)}>🎲 Random</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.chips}>
            {BOARD_CATEGORIES.map((c) => {
              const on = cats.includes(c);
              return (
                <TouchableOpacity key={c} onPress={() => toggle(c)} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={on ? displayText(12, QB.ink, false) : displayText(12)}>
                    {on ? "✓ " : ""}
                    {QUIZ_CATEGORIES[c].emoji} {QUIZ_CATEGORIES[c].label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <RetroButton label={cats.length === need ? "Build the board" : `Pick ${need} categories`} disabled={cats.length !== need} onPress={start} />
          <TouchableOpacity style={styles.link} onPress={quit}>
            <Text style={styles.linkText}>Back to menu</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const strip = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.strip}>
      {[...players]
        .sort((a, b) => (money[b] ?? 0) - (money[a] ?? 0))
        .map((p) => (
          <View key={p} style={[styles.podium, p === picker && styles.podiumPick]}>
            <Text numberOfLines={1} style={displayText(11, QB.dim)}>
              {p === picker ? "▶ " : ""}
              {p}
            </Text>
            <Text style={digitText(15, (money[p] ?? 0) < 0 ? QB.red : QB.gold)}>{formatRupees(money[p] ?? 0)}</Text>
          </View>
        ))}
    </ScrollView>
  );

  // ── The board ─────────────────────────────────────────────────────
  if (phase === "board") {
    const cols = cats.length;
    const tileW = Math.floor((width - SIDE * 2 - GAP * (cols - 1) - 8) / cols);
    const double = doubleMoneyActive(tiles, size);
    const left = tiles.filter((t) => !t.used).length;
    return (
      <View style={[styles.container, padBottom(styles.container, bottomInset)]}>
        <View style={styles.header}>
          <Text style={displayText(22, QB.gold)}>{picker} picks!</Text>
          <Text style={styles.hint}>Pick a tile, then hand the phone to the quizmaster</Text>
        </View>
        {strip}
        {double && (
          <View style={styles.doubleBanner}>
            <Text style={displayText(16, QB.ink, false)}>
              💰 Double Money · last {left} tile{left === 1 ? "" : "s"}
            </Text>
          </View>
        )}
        <ScrollView contentContainerStyle={{ paddingBottom: 30, gap: 12 }}>
          <View style={styles.board}>
            <View style={styles.row}>
              {cats.map((c) => (
                <View key={c} style={[styles.catCell, { width: tileW }]}>
                  <Text style={{ fontSize: 16 }}>{QUIZ_CATEGORIES[c].emoji}</Text>
                  <Text numberOfLines={2} adjustsFontSizeToFit style={[displayText(10), { textAlign: "center", lineHeight: 12 }]}>
                    {QUIZ_CATEGORIES[c].label}
                  </Text>
                </View>
              ))}
            </View>
            {Array.from({ length: Math.ceil(tiles.length / cols) }, (_, r) => (
              <View key={r} style={styles.row}>
                {cats.map((_, c) => {
                  const index = r * cols + c;
                  const tile = tiles[index];
                  if (!tile) return <View key={c} style={{ width: tileW }} />;
                  return (
                    <TouchableOpacity
                      key={c}
                      disabled={tile.used}
                      onPress={() => pick(index)}
                      style={[styles.tile, { width: tileW, height: Math.min(64, tileW * 0.8) }, tile.used && styles.tileUsed]}
                    >
                      {!tile.used && (
                        <Text numberOfLines={1} adjustsFontSizeToFit style={digitText(Math.max(13, Math.min(22, tileW / 4.2)))}>
                          {formatRupees(tile.value * (double ? 2 : 1))}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
          {lastNote && <Text style={styles.lastNote}>Last question: {lastNote}</Text>}
          <RetroButton label="End board" variant="ghost" onPress={confirmEnd} style={{ marginHorizontal: 12 }} />
        </ScrollView>
      </View>
    );
  }

  // ── Golden tile: the picker bets ──────────────────────────────────
  if (phase === "golden" && live) {
    const max = goldenMaxWager(size, live.double);
    const options = [...new Set([GOLDEN_MIN_WAGER, Math.round(max / 2 / 500) * 500, max])];
    return (
      <View style={[styles.container, styles.pad, { justifyContent: "center", gap: 14 }, padBottom(styles.container, bottomInset)]}>
        <Text style={[displayText(30, QB.gold), { textAlign: "center" }]}>🌟 Golden tile!</Text>
        <Text style={[styles.rule, { textAlign: "center" }]}>
          {picker} bets before hearing the question, then answers alone. Right wins the bet, wrong loses it.
        </Text>
        {options.map((w) => (
          <RetroButton
            key={w}
            label={`Bet ${formatRupees(w)}`}
            variant="blue"
            onPress={() => {
              setLive({ ...live, value: w });
              setPhase("handoff");
            }}
          />
        ))}
        <RetroButton
          label="Pass: play it as a normal tile"
          variant="ghost"
          onPress={() => {
            setLive({ ...live, isGolden: false });
            setPhase("handoff");
          }}
        />
      </View>
    );
  }

  // ── Hand the phone to the quizmaster ──────────────────────────────
  // The picker never sees the question: they pass the phone over, and only
  // the quizmaster's tap shows it (and starts the clock).
  if (phase === "handoff" && live) {
    const tile = tiles[live.tileIndex];
    return (
      <HandOff
        name="the quizmaster"
        emoji="🎤"
        hint={`${picker} picked ${QUIZ_CATEGORIES[tile.category].emoji} ${QUIZ_CATEGORIES[tile.category].label} for ${formatRupees(live.value)}${
          live.isGolden ? " (🌟 golden bet)" : live.double ? " (💰 double)" : ""
        }. Quizmaster: tap once you're holding the phone, then read the question out loud.`}
        button="Show the question"
        onReady={() => {
          setEndsAt(Date.now() + DEFAULT_WINDOW_MS);
          setNow(Date.now());
          setPhase("question");
        }}
        theme={{ bg: QB.bg, text: QB.white, muted: QB.dim, accent: QB.gold, accentText: QB.bg }}
      />
    );
  }

  // ── Question: read it out ─────────────────────────────────────────
  if (phase === "question" && live) {
    const tile = tiles[live.tileIndex];
    const leftMs = Math.max(0, endsAt - now);
    return (
      <View style={[styles.container, padBottom(styles.container, bottomInset)]}>
        <View style={[styles.pad, { flex: 1, gap: 14 }]}>
          <Text style={displayText(14, QB.dim)}>
            {QUIZ_CATEGORIES[tile.category].emoji} {QUIZ_CATEGORIES[tile.category].label} · {formatRupees(live.value)}
            {live.isGolden ? ` · 🌟 ${picker}'s bet` : live.double ? " · 💰 double" : ""}
          </Text>
          <View style={styles.timerTrack}>
            <View style={[styles.timerFill, { width: `${(leftMs / DEFAULT_WINDOW_MS) * 100}%` }, leftMs < 5000 && { backgroundColor: QB.red }]} />
          </View>
          <View style={styles.promptBox}>
            <Text style={[displayText(26), { textAlign: "center", lineHeight: 32 }]}>{live.prompt}</Text>
          </View>
          <Text style={[styles.rule, { textAlign: "center" }]}>
            {live.isGolden
              ? `Only ${picker} answers. Say it out loud!`
              : leftMs > 0
                ? "Read it out. First to shout (or hand up) answers!"
                : "⏰ Time! Last answers, then show it."}
          </Text>
        </View>
        <View style={styles.footer}>
          <RetroButton label="Show the answer" onPress={() => setPhase("judge")} />
        </View>
      </View>
    );
  }

  // ── Mark who was right / wrong ────────────────────────────────────
  if (phase === "judge" && live) {
    const cycle = (p: string) =>
      setMarks((prev) => {
        const cur = prev[p];
        const next: Record<string, Mark> = { ...prev };
        if (!cur) {
          // only one person can be right: moving ✓ clears the old one
          for (const k of Object.keys(next)) if (next[k] === "right") delete next[k];
          next[p] = "right";
        } else if (cur === "right") next[p] = "wrong";
        else delete next[p];
        return next;
      });
    const who = live.isGolden ? [picker] : players;
    return (
      <View style={[styles.container, padBottom(styles.container, bottomInset)]}>
        <ScrollView contentContainerStyle={[styles.pad, { gap: 12 }]}>
          <Text style={[displayText(14, QB.dim), { textAlign: "center" }]}>{live.prompt}</Text>
          <View style={styles.answerBox}>
            <Text style={displayText(12, QB.dim)}>ANSWER</Text>
            <Text style={[displayText(28, QB.gold), { textAlign: "center" }]}>{live.answer}</Text>
            {!!live.alsoAccepted?.length && <Text style={styles.also}>Also accept: {live.alsoAccepted.join(", ")}</Text>}
          </View>
          <Text style={styles.label}>
            {live.isGolden ? `WAS ${picker.toUpperCase()} RIGHT?` : "TAP: ✓ RIGHT · TAP AGAIN: ✗ WRONG · AGAIN: DIDN'T ANSWER"}
          </Text>
          {who.map((p) => {
            const m = marks[p];
            return (
              <TouchableOpacity key={p} style={[styles.markRow, m === "right" && styles.markRight, m === "wrong" && styles.markWrong]} onPress={() => cycle(p)}>
                <Text style={[displayText(18), { flex: 1 }]}>{p}</Text>
                <Text style={displayText(18, m === "right" ? QB.green : m === "wrong" ? QB.red : QB.dim)}>
                  {m === "right" ? `✓ +${formatRupees(live.value)}` : m === "wrong" ? `✗ −${formatRupees(live.value)}` : "—"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <View style={styles.footer}>
          <RetroButton
            label={live.isGolden && !marks[picker] ? "Mark the answer first" : "Done, back to the board"}
            disabled={live.isGolden && !marks[picker]}
            onPress={applyMarks}
          />
        </View>
      </View>
    );
  }

  // ── Final standings ───────────────────────────────────────────────
  const rows = standings();
  const podium: PodiumEntry[] = rounds > 0 ? rows.filter((r) => r.rank <= 3).map((r) => ({ id: r.name, name: r.name, rank: r.rank, score: formatRupees(r.money) })) : [];
  return (
    <View style={[styles.container, padBottom(styles.container, bottomInset)]}>
      <EndPodium id={`quiz-pass:${runId}:${rows.map((r) => r.name + r.money).join(",")}`} subtitle="QUIZ BOARD · FINAL" entries={podium} />
      <ScrollView contentContainerStyle={[styles.pad, { gap: 8 }]}>
        <View style={styles.marquee}>
          <Text style={displayText(30, QB.gold)}>Final Standings</Text>
          {rounds > 0 && rows[0] && <Text style={displayText(16)}>{rows.filter((r) => r.rank === 1).map((r) => r.name).join(" & ")} takes the crown!</Text>}
        </View>
        {rows.map((r) => (
          <View key={r.name} style={styles.finalRow}>
            <Text style={styles.finalRank}>{r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : `${r.rank}.`}</Text>
            <Text style={[displayText(17), { flex: 1 }]}>{r.name}</Text>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={digitText(17, r.money < 0 ? QB.red : QB.gold)}>{formatRupees(r.money)}</Text>
              {r.points > 0 && <Text style={styles.pts}>+{r.points} pts</Text>}
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <RetroButton label="Back to Quick Play" onPress={quit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: QB.bg, paddingTop: 48 },
  pad: { padding: 16 },
  marquee: { alignItems: "center", paddingVertical: 16, gap: 6, backgroundColor: QB.tile, marginBottom: 8, ...bevel, borderWidth: 4 },
  label: { color: QB.dim, fontSize: 12, letterSpacing: 2, marginTop: 10, marginBottom: 6 },
  rules: { backgroundColor: QB.panel, padding: 12, gap: 6 },
  rule: { color: QB.white, fontSize: 14, lineHeight: 20 },
  modeRow: { flexDirection: "row", gap: 8 },
  mode: { flex: 1, backgroundColor: QB.panel, padding: 10, borderWidth: 2, borderColor: QB.tileDark, gap: 4 },
  modeOn: { borderColor: QB.gold },
  modeDesc: { color: QB.dim, fontSize: 11 },
  catHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { backgroundColor: QB.panel, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: QB.tileDark },
  chipOn: { backgroundColor: QB.gold, borderColor: QB.goldDark },
  footer: { padding: 16, paddingBottom: 28, borderTopWidth: 2, borderTopColor: QB.tileDark },
  link: { alignItems: "center", paddingTop: 12 },
  linkText: { color: QB.dim, fontSize: 14 },
  header: { alignItems: "center", paddingBottom: 4, gap: 2 },
  hint: { color: QB.dim, fontSize: 11 },
  strip: { paddingHorizontal: 10, gap: 6, paddingVertical: 8, alignItems: "flex-start" },
  podium: { backgroundColor: QB.panel, paddingHorizontal: 10, paddingVertical: 6, minWidth: 80, borderWidth: 2, borderColor: QB.tileDark },
  podiumPick: { borderColor: QB.gold },
  doubleBanner: { backgroundColor: QB.gold, alignItems: "center", paddingVertical: 8, marginHorizontal: 10, marginBottom: 6, borderWidth: 3, borderColor: QB.goldDark },
  board: { backgroundColor: QB.frame, marginHorizontal: SIDE, padding: 4, gap: GAP, borderWidth: 3, borderColor: QB.goldDark },
  row: { flexDirection: "row", gap: GAP },
  catCell: { height: 58, backgroundColor: QB.tile, alignItems: "center", justifyContent: "center", paddingHorizontal: 2, ...bevel, borderWidth: 2 },
  tile: { backgroundColor: QB.tile, alignItems: "center", justifyContent: "center", ...bevel },
  tileUsed: { backgroundColor: QB.tileUsed, borderTopColor: QB.tileUsed, borderLeftColor: QB.tileUsed, borderBottomColor: QB.tileUsed, borderRightColor: QB.tileUsed },
  lastNote: { color: QB.dim, fontSize: 12, textAlign: "center", marginHorizontal: 16 },
  timerTrack: { height: 8, backgroundColor: QB.panel },
  timerFill: { height: 8, backgroundColor: QB.gold },
  promptBox: { backgroundColor: QB.tile, padding: 22, minHeight: 200, justifyContent: "center", ...bevel, borderWidth: 4 },
  answerBox: { backgroundColor: QB.tile, padding: 18, alignItems: "center", gap: 6, ...bevel, borderWidth: 4 },
  also: { color: QB.dim, fontSize: 12, textAlign: "center" },
  markRow: { flexDirection: "row", alignItems: "center", backgroundColor: QB.panel, padding: 14, borderWidth: 2, borderColor: QB.tileDark },
  markRight: { borderColor: QB.green },
  markWrong: { borderColor: QB.red },
  finalRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: QB.panel },
  finalRank: { fontSize: 18, width: 32, textAlign: "center", color: QB.white },
  pts: { color: QB.green, fontSize: 11 },
});
