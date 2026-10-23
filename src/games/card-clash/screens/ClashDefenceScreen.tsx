// ⚡ Gold Defence: a normal card beat a gold card, so the two meet again.
// The gold card's owner picks a different stat (blind: they only know the
// challenger's number on the first stat) and locks it in with CLASH!.
// Everyone else watches the face-off: the gold card vs a masked "???".
import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Vibration, Animated, Easing, useWindowDimensions } from "react-native";
import type { ClashGameState, Group } from "../../../shared/types";
import { cardById, statByKey } from "../data/decks";
import { formatStat } from "../data/types";
import { CALL_MS, callDefence } from "../logic/game";
import ClashCardView, { MiniCard } from "../components/ClashCardView";
import PileBar from "../components/PileBar";
import { FoilFill } from "../components/Foil";
import { CC, GOLD_FRAME, SERIF } from "../theme";

type Props = { group: Group; gs: ClashGameState; playerId: string };

// Send a picked-but-unconfirmed stat this long before this phone's deadline,
// so it lands before the host's random fallback.
const AUTO_SEND_EARLY_MS = 1500;

export default function ClashDefenceScreen({ group, gs, playerId }: Props) {
  const d = gs.defence!;
  const { width: screenW } = useWindowDimensions();
  const isDefender = d.defenderId === playerId;
  const isChallenger = d.challengerId === playerId;
  const goldCard = cardById(d.goldCard);
  const chalCard = cardById(d.challengerCard);
  const first = statByKey(gs.deck, d.firstStatKey);
  const nameOf = (id: string) =>
    id === playerId ? "You" : group.players.find((p) => p.id === id)?.name ?? "Someone";
  const fmt = (v: number) => (first ? formatStat(first, v, true) : String(v));

  const [picked, setPicked] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Countdown from when this phone saw the defence start.
  const seen = useRef<{ round: number; at: number } | null>(null);
  if (seen.current?.round !== gs.round) seen.current = { round: gs.round, at: Date.now() };
  const deadline = seen.current.at + CALL_MS;
  const [, setTick] = useState(0);
  const shield = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 250);
    Animated.spring(shield, { toValue: 1, friction: 4, useNativeDriver: true }).start();
    if (isDefender) Vibration.vibrate([0, 120, 60, 120, 60, 200]);
    return () => clearInterval(t);
  }, []);
  const secsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));

  const lockIn = async () => {
    if (!picked || busy || chosen || !isDefender) return;
    setBusy(true);
    setChosen(picked);
    Vibration.vibrate(40);
    try {
      const res = await callDefence(group.id, playerId, gs.round, { statKey: picked });
      if (!res.success) setChosen(null);
    } finally {
      setBusy(false);
    }
  };
  const pick = (k: string) => {
    if (busy || chosen || !isDefender) return;
    Vibration.vibrate(15);
    setPicked((cur) => (cur === k ? null : k));
  };
  useEffect(() => {
    if (isDefender && picked && !chosen && !busy && Date.now() >= deadline - AUTO_SEND_EARLY_MS) lockIn();
  });

  const miniW = Math.min(150, (screenW - 32 - 40) / 2);
  const bigW = Math.min(380, screenW - 32);

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

        <Animated.View
          style={[
            styles.title,
            { transform: [{ scale: shield.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }], opacity: shield },
          ]}
        >
          <FoilFill colors={GOLD_FRAME.foil} radius={14} />
          <Text style={styles.titleText}>⚡ GOLD DEFENCE 🛡️</Text>
          <Text style={styles.titleSub}>
            {nameOf(d.challengerId)} beat {isDefender ? "your" : `${nameOf(d.defenderId)}'s`} gold card on {first?.emoji}{" "}
            {first?.label}. {isChallenger ? "You have" : `${nameOf(d.challengerId)} has`} to win again.
          </Text>
        </Animated.View>

        {/* The face-off, with the first clash's numbers. */}
        {goldCard && chalCard && !isDefender && (
          <View style={styles.faceoff}>
            <View style={styles.side}>
              <MiniCard card={goldCard} deck={gs.deck} width={miniW} gold label={first?.label ?? ""} value={fmt(d.firstValues[d.defenderId] ?? 0)} />
              <Text style={styles.owner}>{nameOf(d.defenderId)}</Text>
            </View>
            <Text style={styles.vs}>VS</Text>
            <View style={styles.side}>
              <MiniCard
                card={chalCard}
                deck={gs.deck}
                width={miniW}
                masked={!isChallenger}
                win
                label={first?.label ?? ""}
                value={fmt(d.firstValues[d.challengerId] ?? 0)}
              />
              <Text style={styles.owner}>{nameOf(d.challengerId)}</Text>
            </View>
          </View>
        )}

        {isDefender ? (
          <>
            <View style={styles.banner}>
              <Text style={styles.bannerText}>
                🛡️ Pick a DIFFERENT stat, then hit CLASH! Gold wins a tie.{"\n"}
                Their card: ??? · {first?.emoji} {fmt(d.firstValues[d.challengerId] ?? 0)}
              </Text>
            </View>
            {goldCard && (
              <ClashCardView
                card={goldCard}
                deck={gs.deck}
                width={bigW}
                gold
                usedKeys={[d.firstStatKey]}
                onPickStat={pick}
                disabled={busy || !!chosen}
                selectedKey={picked ?? undefined}
                calledKey={chosen ?? undefined}
              />
            )}
          </>
        ) : (
          <View style={styles.waitBox}>
            <Text style={styles.waitText}>
              {nameOf(d.defenderId)} {d.defenderId === playerId ? "are" : "is"} picking a new stat to defend the gold…
            </Text>
            {isChallenger && chalCard && (
              <Text style={styles.waitSub}>Your card stays in. Win this and you take every card in the clash, and the ★ gold.</Text>
            )}
          </View>
        )}
        {isChallenger && chalCard && <ClashCardView card={chalCard} deck={gs.deck} width={bigW} />}
      </ScrollView>
      {isDefender && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.clashBtn, (!picked || busy || !!chosen) && styles.clashBtnOff]}
            onPress={lockIn}
            disabled={!picked || busy || !!chosen}
            activeOpacity={0.7}
          >
            <Text style={[styles.clashText, (!picked || !!chosen) && styles.clashTextOff]}>
              {chosen ? "CALLED!" : picked ? "🛡️ DEFEND!" : "Pick a stat first"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
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
  title: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12, alignItems: "center", overflow: "hidden", gap: 4 },
  titleText: { color: "#3A2400", fontSize: 22, fontWeight: "900", fontFamily: SERIF, letterSpacing: 1.5 },
  titleSub: { color: "#3A2400", fontSize: 13, fontWeight: "700", textAlign: "center" },
  faceoff: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  side: { alignItems: "center", gap: 4 },
  owner: { color: CC.textMuted, fontSize: 12, fontWeight: "800" },
  vs: { color: CC.gold, fontSize: 22, fontWeight: "900", fontFamily: SERIF },
  banner: { backgroundColor: CC.gold, borderRadius: 12, padding: 10, borderWidth: 1.5, borderColor: CC.goldDeep },
  bannerText: { color: "#1A0F00", fontSize: 14, fontWeight: "800", textAlign: "center", lineHeight: 20 },
  waitBox: { backgroundColor: CC.panel, borderRadius: 14, padding: 14, gap: 6 },
  waitText: { color: CC.text, fontSize: 15, fontWeight: "800", textAlign: "center" },
  waitSub: { color: CC.textMuted, fontSize: 13, textAlign: "center" },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18, backgroundColor: CC.bg, borderTopWidth: 1, borderTopColor: CC.line },
  clashBtn: { backgroundColor: CC.gold, borderRadius: 16, borderWidth: 3, borderColor: CC.goldDeep, paddingVertical: 16, alignItems: "center" },
  clashBtnOff: { backgroundColor: CC.panel, borderColor: CC.line },
  clashText: { color: "#1A0F00", fontSize: 20, fontWeight: "900", fontFamily: SERIF, letterSpacing: 2 },
  clashTextOff: { color: CC.textMuted, fontSize: 15, letterSpacing: 0.5 },
});
