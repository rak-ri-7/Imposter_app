// The answer beat: the call has been made, the cards are still hidden.
// The stat stamps down on every phone; each player sees their own number
// (time to celebrate or to panic) and taps ⚔️ CLASH! when ready. The caller
// waits it out with their own card in front of them. Once everyone's in,
// or ANSWER_MS runs out, the reveal starts.
import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Vibration, Animated, Easing, useWindowDimensions } from "react-native";
import type { ClashGameState, Group } from "../../../shared/types";
import { cardById, statByKey } from "../data/decks";
import { formatStat } from "../data/types";
import { ANSWER_MS, markReady } from "../logic/game";
import ClashCardView from "../components/ClashCardView";
import PileBar from "../components/PileBar";
import { FoilFill } from "../components/Foil";
import { CC, GOLD_FRAME, SERIF } from "../theme";

type Props = { group: Group; gs: ClashGameState; playerId: string };

export default function ClashAnswerScreen({ group, gs, playerId }: Props) {
  const c = gs.called!;
  const { width: screenW } = useWindowDimensions();
  const isDefence = c.stage === "defence";
  const stat = statByKey(gs.deck, c.statKey);
  const nameOf = (id: string) =>
    id === playerId ? "You" : group.players.find((p) => p.id === id)?.name ?? "Someone";
  const isCaller = c.by === playerId;
  const mustTap = c.waitingFor.includes(playerId);
  const tapped = !!gs.ready?.[playerId];
  const [sending, setSending] = useState(false);

  // My card in this clash (if I'm in it).
  const myCardId = isDefence
    ? playerId === gs.defence?.defenderId
      ? gs.defence.goldCard
      : playerId === gs.defence?.challengerId
        ? gs.defence.challengerCard
        : undefined
    : gs.piles[playerId]?.[0];
  const myCard = cardById(myCardId ?? "");
  const myGold = !!myCardId && !!gs.gold?.[myCardId];
  const myValue = myCard && stat ? formatStat(stat, myCard.stats[c.statKey] ?? 0, true) : null;
  const isMainStat = !c.wildcard;

  // Countdown from when this phone saw the call.
  const seen = useRef(Date.now());
  const [, setTick] = useState(0);
  const stamp = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 250);
    Animated.timing(stamp, { toValue: 1, duration: 380, easing: Easing.out(Easing.back(2.2)), useNativeDriver: true }).start();
    if (mustTap) {
      Vibration.vibrate([0, 140, 80, 140]);
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]),
      ).start();
    }
    return () => clearInterval(t);
  }, []);
  const secsLeft = Math.max(0, Math.ceil((seen.current + ANSWER_MS - Date.now()) / 1000));

  const clash = async () => {
    if (!mustTap || tapped || sending) return;
    setSending(true);
    Vibration.vibrate(60);
    try {
      await markReady(group.id, playerId, gs.round);
    } finally {
      setSending(false);
    }
  };

  const waitingNames = c.waitingFor.filter((id) => !gs.ready?.[id]).map(nameOf);
  const cardW = Math.min(380, screenW - 32);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.round}>CLASH {gs.round}</Text>
          <View style={[styles.timerPill, secsLeft <= 5 && styles.timerUrgent]}>
            <Text style={styles.timer}>⏱ {secsLeft}s</Text>
          </View>
        </View>
        <PileBar group={group} gs={gs} playerId={playerId} />

        {/* The call, stamped down */}
        <Animated.View
          style={[
            styles.callBanner,
            {
              opacity: stamp,
              transform: [{ scale: stamp.interpolate({ inputRange: [0, 1], outputRange: [2.2, 1] }) }, { rotate: "-1.5deg" }],
            },
          ]}
        >
          <FoilFill
            colors={c.wildcard ? ["#3B1D6E", "#8E5BE0", "#3B1D6E"] : isDefence ? GOLD_FRAME.foil : [CC.goldDeep, CC.gold, CC.goldDeep]}
            radius={14}
          />
          <Text style={styles.callWho}>
            {isDefence
              ? `⚡ GOLD DEFENCE · ${nameOf(c.by)} ${isCaller ? "defend" : "defends"} with`
              : c.auto
                ? `⏱ ${nameOf(c.by)} ran out of time · random stat`
                : c.wildcard
                  ? `🃏 ${nameOf(c.by)} played the WILDCARD`
                  : `📣 ${nameOf(c.by)} called`}
          </Text>
          <Text style={styles.callStat}>
            {stat?.emoji} {stat?.label.toUpperCase()}
          </Text>
        </Animated.View>

        {/* Your number, big */}
        {myCard && myValue && (
          <View style={[styles.yourBox, myGold && styles.yourBoxGold]}>
            <Text style={styles.yourLabel}>{isCaller ? "YOUR CARD HAS" : `YOUR ${myCard.name.toUpperCase()} HAS`}</Text>
            <Text style={styles.yourValue}>{myValue}</Text>
          </View>
        )}

        {/* Who's ready */}
        {c.waitingFor.length > 0 && (
          <View style={styles.readyRow}>
            {c.waitingFor.map((id) => (
              <View key={id} style={[styles.readyChip, gs.ready?.[id] && styles.readyChipOn]}>
                <Text style={[styles.readyText, gs.ready?.[id] && styles.readyTextOn]}>
                  {gs.ready?.[id] ? "✅" : "🤔"} {nameOf(id)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {myCard && (
          <ClashCardView
            card={myCard}
            deck={gs.deck}
            width={cardW}
            gold={myGold}
            calledKey={isMainStat ? c.statKey : undefined}
          />
        )}
        {!myCard && <Text style={styles.watchText}>You're watching this one.</Text>}
      </ScrollView>

      <View style={styles.footer}>
        {mustTap && !tapped ? (
          <Animated.View style={{ transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }] }}>
            <TouchableOpacity style={[styles.clashBtn, sending && styles.dim]} onPress={clash} disabled={sending} activeOpacity={0.7}>
              <Text style={styles.clashText}>⚔️ CLASH!</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <View style={styles.waitBox}>
            <Text style={styles.waitText}>
              {isCaller
                ? waitingNames.length > 0
                  ? `😬 You called it. Waiting for ${waitingNames.join(", ")}…`
                  : "😬 Here it comes…"
                : tapped
                  ? waitingNames.length > 0
                    ? `✅ Ready. Waiting for ${waitingNames.join(", ")}…`
                    : "✅ Here it comes…"
                  : waitingNames.length > 0
                    ? `Waiting for ${waitingNames.join(", ")}…`
                    : "Here it comes…"}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CC.bg },
  content: { padding: 16, paddingTop: 48, paddingBottom: 40, gap: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  round: { color: CC.gold, fontSize: 22, fontWeight: "900", fontFamily: SERIF, letterSpacing: 2 },
  timerPill: { backgroundColor: CC.panel, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4 },
  timerUrgent: { backgroundColor: CC.lose },
  timer: { color: CC.text, fontSize: 16, fontWeight: "900" },
  callBanner: { borderRadius: 14, paddingVertical: 14, alignItems: "center", overflow: "hidden", borderWidth: 3, borderColor: "#7A4E00" },
  callWho: { color: "#1A0F00", fontSize: 13, fontWeight: "800" },
  callStat: { color: "#1A0F00", fontSize: 30, fontWeight: "900", fontFamily: SERIF, letterSpacing: 1.5, textAlign: "center" },
  yourBox: { backgroundColor: CC.parchment, borderRadius: 14, borderWidth: 3, borderColor: CC.goldDeep, paddingVertical: 10, alignItems: "center" },
  yourBoxGold: { borderColor: CC.gold, backgroundColor: "#FFF3C4" },
  yourLabel: { color: CC.inkMuted, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  yourValue: { color: CC.ink, fontSize: 34, fontWeight: "900", fontFamily: SERIF },
  readyRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  readyChip: { backgroundColor: CC.panel, borderRadius: 14, borderWidth: 1.5, borderColor: CC.line, paddingHorizontal: 12, paddingVertical: 6 },
  readyChipOn: { borderColor: CC.win },
  readyText: { color: CC.textMuted, fontSize: 13, fontWeight: "800" },
  readyTextOn: { color: CC.win },
  watchText: { color: CC.textMuted, textAlign: "center", marginTop: 20 },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18, backgroundColor: CC.bg, borderTopWidth: 1, borderTopColor: CC.line },
  clashBtn: { backgroundColor: CC.gold, borderRadius: 16, borderWidth: 3, borderColor: CC.goldDeep, paddingVertical: 18, alignItems: "center" },
  clashText: { color: "#1A0F00", fontSize: 24, fontWeight: "900", fontFamily: SERIF, letterSpacing: 3 },
  waitBox: { backgroundColor: CC.panel, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 12, alignItems: "center" },
  waitText: { color: CC.text, fontSize: 15, fontWeight: "800", textAlign: "center" },
  dim: { opacity: 0.5 },
});
