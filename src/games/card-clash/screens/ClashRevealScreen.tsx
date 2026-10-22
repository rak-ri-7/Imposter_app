// The clash: every top card lands face-down, flips one by one, the winner
// slams forward and glows, then the beaten cards fly into the winner's pile.
// A tie at the top rolls the die first (a ★ gold card wins a tie outright).
// With a gold card in the clash, everyone else's cards stay masked. If a
// normal card beats a gold one, the shield goes up and nothing moves yet:
// the Gold Defence decides it. That defence has its own reveal, where the
// gold either holds or passes to the challenger's card.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Vibration,
  Animated,
  Easing,
  useWindowDimensions,
} from "react-native";
import type { ClashGameState, Group } from "../../../shared/types";
import { cardById, statByKey } from "../data/decks";
import { formatStat } from "../data/types";
import { nextClash } from "../logic/game";
import { timelineFor } from "../logic/timeline";
import { MiniCard } from "../components/ClashCardView";
import FlipCard from "../components/FlipCard";
import PileBar, { Rect } from "../components/PileBar";
import FlyingCards, { Flight } from "../components/FlyingCards";
import { FoilFill } from "../components/Foil";
import { CC, SERIF } from "../theme";

type Props = { group: Group; gs: ClashGameState; playerId: string };

const SPARKS = ["✨", "⭐", "✨", "💥", "✨", "⭐", "✨", "💫"];

// One card in the clash, with its own slide-in, wobble and winner effects.
function ClashSlot({
  index,
  children,
  slideDelay,
  wobble,
  winner,
  loser,
  badge,
  slotRef,
}: {
  index: number;
  children: React.ReactNode;
  slideDelay: number;
  wobble: boolean;
  winner: boolean;
  loser: boolean;
  badge?: string | null; // 🛡️ / 💥 popped over the card
  slotRef: (v: View | null) => void;
}) {
  const badgePop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!badge) return;
    badgePop.setValue(0);
    Animated.spring(badgePop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
  }, [badge]);
  const slide = useRef(new Animated.Value(0)).current;
  const wob = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const spark = useRef(new Animated.Value(0)).current;
  const dim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(slide, { toValue: 1, delay: slideDelay, friction: 6, useNativeDriver: true }).start();
  }, []);
  useEffect(() => {
    if (!wobble) {
      wob.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wob, { toValue: 1, duration: 90, useNativeDriver: true }),
        Animated.timing(wob, { toValue: -1, duration: 180, useNativeDriver: true }),
        Animated.timing(wob, { toValue: 0, duration: 90, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [wobble]);
  useEffect(() => {
    if (!winner) return;
    // slam: shrink, then punch forward with a shake; then a pulsing glow
    Animated.sequence([
      Animated.timing(pop, { toValue: 0.9, duration: 120, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1.1, friction: 3, tension: 160, useNativeDriver: true }),
    ]).start();
    Animated.sequence([
      Animated.timing(wob, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(wob, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(wob, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(wob, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
    Animated.timing(spark, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.4, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [winner]);
  useEffect(() => {
    if (loser) Animated.timing(dim, { toValue: 0.55, duration: 400, useNativeDriver: true }).start();
  }, [loser]);

  return (
    <Animated.View
      ref={slotRef as any}
      style={{
        opacity: Animated.multiply(slide, dim),
        zIndex: winner ? 10 : 1,
        transform: [
          { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [120 + index * 10, 0] }) },
          { rotate: wob.interpolate({ inputRange: [-1, 1], outputRange: ["-5deg", "5deg"] }) },
          { scale: pop },
        ],
      }}
    >
      {/* gold halo behind the winner */}
      <Animated.View pointerEvents="none" style={[styles.halo, { opacity: glow }]} />
      {children}
      {badge && (
        <Animated.Text
          pointerEvents="none"
          style={[
            styles.badge,
            {
              opacity: badgePop,
              transform: [{ scale: badgePop.interpolate({ inputRange: [0, 1], outputRange: [3, 1] }) }],
            },
          ]}
        >
          {badge}
        </Animated.Text>
      )}
      {winner && (
        <View pointerEvents="none" style={styles.sparkWrap}>
          {SPARKS.map((s, i) => {
            const angle = (i / SPARKS.length) * Math.PI * 2;
            return (
              <Animated.Text
                key={i}
                style={[
                  styles.spark,
                  {
                    opacity: spark.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
                    transform: [
                      { translateX: spark.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * 90] }) },
                      { translateY: spark.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * 110] }) },
                      { scale: spark.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 1.4, 0.8] }) },
                    ],
                  },
                ]}
              >
                {s}
              </Animated.Text>
            );
          })}
        </View>
      )}
    </Animated.View>
  );
}

