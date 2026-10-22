// A 90s-style trading card: foil frame, name banner, bevelled art window,
// parchment stat box, set number and rarity gem. The caller taps a stat to
// call it; the called stat gets a "CALLED!" stamp. A ★ gold card wears a
// gold foil frame with a holo shine and a ribbon; a masked card (someone
// else's, in a clash with a gold card) hides its name and picture.
import { useEffect, useRef } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, Linking, Animated, Easing } from "react-native";
import type { ClashCard, ClashDeckId } from "../data/types";
import { formatStat } from "../data/types";
import { DECKS, cardMeta } from "../data/decks";
import { FLAG_IMAGES } from "../data/flagImages";
import { useCardPhoto } from "../data/photos";
import { FoilFill, HoloShine } from "./Foil";
import { CC, FRAME, GOLD_FRAME, RARITY, SERIF } from "../theme";

// The picture: a bundled flag, a Wikimedia photo, or the emoji.
export function CardPicture({ card, width, height }: { card: ClashCard; width: number; height: number }) {
  const photo = useCardPhoto(card);
  const flag = card.image ? FLAG_IMAGES[card.image] : undefined;
  if (flag) {
    return (
      <View style={[styles.flagBg, { width, height }]}>
        <Image source={flag} style={{ width: width * 0.86, height: height * 0.86 }} resizeMode="contain" />
      </View>
    );
  }
  if (photo) return <Image source={{ uri: photo.uri }} style={{ width, height }} resizeMode="cover" />;
  return (
    <View style={[styles.emojiBg, { width, height }]}>
      <Text style={{ fontSize: Math.min(width, height) * 0.6 }}>{card.emoji ?? "🃏"}</Text>
    </View>
  );
}

// The frame + banner + art used by both the big card and the mini card.
function Frame({
  card,
  deck,
  width,
  artHeight,
  children,
  small,
  gold,
  masked,
}: {
  card: ClashCard;
  deck: ClashDeckId;
  width: number;
  artHeight: number;
  children: React.ReactNode;
  small?: boolean;
  gold?: boolean;
  masked?: boolean;
}) {
  const meta = cardMeta(card.id);
  const pad = Math.max(4, width * 0.035);
  const radius = width * 0.06;
  const artW = width - pad * 4;
  const foil = gold ? GOLD_FRAME.foil : FRAME[deck].foil;
  const band = masked ? "#2B2440" : gold ? GOLD_FRAME.band : FRAME[deck].band;
  return (
    <View style={[styles.frame, { width, borderRadius: radius, padding: pad }]}>
      <FoilFill colors={masked ? ["#3A3355", "#6A6290", "#3A3355"] : foil} radius={radius} />
      <View style={[styles.body, { backgroundColor: band, borderRadius: radius * 0.7, padding: pad }]}>
        {/* name banner */}
        <View style={[styles.banner, { paddingVertical: small ? 3 : 6, borderRadius: small ? 4 : 8 }]}>
          <FoilFill colors={[CC.goldLight, CC.gold, CC.goldLight]} radius={small ? 4 : 8} />
          <Text
            style={[styles.bannerName, { fontSize: small ? Math.max(10, width * 0.085) : width * 0.07 }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {masked ? "? ? ?" : gold ? `★ ${card.name.toUpperCase()}` : card.name.toUpperCase()}
          </Text>
          {!small && <Text style={styles.bannerDeck}>{DECKS[deck].emoji}</Text>}
        </View>
        {/* art window */}
        <View style={[styles.art, { height: artHeight, marginTop: pad }]}>
          {masked ? (
            <View style={[styles.maskArt, { width: artW, height: artHeight - 6 }]}>
              <Text style={[styles.maskQ, { fontSize: artHeight * 0.5 }]}>?</Text>
            </View>
          ) : (
            <CardPicture card={card} width={artW} height={artHeight - 6} />
          )}
          <HoloShine width={artW} height={artHeight} active={!!gold && !masked} />
          {gold && !masked && (
            <View style={[styles.ribbon, small && styles.ribbonSmall]} pointerEvents="none">
              <Text style={[styles.ribbonText, small && styles.ribbonTextSmall]}>★ GOLD</Text>
            </View>
          )}
        </View>
        {children}
        {!small && !masked && (
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {String(meta.setNo).padStart(3, "0")}/{meta.setSize} · {RARITY[meta.rarity].name.toUpperCase()}
            </Text>
            <Text style={[styles.gem, { color: RARITY[meta.rarity].gem }]}>◆</Text>
          </View>
        )}
      </View>
    </View>
  );
}

type Props = {
  card: ClashCard;
  deck: ClashDeckId;
  width: number;
  onPickStat?: (key: string) => void; // set = this player is calling
  disabled?: boolean;
  calledKey?: string; // stamp "CALLED!" on this stat
  selectedKey?: string; // picked but not locked in yet
  gold?: boolean;
  usedKey?: string; // can't be picked (Gold Defence: the first clash's stat)
};

export default function ClashCardView({ card, deck, width, onPickStat, disabled, calledKey, selectedKey, gold, usedKey }: Props) {
  const d = DECKS[deck];
  const photo = useCardPhoto(card);
  const calling = !!onPickStat;
  const stamp = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!calledKey) {
      stamp.setValue(0);
      return;
    }
    Animated.timing(stamp, { toValue: 1, duration: 260, easing: Easing.out(Easing.back(2)), useNativeDriver: true }).start();
  }, [calledKey]);

  return (
    <Frame card={card} deck={deck} width={width} artHeight={width * 0.46} gold={gold}>
      {photo && (
        <Text style={styles.credit} numberOfLines={1} onPress={() => Linking.openURL(photo.page).catch(() => {})}>
          📷 {photo.credit}
        </Text>
      )}
      <View style={styles.statBox}>
        {d.stats.map((s, i) => {
          const hot = calledKey === s.key;
          const sel = !calledKey && selectedKey === s.key;
          const used = usedKey === s.key;
          const Row = calling && !used ? TouchableOpacity : View;
          return (
            <Row
              key={s.key}
              style={[styles.statRow, i === d.stats.length - 1 && styles.statRowLast, hot && styles.statRowHot, sel && styles.statRowSel, used && styles.statRowUsed]}
              {...(calling && !used ? { onPress: () => onPickStat?.(s.key), disabled, activeOpacity: 0.55 } : {})}
            >
              <Text
                style={[styles.statLabel, calling && !sel && !used && styles.statLabelTap, sel && styles.statLabelSel, used && styles.statUsed]}
                numberOfLines={1}
              >
                {sel ? "▶ " : ""}
                {s.emoji} {s.label}
                {used ? "  · used" : ""}
              </Text>
              <Text style={[styles.statValue, used && styles.statUsed]}>{formatStat(s, card.stats[s.key] ?? 0)}</Text>
              {hot && (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.stamp,
                    {
                      opacity: stamp,
                      transform: [
                        { rotate: "-10deg" },
                        { scale: stamp.interpolate({ inputRange: [0, 1], outputRange: [2.4, 1] }) },
                      ],
                    },
                  ]}
                >
                  <Text style={styles.stampText}>CALLED!</Text>
                </Animated.View>
              )}
            </Row>
          );
        })}
      </View>
    </Frame>
  );
}

