import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Animated,
  Platform,
} from "react-native";
import { Group, BombGameState, BetMarket } from "../../../shared/types";
import {
  buildMarkets,
  maxStakeFor,
  isGameLongMarket,
  winnerBetPoints,
  MIN_STAKE,
  BET_CHARGES_PER_TICKET,
} from "../data/betOdds";
import { placeMatchBet } from "../logic/betEngine";

type Props = {
  group: Group;
  playerId: string;
  onClose: () => void;
  onOpenAlley: () => void;
};

// What a pick is called on screen — shared with the replay's results card.
export const betPickLabel = (
  pick: string,
  players: { id: string; name: string }[],
  viewerId: string,
): string => {
  if (pick === "boom") return "💥 It blows";
  if (pick === "defuse") return "🧯 It's defused";
  if (pick === "nobody") return "🕊️ Nobody";
  const name = players.find((p) => p.id === pick)?.name ?? "Unknown";
  return pick === viewerId ? `${name} (you)` : name;
};

const MARKET_INFO: Record<BetMarket, { title: string; blurb: string }> = {
  "boom-or-defuse": {
    title: "💥 BOOM OR DEFUSE?",
    blurb: "Next round. Either the bomb goes off, or somebody keeps it quiet.",
  },
  "round-victim": {
    title: "🎯 WHO LOSES A LIFE?",
    blurb: "Next round. Who takes the hit — or does everybody walk?",
  },
  "first-ghost": {
    title: "👻 FIRST GHOST",
    blurb: "Who runs out of lives first? Stays live till it happens.",
  },
  "next-ghost": {
    title: "👻 NEXT GHOST",
    blurb: "Who goes down next? Stays live till it happens.",
  },
  "game-winner": {
    title: "🏆 WHO WINS THE GAME?",
    blurb:
      "Last one standing. Pays leaderboard points, not FP. Your stake's locked till the end. One bet a game.",
  },
};

const FAIL_MESSAGES: Record<string, string> = {
  "between-rounds-only": "Action only goes down between rounds.",
  "market-closed": "That table's closed.",
  "option-unavailable": "That pick's gone. Try another.",
  "stake-too-low": `Minimum's ${MIN_STAKE} FP. Don't waste my time.`,
  "not-enough-fp": "You're light on FP, friend.",
  "stake-too-high": "That's more than the house will cover.",
  "already-bet": "You've already got money on that.",
  "no-ticket": "No pass, no seat. Your first one's free at the Alley.",
};

const TAGLINES = [
  "Cash only. No names. No refunds.",
  "What's said in here stays in here.",
  "The house doesn't lose. You might.",
  "Walk in with a plan. Walk out with a story.",
  "Everybody's watching. Nobody's talking.",
];

const MONO = Platform.select({ ios: "Courier", android: "monospace" });