export default function ClashRevealScreen({ group, gs, playerId }: Props) {
  const last = gs.last!;
  const stage = last.stage ?? "clash";
  const isDefence = stage === "defence";
  const isHost = group.hostId === playerId;
  const { width: screenW } = useWindowDimensions();
  const stat = statByKey(gs.deck, last.statKey);
  const nameOf = (id: string) =>
    id === playerId ? "You" : group.players.find((p) => p.id === id)?.name ?? "Someone";

  const plays = useMemo(
    () =>
      group.players
        .filter((p) => last.plays[p.id])
        .map((p) => {
          const card = cardById(last.plays[p.id]);
          return { pid: p.id, card, value: card?.stats[last.statKey] ?? 0 };
        }),
    [last.round, stage],
  );
  const n = plays.length;
  const pot = last.pot ?? last.plays; // every card that moves
  const potN = Object.keys(pot).length;
  const tl = timelineFor(last);
  const goldSet = new Set(last.gold ?? []);
  const anyGold = goldSet.size > 0;
  const defenderId = isDefence ? last.callerId : gs.defence?.defenderId;

  // Timed from when this phone saw the result (phone clocks may disagree).
  const seenAt = useRef<{ key: string; at: number } | null>(null);
  const seenKey = `${last.round}:${stage}`;
  if (seenAt.current?.key !== seenKey) seenAt.current = { key: seenKey, at: Date.now() };
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - (seenAt.current?.at ?? Date.now())), 80);
    return () => clearInterval(t);
  }, [seenKey]);

  const rolling = !!last.tied && elapsed >= tl.rollStart && elapsed < tl.winAt;
  const decided = elapsed >= tl.winAt;
  const flying = elapsed >= tl.flyAt;
  const landed = elapsed >= tl.landed;
  const shieldUp = elapsed >= tl.shieldAt;
  // Defence lost: the gold leaves the beaten card for the challenger's.
  const goldMoved = !!last.goldTo && elapsed >= tl.winAt + 600;
  const cardGold = (cardId?: string) => {
    if (!cardId) return false;
    if (cardId === last.goldTo) return goldMoved;
    return goldSet.has(cardId) && !(last.goldTo && goldMoved);
  };
  // Someone else's normal card in a gold clash stays masked (until it takes the gold).
  const cardMasked = (pid: string, cardId?: string) =>
    anyGold && !!cardId && !goldSet.has(cardId) && pid !== playerId && !(cardId === last.goldTo && goldMoved);

  useEffect(() => {
    if (decided && last.winnerId === playerId) Vibration.vibrate([0, 80, 50, 180]);
  }, [decided]);
  useEffect(() => {
    if (shieldUp && last.defenceNext) Vibration.vibrate([0, 60, 40, 60, 40, 160]);
  }, [shieldUp]);

  // Card positions, for the flight to the winner's pile.
  const slotRefs = useRef<Record<string, View | null>>({});
  const chipRects = useRef<Record<string, Rect>>({});
  const [flights, setFlights] = useState<Flight[]>([]);
  useEffect(() => {
    if (!flying) return;
    const target = chipRects.current[last.winnerId];
    if (!target) return;
    const out: Flight[] = [];
    const ids = Object.keys(pot);
    let pending = ids.length;
    const done = () => {
      pending -= 1;
      if (pending === 0) setFlights([...out]);
    };
    ids.forEach((pid, i) => {
      const add = (from: Rect) => out.push({ id: `${seenKey}-${pid}`, from, to: target, delay: i * 120 });
      const node = slotRefs.current[pid];
      // On screen: fly from the card. Not shown (defence pot): from their pile.
      if (node) {
        node.measureInWindow((x, y, w, h) => {
          add({ x, y, w, h });
          done();
        });
      } else {
        if (chipRects.current[pid]) add(chipRects.current[pid]);
        done();
      }
    });
  }, [flying]);

  // Pile counts as they were before this clash, until the cards land.
  const beforeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    if (last.defenceNext) return c; // nothing has moved
    for (const [pid, pile] of Object.entries(gs.piles)) {
      if (!pot[pid]) continue;
      c[pid] = pid === last.winnerId ? pile.length - potN + 1 : pile.length + 1;
    }
    return c;
  }, [seenKey]);
  // ★ golds as they were before a Gold Defence moved one, until the cards land.
  const beforeGold = useMemo(() => {
    if (!last.goldTo) return undefined;
    const g: Record<string, boolean> = { ...(gs.gold ?? {}) };
    delete g[last.goldTo];
    for (const c of last.gold ?? []) g[c] = true;
    return g;
  }, [seenKey]);

  const cols = n <= 4 ? 2 : 3;
  const cardW = Math.min(170, (screenW - 32 - (cols - 1) * 10) / cols);
  const total = tl.total;
  const secsLeft = Math.max(0, Math.ceil((total - elapsed) / 1000));
  const top = Math.max(...plays.map((p) => p.value));
  const spinName = last.tied ? nameOf(last.tied[Math.floor(elapsed / 110) % last.tied.length]) : "";

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <PileBar
          group={group}
          gs={gs}
          playerId={playerId}
          counts={landed ? undefined : beforeCounts}
          gold={landed ? undefined : beforeGold}
          onChipRect={(pid, r) => (chipRects.current[pid] = r)}
        />

        <View style={styles.statBanner}>
          <FoilFill
            colors={last.wildcard ? ["#3B1D6E", "#8E5BE0", "#3B1D6E"] : [CC.goldDeep, CC.gold, CC.goldDeep]}
            radius={12}
          />
          <Text style={styles.caller}>
            {isDefence
              ? last.auto
                ? `⚡ GOLD DEFENCE · ${nameOf(last.callerId)} ran out of time · random stat`
                : `⚡ GOLD DEFENCE · ${nameOf(last.callerId)} defends with`
              : last.auto
              ? `⏱ ${nameOf(last.callerId)} ran out of time · random stat`
              : last.wildcard
                ? `🃏 ${nameOf(last.callerId)} played the WILDCARD`
                : `📣 ${nameOf(last.callerId)} called`}
          </Text>
          <Text style={styles.statName}>
            {stat?.emoji} {stat?.label.toUpperCase()}
          </Text>
        </View>

        <View style={styles.grid}>
          {plays.map((p, i) => {
            const isWinner = decided && p.pid === last.winnerId;
            const tiedTop = !!last.tied?.includes(p.pid) && p.value === top;
            const cardId = p.card?.id;
            const gold = cardGold(cardId);
            const isDefender = p.pid === defenderId && goldSet.has(cardId ?? "");
            const badge = !isDefender
              ? null
              : last.defenceNext
                ? shieldUp
                  ? "🛡️"
                  : null
                : isDefence
                  ? decided && last.goldTo
                    ? "💥"
                    : "🛡️"
                  : null;
            return (
              <View key={p.pid} style={{ width: cardW, alignItems: "center" }}>
                <ClashSlot
                  index={i}
                  slideDelay={tl.dealIn + i * 90}
                  wobble={rolling && tiedTop}
                  winner={isWinner}
                  loser={decided && !isWinner && !(last.defenceNext && isDefender)}
                  badge={badge}
                  slotRef={(v) => (slotRefs.current[p.pid] = v)}
                >
                  {p.card && (
                    <FlipCard
                      flipped={elapsed >= tl.flipStart + i * tl.flipGap}
                      gold={goldSet.has(cardId ?? "")}
                      front={
                        <MiniCard
                          card={p.card}
                          deck={gs.deck}
                          width={cardW}
                          label={stat?.label ?? ""}
                          value={stat ? formatStat(stat, p.value, true) : String(p.value)}
                          win={isWinner}
                          gold={gold}
                          masked={cardMasked(p.pid, cardId)}
                        />
                      }
                    />
                  )}
                </ClashSlot>
                <Text style={[styles.owner, isWinner && styles.ownerWin]} numberOfLines={1}>
                  {nameOf(p.pid)}
                </Text>
              </View>
            );
          })}
        </View>

        {rolling && (
          <View style={styles.rollBox}>
            <Text style={styles.rollDice}>🎲</Text>
            <Text style={styles.rollText}>{last.tied!.map(nameOf).join(" and ")} tied! Rolling…</Text>
            <Text style={styles.rollName}>{spinName}</Text>
          </View>
        )}

        {isDefence && last.firstStatKey && (
          <Text style={styles.recap}>
            First clash: {statByKey(gs.deck, last.firstStatKey)?.label} · won by {nameOf(Object.keys(last.plays).find((id) => id !== last.callerId) ?? "")}
          </Text>
        )}

        {decided && last.defenceNext && gs.defence && (
          <View style={styles.shieldBox}>
            <FoilFill colors={["#7A4E00", "#FFE27A", "#B8860B", "#FFF3B0", "#7A4E00"]} radius={16} />
            <Text style={styles.shieldTitle}>⚡ GOLD DEFENCE! 🛡️</Text>
            <Text style={styles.shieldText}>
              {nameOf(last.winnerId)} beat {gs.defence.defenderId === playerId ? "your" : `${nameOf(gs.defence.defenderId)}'s`} ★ gold
              card. {gs.defence.defenderId === playerId ? "You pick" : `${nameOf(gs.defence.defenderId)} picks`} a new stat:{" "}
              {last.winnerId === playerId ? "you have" : `${nameOf(last.winnerId)} has`} to win twice.
            </Text>
          </View>
        )}

        {decided && !last.defenceNext && (
          <View style={styles.resultBox}>
            {isDefence && (
              <Text style={[styles.defResult, last.goldTo ? styles.defStolen : styles.defHeld]}>
                {last.goldTo ? "💥 GOLD STOLEN! The ★ moves to the challenger's card" : "🛡️ GOLD HOLDS!"}
              </Text>
            )}
            <Text style={styles.resultText}>
              🏆 {last.winnerId === playerId ? "You take" : `${nameOf(last.winnerId)} takes`} {potN} cards
              {last.tied ? " (won the roll)" : last.goldTie ? " (★ gold wins a tie)" : ""}
            </Text>
            {landed &&
              (last.out ?? []).map((id) => (
                <Text key={id} style={styles.outText}>
                  💀 {nameOf(id)} {id === playerId ? "are" : "is"} out of cards
                </Text>
              ))}
          </View>
        )}

        {isHost && landed && (
          <TouchableOpacity style={styles.nextBtn} onPress={() => nextClash(group.id, last.round, stage)}>
            <Text style={styles.nextText}>
              {last.defenceNext ? "To the Gold Defence" : "Next clash"} ({secsLeft}s)
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      {flights.length > 0 && !landed && <FlyingCards flights={flights} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CC.bg },
  content: { padding: 16, paddingTop: 48, paddingBottom: 40, gap: 12 },
  statBanner: { borderRadius: 12, paddingVertical: 10, alignItems: "center", overflow: "hidden" },
  caller: { color: "#1A0F00", fontSize: 12, fontWeight: "800" },
  statName: { color: "#1A0F00", fontSize: 22, fontWeight: "900", fontFamily: SERIF, letterSpacing: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10, rowGap: 14 },
  owner: { color: CC.textMuted, fontSize: 12, fontWeight: "800", marginTop: 4 },
  ownerWin: { color: CC.gold },
  halo: {
    position: "absolute",
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
    borderRadius: 18,
    backgroundColor: "rgba(245,197,66,0.55)",
    shadowColor: CC.gold,
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 12,
  },
  badge: { position: "absolute", top: -18, alignSelf: "center", fontSize: 40, zIndex: 20 },
  recap: { color: CC.textMuted, fontSize: 12, textAlign: "center" },
  shieldBox: { borderRadius: 16, padding: 14, alignItems: "center", gap: 4, overflow: "hidden" },
  shieldTitle: { color: "#3A2400", fontSize: 22, fontWeight: "900", fontFamily: SERIF, letterSpacing: 1 },
  shieldText: { color: "#3A2400", fontSize: 14, fontWeight: "700", textAlign: "center" },
  defResult: { fontSize: 18, fontWeight: "900", fontFamily: SERIF, textAlign: "center" },
  defHeld: { color: CC.gold },
  defStolen: { color: CC.lose },
  sparkWrap: { position: "absolute", top: "40%", left: "45%" },
  spark: { position: "absolute", fontSize: 22 },
  rollBox: {
    backgroundColor: CC.panel,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: CC.gold,
    padding: 14,
    alignItems: "center",
  },
  rollDice: { fontSize: 40 },
  rollText: { color: CC.text, fontSize: 14, fontWeight: "700", textAlign: "center" },
  rollName: { color: CC.gold, fontSize: 26, fontWeight: "900", fontFamily: SERIF, marginTop: 4 },
  resultBox: { backgroundColor: CC.panel, borderRadius: 14, padding: 12, alignItems: "center", gap: 4 },
  resultText: { color: CC.win, fontSize: 17, fontWeight: "900", textAlign: "center" },
  outText: { color: CC.lose, fontSize: 14, fontWeight: "700" },
  nextBtn: { backgroundColor: CC.gold, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  nextText: { color: "#1A0F00", fontSize: 16, fontWeight: "900" },
});