// A small card for the clash: picture, name and one big number.
export function MiniCard({
  card,
  deck,
  width,
  label,
  value,
  win,
  gold,
  masked,
}: {
  card: ClashCard;
  deck: ClashDeckId;
  width: number;
  label: string;
  value: string;
  win?: boolean;
  gold?: boolean;
  masked?: boolean;
}) {
  return (
    <Frame card={card} deck={deck} width={width} artHeight={width * 0.62} small gold={gold} masked={masked}>
      <View style={[styles.plate, win && styles.plateWin]}>
        <Text style={styles.plateLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.plateValue, { fontSize: Math.max(11, width * 0.105) }]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
      </View>
    </Frame>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  body: { borderWidth: 1.5, borderColor: CC.goldDeep },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    borderWidth: 1.5,
    borderColor: CC.goldDeep,
    overflow: "hidden",
  },
  bannerName: {
    flex: 1,
    color: CC.ink,
    fontFamily: SERIF,
    fontWeight: "900",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  bannerDeck: { fontSize: 16, marginLeft: 4 },
  art: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B0B0B",
    borderWidth: 3,
    borderTopColor: "#000",
    borderLeftColor: "#000",
    borderBottomColor: CC.goldLight,
    borderRightColor: CC.goldLight,
    overflow: "hidden",
  },
  flagBg: { backgroundColor: "#F3F1EA", alignItems: "center", justifyContent: "center" },
  emojiBg: { backgroundColor: "#FFF8E6", alignItems: "center", justifyContent: "center" },
  credit: { color: "rgba(255,255,255,0.75)", fontSize: 9, textAlign: "center", marginTop: 2 },
  statBox: {
    marginTop: 6,
    backgroundColor: CC.parchment,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: CC.goldDeep,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: CC.parchmentLine,
  },
  statRowLast: { borderBottomWidth: 0 },
  statRowHot: { backgroundColor: "#FFE08A" },
  statRowSel: { backgroundColor: "#F5C542", borderRadius: 4, marginHorizontal: -4, paddingHorizontal: 4 },
  statLabelSel: { fontWeight: "900" },
  statRowUsed: { opacity: 0.45 },
  statUsed: { textDecorationLine: "line-through" },
  maskArt: { backgroundColor: "#1C1730", alignItems: "center", justifyContent: "center" },
  maskQ: { color: "#6A6290", fontWeight: "900", fontFamily: SERIF },
  ribbon: {
    position: "absolute",
    top: 8,
    right: -26,
    width: 100,
    paddingVertical: 2,
    backgroundColor: CC.gold,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: CC.goldDeep,
    alignItems: "center",
    transform: [{ rotate: "35deg" }],
  },
  ribbonSmall: { top: 5, right: -30, width: 90, paddingVertical: 1 },
  ribbonText: { color: "#3A2400", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  ribbonTextSmall: { fontSize: 8 },
  statLabel: { color: CC.ink, fontSize: 14, fontFamily: SERIF, flex: 1 },
  statLabelTap: { textDecorationLine: "underline", textDecorationColor: CC.parchmentLine },
  statValue: { color: CC.ink, fontSize: 15, fontWeight: "900", fontFamily: SERIF },
  stamp: {
    position: "absolute",
    right: "28%",
    borderWidth: 3,
    borderColor: "#C1121F",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 1,
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  stampText: { color: "#C1121F", fontWeight: "900", fontSize: 16, letterSpacing: 2 },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 5 },
  footerText: { color: "rgba(255,255,255,0.8)", fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  gem: { fontSize: 16, textShadowColor: "#000", textShadowRadius: 2 },
  plate: {
    marginTop: 5,
    backgroundColor: CC.parchment,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: CC.goldDeep,
    paddingVertical: 3,
    alignItems: "center",
  },
  plateWin: { backgroundColor: "#D9FBE5", borderColor: CC.win },
  plateLabel: { color: CC.inkMuted, fontSize: 9, fontWeight: "700" },
  plateValue: { color: CC.ink, fontWeight: "900", fontFamily: SERIF },
});