export default function BombBetSheet({
  group,
  playerId,
  onClose,
  onOpenAlley,
}: Props) {
  const gameState = group.gameState as BombGameState;
  const [selection, setSelection] = useState<{
    market: BetMarket;
    pick: string;
  } | null>(null);
  const [stake, setStake] = useState(MIN_STAKE);
  const [busy, setBusy] = useState(false);
  const [tagline] = useState(
    () => TAGLINES[Math.floor(Math.random() * TAGLINES.length)],
  );

  // The sign over the door doesn't quite work.
  const flicker = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2200),
        Animated.timing(flicker, {
          toValue: 0.3,
          duration: 70,
          useNativeDriver: true,
        }),
        Animated.timing(flicker, {
          toValue: 1,
          duration: 90,
          useNativeDriver: true,
        }),
        Animated.timing(flicker, {
          toValue: 0.55,
          duration: 60,
          useNativeDriver: true,
        }),
        Animated.timing(flicker, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const activeIds = group.players
    .map((p) => p.id)
    .filter((id) => !gameState.ghosts.includes(id));
  const markets = buildMarkets({
    bettorId: playerId,
    activePlayerIds: activeIds,
    lives: gameState.lives,
    everGhosted: gameState.everGhosted ?? [],
  });

  const fp = gameState.fusePoints?.[playerId] ?? 0;
  const tickets = gameState.bettingTickets?.[playerId] ?? 0;
  const charges = gameState.betCharges?.[playerId] ?? 0;
  const canBet = tickets > 0 || charges > 0;

  const myOpenBets = (gameState.matchBets ?? []).filter(
    (b) => b.bettorId === playerId && b.status === "open",
  );
  const hasOpenBet = (market: BetMarket) =>
    myOpenBets.some(
      (b) =>
        b.market === market &&
        (isGameLongMarket(market) || b.forRound === gameState.roundNumber + 1),
    );

  const selectedOption = selection
    ? markets
        .find((m) => m.market === selection.market)
        ?.options.find((o) => o.pick === selection.pick)
    : undefined;
  const multiplier = selectedOption?.multiplier ?? null;
  const limit =
    multiplier !== null ? maxStakeFor(multiplier, fp, activeIds.length) : 0;
  const stakeNow = Math.max(MIN_STAKE, Math.min(stake, limit));
  const canPlace = !!selection && multiplier !== null && limit >= MIN_STAKE;

  const choose = (market: BetMarket, pick: string, mult: number | null) => {
    if (mult === null || !canBet || hasOpenBet(market)) return;
    setSelection({ market, pick });
    setStake(
      Math.min(
        20,
        Math.max(MIN_STAKE, maxStakeFor(mult, fp, activeIds.length)),
      ),
    );
  };

  const place = async () => {
    if (!selection || !canPlace || busy) return;
    setBusy(true);
    try {
      const result = await placeMatchBet(
        group.id,
        playerId,
        selection.market,
        selection.pick,
        stakeNow,
      );
      if (result.success) setSelection(null);
      else
        Alert.alert(
          "House says no",
          FAIL_MESSAGES[result.reason ?? ""] ??
            "Something went sideways — try again.",
        );
    } finally {
      setBusy(false);
    }
  };

  const ticketLine =
    charges > 0
      ? `${charges} bet${charges === 1 ? "" : "s"} left on your pass${tickets > 0 ? ` · ${tickets} spare` : ""}`
      : tickets > 0
        ? `Next bet burns a pass (${BET_CHARGES_PER_TICKET} bets) · ${tickets} in hand`
        : "No pass. No seat.";

  const profitNow = Math.floor(stakeNow * (multiplier ?? 1) + 1e-9) - stakeNow;

  return (
    <View style={styles.container}>
      {/* the bulb over the door */}
      <View pointerEvents="none" style={styles.glow} />

      <View style={styles.header}>
        <View style={styles.headerText}>
          <Animated.Text style={[styles.title, { opacity: flicker }]}>
            THE BACK ROOM
          </Animated.Text>
          <Text style={styles.tagline}>{tagline}</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.stashBox}>
        <Text style={styles.stamp}>NO REFUNDS</Text>
        <Text style={styles.stashLabel}>YOUR STASH</Text>
        <Text style={styles.stashValue}>⚡ {fp} FP</Text>
        <Text style={[styles.ticketLine, !canBet && styles.ticketLineWarn]}>
          🎟️ {ticketLine}
        </Text>
      </View>

      {!canBet && (
        <TouchableOpacity style={styles.noTicketCard} onPress={onOpenAlley}>
          <Text style={styles.noTicketText}>
            No pass, no entry. Your first one's free — the Alley's got it. Tap
            to head over.
          </Text>
        </TouchableOpacity>
      )}

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {markets.map((view) => {
          const info = MARKET_INFO[view.market];
          const betAlready = hasOpenBet(view.market);
          return (
            <View key={view.market} style={styles.marketCard}>
              <Text style={styles.marketTitle}>{info.title}</Text>
              <Text style={styles.marketBlurb}>{info.blurb}</Text>
              {view.closedReason ? (
                <Text style={styles.closed}>🔒 {view.closedReason}</Text>
              ) : betAlready ? (
                <Text style={styles.closed}>
                  ✓ You've already got money on this
                </Text>
              ) : (
                <View style={styles.optionWrap}>
                  {view.options.map((o) => {
                    const chosen =
                      selection?.market === view.market &&
                      selection.pick === o.pick;
                    const disabled = o.multiplier === null || !canBet;
                    return (
                      <TouchableOpacity
                        key={o.pick}
                        style={[
                          styles.option,
                          chosen && styles.optionChosen,
                          disabled && styles.optionDisabled,
                        ]}
                        disabled={disabled}
                        onPress={() =>
                          choose(view.market, o.pick, o.multiplier)
                        }
                      >
                        <Text
                          style={[
                            styles.optionName,
                            chosen && styles.optionNameChosen,
                          ]}
                        >
                          {betPickLabel(o.pick, group.players, playerId)}
                        </Text>
                        <Text style={styles.optionOdds}>
                          {o.multiplier === null
                            ? "closed"
                            : `×${o.multiplier.toFixed(1)} · ${Math.round(o.chance * 100)}%`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        {myOpenBets.length > 0 && (
          <View style={styles.marketCard}>
            <Text style={styles.marketTitle}>🧾 YOUR ACTION</Text>
            {myOpenBets.map((b) => (
              <Text key={b.id} style={styles.openBet}>
                {MARKET_INFO[b.market].title} —{" "}
                {betPickLabel(b.pick, group.players, playerId)} · {b.stake} FP
                at ×{b.multiplier.toFixed(1)}
              </Text>
            ))}
          </View>
        )}
        <Text style={styles.fineprint}>
          Odds move with everyone's lives and lock the second you bet. Back
          yourself to go down and they'll pay you peanuts. Guess wrong and all
          you lose is the stake.
        </Text>
      </ScrollView>

      {selection && selectedOption && (
        <View style={styles.slip}>
          <Text style={styles.slipLabel}>THE SLIP</Text>
          <Text style={styles.slipPick}>
            {MARKET_INFO[selection.market].title} ·{" "}
            {betPickLabel(selection.pick, group.players, playerId)}
          </Text>
          {canPlace ? (
            <>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={styles.chip}
                  onPress={() => setStake(Math.max(MIN_STAKE, stakeNow - 5))}
                >
                  <Text style={styles.chipText}>−5</Text>
                </TouchableOpacity>
                <Text style={styles.slipStake}>{stakeNow} FP</Text>
                <TouchableOpacity
                  style={styles.chip}
                  onPress={() => setStake(Math.min(limit, stakeNow + 5))}
                >
                  <Text style={styles.chipText}>+5</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.chip}
                  onPress={() => setStake(limit)}
                >
                  <Text style={styles.chipTextSmall}>MAX</Text>
                  <Text style={styles.chipTextSmall}>{limit}</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.winLine}>
                {selection.market === "game-winner"
                  ? `Pays ${winnerBetPoints(profitNow)} leaderboard points if you're right · ${Math.round(selectedOption.chance * 100)}% shot · ${stakeNow} FP locked till the end`
                  : `Pays up to +${profitNow} FP · ${Math.round(selectedOption.chance * 100)}% shot`}
              </Text>
              <TouchableOpacity
                style={[styles.placeBtn, busy && styles.placeBtnBusy]}
                onPress={place}
                disabled={busy}
              >
                <Text style={styles.placeBtnText}>
                  {busy ? "COUNTING..." : `PUT ${stakeNow} FP DOWN`}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.closed}>
              You need at least {MIN_STAKE} FP to play this one.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#12060A",
    padding: 20,
    paddingTop: 50,
  },
  glow: {
    position: "absolute",
    top: -150,
    left: "50%",
    marginLeft: -170,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: "rgba(220,20,60,0.10)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  headerText: { flex: 1, paddingRight: 12 },
  title: {
    color: "#FF3B4E",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 4,
    fontFamily: MONO,
    textShadowColor: "#FF1F3D",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  tagline: {
    color: "#9A6B72",
    fontSize: 11,
    fontStyle: "italic",
    fontFamily: MONO,
    marginTop: 4,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#1C0A10",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#5A2A38",
  },
  closeBtnText: { color: "#9A6B72", fontSize: 16 },
  stashBox: {
    backgroundColor: "#1C0A10",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#5A2A38",
    borderStyle: "dashed",
  },
  stamp: {
    position: "absolute",
    top: 8,
    right: 8,
    color: "#C1121F",
    borderColor: "#C1121F",
    borderWidth: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
    fontFamily: MONO,
    transform: [{ rotate: "-8deg" }],
    opacity: 0.85,
  },
  stashLabel: {
    color: "#9A6B72",
    fontSize: 10,
    letterSpacing: 3,
    fontFamily: MONO,
  },
  stashValue: {
    color: "#39FF88",
    fontSize: 28,
    fontWeight: "900",
    fontFamily: MONO,
    marginTop: 2,
    textShadowColor: "#39FF88",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  ticketLine: {
    color: "#E9C46A",
    fontSize: 11,
    marginTop: 4,
    fontFamily: MONO,
  },
  ticketLineWarn: { color: "#FF3B4E" },
  noTicketCard: {
    backgroundColor: "#2A0C12",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#C1121F",
  },
  noTicketText: {
    color: "#F2DADA",
    fontSize: 12,
    textAlign: "center",
    fontFamily: MONO,
  },
  list: { flex: 1 },
  marketCard: {
    backgroundColor: "#1C0A10",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#3A1420",
    borderLeftWidth: 4,
    borderLeftColor: "#C1121F",
  },
  marketTitle: {
    color: "#F5E6E8",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1,
    fontFamily: MONO,
  },
  marketBlurb: {
    color: "#A07A80",
    fontSize: 11,
    marginTop: 3,
    marginBottom: 10,
    fontFamily: MONO,
  },
  closed: {
    color: "#A07A80",
    fontSize: 12,
    fontStyle: "italic",
    fontFamily: MONO,
  },
  optionWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: {
    backgroundColor: "#26101A",
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#5A2A38",
    minWidth: 100,
  },
  optionChosen: {
    borderColor: "#39FF88",
    backgroundColor: "#10261C",
    borderStyle: "solid",
  },
  optionDisabled: { opacity: 0.35 },
  optionName: {
    color: "#F2DADA",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: MONO,
  },
  optionNameChosen: { color: "#39FF88" },
  optionOdds: {
    color: "#E9C46A",
    fontSize: 11,
    marginTop: 3,
    fontFamily: MONO,
  },
  openBet: { color: "#C9A9AE", fontSize: 12, marginTop: 6, fontFamily: MONO },
  fineprint: {
    color: "#6E4B52",
    fontSize: 10,
    textAlign: "center",
    marginBottom: 12,
    fontFamily: MONO,
  },
  slip: {
    backgroundColor: "#1C0A10",
    borderRadius: 14,
    padding: 14,
    borderWidth: 2,
    borderColor: "#C1121F",
    marginTop: 6,
  },
  slipLabel: {
    color: "#C1121F",
    fontSize: 10,
    letterSpacing: 4,
    fontWeight: "900",
    textAlign: "center",
    fontFamily: MONO,
  },
  slipPick: {
    color: "#F5E6E8",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 10,
    fontFamily: MONO,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  chip: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 3,
    borderStyle: "dashed",
    borderColor: "#E9C46A",
    backgroundColor: "#26101A",
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: {
    color: "#E9C46A",
    fontSize: 15,
    fontWeight: "900",
    fontFamily: MONO,
  },
  chipTextSmall: {
    color: "#E9C46A",
    fontSize: 10,
    fontWeight: "900",
    fontFamily: MONO,
  },
  slipStake: {
    color: "#39FF88",
    fontSize: 24,
    fontWeight: "900",
    minWidth: 96,
    textAlign: "center",
    fontFamily: MONO,
  },
  winLine: {
    color: "#39FF88",
    fontSize: 11,
    textAlign: "center",
    marginTop: 10,
    fontFamily: MONO,
  },
  placeBtn: {
    backgroundColor: "#C1121F",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginTop: 10,
    borderBottomWidth: 4,
    borderBottomColor: "#7A0B14",
  },
  placeBtnBusy: { opacity: 0.6 },
  placeBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 2,
    fontFamily: MONO,
  },
});
