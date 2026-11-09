// The end of an expedition (who got the treasure, and how), and the end of
// the night (the final scores, awards, and adding the points).
import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Group, RrfGameState, RrfResult } from '../../../shared/types';
import { POINTS, TREASURE, awards, expeditionsForPoints, nightWinner, playerPoints, standings } from '../logic/engine';
import { finishRrf, rrfSkip } from '../logic/game';
import { scenarioById } from '../data/scenarios';
import Ruin, { TimerPill } from '../components/Ruin';
import { GoldButton } from '../components/Bits';
import { useServerNow } from '../../../shared/hooks/useServerNow';
import { CARVED, RR, TEAM, clock, sideLabel } from '../theme';
import { EndPodium, type PodiumEntry } from '../../../shared/components/WinnerPodium';

type Props = { group: Group; gs: RrfGameState; playerId: string };

const story = (r: RrfResult): string => {
    const w = r.winner ? TEAM[r.winner].name : '';
    const by = r.interruptedBy ? TEAM[r.interruptedBy].name : '';
    switch (r.how) {
        case 'claim':
            return r.interruptedBy ? `${by} knocked everyone down, but ${w} broke the Final Seal and held on.` : `${w} opened the vault and held the chest together.`;
        case 'steal':
            return `${w} STOLE it! The other team let go of the chest and ${w} grabbed it.`;
        case 'seal-timeout':
            return `Nobody broke the Final Seal in time. ${w} had more gems, so the treasure is theirs.`;
        default:
            return 'The ruin kept its treasure. Nobody made it out with it.';
    }
};

export function RrfExpeditionEndScreen({ group, gs, playerId }: Props) {
    const now = useServerNow();
    const isHost = group.hostId === playerId;
    const r = gs.results[gs.results.length - 1];
    const sc = scenarioById(r.scenario);
    const last = gs.expedition >= gs.expeditionsTotal;
    const W = r.winner ? TEAM[r.winner] : null;
    return (
        <Ruin
            kicker={`EXPEDITION ${r.expedition} OF ${gs.expeditionsTotal}`}
            right={<TimerPill text={clock(gs.phaseEndsAt - now)} />}
            footer={
                isHost ? (
                    <GoldButton label={last ? 'See the final scores 🏆' : 'Next expedition 🗺️'} onPress={() => rrfSkip(group.id, playerId)} />
                ) : (
                    <Text style={styles.waiting}>{last ? 'Final scores in a moment…' : 'Next expedition in a moment…'}</Text>
                )
            }
        >
            <Text style={styles.big}>{W ? '👑' : '🪦'}</Text>
            <Text style={styles.label}>{sc.treasure.toUpperCase()}</Text>
            <Text style={[styles.title, W && { color: W.color }]}>{W ? `${W.emoji} ${W.name} ${r.how === 'steal' ? 'steals' : 'claims'} it!` : 'Nobody claims it'}</Text>
            <Text style={styles.text}>{story(r)}</Text>
            <View style={styles.tally}>
                {(['tiger', 'cobra'] as const).map((id) => {
                    const T = TEAM[id];
                    const won = r.winner === id;
                    return (
                        <View key={id} style={styles.row}>
                            <Text style={[styles.name, { color: T.color }]} numberOfLines={1}>
                                {T.emoji} {sideLabel(gs, id)}
                            </Text>
                            <Text style={styles.pts}>
                                💎 {r.gems[id]}
                                {won ? ` + 👑 ${TREASURE}` : ''} = {r.gems[id] + (won ? TREASURE : 0)}
                            </Text>
                        </View>
                    );
                })}
                <View style={styles.rule} />
                {(['tiger', 'cobra'] as const).map((id) => (
                    <View key={id} style={styles.row}>
                        <Text style={styles.small}>{TEAM[id].name} so far</Text>
                        <Text style={styles.small}>{gs.teams[id].score}</Text>
                    </View>
                ))}
            </View>
        </Ruin>
    );
}

