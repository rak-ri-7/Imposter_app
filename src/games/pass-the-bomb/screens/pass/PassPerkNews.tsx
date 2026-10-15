import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Vibration } from "react-native";
import { Group, PassGameState } from "../../../../shared/types";
import { sideById, sideOf, CURRENCY } from "../../logic/pass/passGame";
import { LUCKY, TICKETS, EARN_COMEBACK } from "../../logic/pass/passPerks";

type Props = {
  group: Group;
  playerId: string;
  // 'toast' — pops up on the play screen when something happens.
  // 'list'  — a static summary for the round-end screen.
  variant: "toast" | "list";
};

// Ghost comebacks and Lucky Centre results.
export default function PassPerkNews({ group, playerId, variant }: Props) {
  const gs = group.gameState as PassGameState;
  const mySide = sideOf(gs, playerId);
  const sideName = (id?: string) => sideById(gs, id)?.name ?? "Someone";
  const team = gs.teamMode;

  const ticketLine = (
    it: NonNullable<PassGameState["ticketNews"]>["items"][number],
  ) => {
    const t = TICKETS[it.kind];
    const who = it.sideId === mySide ? "Your" : `${sideName(it.sideId)}'s`;
    return it.won
      ? `${LUCKY.icon} ${who} ${t.name} ticket paid ${it.payout} ${CURRENCY.icon}`
      : `${t.emoji} ${who} ${t.name} ticket bust`;
  };

  // ── Toast state (hooks always run, whichever variant) ───────────────
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (text: string, ms: number) => {
    setToast(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), ms);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const revivalId = gs.lastRevival?.id;
  const prevRevival = useRef(revivalId);
  useEffect(() => {
    if (prevRevival.current === revivalId || !gs.lastRevival) return;
    prevRevival.current = revivalId;
    if (variant !== "toast") return;
    const back = gs.lastRevival.sideId;
    if (back === mySide) Vibration.vibrate([0, 200, 100, 200, 100, 400]);
    show(
      back === mySide
        ? `👻➡️❤️ ${team ? "Your team is" : "You're"} BACK from the dead!  +${EARN_COMEBACK} ${CURRENCY.icon}`
        :`👻➡️❤️ ${sideName(back)} ${team ? "are" : "is"} BACK from the dead!`,
      3500,
    );
  }, [revivalId]);

  const newsId = gs.ticketNews?.id;
  const prevNews = useRef(newsId);
  useEffect(() => {
    if (prevNews.current === newsId || !gs.ticketNews) return;
    prevNews.current = newsId;
    if (variant !== "toast") return;
    // Mid-round results only matter to the ticket holder; round-end results
    // are listed on the explosion screen instead.
    const mine = gs.ticketNews.items.find((it) => it.sideId === mySide);
    if (mine && gs.phase === "pass-playing") show(ticketLine(mine), 3000);
  }, [newsId]);

  // ── Static list (round-end screen) ─────────────────────────────────
  if (variant === "list") {
    const round = gs.lastExplosion?.round;
    const news = gs.ticketNews;
    // Only ticket news from the tap that ended this round.
    const tickets =
      news && news.roundEnd && news.round === round ? news.items : [];
    // Any comeback this round (it may have happened on the very tap that
    // ended it, when the play screen was already gone).
    const back =
      gs.lastRevival && gs.lastRevival.round === round ? gs.lastRevival : null;
    if (tickets.length === 0 && !back) return null;
    return (
      <View style={styles.list}>
        {back && (
          <Text style={[styles.listLine, styles.revival]}>
            👻➡️❤️{" "}
            {back.sideId === mySide
              ? `${team ? "Your team" : "You"} came back from the dead!`
              : `${sideName(back.sideId)} came back from the dead!`}
          </Text>
        )}
        {tickets.map((it, i) => (
          <Text key={i} style={[styles.listLine, it.won && styles.win]}>
            {ticketLine(it)}
          </Text>
        ))}
      </View>
    );
  }

  if (!toast) return null;
  return (
    <View pointerEvents="none" style={styles.toast}>
      <Text style={styles.toastText}>{toast}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: 14, gap: 4 },
  listLine: { color: "#888", fontSize: 13, textAlign: "center" },
  win: { color: "#4CAF50", fontWeight: "700" },
  toast: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: "rgba(20,18,31,0.97)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#6A5ACD",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  toastText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  revival: { color: "#B39DDB", fontWeight: "800" },
});
