import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Group, PassGameState } from "../../../../shared/types";
import { sideById, sideOf } from "../../logic/pass/passGame";
import {
  activeHaunt,
  canHaunt,
  reviveTarget,
  stashOf,
  HAUNT_MIN_ALIVE,
} from "../../logic/pass/passPerks";
import { hauntHolder } from "../../logic/pass/passPerkActions";

type Props = { group: Group; playerId: string };

// Ghost haunting, as seen by each kind of player:
//   • ghosts — the Haunt button and their stash progress
//   • the holder — a warning that their fumbles are feeding a ghost
//   • everyone else — who's haunting whom
export default function PassHauntPanel({ group, playerId }: Props) {
  const gs = group.gameState as PassGameState;
  const [busy, setBusy] = useState(false);
  if (gs.phase !== "pass-playing") return null;

  const sideName = (id?: string | null) => sideById(gs, id)?.name ?? "Someone";
  const mySide = sideOf(gs, playerId);
  const iAmGhost = !!mySide && gs.ghosts.includes(mySide);
  const isHolder = !!mySide && mySide === gs.holderId;
  const haunt = activeHaunt(gs);
  const target = reviveTarget(gs);
  const aliveCount = gs.sideIds.filter((id) => !gs.ghosts.includes(id)).length;
  const alreadyBack = !!mySide && (gs.revived ?? []).includes(mySide);

  const haunt_ = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await hauntHolder(group, playerId);
    } finally {
      setBusy(false);
    }
  };

  // ── Ghost's view ───────────────────────────────────────────────────
  if (iAmGhost) {
    if (alreadyBack) {
      return (
        <Text style={styles.dim}>
          👻 You've already had your comeback this game.
        </Text>
      );
    }
    if (aliveCount < HAUNT_MIN_ALIVE) {
      return (
        <Text style={styles.dim}>
          👻 It's down to the final duel — no more haunting.
        </Text>
      );
    }
    const mine = haunt?.ghostId === mySide;
    return (
      <View style={styles.box}>
        <Text style={styles.stash}>
          👻 Your stash: {stashOf(gs, mySide)}/{target}
        </Text>
        <Text style={styles.sub}>
          Catch {target - stashOf(gs, mySide)} more fumbles to come back with a
          life
        </Text>
        {mine ? (
          <Text style={styles.active}>
            Haunting {sideName(gs.holderId)}… every wrong answer is yours
          </Text>
        ) : haunt ? (
          <Text style={styles.sub}>
            {sideName(haunt.ghostId)} got here first this turn
          </Text>
        ) : (
          <TouchableOpacity
            style={styles.btn}
            disabled={busy || !canHaunt(gs, mySide)}
            onPress={haunt_}
          >
            <Text style={styles.btnText}>👻 Haunt {sideName(gs.holderId)}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // ── Everyone alive ─────────────────────────────────────────────────
  if (!haunt) return null;
  return (
    <Text style={isHolder ? styles.warn : styles.dim}>
      {isHolder
        ? `👻 ${sideName(haunt.ghostId)} is haunting ${gs.teamMode ? "your team" : "you"} — your fumbles feed them`
        : `👻 ${sideName(haunt.ghostId)} is haunting ${sideName(gs.holderId)}`}
    </Text>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: "#14121F",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#6A5ACD",
    padding: 12,
    marginBottom: 14,
    alignItems: "center",
  },
  stash: { color: "#B39DDB", fontSize: 16, fontWeight: "800" },
  sub: { color: "#888", fontSize: 12, marginTop: 4, textAlign: "center" },
  active: {
    color: "#B39DDB",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 8,
    textAlign: "center",
  },
  btn: {
    marginTop: 10,
    backgroundColor: "#6A5ACD",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  warn: {
    color: "#B39DDB",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },
  dim: { color: "#777", fontSize: 12, textAlign: "center", marginBottom: 12 },
});
