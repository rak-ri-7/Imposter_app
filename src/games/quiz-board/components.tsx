// src/games/quiz-board/components.tsx
// Small building blocks shared by the Quiz Board screens.
import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Alert,
  ViewStyle,
} from "react-native";
import { formatRupees } from "../../shared/quiz";
import type { Group, QuizBoardRound } from "../../shared/types";
import type { QuizBoardCtx } from "./logic/useQuizBoard";
import {
  correctRound,
  dismissReview,
  requestReview,
  voidRound,
} from "./logic/game";
import { QB, bevel, digitText, displayText } from "./theme";

// ── Buttons ───────────────────────────────────────────────────────
export function RetroButton({
  label,
  onPress,
  variant = "gold",
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "gold" | "blue" | "red" | "ghost";
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const bg =
    variant === "gold"
      ? QB.gold
      : variant === "red"
        ? QB.red
        : variant === "blue"
          ? QB.tile
          : "transparent";
  const fg = variant === "gold" ? QB.ink : QB.white;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[
        styles.btn,
        { backgroundColor: bg },
        variant === "ghost" && styles.btnGhost,
        variant === "blue" && bevel,
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      <Text
        style={displayText(16, fg, variant !== "gold")}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ── Money strip ───────────────────────────────────────────────────
export function MoneyStrip({
  group,
  ctx,
  playerId,
}: {
  group: Group;
  ctx: QuizBoardCtx;
  playerId: string;
}) {
  const money = ctx.gs?.money ?? {};
  const rows = [...group.players].sort(
    (a, b) => (money[b.id] ?? 0) - (money[a.id] ?? 0),
  );
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
    >
      {rows.map((p) => {
        const m = money[p.id] ?? 0;
        const isPicker = ctx.gs?.pickerId === p.id;
        return (
          <View
            key={p.id}
            style={[styles.podium, p.id === playerId && styles.podiumMe]}
          >
            <Text numberOfLines={1} style={displayText(11, QB.dim)}>
              {isPicker ? "▶ " : ""}
              {p.name}
            </Text>
            <Text style={digitText(15, m < 0 ? QB.red : QB.gold)}>
              {formatRupees(m)}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ── Round outcome: who won, who lost, and the after-round actions ─
export function RoundOutcome({
  round,
  ctx,
  playerId,
  compact,
}: {
  round: QuizBoardRound;
  ctx: QuizBoardCtx;
  playerId: string;
  compact?: boolean;
}) {
  const { isHost, nameOf, gs } = ctx;
  const [changing, setChanging] = useState(false);
  const { groupId } = ctx;
  const reviewBy = round.reviewBy ?? [];
  const iReviewed = reviewBy.includes(playerId);
  const openReview = reviewBy.length > 0 && !round.reviewSeen;

  const goldenName = nameOf(round.pickerBefore);
  const headline = round.voided
    ? "ROUND VOIDED"
    : round.golden
      ? round.winnerId
        ? `🌟 ${goldenName} won the golden bet: +${formatRupees(round.value)}`
        : `🌟 ${goldenName} lost the golden bet: −${formatRupees(round.value)}`
      : round.winnerId
        ? `${nameOf(round.winnerId)} wins ${formatRupees(round.value)}${round.double ? " (double money)" : ""}`
        : "Nobody got it";

  const deltas = Object.entries(round.deltas ?? {}).filter(([, d]) => d !== 0);

  const confirmVoid = () =>
    Alert.alert(
      "Void this round?",
      "All money from this round is undone and the tile goes back on the board with a new question.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Void Round",
          style: "destructive",
          onPress: () => voidRound(groupId),
        },
      ],
    );

  return (
    <View style={[styles.outcome, compact && styles.outcomeCompact]}>
      {compact && <Text style={displayText(10, QB.dim)}>LAST ROUND</Text>}
      <Text
        style={displayText(
          compact ? 15 : 22,
          round.voided
            ? QB.dim
            : round.winnerId
              ? QB.green
              : round.golden
                ? QB.red
                : QB.white,
        )}
      >
        {headline}
      </Text>
      {round.changed && !round.voided && (
        <Text style={styles.note}>Host corrected this call</Text>
      )}
      {round.forceEnded && !compact && (
        <Text style={styles.note}>Host ended this round early</Text>
      )}

      {!compact && deltas.length > 0 && !round.voided && (
        <View style={styles.deltaList}>
          {deltas.map(([id, d]) => (
            <View key={id} style={styles.deltaRow}>
              <Text style={displayText(15)}>
                {nameOf(id)}
                {id === playerId ? " (you)" : ""}
              </Text>
              <Text style={digitText(16, d > 0 ? QB.green : QB.red)}>
                {d > 0 ? "+" : "−"}
                {formatRupees(Math.abs(d))}
              </Text>
            </View>
          ))}
        </View>
      )}

      {!round.voided && round.mode === "buzzer" && (
        <>
          {/* Review: a nudge to the host, nothing more */}
          {!isHost &&
            (iReviewed ? (
              <Text style={styles.note}>You asked the host to review</Text>
            ) : (
              <RetroButton
                label="⚑ Review"
                variant="ghost"
                onPress={() => requestReview(groupId, playerId)}
                style={styles.smallBtn}
              />
            ))}
          {!isHost && openReview && !iReviewed && (
            <Text style={styles.note}>Review requested</Text>
          )}

          {isHost && openReview && (
            <View style={styles.reviewBox}>
              <Text style={displayText(14, QB.gold)}>
                ⚑ {reviewBy.map(nameOf).join(", ")} flagged this call
              </Text>
              <View style={styles.row}>
                <RetroButton
                  label="Keep"
                  variant="blue"
                  onPress={() => dismissReview(groupId)}
                  style={styles.flex}
                />
                <RetroButton
                  label="Change"
                  onPress={() => setChanging(true)}
                  style={styles.flex}
                />
              </View>
            </View>
          )}
        </>
      )}

      {isHost && !round.voided && (
        <View style={styles.row}>
          {round.mode === "buzzer" && !openReview && (
            <RetroButton
              label="Change call"
              variant="ghost"
              onPress={() => setChanging(true)}
              style={styles.flex}
            />
          )}
          <RetroButton
            label="Void round"
            variant="ghost"
            onPress={confirmVoid}
            style={styles.flex}
          />
        </View>
      )}

      <WinnerPicker
        visible={changing}
        title={round.golden ? `Was ${goldenName} right?` : "Who was actually right?"}
        candidates={round.buzzOrder}
        nobodyLabel={round.golden ? `${goldenName} was wrong` : undefined}
        current={round.winnerId}
        nameOf={nameOf}
        onCancel={() => setChanging(false)}
        onPick={async (id) => {
          setChanging(false);
          if (gs) await correctRound(groupId, id);
        }}
      />
    </View>
  );
}

// ── Winner picker (judging and corrections) ───────────────────────
export function WinnerPicker({
  visible,
  title,
  candidates,
  current,
  nameOf,
  onPick,
  onCancel,
  nobodyLabel = "Nobody was right",
}: {
  visible: boolean;
  title: string;
  candidates: string[];
  current?: string | null;
  nameOf: (id: string) => string;
  onPick: (id: string | null) => void;
  onCancel: () => void;
  nobodyLabel?: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={[displayText(20, QB.gold), styles.center]}>{title}</Text>
          {candidates.map((id, i) => (
            <RetroButton
              key={id}
              label={`${i + 1}. ${nameOf(id)}${current === id ? "  (current)" : ""}`}
              variant="blue"
              onPress={() => onPick(id)}
              style={styles.pickRow}
            />
          ))}
          <RetroButton
            label={`${nobodyLabel}${current === null ? "  (current)" : ""}`}
            variant="red"
            onPress={() => onPick(null)}
            style={styles.pickRow}
          />
          <RetroButton label="Cancel" variant="ghost" onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhost: { borderWidth: 2, borderColor: QB.dim },
  strip: { gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  podium: {
    backgroundColor: QB.panel,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 82,
    alignItems: "center",
    ...bevel,
  },
  podiumMe: { borderTopColor: QB.gold, borderLeftColor: QB.gold },
  outcome: { gap: 10, alignItems: "stretch" },
  outcomeCompact: {
    backgroundColor: QB.panel,
    padding: 10,
    gap: 6,
    marginHorizontal: 12,
    ...bevel,
  },
  note: { color: QB.dim, fontSize: 12, textAlign: "center" },
  deltaList: { gap: 6 },
  deltaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: QB.tileDark,
  },
  reviewBox: {
    borderWidth: 2,
    borderColor: QB.gold,
    padding: 10,
    gap: 8,
  },
  row: { flexDirection: "row", gap: 8 },
  flex: { flex: 1 },
  smallBtn: { paddingVertical: 8 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    padding: 20,
  },
  sheet: {
    backgroundColor: QB.bg,
    borderWidth: 3,
    borderColor: QB.gold,
    padding: 18,
    gap: 10,
  },
  center: { textAlign: "center", marginBottom: 6 },
  pickRow: { alignItems: "flex-start" },
});
