import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { Group, BombGameState, BetMarket } from "../../../shared/types";
import {
  buildMarkets,
  maxStakeFor,
  MIN_STAKE,
  BET_CHARGES_PER_TICKET,
  isGameLongMarket,
  winnerBetPoints,
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
  if (pick === "boom") return "💥 Boom";
  if (pick === "defuse") return "🧯 Defuse";
  if (pick === "nobody") return "🕊️ Nobody";
  const name = players.find((p) => p.id === pick)?.name ?? "Unknown";
  return pick === viewerId ? `${name} (you)` : name;
};

const MARKET_INFO: Record<BetMarket, { title: string; blurb: string }> = {
  "boom-or-defuse": {
    title: "💥 Boom or defuse?",
    blurb: "Next round: does the bomb explode, or does someone defuse it?",
  },
  "round-victim": {
    title: "🎯 Who loses a life?",
    blurb: "Next round: who gets blown up — or does nobody?",
  },
  "first-ghost": {
    title: "👻 First ghost",
    blurb:
      "Who will be the first player to run out of lives? Stays open until it happens.",
  },
  "next-ghost": {
    title: "👻 Next ghost",
    blurb:
      "Who will be the next player to run out of lives? Stays open until it happens.",
  },
  "game-winner": {
    title: "🏆 Who wins the game?",
    blurb:
      "Settles when the game ends and pays leaderboard points, not FP. Your stake stays locked until then. One bet per game.",
  },
};

const FAIL_MESSAGES: Record<string, string> = {
  "between-rounds-only": "Bets can only be placed between rounds.",
  "market-closed": "That market is closed right now.",
  "option-unavailable": "That pick isn't available any more.",
  "stake-too-low": `The minimum stake is ${MIN_STAKE} FP.`,
  "not-enough-fp": "You don't have enough Fuse Points for that stake.",
  "stake-too-high": "That stake is over the limit for this bet.",
  "already-bet": "You already have a bet on this.",
  "no-ticket":
    "You need a Betting Ticket. Your first one is free in the Alley.",
};

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
          "Bet not placed",
          FAIL_MESSAGES[result.reason ?? ""] ??
            "Something went wrong — try again.",
        );
    } finally {
      setBusy(false);
    }
  };

  const ticketLine =
    charges > 0
      ? `${charges} bet${charges === 1 ? "" : "s"} left on your ticket${tickets > 0 ? ` · ${tickets} more ticket${tickets === 1 ? "" : "s"}` : ""}`
      : tickets > 0
        ? `Your next bet opens a ticket (${BET_CHARGES_PER_TICKET} bets) · ${tickets} in hand`
        : "No Betting Ticket";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🎲 PLACE YOUR BETS</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.balanceBox}>
        <Text style={styles.balanceValue}>⚡ {fp} FP</Text>
        <Text style={[styles.ticketLine, !canBet && styles.ticketLineWarn]}>
          🎟️ {ticketLine}
        </Text>
      </View>

      {!canBet && (
        <TouchableOpacity style={styles.noTicketCard} onPress={onOpenAlley}>
          <Text style={styles.noTicketText}>
            You need a Betting Ticket to bet. Your first one is free — tap to
            open the Alley.
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
                  ✓ You already have a bet on this
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
            <Text style={styles.marketTitle}>Your open bets</Text>
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
          Odds are worked out from everyone's lives and lock when you bet.
          Bigger groups allow bigger bets. Betting on yourself to lose pays
          almost nothing. A wrong guess only costs your stake.
        </Text>
      </ScrollView>

      {selection && selectedOption && (
        <View style={styles.stakePanel}>
          <Text style={styles.stakePick}>
            {MARKET_INFO[selection.market].title} ·{" "}
            {betPickLabel(selection.pick, group.players, playerId)}
          </Text>
          {canPlace ? (
            <>
              <View style={styles.stakeRow}>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => setStake(Math.max(MIN_STAKE, stakeNow - 5))}
                >
                  <Text style={styles.stepText}>−5</Text>
                </TouchableOpacity>
                <Text style={styles.stakeValue}>{stakeNow} FP</Text>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => setStake(Math.min(limit, stakeNow + 5))}
                >
                  <Text style={styles.stepText}>+5</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => setStake(limit)}
                >
                  <Text style={styles.stepText}>MAX {limit}</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.winLine}>
                {selection.market === "game-winner"
                  ? `Win ${winnerBetPoints(Math.floor(stakeNow * (multiplier ?? 1) + 1e-9) - stakeNow)} leaderboard points if right · ${Math.round(selectedOption.chance * 100)}% chance · ${stakeNow} FP locked until the game ends`
                  : `Win up to +${Math.floor(stakeNow * (multiplier ?? 1) + 1e-9) - stakeNow} FP · ${Math.round(selectedOption.chance * 100)}% chance`}
              </Text>
              <TouchableOpacity
                style={[styles.placeBtn, busy && styles.placeBtnBusy]}
                onPress={place}
                disabled={busy}
              >
                <Text style={styles.placeBtnText}>
                  {busy ? "Placing..." : `Bet ${stakeNow} FP`}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.closed}>
              You need at least {MIN_STAKE} FP to bet on this.
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
    backgroundColor: "#0D0D0D",
    padding: 20,
    paddingTop: 50,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    color: "#FFD700",
    fontSize: 20,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: { color: "#888", fontSize: 16 },
  balanceBox: {
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  balanceValue: { color: "#FFD700", fontSize: 24, fontWeight: "bold" },
  ticketLine: { color: "#4CAF50", fontSize: 12, marginTop: 2 },
  ticketLineWarn: { color: "#E63946" },
  noTicketCard: {
    backgroundColor: "#2D0A0E",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E63946",
  },
  noTicketText: { color: "#fff", fontSize: 12, textAlign: "center" },
  list: { flex: 1 },
  marketCard: {
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#333",
  },
  marketTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  marketBlurb: { color: "#888", fontSize: 11, marginTop: 2, marginBottom: 10 },
  closed: { color: "#888", fontSize: 12, fontStyle: "italic" },
  optionWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: {
    backgroundColor: "#2A2A2A",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#444",
    minWidth: 96,
  },
  optionChosen: { borderColor: "#FF4500", backgroundColor: "#2A1A1A" },
  optionDisabled: { opacity: 0.4 },
  optionName: { color: "#ddd", fontSize: 13, fontWeight: "600" },
  optionNameChosen: { color: "#FF4500" },
  optionOdds: { color: "#FFD700", fontSize: 11, marginTop: 2 },
  openBet: { color: "#aaa", fontSize: 12, marginTop: 6 },
  fineprint: {
    color: "#555",
    fontSize: 10,
    textAlign: "center",
    marginBottom: 12,
  },
  stakePanel: {
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#FF4500",
    marginTop: 6,
  },
  stakePick: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 10,
  },
  stakeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  stepBtn: {
    backgroundColor: "#2A2A2A",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#444",
  },
  stepText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  stakeValue: {
    color: "#FFD700",
    fontSize: 22,
    fontWeight: "bold",
    minWidth: 90,
    textAlign: "center",
  },
  winLine: {
    color: "#4CAF50",
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },
  placeBtn: {
    backgroundColor: "#FF4500",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 10,
  },
  placeBtnBusy: { opacity: 0.6 },
  placeBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
});
