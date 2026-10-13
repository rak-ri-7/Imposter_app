import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Group, PassGameState } from "../../../../shared/types";
import {
  continuePassGame,
  passAlive,
  totalPassesLeft,
  sideById,
  sideOf,
  EXPLODED_REFILL_SHARE,
  CURRENCY,
  walletOf,
  STORE,
} from "../../logic/pass/passGame";
import PassStoreSheet from "./PassStoreSheet";
import { returnToMenu } from "../../../../shared/firebase/groups";

type Props = { group: Group; playerId: string };

// Shown for both 'pass-exploded' (between rounds) and 'pass-result' (game over).
export default function PassRoundEndScreen({ group, playerId }: Props) {
  const gs = group.gameState as PassGameState;
  const [busy, setBusy] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const playerName = (id?: string | null) =>
    group.players.find((p) => p.id === id)?.name ?? "Someone";
  const sideName = (id?: string | null) => sideById(gs, id)?.name ?? "Someone";

  const team = gs.teamMode;
  const mySide = sideOf(gs, playerId);
  const isResult = gs.phase === "pass-result";
  const boom = gs.lastExplosion;
  const victimIsMine = !!boom && boom.sideId === mySide;
  const victimLabel = victimIsMine
    ? team
      ? "your team"
      : "you"
    : sideName(boom?.sideId);
  const refill = Math.max(1, Math.ceil(gs.budget * EXPLODED_REFILL_SHARE));
  const gameOverNext = passAlive(gs).length <= 1;

  // Per-side totals (in solo a side has one member, so this is just the player).
  const sideStats = (sideId: string) => {
    const members = sideById(gs, sideId)?.memberIds ?? [];
    return members.reduce(
      (acc, id) => ({
        passes: acc.passes + (gs.stats[id]?.passes ?? 0),
        wrong: acc.wrong + (gs.stats[id]?.wrong ?? 0),
      }),
      { passes: 0, wrong: 0 },
    );
  };

  // Team play: the player who landed the most passes.
  const mvp = team
    ? group.players
        .filter((p) => (gs.stats[p.id]?.passes ?? 0) > 0)
        .sort(
          (a, b) =>
            (gs.stats[b.id]?.passes ?? 0) - (gs.stats[a.id]?.passes ?? 0),
        )[0]
    : undefined;

  const onContinue = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await continuePassGame(group);
    } finally {
      setBusy(false);
    }
  };

  const onMenu = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await returnToMenu(group.id);
    } finally {
      setBusy(false);
    }
  };

  // Final standings: winner first, then the last eliminated, back to the first.
  const standings = [
    ...(gs.winnerId ? [gs.winnerId] : []),
    ...[...gs.eliminationOrder].reverse(),
  ];
  const iWon = !!gs.winnerId && gs.winnerId === mySide;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {isResult ? (
          <>
            <Text style={styles.emoji}>🏆</Text>
            <Text style={styles.title}>
              {iWon
                ? team
                  ? "Your team survived!"
                  : "You survived!"
                : `${sideName(gs.winnerId)} ${team ? "win" : "wins"}!`}
            </Text>
            <Text style={styles.sub}>Last one standing</Text>

            <View style={styles.card}>
              {standings.map((id, i) => {
                const s = sideStats(id);
                const side = sideById(gs, id);
                return (
                  <View key={id} style={styles.row}>
                    <Text style={styles.place}>#{i + 1}</Text>
                    {side?.color ? (
                      <View
                        style={[
                          styles.teamDot,
                          { backgroundColor: side.color },
                        ]}
                      />
                    ) : null}
                    <Text style={styles.name} numberOfLines={1}>
                      {sideName(id)}
                      {id === mySide ? (team ? " (your team)" : " (you)") : ""}
                    </Text>
                    <Text style={styles.stat}>
                      {s.passes} passed · {s.wrong} wrong
                    </Text>
                  </View>
                );
              })}
            </View>

            {mvp && (
              <Text style={styles.mvp}>
                ⭐ MVP: {playerName(mvp.id)} — {gs.stats[mvp.id]?.passes ?? 0}{" "}
                passes landed
              </Text>
            )}
          </>
        ) : (
          <>
            <Text style={styles.emoji}>💥</Text>
            <Text style={styles.title}>
              BOOM —{" "}
              {victimIsMine
                ? `it went off on ${victimLabel}!`
                : `${victimLabel}!`}
            </Text>
            {boom?.reason && (
              <Text style={styles.reason}>
                {boom.reason === "left"
                  ? `${victimLabel} left the game.`
                  : `The host skipped ${victimLabel} — not responding.`}
              </Text>
            )}
            <Text style={styles.sub}>
              {boom?.eliminated
                ? victimIsMine
                  ? `${team ? "Your team is" : "You're"} out of lives. 👻`
                  : `${victimLabel} ${team ? "are" : "is"} out of the game. 👻`
                : `${victimIsMine ? (team ? "Your team loses" : "You lose") : `${victimLabel} ${team ? "lose" : "loses"}`} a life` +
                  (!gs.hiddenPasses || victimIsMine
                    ? `, and gets topped back up to ${refill} passes per ${team ? "team" : "player"}.`
                    : ", and gets a top-up.")}
            </Text>

            <View style={styles.card}>
              {gs.sides.map((side) => {
                const ghost = gs.ghosts.includes(side.id);
                return (
                  <View
                    key={side.id}
                    style={[styles.row, ghost && styles.rowGhost]}
                  >
                    {side.color ? (
                      <View
                        style={[
                          styles.teamDot,
                          { backgroundColor: side.color },
                        ]}
                      />
                    ) : null}
                    <Text style={styles.name} numberOfLines={1}>
                      {ghost ? "👻 " : ""}
                      {side.name}
                      {side.id === mySide
                        ? team
                          ? " (your team)"
                          : " (you)"
                        : ""}
                    </Text>
                    <Text style={styles.lives}>
                      {ghost ? "out" : "❤️".repeat(gs.lives[side.id] ?? 0)}
                    </Text>
                    {!ghost && (
                      <Text style={styles.stat}>
                        {!gs.hiddenPasses || side.id === mySide
                          ? `${totalPassesLeft(gs, side.id)} passes`
                          : "🔒"}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>

            {!gameOverNext && (
              <Text style={styles.hint}>
                {gs.hiddenPasses
                  ? "Someone random gets the bomb next…"
                  : "The bomb goes to whoever has the fewest passes left."}
              </Text>
            )}

            {!gameOverNext && mySide && !gs.ghosts.includes(mySide) && (
              <TouchableOpacity
                style={styles.storeBtn}
                onPress={() => setStoreOpen(true)}
              >
                <Text style={styles.storeBtnText}>
                  {STORE.icon} {STORE.name} · {CURRENCY.icon}{" "}
                  {walletOf(gs, mySide)} {CURRENCY.short}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>

      <PassStoreSheet
        visible={storeOpen && !isResult}
        onClose={() => setStoreOpen(false)}
        group={group}
        playerId={playerId}
      />

      {isResult ? (
        <TouchableOpacity style={styles.btn} onPress={onMenu} disabled={busy}>
          <Text style={styles.btnText}>Back to Game Menu</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.btn}
          onPress={onContinue}
          disabled={busy}
        >
          <Text style={styles.btnText}>
            {gameOverNext ? "See the winner 🏆" : "Next round 💣"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D0D0D", padding: 20 },
  scroll: { paddingBottom: 20, alignItems: "stretch" },
  emoji: { fontSize: 64, textAlign: "center", marginTop: 12, marginBottom: 8 },
  title: {
    color: "#FF4500",
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 6,
  },
  sub: {
    color: "#aaa",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  card: {
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "#333",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
    gap: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#2A2A2A",
  },
  rowGhost: { opacity: 0.4 },
  teamDot: { width: 10, height: 10, borderRadius: 5 },
  place: { color: "#FFD700", fontSize: 14, fontWeight: "800", width: 30 },
  name: { color: "#fff", fontSize: 15, flex: 1 },
  lives: { color: "#888", fontSize: 11 },
  stat: { color: "#FFD700", fontSize: 12, fontWeight: "600" },
  mvp: {
    color: "#FFD700",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 16,
  },
  hint: { color: "#666", fontSize: 12, textAlign: "center", marginTop: 14 },
  reason: {
    color: "#FFD700",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 6,
  },
  storeBtn: {
    alignSelf: "center",
    marginTop: 16,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  storeBtnText: { color: "#FFD700", fontSize: 14, fontWeight: "700" },
  btn: {
    backgroundColor: "#FF4500",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontSize: 17, fontWeight: "bold" },
});
