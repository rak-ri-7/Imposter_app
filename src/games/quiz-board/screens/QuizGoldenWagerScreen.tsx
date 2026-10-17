// src/games/quiz-board/screens/QuizGoldenWagerScreen.tsx
// A golden tile was picked: big reveal, then the picker bets before seeing
// the question, or passes and it plays as a normal tile. Everyone else watches.
import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import { QUIZ_CATEGORIES, formatRupees } from "../../../shared/quiz";
import type { Group } from "../../../shared/types";
import { getServerNow } from "../../../shared/firebase/time";
import { playSound } from "../../../shared/sounds/soundManager";
import type { QuizBoardCtx } from "../logic/useQuizBoard";
import {
  GOLDEN_WAGER_STEP,
  clampWager,
  goldenMaxWager,
} from "../logic/board";
import { passGoldenTile, placeGoldenWager } from "../logic/game";
import { RetroButton } from "../components";
import { QB, bevel, digitText, displayText } from "../theme";

type Props = { group: Group; playerId: string; ctx: QuizBoardCtx };

export default function QuizGoldenWagerScreen({ group, playerId, ctx }: Props) {
  const { gs, isHost, nameOf } = ctx;
  const golden = gs?.current?.golden;
  const tile = gs && gs.current ? gs.tiles[gs.current.tileIndex] : undefined;
  const money = golden ? gs?.money?.[golden.playerId] ?? 0 : 0;
  const max = goldenMaxWager(gs?.boardSize, !!gs?.current?.double);
  const [wager, setWager] = useState(() =>
    clampWager(gs?.current?.value ?? tile?.value ?? 1000, max),
  );
  const [busy, setBusy] = useState(false);
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    playSound("reveal-1");
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  if (!gs || !golden || !tile) return <View style={styles.container} />;

  const isPicker = golden.playerId === playerId;
  const cat = QUIZ_CATEGORIES[tile.category];
  const canBet = isPicker || isHost;
  const set = (n: number) => setWager(clampWager(n, max));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      console.error(e);
      setBusy(false);
    }
  };
  const lock = () =>
    run(() => placeGoldenWager(group.id, playerId, wager, getServerNow()));
  const pass = () => run(() => passGoldenTile(group.id, playerId, getServerNow()));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.marquee, { opacity: glow }]}>
        <Text style={displayText(40, QB.ink, false)}>🌟 Golden Tile!</Text>
      </Animated.View>

      <Text style={[displayText(18), styles.center]}>
        {cat.emoji} {cat.label}
      </Text>
      <Text style={styles.sub}>
        {isPicker ? "Bet" : `${nameOf(golden.playerId)} bets`} before seeing the
        question. Right wins the bet, wrong loses it, and only{" "}
        {isPicker ? "you answer" : `${nameOf(golden.playerId)} answers`}. Or pass,
        and it plays as a normal {formatRupees(gs.current?.value ?? tile.value)} tile
        for everyone.
      </Text>
      {gs.current?.double && (
        <Text style={[displayText(14, QB.gold), styles.center]}>
          💰 Double Money: bets up to {formatRupees(max)}
        </Text>
      )}

      {canBet ? (
        <View style={styles.betBox}>
          {!isPicker && (
            <Text style={styles.note}>
              Betting for {nameOf(golden.playerId)} (host)
            </Text>
          )}
          <Text style={styles.note}>
            Money: {formatRupees(money)} · Bet {formatRupees(500)} – {formatRupees(max)}
          </Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => set(wager - GOLDEN_WAGER_STEP)}
            >
              <Text style={displayText(28)}>−</Text>
            </TouchableOpacity>
            <Text style={[digitText(34), styles.amount]}>
              {formatRupees(wager)}
            </Text>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => set(wager + GOLDEN_WAGER_STEP)}
            >
              <Text style={displayText(28)}>+</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.row}>
            <RetroButton
              label={`Tile ${formatRupees(gs.current?.value ?? tile.value)}`}
              variant="blue"
              style={styles.flex}
              onPress={() => set(gs.current?.value ?? tile.value)}
            />
            <RetroButton
              label="Half"
              variant="blue"
              style={styles.flex}
              onPress={() => set(max / 2)}
            />
            <RetroButton
              label="Max"
              variant="red"
              style={styles.flex}
              onPress={() => set(max)}
            />
          </View>
          <RetroButton
            label={busy ? "Locking…" : `Lock bet ${formatRupees(wager)} ▶`}
            disabled={busy}
            onPress={lock}
          />
          <RetroButton
            label="Pass · play it as a normal tile"
            variant="ghost"
            disabled={busy}
            onPress={pass}
          />
        </View>
      ) : (
        <Text style={[displayText(16, QB.dim), styles.center, styles.waiting]}>
          {nameOf(golden.playerId)} is placing a bet…
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: QB.bg,
    paddingTop: 60,
    paddingHorizontal: 16,
    gap: 12,
  },
  marquee: {
    backgroundColor: QB.gold,
    paddingVertical: 22,
    alignItems: "center",
    borderWidth: 4,
    borderColor: QB.goldDark,
  },
  center: { textAlign: "center" },
  sub: { color: QB.white, fontSize: 15, textAlign: "center", lineHeight: 21 },
  note: { color: QB.dim, fontSize: 13, textAlign: "center" },
  betBox: {
    backgroundColor: QB.panel,
    padding: 16,
    gap: 12,
    marginTop: 8,
    ...bevel,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepBtn: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: QB.tile,
    ...bevel,
  },
  amount: { flex: 1, textAlign: "center" },
  row: { flexDirection: "row", gap: 8 },
  flex: { flex: 1 },
  waiting: { marginTop: 30 },
});