export function RrfOverScreen({ group, gs, playerId }: Props) {
    const isHost = group.hostId === playerId;
    const [busy, setBusy] = useState(false);
    const present = group.players.map((p) => p.id);
    const nameOf = (id: string) => (id === playerId ? 'You' : group.players.find((p) => p.id === id)?.name ?? 'Someone');
    const rows = standings(gs);
    const w = nightWinner(gs);
    const aw = awards(gs, present);
    const pts = playerPoints(gs, present);
    const none = Object.keys(pts).length === 0;
    // 🏆 The night's teams on the podium (a draw shares the top step).
    const podium: PodiumEntry[] = gs.results.length
        ? rows.map((r, i) => ({
              id: r.id,
              name: sideLabel(gs, r.id),
              rank: i > 0 && rows[i - 1].score === r.score ? 1 : i + 1,
              color: TEAM[r.id].color,
              score: `${r.score} pts · 👑×${r.treasures}`,
              members: (gs.teams[r.id]?.members ?? []).map((id) => group.players.find((p) => p.id === id) ?? { id, name: nameOf(id) }),
          }))
        : [];
    return (
        <Ruin
            kicker={gs.endedEarly ? `ENDED EARLY · ${gs.results.length} EXPEDITION${gs.results.length === 1 ? '' : 'S'}` : 'THE NIGHT IS OVER'}
            footer={
                isHost ? (
                    <GoldButton
                        label={busy ? 'Adding points…' : 'Add points & back to menu'}
                        disabled={busy}
                        onPress={async () => {
                            setBusy(true);
                            try {
                                await finishRrf(group);
                            } finally {
                                setBusy(false);
                            }
                        }}
                    />
                ) : (
                    <Text style={styles.waiting}>Waiting for the host…</Text>
                )
            }
        >
            <EndPodium id={`${group.id}:rrf:${rows.map((r) => r.id + r.score).join(',')}:${gs.results.length}`} subtitle="ROOF RACE · THE NIGHT IS OVER" entries={podium} />
            <Text style={styles.big}>🏆</Text>
            <Text style={[styles.title, w && { color: TEAM[w].color }]}>
                {w ? `${TEAM[w].emoji} ${sideLabel(gs, w)} wins the night!` : gs.results.length ? 'A draw! The ruins couldn’t pick.' : 'No expedition finished'}
            </Text>
            <View style={styles.tally}>
                {rows.map((r) => (
                    <View key={r.id} style={styles.row}>
                        <Text style={[styles.name, { color: TEAM[r.id].color }]} numberOfLines={1}>
                            {TEAM[r.id].emoji} {sideLabel(gs, r.id)}
                        </Text>
                        <Text style={styles.pts}>
                            {r.score} · 👑×{r.treasures}
                        </Text>
                    </View>
                ))}
            </View>
            {(aw.keyHolder || aw.rope) && (
                <View style={styles.awards}>
                    {aw.keyHolder && (
                        <View style={styles.award}>
                            <Text style={styles.awardEmoji}>⭐</Text>
                            <Text style={styles.awardTitle}>KEY-HOLDER OF THE NIGHT</Text>
                            <Text style={styles.awardName}>{nameOf(aw.keyHolder)}</Text>
                            <Text style={styles.awardSub}>
                                {gs.stats[aw.keyHolder].clean} clean door{gs.stats[aw.keyHolder].clean === 1 ? '' : 's'}
                            </Text>
                        </View>
                    )}
                    {aw.rope && (
                        <View style={styles.award}>
                            <Text style={styles.awardEmoji}>🪢</Text>
                            <Text style={styles.awardTitle}>ROPE HERO</Text>
                            <Text style={styles.awardName}>{nameOf(aw.rope)}</Text>
                            <Text style={styles.awardSub}>saved the team</Text>
                        </View>
                    )}
                </View>
            )}
            <Text style={styles.small}>
                {none ? (gs.endedEarly && gs.results.length ? `Ended before ${expeditionsForPoints(gs)} expeditions were finished: no points this time.` : 'No points this time.') : `Points: winning team ${POINTS.win} each, the others ${POINTS.lose}${w ? '' : ` (a draw: ${POINTS.draw} each)`}.`}
            </Text>
        </Ruin>
    );
}

const styles = StyleSheet.create({
    big: { fontSize: 84, textAlign: 'center', marginTop: 8 },
    label: { color: RR.gold, fontSize: 12, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
    title: { color: RR.gold, fontSize: 28, fontWeight: '900', fontFamily: CARVED, textAlign: 'center' },
    text: { color: RR.sand, fontSize: 15, fontWeight: '700', lineHeight: 21, textAlign: 'center' },
    tally: { backgroundColor: RR.panel, borderRadius: 18, padding: 14, gap: 10, borderWidth: 1, borderColor: RR.line },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    name: { fontSize: 16, fontWeight: '900', flexShrink: 1, marginRight: 8 },
    pts: { color: RR.gold, fontSize: 16, fontWeight: '900' },
    rule: { height: 1, backgroundColor: RR.line },
    small: { color: RR.sandMuted, fontSize: 13, fontWeight: '700', textAlign: 'center' },
    awards: { flexDirection: 'row', gap: 10 },
    award: { flex: 1, backgroundColor: RR.panel, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: RR.goldDeep, padding: 12, alignItems: 'center', gap: 2 },
    awardEmoji: { fontSize: 30 },
    awardTitle: { color: RR.goldDeep, fontSize: 11, fontWeight: '900', letterSpacing: 1, textAlign: 'center' },
    awardName: { color: RR.sand, fontSize: 18, fontWeight: '900' },
    awardSub: { color: RR.sandMuted, fontSize: 12 },
    waiting: { color: RR.sandMuted, textAlign: 'center', paddingVertical: 8 },
});
