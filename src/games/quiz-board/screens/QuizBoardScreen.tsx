// src/games/quiz-board/screens/QuizBoardScreen.tsx
import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  useWindowDimensions,
} from "react-native";
import { QUIZ_CATEGORIES, QUIZ_LEVELS, formatRupees } from "../../../shared/quiz";
import type { Group } from "../../../shared/types";
import { getServerNow } from "../../../shared/firebase/time";
import type { QuizBoardCtx } from "../logic/useQuizBoard";
import { endBoardEarly, pickTile } from "../logic/game";
import { MoneyStrip, RetroButton, RoundOutcome } from "../components";
import { QB, bevel, digitText, displayText } from "../theme";

type Props = { group: Group; playerId: string; ctx: QuizBoardCtx };

const GAP = 4;
const SIDE = 10;

export default function QuizBoardScreen({ group, playerId, ctx }: Props) {
  const { gs, isHost, canPick, nameOf, lastRound } = ctx;
  const { width } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  if (!gs) return null;

  const cols = gs.categories.length;
  const tileW = Math.floor((width - SIDE * 2 - GAP * (cols - 1) - 8) / cols);
  const valueSize = Math.max(13, Math.min(22, tileW / 4.2));
  const myPick = gs.pickerId === playerId;
  const left = gs.tiles.filter((t) => !t.used).length;

  const onTile = async (index: number) => {
    if (!canPick || busy) return;
    setBusy(true);
    try {
      await pickTile(group.id, playerId, index, getServerNow());
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const confirmEnd = () =>
    Alert.alert(
      "End the board now?",
      `${left} tile${left === 1 ? "" : "s"} left. Final standings use the money so far.`,
      [
        { text: "Keep playing", style: "cancel" },
        { text: "End board", style: "destructive", onPress: () => endBoardEarly(group.id) },
      ],
    );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={displayText(myPick ? 22 : 16, myPick ? QB.gold : QB.white)}>
          {myPick ? "Your pick!" : `${nameOf(gs.pickerId)} is picking`}
        </Text>
        {!myPick && isHost && (
          <Text style={styles.hint}>Host can pick for them</Text>
        )}
      </View>

      <MoneyStrip group={group} ctx={ctx} playerId={playerId} />

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.board}>
          {/* category headers */}
          <View style={styles.row}>
            {gs.categories.map((c) => (
              <View key={c} style={[styles.catCell, { width: tileW }]}>
                <Text style={styles.catEmoji}>{QUIZ_CATEGORIES[c].emoji}</Text>
                <Text
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  style={[displayText(10), styles.catText]}
                >
                  {QUIZ_CATEGORIES[c].label}
                </Text>
              </View>
            ))}
          </View>

          {/* value rows */}
          {QUIZ_LEVELS.map((level, r) => (
            <View key={level} style={styles.row}>
              {gs.categories.map((_, c) => {
                const index = r * cols + c;
                const tile = gs.tiles[index];
                if (!tile) return <View key={c} style={{ width: tileW }} />;
                return (
                  <TouchableOpacity
                    key={c}
                    disabled={tile.used || !canPick || busy}
                    onPress={() => onTile(index)}
                    activeOpacity={0.7}
                    style={[
                      styles.tile,
                      { width: tileW, height: Math.min(64, tileW * 0.8) },
                      tile.used && styles.tileUsed,
                    ]}
                  >
                    {!tile.used && (
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        style={digitText(valueSize)}
                      >
                        {formatRupees(tile.value)}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {lastRound && (
          <RoundOutcome round={lastRound} ctx={ctx} playerId={playerId} compact />
        )}

        {isHost && (
          <RetroButton
            label="End board"
            variant="ghost"
            onPress={confirmEnd}
            style={styles.endBtn}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: QB.bg, paddingTop: 48 },
  header: { alignItems: "center", paddingBottom: 4 },
  hint: { color: QB.dim, fontSize: 11 },
  scroll: { paddingBottom: 30, gap: 12 },
  board: {
    backgroundColor: QB.frame,
    marginHorizontal: SIDE,
    padding: 4,
    gap: GAP,
    borderWidth: 3,
    borderColor: QB.goldDark,
  },
  row: { flexDirection: "row", gap: GAP },
  catCell: {
    height: 58,
    backgroundColor: QB.tile,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    ...bevel,
    borderWidth: 2,
  },
  catEmoji: { fontSize: 16 },
  catText: { textAlign: "center", lineHeight: 12 },
  tile: {
    backgroundColor: QB.tile,
    alignItems: "center",
    justifyContent: "center",
    ...bevel,
  },
  tileUsed: {
    backgroundColor: QB.tileUsed,
    borderTopColor: QB.tileUsed,
    borderLeftColor: QB.tileUsed,
    borderBottomColor: QB.tileUsed,
    borderRightColor: QB.tileUsed,
  },
  endBtn: { marginHorizontal: 12 },
});
