import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
} from "react-native";
import { Group, BombGameState, BombMission } from "../../../shared/types";
import { MISSION_FP } from "../data/missions";
import { startMissionClaim, cancelMissionClaim } from "../logic/missionEngine";

type Props = {
  visible: boolean;
  onClose: () => void;
  group: Group;
  playerId: string;
};

type Key = "mission1" | "mission2" | "lifeMission";

const progressLabel = (m: BombMission, otherCount: number): string | null => {
  if (m.type === "vote") return null;
  const goal = m.conditionValue ?? 1;
  switch (m.conditionType) {
    case "pass-to-everyone":
      return `${m.progressSet?.length ?? 0}/${otherCount}`;
    case "pass-distinct-n":
      return `${m.progressSet?.length ?? 0}/${goal}`;
    case "avoid-target-rounds":
    case "safe-rounds-streak-n":
      return `${m.progress ?? 0}/${goal} rounds`;
    default:
      return `${m.progress ?? 0}/${goal}`;
  }
};

const tierLabel = (m: BombMission): string =>
  m.isLifeMission
    ? "❤️ LIFE MISSION · +1 life"
    : `${m.tier.toUpperCase()} · ${MISSION_FP[m.tier]} FP`;

export default function BombMissionsModal({
  visible,
  onClose,
  group,
  playerId,
}: Props) {
  const gameState = group.gameState as BombGameState;
  const missions = gameState.missions?.[playerId];
  const isGhost = (gameState.ghosts ?? []).includes(playerId);
  const claim = gameState.missionClaim;
  const [busy, setBusy] = useState(false);

  const otherCount = group.players.length - 1;
  const votesNeeded = Math.floor(otherCount / 2) + 1;

  const handleClaim = async (key: "mission1" | "mission2") => {
    if (busy) return;
    setBusy(true);
    try {
      await startMissionClaim(group.id, playerId, key);
    } finally {
      setBusy(false);
    }
  };

  const entries: [Key, BombMission | undefined][] = missions
    ? [
        ["mission1", missions.mission1],
        ["mission2", missions.mission2],
        ["lifeMission", missions.lifeMission],
      ]
    : [];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity style={styles.sheet} activeOpacity={1}>
          <Text style={styles.title}>🎯 My Missions</Text>

          {isGhost ? (
            <View style={styles.card}>
              <Text style={styles.text}>
                👻 Ghosts don't carry missions. Win the ghost challenge to come
                back.
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.list}>
              {entries.map(([key, m]) => {
                if (!m) {
                  if (key !== "lifeMission") return null;
                  return (
                    <View key={key} style={[styles.card, styles.cardLocked]}>
                      <Text style={styles.tier}>🔒 LIFE MISSION</Text>
                      <Text style={styles.textDim}>
                        Complete one of your missions to unlock it.
                      </Text>
                    </View>
                  );
                }

                const progress = progressLabel(m, otherCount);
                const claimKey = key === "lifeMission" ? null : key;
                const isMyClaim =
                  !!claim &&
                  claim.claimerId === playerId &&
                  claim.missionKey === claimKey;

                return (
                  <View
                    key={key}
                    style={[
                      styles.card,
                      m.isLifeMission && styles.cardLife,
                      m.completed && styles.cardDone,
                    ]}
                  >
                    <View style={styles.cardHeader}>
                      <Text style={styles.tier}>{tierLabel(m)}</Text>
                      {progress && !m.completed ? (
                        <Text style={styles.progress}>{progress}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.text}>{m.text}</Text>

                    {m.completed ? (
                      <Text style={styles.done}>
                        ✓ Completed — {m.rewardText ?? "reward earned"}
                      </Text>
                    ) : claimKey && m.type === "vote" ? (
                      isMyClaim ? (
                        <View style={styles.claimRow}>
                          <Text style={styles.claimWaiting}>
                            ⏳ Waiting for votes — {claim?.yesIds.length ?? 0}/
                            {votesNeeded} yes
                          </Text>
                          <TouchableOpacity
                            onPress={() =>
                              cancelMissionClaim(group.id, playerId)
                            }
                          >
                            <Text style={styles.claimCancel}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[
                            styles.claimBtn,
                            !!claim && styles.claimBtnDisabled,
                          ]}
                          onPress={() => handleClaim(claimKey)}
                          disabled={!!claim || busy}
                        >
                          <Text style={styles.claimBtnText}>
                            {claim
                              ? "Another claim is being voted on"
                              : "📣 Claim it — the group votes"}
                          </Text>
                        </TouchableOpacity>
                      )
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          )}

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#161616",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    gap: 10,
  },
  title: { color: "#fff", fontSize: 17, fontWeight: "bold", marginBottom: 4 },
  list: { maxHeight: 440 },
  card: {
    backgroundColor: "#2A2A2A",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#333",
  },
  cardLife: { borderColor: "#E63946", backgroundColor: "#1E1012" },
  cardDone: { borderColor: "#4CAF50", backgroundColor: "#0A1E0A" },
  cardLocked: { opacity: 0.6 },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  tier: { color: "#FF4500", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  progress: { color: "#FFD700", fontSize: 12, fontWeight: "700" },
  text: { color: "#fff", fontSize: 14, lineHeight: 20 },
  textDim: { color: "#888", fontSize: 13, marginTop: 4 },
  done: { color: "#4CAF50", fontSize: 12, fontWeight: "600", marginTop: 8 },
  claimBtn: {
    backgroundColor: "#1A1A1A",
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  claimBtnDisabled: { opacity: 0.4, borderColor: "#444" },
  claimBtnText: { color: "#FFD700", fontSize: 12, fontWeight: "700" },
  claimRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  claimWaiting: { color: "#FFD700", fontSize: 12, fontStyle: "italic" },
  claimCancel: { color: "#888", fontSize: 12 },
  closeBtn: {
    marginTop: 4,
    backgroundColor: "#1A1A1A",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  closeBtnText: { color: "#888", fontSize: 14, fontWeight: "600" },
});
