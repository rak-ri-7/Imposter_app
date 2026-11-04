// Match the following: draw a line from every name to an answer. Every
// change is saved straight away (each save numbered, so a slow older save
// can't overwrite a newer one), and once more just before time runs out or
// when the screen closes, so the last lines drawn always count. A board left
// half-done still counts what's drawn; "Lock in" needs every line.
import { useEffect, useRef, useState } from "react";
import { Text, TouchableOpacity, StyleSheet } from "react-native";
import type { Group, MtfGameState } from "../../../shared/types";
import { mtfSaveBoard } from "../logic/game";
import MatchBoard from "../components/MatchBoard";
import Paper, { clock } from "../components/Paper";
import { HAND, MF, penOf } from "../theme";
import { useServerNow } from "../useServerNow";

type Props = { group: Group; gs: MtfGameState; playerId: string };

const FINAL_SAVE_MS = 1500;   // one last save when this little time is left

export default function MtfMatchScreen({ group, gs, playerId }: Props) {
  const now = useServerNow();
  const locked = !!gs.locked[playerId];
  const [lines, setLines] = useState<Record<string, string>>(gs.lines[playerId] ?? {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const names = gs.targets[playerId] ?? [];
  const order = gs.order[playerId] ?? [];
  const nameOf = (id: string) => group.players.find((p) => p.id === id)?.name ?? "Someone";
  const left = (gs.phaseEndsAt ?? now) - now;
  const complete = names.length > 0 && names.every((n) => !!lines[n]);
  const lockedCount = gs.seats.filter((id) => gs.locked[id]).length;

  // Saves carry a rising number: the newest board always wins.
  const rev = useRef(0);
  const nextRev = () => (rev.current = Math.max(rev.current + 1, Date.now()));
  const latest = useRef(lines);
  latest.current = lines;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const finalSent = useRef(false);
  const save = (board: Record<string, string>) => {
    if (lockedRef.current) return;
    mtfSaveBoard(group.id, playerId, board, false, nextRev());
  };

  const change = (next: Record<string, string>) => {
    setLines(next);
    save(next);
  };

  // One last save just before the timer runs out.
  useEffect(() => {
    if (!finalSent.current && !locked && left > 0 && left < FINAL_SAVE_MS) {
      finalSent.current = true;
      save(latest.current);
    }
  }, [left, locked]);

  // And when the screen closes (time's up, or everyone else locked in).
  useEffect(() => () => save(latest.current), []);

  const lockIn = async () => {
    if (busy || !complete) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await mtfSaveBoard(group.id, playerId, lines, true, nextRev());
      if (!r.success && r.reason && r.reason !== "stale") setErr(r.reason);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper
      kicker={`Q${gs.round} · Match the following`}
      right={clock(left)}
      urgent={left < 10000}
      footer={
        locked ? (
          <Text style={styles.waiting}>
            🔒 Locked in · waiting for {gs.seats.length - lockedCount} more
          </Text>
        ) : (
          <TouchableOpacity style={[styles.lockBtn, (!complete || busy) && styles.dim]} disabled={!complete || busy} onPress={lockIn}>
            <Text style={styles.lockText}>
              {busy ? "Locking…" : complete ? "Lock in my answers" : `Draw ${names.filter((n) => !lines[n]).length} more line(s)`}
            </Text>
          </TouchableOpacity>
        )
      }
    >
      <Text style={styles.prompt}>{gs.prompt}</Text>
      <Text style={styles.help}>{locked ? "Your lines are in." : "Tap a name, then the answer you think they wrote."}</Text>
      <MatchBoard
        names={names.map((id) => ({ id, label: nameOf(id), color: penOf(gs.seats, id) }))}
        answers={order.map((id) => ({ id, text: gs.answers[id]?.text ?? "", empty: !gs.answers[id] }))}
        lines={locked ? gs.lines[playerId] ?? lines : lines}
        onChange={locked ? undefined : change}
      />
      {err && <Text style={styles.err}>{err}</Text>}
    </Paper>
  );
}

const styles = StyleSheet.create({
  prompt: { color: MF.ink, fontSize: 19, fontWeight: "800", lineHeight: 26, fontFamily: HAND },
  help: { color: MF.muted, fontSize: 13, fontWeight: "700" },
  lockBtn: { backgroundColor: MF.ink, borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  lockText: { color: "#fff", fontSize: 17, fontWeight: "900" },
  waiting: { color: MF.muted, textAlign: "center", fontSize: 15, fontWeight: "800", paddingVertical: 10 },
  err: { color: MF.wrong, fontWeight: "800", textAlign: "center" },
  dim: { opacity: 0.45 },
});
