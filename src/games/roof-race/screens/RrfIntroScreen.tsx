// The story before each expedition: where you are, the three doors, the
// teams and who holds the key first. The host can skip ahead.
import { View, Text, StyleSheet } from 'react-native';
import type { Group, RrfGameState } from '../../../shared/types';
import { TEAM_IDS, here } from '../logic/engine';
import { presentOf, rrfSkip } from '../logic/game';
import { scenarioById } from '../data/scenarios';
import Ruin, { TimerPill } from '../components/Ruin';
import { DoorPath, GoldButton } from '../components/Bits';
import { useServerNow } from '../../../shared/hooks/useServerNow';
import { CARVED, RR, TEAM, clock, sideLabel } from '../theme';

type Props = { group: Group; gs: RrfGameState; playerId: string };

const ART: Record<string, string> = { temple: '🛕', caves: '🌊', tomb: '🏜️', stepwell: '🪔', forge: '⛰️' };

export default function RrfIntroScreen({ group, gs, playerId }: Props) {
    const now = useServerNow();
    const isHost = group.hostId === playerId;
    const sc = scenarioById(gs.scenario);
    const present = presentOf(group);
    const nameOf = (id: string) => (id === playerId ? 'You' : group.players.find((p) => p.id === id)?.name ?? 'Someone');
    const left = gs.phaseEndsAt - now;

    return (
        <Ruin
            kicker={`EXPEDITION ${gs.expedition} OF ${gs.expeditionsTotal}`}
            right={<TimerPill text={clock(left)} />}
            footer={
                isHost ? (
                    <GoldButton label="Enter now 🔦" onPress={() => rrfSkip(group.id, playerId)} />
                ) : (
                    <Text style={styles.waiting}>The expedition starts in {Math.max(0, Math.ceil(left / 1000))}…</Text>
                )
            }
        >
            <View style={styles.hero}>
                <Text style={styles.art}>{ART[sc.id] ?? '🏛️'}</Text>
            </View>
            <Text style={styles.title}>{sc.name}</Text>
            <Text style={styles.story}>{sc.story}</Text>
            <DoorPath names={[...sc.doors]} />
            <View style={styles.teams}>
                {TEAM_IDS.map((id) => {
                    const t = gs.teams[id];
                    const T = TEAM[id];
                    const people = here(t, present);
                    const first = people.length ? people[t.keyTurn % people.length] : null;
                    return (
                        <View key={id} style={[styles.team, { borderColor: T.color }]}>
                            <Text style={[styles.teamName, { color: T.color }]}>
                                {T.emoji} {sideLabel(gs, id)}
                                {t.score ? `  ·  ${t.score}` : ''}
                            </Text>
                            <Text style={styles.members}>{t.members.map(nameOf).join(' · ')}</Text>
                            {first && (
                                <Text style={styles.key}>
                                    🔑 {nameOf(first)} {first === playerId ? 'hold' : 'holds'} the key first
                                </Text>
                            )}
                        </View>
                    );
                })}
            </View>
        </Ruin>
    );
}

const styles = StyleSheet.create({
    hero: { height: 150, borderRadius: 20, backgroundColor: RR.panel, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: RR.line },
    art: { fontSize: 88 },
    title: { color: RR.gold, fontSize: 28, fontWeight: '900', fontFamily: CARVED },
    story: { color: RR.sand, fontSize: 16, lineHeight: 23 },
    teams: { flexDirection: 'row', gap: 10 },
    team: { flex: 1, borderWidth: 2, borderRadius: 16, padding: 12, gap: 4, backgroundColor: RR.panel },
    teamName: { fontSize: 15, fontWeight: '900' },
    members: { color: RR.sandMuted, fontSize: 13 },
    key: { color: RR.sand, fontSize: 13, fontWeight: '800', marginTop: 2 },
    waiting: { color: RR.sandMuted, textAlign: 'center', paddingVertical: 8 },
});
