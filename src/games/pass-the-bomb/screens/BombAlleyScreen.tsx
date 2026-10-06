import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { Group, BombGameState } from "../../../shared/types";
import {
  purchaseBettingTicket,
  purchaseTbcTicket,
  SHOP_PRICES,
} from "../logic/game";
import {
  buyLife,
  lifePrice,
  GHOST_STIPEND_FP,
  LIFE_PURCHASE_GHOSTS_ONLY,
} from "../logic/ghostEconomy";

type Props = {
  group: Group;
  playerId: string;
  onClose: () => void;
};

export default function BombAlleyScreen({ group, playerId, onClose }: Props) {
  const gameState = group.gameState as BombGameState;
  const [buying, setBuying] = useState(false);

  const myFP = gameState.fusePoints?.[playerId] ?? 0;
  const myBettingTickets = gameState.bettingTickets?.[playerId] ?? 0;
  const myBetCharges = gameState.betCharges?.[playerId] ?? 0;
  const myTbcTickets = gameState.tbcTickets?.[playerId] ?? 0;

  // Real price for THIS player, right now — 0 the first time, full price
  // after that. The button/disabled-state MUST be driven by this, not
  // the flat SHOP_PRICES constant — a player who hasn't earned enough
  // (or negative!) FP yet would otherwise be locked out of a purchase
  // that's actually free, with the button silently doing nothing on tap.
  const bettingFreeAvailable = !(
    gameState.freeBettingClaimed?.[playerId] ?? false
  );
  const tbcFreeAvailable = !(gameState.freeTbcClaimed?.[playerId] ?? false);
  const bettingPrice = bettingFreeAvailable ? 0 : SHOP_PRICES.BETTING_TICKET;
  const tbcPrice = tbcFreeAvailable ? 0 : SHOP_PRICES.TBC_TICKET;
  // FP can go negative (wrong wire, callouts), so a free item must skip the
  // balance check entirely — otherwise -5 < 0 locks out a 0 FP purchase.
  const canAfford = (price: number) => price === 0 || myFP >= price;
  const canAffordBetting = canAfford(bettingPrice);
  const canAffordTbc = canAfford(tbcPrice);

  // ── Extra life ─────────────────────────────────────────────────────────
  const isGhost = gameState.ghosts.includes(playerId);
  const myLives = gameState.lives?.[playerId] ?? 0;
  const activeCount = group.players.filter(
    (p) => !gameState.ghosts.includes(p.id),
  ).length;
  const lifePurchases = gameState.lifePurchases?.[playerId] ?? 0;
  const nextLifePrice = lifePrice(lifePurchases);
  const boughtThisBreak =
    gameState.lifeBoughtRound?.[playerId] === gameState.roundNumber;
  const lifeBlock: string | null =
    gameState.phase !== "replay"
      ? "Between rounds only"
      : activeCount <= 1
        ? "The game is already decided"
        : LIFE_PURCHASE_GHOSTS_ONLY && !isGhost
          ? "Ghosts only"
          : myLives >= 3
            ? "You're already on full lives"
            : boughtThisBreak
              ? "One per break — try again next round"
              : myFP < nextLifePrice
                ? `You need ${nextLifePrice} FP`
                : null;

  const handleBuyLife = async () => {
    if (buying || lifeBlock) return;
    setBuying(true);
    try {
      const result = await buyLife(group.id, playerId);
      if (result.success) {
        Alert.alert(
          "❤️ Life bought",
          isGhost
            ? "You're back in at the start of the next round."
            : "You gained a life.",
        );
      } else {
        Alert.alert("Couldn't buy a life", "Something changed — try again.");
      }
    } finally {
      setBuying(false);
    }
  };

  const handleBuy = async (
    price: number,
    purchaseFn: (
      group: Group,
      playerId: string,
    ) => Promise<{ success: boolean; reason?: string }>,
  ) => {
    if (buying) return;
    if (!canAfford(price)) {
      Alert.alert(
        "Not enough Fuse Points",
        `You need ${price} FP for this item.`,
      );
      return;
    }
    setBuying(true);
    try {
      const result = await purchaseFn(group, playerId);
      if (!result.success) {
        if (result.reason === "insufficient-fp") {
          Alert.alert(
            "Not enough Fuse Points",
            "Something changed server-side — try again.",
          );
        } else {
          Alert.alert("Purchase failed", "Something went wrong — try again.");
        }
      }
    } catch (err) {
      console.error("Betting/TBC purchase threw:", err);
      Alert.alert("Error", String(err));
    } finally {
      setBuying(false);
    }
  };
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🕯️ THE ALLEY</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.balanceBox}>
        <Text style={styles.balanceLabel}>YOUR FUSE POINTS</Text>
        <Text style={styles.balanceValue}>⚡ {myFP} FP</Text>
      </View>

      <ScrollView style={styles.shopList}>
        <View style={styles.itemCard}>
          <Text style={styles.itemEmoji}>❤️</Text>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>Extra Life</Text>
            <Text style={styles.itemDesc}>
              Buy your way back in, or top up a life. Between rounds only, one
              per break, and each one you buy costs 50 FP more than the last.
              {isGhost
                ? ` Ghosts also earn ${GHOST_STIPEND_FP} FP for every round they sit out.`
                : ""}
            </Text>
            <Text style={lifeBlock ? styles.itemBlocked : styles.itemOwned}>
              {lifeBlock ?? "Ready to buy"}
            </Text>
          </View>
          <View style={styles.buyColumn}>
            <TouchableOpacity
              style={[styles.buyBtn, lifeBlock && styles.buyBtnDisabled]}
              onPress={handleBuyLife}
              disabled={buying || !!lifeBlock}
            >
              <Text style={styles.buyBtnText}>{nextLifePrice} FP</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.itemCard}>
          <Text style={styles.itemEmoji}>🎟️</Text>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>Betting Ticket</Text>
            <Text style={styles.itemDesc}>
              Good for 3 match bets on the replay screen (🎲): guess what
              happens next round, or who becomes the first ghost. Ghosts can
              also spend one to secretly guess a wire when someone else defuses
              — win, and you can challenge them to a duel.
            </Text>
            <Text style={styles.itemOwned}>
              You have: {myBettingTickets}
              {myBetCharges > 0
                ? ` · ${myBetCharges} bet${myBetCharges === 1 ? "" : "s"} left on an open ticket`
                : ""}
            </Text>
          </View>
          <View style={styles.buyColumn}>
            {bettingFreeAvailable && (
              <Text style={styles.strikePrice}>
                {SHOP_PRICES.BETTING_TICKET} FP
              </Text>
            )}
            <TouchableOpacity
              style={[
                styles.buyBtn,
                bettingFreeAvailable && styles.buyBtnFree,
                !canAffordBetting && styles.buyBtnDisabled,
              ]}
              onPress={() => handleBuy(bettingPrice, purchaseBettingTicket)}
              disabled={buying || !canAffordBetting}
            >
              <Text style={styles.buyBtnText}>
                {bettingFreeAvailable ? "FREE" : `${bettingPrice} FP`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.itemCard}>
          <Text style={styles.itemEmoji}>⚔️</Text>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>TBC Ticket</Text>
            <Text style={styles.itemDesc}>
              An extra Trial by Combat lifeline, beyond your free one.
            </Text>
            <Text style={styles.itemOwned}>You have: {myTbcTickets}</Text>
          </View>
          <View style={styles.buyColumn}>
            {tbcFreeAvailable && (
              <Text style={styles.strikePrice}>
                {SHOP_PRICES.TBC_TICKET} FP
              </Text>
            )}
            <TouchableOpacity
              style={[
                styles.buyBtn,
                tbcFreeAvailable && styles.buyBtnFree,
                !canAffordTbc && styles.buyBtnDisabled,
              ]}
              onPress={() => handleBuy(tbcPrice, purchaseTbcTicket)}
              disabled={buying || !canAffordTbc}
            >
              <Text style={styles.buyBtnText}>
                {tbcFreeAvailable ? "FREE" : `${tbcPrice} FP`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
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
    marginBottom: 16,
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
    padding: 16,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  balanceLabel: {
    color: "#888",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 4,
  },
  balanceValue: { color: "#FFD700", fontSize: 28, fontWeight: "bold" },
  shopList: { flex: 1 },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: "#333",
  },
  itemEmoji: { fontSize: 32 },
  itemInfo: { flex: 1 },
  itemName: { color: "#fff", fontSize: 15, fontWeight: "700", marginBottom: 2 },
  itemDesc: { color: "#888", fontSize: 11, lineHeight: 15, marginBottom: 4 },
  itemOwned: { color: "#4CAF50", fontSize: 11, fontWeight: "600" },
  itemBlocked: { color: "#E69F00", fontSize: 11, fontWeight: "600" },
  buyColumn: { alignItems: "center", gap: 4 },
  strikePrice: {
    color: "#555",
    fontSize: 11,
    textDecorationLine: "line-through",
  },
  buyBtn: {
    backgroundColor: "#FF4500",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  buyBtnFree: { backgroundColor: "#4CAF50" },
  buyBtnDisabled: { backgroundColor: "#333" },
  buyBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
