import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Animated,
} from "react-native";
import { Group, BombGameState } from "../../../shared/types";
import {
  purchaseBettingTicket,
  purchaseTbcTicket,
  SHOP_PRICES,
  purchaseWireRevealer,
  nextRevealerAccuracy,
  purchaseBombShield,
  armBombShield,
  ITEM_PRICES,
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

const TAGLINES = [
  "Keep your voice down.",
  "Nothing here comes with a receipt.",
  "Cash talks. Everything else walks.",
  "Don't ask where it came from.",
];

// A paper price tag, tied to the crate. Tap it to "cop" the thing.
function PriceTag({
  price,
  unit,
  strike,
  disabled,
  onPress,
}: {
  price: string;
  unit?: string;
  strike?: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[styles.tag, disabled && styles.tagDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={styles.tagHole} />
      {strike ? <Text style={styles.tagStrike}>{strike}</Text> : null}
      <Text style={styles.tagPrice}>{price}</Text>
      {unit ? <Text style={styles.tagUnit}>{unit}</Text> : null}
      <Text style={styles.tagCta}>COP IT</Text>
    </TouchableOpacity>
  );
}

export default function BombAlleyScreen({ group, playerId, onClose }: Props) {
  const gameState = group.gameState as BombGameState;
  const [buying, setBuying] = useState(false);
  const [tagline] = useState(
    () => TAGLINES[Math.floor(Math.random() * TAGLINES.length)],
  );

  // The neon sign is on its last legs.
  const flicker = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2600),
        Animated.timing(flicker, {
          toValue: 0.4,
          duration: 60,
          useNativeDriver: true,
        }),
        Animated.timing(flicker, {
          toValue: 1,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(flicker, {
          toValue: 0.7,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(flicker, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

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

  // ── Borrowed time (extra life) ─────────────────────────────────────────
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
      ? "Not while the fuse is lit"
      : activeCount <= 1
        ? "It's over. Nothing left to buy."
        : LIFE_PURCHASE_GHOSTS_ONLY && !isGhost
          ? "Ghosts only"
          : myLives >= 3
            ? "You're already stacked"
            : boughtThisBreak
              ? "One a break. Come back next round."
              : myFP < nextLifePrice
                ? `Short. You need ${nextLifePrice} FP`
                : null;

  const handleBuyLife = async () => {
    if (buying || lifeBlock) return;
    setBuying(true);
    try {
      const result = await buyLife(group.id, playerId);
      if (result.success) {
        Alert.alert(
          "❤️ Borrowed time",
          isGhost
            ? "Back from the dead. You're in at the start of the next round."
            : "One more life on the tab.",
        );
      } else {
        Alert.alert("That fell through", "Something changed — try again.");
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
      Alert.alert("You're short", `Come back with ${price} FP.`);
      return;
    }
    setBuying(true);
    try {
      const result = await purchaseFn(group, playerId);
      if (!result.success) {
        if (result.reason === "insufficient-fp") {
          Alert.alert("You're short", "Something changed — try again.");
        } else {
          Alert.alert("That fell through", "Something went wrong — try again.");
        }
      }
    } catch (err) {
      console.error("Betting/TBC purchase threw:", err);
      Alert.alert("Error", String(err));
    } finally {
      setBuying(false);
    }
  };

  // ── Wire Revealer ──────────────────────────────────────────────────
  const myRevealers = gameState.revealerItems?.[playerId] ?? [];
  const revealersBought = gameState.revealerPurchases?.[playerId] ?? 0;

  const nextAccuracy = nextRevealerAccuracy(revealersBought);

  // ── Bomb Shield ────────────────────────────────────────────────────
  const myShields = gameState.shieldItems?.[playerId] ?? 0;
  const shieldArmed = (gameState.shieldArmed ?? []).includes(playerId);
  const armBlock: string | null = shieldArmed
    ? null
    : gameState.phase !== "replay"
      ? "Arm it between rounds"
      : isGhost
        ? "Ghosts don't need vests"
        : activeCount <= 2
          ? "No vests in the final duel"
          : null;

  const handleArmShield = async () => {
    if (buying || armBlock || myShields <= 0 || shieldArmed) return;
    setBuying(true);
    try {
      const result = await armBombShield(group, playerId);
      if (result.success) {
        Alert.alert(
          "🛡️ Vest on",
          "You're covered for the next round. Keep it quiet.",
        );
      } else {
        Alert.alert("Can't strap it on", "Something changed — try again.");
      }
    } finally {
      setBuying(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* the streetlamp */}
      <View pointerEvents="none" style={styles.lamp} />

      <View style={styles.header}>
        <View style={styles.headerText}>
          <Animated.Text style={[styles.title, { opacity: flicker }]}>
            THE ALLEY
          </Animated.Text>
          <Text style={styles.tagline}>{tagline}</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.stashBox}>
        <Text style={styles.stashLabel}>YOUR STASH</Text>
        <Text style={styles.stashValue}>⚡ {myFP} FP</Text>
      </View>

      <ScrollView style={styles.shopList} showsVerticalScrollIndicator={false}>
        <View style={styles.crate}>
          <View style={styles.crateIcon}>
            <Text style={styles.crateEmoji}>❤️</Text>
          </View>
          <View style={styles.crateInfo}>
            <Text style={styles.crateName}>BORROWED TIME</Text>
            <Text style={styles.crateSub}>extra life</Text>
            <Text style={styles.crateDesc}>
              Claw your way back in, or stack another life. Between rounds only,
              one a break, and every one costs 50 more than the last. Greed gets
              pricey.
              {isGhost
                ? ` Ghosts pick up ${GHOST_STIPEND_FP} FP for every round they sit out.`
                : ""}
            </Text>
            <Text style={lifeBlock ? styles.crateBlocked : styles.crateOwned}>
              {lifeBlock ?? "Ready when you are."}
            </Text>
          </View>
          <PriceTag
            price={String(nextLifePrice)}
            unit="FP"
            disabled={buying || !!lifeBlock}
            onPress={handleBuyLife}
          />
        </View>

        <View style={styles.crate}>
          <View style={styles.crateIcon}>
            <Text style={styles.crateEmoji}>🎟️</Text>
          </View>
          <View style={styles.crateInfo}>
            <Text style={styles.crateName}>BACK ROOM PASS</Text>
            <Text style={styles.crateSub}>betting ticket</Text>
            <Text style={styles.crateDesc}>
              Gets you three bets in the Back Room (the 🎲 on the replay
              screen). Ghosts can burn one to slip in a wire guess while
              somebody defuses — call it right and you can challenge them to a
              duel.
            </Text>
            <Text style={styles.crateOwned}>
              In your pocket: {myBettingTickets}
              {myBetCharges > 0
                ? ` · ${myBetCharges} bet${myBetCharges === 1 ? "" : "s"} left on a live pass`
                : ""}
            </Text>
          </View>
          <PriceTag
            price={bettingFreeAvailable ? "FREE" : String(bettingPrice)}
            unit={bettingFreeAvailable ? undefined : "FP"}
            strike={
              bettingFreeAvailable
                ? `${SHOP_PRICES.BETTING_TICKET} FP`
                : undefined
            }
            disabled={buying || !canAffordBetting}
            onPress={() => handleBuy(bettingPrice, purchaseBettingTicket)}
          />
        </View>

        <View style={styles.crate}>
          <View style={styles.crateIcon}>
            <Text style={styles.crateEmoji}>⚔️</Text>
          </View>
          <View style={styles.crateInfo}>
            <Text style={styles.crateName}>BEAT THE RAP</Text>
            <Text style={styles.crateSub}>trial by combat ticket</Text>
            <Text style={styles.crateDesc}>
              An extra shot at beating a call-out, on top of your free one.
            </Text>
            <Text style={styles.crateOwned}>
              In your pocket: {myTbcTickets}
            </Text>
          </View>
          <PriceTag
            price={tbcFreeAvailable ? "FREE" : String(tbcPrice)}
            unit={tbcFreeAvailable ? undefined : "FP"}
            strike={
              tbcFreeAvailable ? `${SHOP_PRICES.TBC_TICKET} FP` : undefined
            }
            disabled={buying || !canAffordTbc}
            onPress={() => handleBuy(tbcPrice, purchaseTbcTicket)}
          />
        </View>

        <View style={styles.crate}>
          <View style={styles.crateIcon}>
            <Text style={styles.crateEmoji}>👁️</Text>
          </View>
          <View style={styles.crateInfo}>
            <Text style={styles.crateName}>THE SNITCH</Text>
            <Text style={styles.crateSub}>wire revealer</Text>
            <Text style={styles.crateDesc}>
              Use it while you're cutting and it whispers which wire is safe.
              Usually right. Every one you buy is a little less reliable than
              the last.
            </Text>
            <Text style={styles.crateOwned}>
              In your pocket: {myRevealers.length}
              {myRevealers.length > 0 ? ` (${myRevealers.join("%, ")}%)` : ""}
            </Text>
            <Text style={styles.crateBlocked}>
              Next one: {nextAccuracy}% sure
            </Text>
          </View>
          <PriceTag
            price={String(ITEM_PRICES.WIRE_REVEALER)}
            unit="FP"
            disabled={buying || !canAfford(ITEM_PRICES.WIRE_REVEALER)}
            onPress={() =>
              handleBuy(ITEM_PRICES.WIRE_REVEALER, purchaseWireRevealer)
            }
          />
        </View>

        <View style={styles.crate}>
          <View style={styles.crateIcon}>
            <Text style={styles.crateEmoji}>🛡️</Text>
          </View>
          <View style={styles.crateInfo}>
            <Text style={styles.crateName}>KEVLAR VEST</Text>
            <Text style={styles.crateSub}>bomb shield</Text>
            <Text style={styles.crateDesc}>
              Strap it on between rounds. If the bomb blows up in your hands
              next round, you keep the life. Not holding it when it goes off?
              Vest's gone anyway. Not allowed in the final duel.
            </Text>
            <Text style={styles.crateOwned}>
              In your pocket: {myShields}
              {shieldArmed ? " · 🛡️ armed for next round" : ""}
            </Text>
            {myShields > 0 && !shieldArmed && (
              <TouchableOpacity
                style={[
                  styles.armBtn,
                  (!!armBlock || buying) && styles.armBtnDisabled,
                ]}
                onPress={handleArmShield}
                disabled={!!armBlock || buying}
              >
                <Text style={styles.armBtnText}>
                  {armBlock ?? "STRAP IT ON"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <PriceTag
            price={String(ITEM_PRICES.BOMB_SHIELD)}
            unit="FP"
            disabled={buying || !canAfford(ITEM_PRICES.BOMB_SHIELD)}
            onPress={() =>
              handleBuy(ITEM_PRICES.BOMB_SHIELD, purchaseBombShield)
            }
          />
        </View>

        <Text style={styles.footer}>No receipts. No returns.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0E14",
    padding: 20,
    paddingTop: 50,
  },
  lamp: {
    position: "absolute",
    top: -140,
    left: "50%",
    marginLeft: -160,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(255,170,60,0.08)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  headerText: { flex: 1, paddingRight: 12 },
  title: {
    color: "#FF2E88",
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 5,
    textShadowColor: "#FF2E88",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  tagline: {
    color: "#6F8299",
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 4,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#111A24",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1F2C3B",
  },
  closeBtnText: { color: "#6F8299", fontSize: 16 },
  stashBox: {
    backgroundColor: "#111A24",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#1F2C3B",
  },
  stashLabel: { color: "#6F8299", fontSize: 10, letterSpacing: 3 },
  stashValue: {
    color: "#FFB347",
    fontSize: 28,
    fontWeight: "900",
    marginTop: 2,
  },
  shopList: { flex: 1 },
  crate: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111A24",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: "#1F2C3B",
    borderLeftWidth: 4,
    borderLeftColor: "#FFB347",
  },
  crateIcon: {
    width: 52,
    height: 52,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#2C3E52",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0D141C",
  },
  crateEmoji: { fontSize: 26 },
  crateInfo: { flex: 1 },
  crateName: {
    color: "#D6E2F0",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 2,
  },
  crateSub: {
    color: "#FFB347",
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 4,
  },
  crateDesc: {
    color: "#7F93A8",
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 4,
  },
  crateOwned: { color: "#5FD38D", fontSize: 11, fontWeight: "600" },
  crateBlocked: { color: "#FFB347", fontSize: 11, fontWeight: "600" },
  tag: {
    backgroundColor: "#E9DDBF",
    borderRadius: 6,
    paddingTop: 14,
    paddingBottom: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    minWidth: 70,
    transform: [{ rotate: "3deg" }],
  },
  tagDisabled: { opacity: 0.35 },
  tagHole: {
    position: "absolute",
    top: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#0A0E14",
  },
  tagStrike: {
    color: "#7A6F55",
    fontSize: 10,
    textDecorationLine: "line-through",
  },
  tagPrice: { color: "#14110A", fontSize: 20, fontWeight: "900" },
  tagUnit: { color: "#14110A", fontSize: 10, fontWeight: "700", marginTop: -2 },
  tagCta: {
    color: "#B4231A",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 4,
  },
  footer: {
    color: "#3E4F63",
    fontSize: 11,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 20,
    letterSpacing: 2,
  },
  armBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: "#1F2C3B",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#5FD38D",
  },
  armBtnDisabled: { opacity: 0.4, borderColor: "#2C3E52" },
  armBtnText: {
    color: "#5FD38D",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
});
