// The answer beat: the call has been made, the cards are still hidden.
// The stat stamps down on every phone; each player sees their own number
// (time to celebrate or to panic) and taps ⚔️ CLASH! when ready. The caller
// waits it out with their own card in front of them. Once everyone's in,
// or ANSWER_MS runs out, the reveal starts.
// Instead of CLASH!, a non-caller may (once a game each) 🔄 COUNTER-CALL,
// picking another open stat on their card, or 🏳️ FOLD.
import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Vibration, Animated, Easing, useWindowDimensions } from "react-native";
import type { ClashGameState, Group } from "../../../shared/types";
import { cardById, statByKey } from "../data/decks";
import { formatStat } from "../data/types";
import { ANSWER_MS, canCounter, canFold, counterCall, foldCall, markReady, openStats, scratchedStats } from "../logic/game";
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
  // 🔄 / 🏳️
  const [countering, setCountering] = useState(false);
  const [counterPick, setCounterPick] = useState<string | null>(null);
  const [foldArmed, setFoldArmed] = useState(false);
  const counterOk = canCounter(gs, playerId);
  const foldOk = canFold(gs, playerId);
  const counterTo = c.counterFrom ? statByKey(gs.deck, c.counterFrom) : undefined;
  const folderId = gs.fold?.round === gs.round ? gs.fold.folderId : undefined;
  const iFolded = folderId === playerId;

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

  const sendCounter = async () => {
    if (!counterPick || sending) return;
    setSending(true);
    Vibration.vibrate([0, 60, 40, 120]);
    try {
      const res = await counterCall(group.id, playerId, gs.round, counterPick);
      if (!res.success) setCounterPick(null);
    } finally {
      setSending(false);
    }
  };
  const sendFold = async () => {
    if (!foldArmed) return setFoldArmed(true);
    if (sending) return;
    setSending(true);
    Vibration.vibrate(80);
    try {
      await foldCall(group.id, playerId, gs.round);
    } finally {
      setSending(false);
    }
  };
  // Picking a counter: only stats still open (not the one called) can be tapped.
  const counterLocked = countering
    ? [...scratchedStats(gs), c.statKey].filter((k, i, a) => a.indexOf(k) === i)
    : scratchedStats(gs).filter((k) => k !== c.statKey);

  const waitingNames = c.waitingFor.filter((id) => !gs.ready?.[id] && id !== folderId).map(nameOf);
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
          {c.counterBy && (
            <Text style={styles.counterLine}>
              🔄 {nameOf(c.counterBy)} COUNTER-CALLED · was {counterTo?.emoji} {counterTo?.label}
            </Text>
          )}
        </Animated.View>
        {folderId && (
          <View style={styles.foldBanner}>
            <Text style={styles.foldBannerText}>
              🏳️ {iFolded ? "You folded" : `${nameOf(folderId)} folded`} ·{" "}
              {iFolded ? "sitting this clash out" : "the winner decides: take the card, or call the bluff"}
            </Text>
          </View>
        )}

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
                  {id === folderId ? "🏳️" : gs.ready?.[id] ? "✅" : "🤔"} {nameOf(id)}
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
            calledKey={isMainStat && !countering ? c.statKey : undefined}
            usedKeys={counterLocked}
            usedLabel="called"
            onPickStat={countering ? (k) => setCounterPick((cur) => (cur === k ? null : k)) : undefined}
            selectedKey={countering ? counterPick ?? undefined : undefined}
          />
        )}
        {!myCard && <Text style={styles.watchText}>You're watching this one.</Text>}
      </ScrollView>

      <View style={styles.footer}>
        {mustTap && !tapped && countering ? (
          <View style={styles.specialCol}>
            <Text style={styles.specialHint}>
              🔄 Tap an open stat on your card. If you don't win this clash, you also lose your next card.
            </Text>
            <View style={styles.specialRow}>
              <TouchableOpacity style={styles.smallBtn} onPress={() => { setCountering(false); setCounterPick(null); }}>
                <Text style={styles.smallBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.counterBtn, (!counterPick || sending) && styles.dim]}
                onPress={sendCounter}
                disabled={!counterPick || sending}
              >
                <Text style={styles.counterBtnText}>
                  {counterPick ? `🔄 COUNTER: ${statByKey(gs.deck, counterPick)?.label.toUpperCase()}` : "Pick a stat"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : mustTap && !tapped ? (
          <View style={styles.specialCol}>
            {(counterOk || foldOk) && (
              <View style={styles.specialRow}>
                {counterOk && (
                  <TouchableOpacity style={styles.smallBtn} onPress={() => { setCountering(true); setFoldArmed(false); }}>
                    <Text style={styles.smallBtnText}>🔄 COUNTER-CALL</Text>
                  </TouchableOpacity>
                )}
                {foldOk && (
                  <TouchableOpacity style={[styles.smallBtn, foldArmed && styles.foldArmed]} onPress={sendFold} disabled={sending}>
                    <Text style={[styles.smallBtnText, foldArmed && styles.foldArmedText]}>
                      {foldArmed ? "🏳️ TAP AGAIN TO FOLD" : "🏳️ FOLD"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            <Animated.View style={{ transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }] }}>
              <TouchableOpacity style={[styles.clashBtn, sending && styles.dim]} onPress={clash} disabled={sending} activeOpacity={0.7}>
                <Text style={styles.clashText}>⚔️ CLASH!</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        ) : (
          <View style={styles.waitBox}>
            <Text style={styles.waitText}>
              {iFolded
                ? "🏳️ You folded. Fingers crossed…"
                : isCaller
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
  counterLine: { color: "#1A0F00", fontSize: 12, fontWeight: "900", marginTop: 2 },
  foldBanner: { backgroundColor: CC.panel, borderRadius: 12, borderWidth: 1.5, borderColor: CC.textMuted, padding: 10, alignItems: "center" },
  foldBannerText: { color: CC.text, fontSize: 13, fontWeight: "800", textAlign: "center" },
  specialCol: { gap: 8 },
  specialRow: { flexDirection: "row", gap: 8 },
  specialHint: { color: CC.textMuted, fontSize: 12, textAlign: "center" },
  smallBtn: { flex: 1, backgroundColor: CC.panel, borderRadius: 12, borderWidth: 1.5, borderColor: CC.line, paddingVertical: 10, alignItems: "center" },
  smallBtnText: { color: CC.text, fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
  foldArmed: { borderColor: CC.lose, backgroundColor: "#3A1520" },
  foldArmedText: { color: CC.lose },
  counterBtn: { flex: 2, backgroundColor: CC.wild, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  counterBtnText: { color: "#1A0F2E", fontSize: 14, fontWeight: "900" },
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
