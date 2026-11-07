// The lobby. Teams come from the session ("👥 Play as Teams" in the game
// menu): the first of the two becomes ☀️ Team Sun, the second 🌙 Team Moon. The
// host picks how many expeditions, or goes back to edit the teams.
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useState } from 'react';
import type { Group } from '../../../shared/types';
import { DEFAULT_EXPEDITIONS, EXPEDITION_OPTIONS, TEAM_IDS } from '../logic/engine';
import { rrfSetExpeditions, sessionTeams, startRrf } from '../logic/game';
import Ruin from '../components/Ruin';
import { GoldButton, GhostButton } from '../components/Bits';
import { CARVED, RR, TEAM } from '../theme';
import HowToPlay from '../../../shared/components/HowToPlay';

type Props = { group: Group; playerId: string; onEditTeams: () => void };

const RULES = [
    'Your two teams race through the same crumbling ruin: three doors, then the treasure.',
    'At each door one of you holds the 🔑 key and sees the lock. Everyone else holds a page of clues, but can’t see the lock. Talk!',
    'The key passes on at every door. Open fast: every 5 seconds left is a 💎 gem.',
    'A wrong push costs 2 gems. Two wrong pushes, or running out of time, and the roof comes down… unless a teammate throws your one 🪢 rope.',
    'Between doors, spend 3 gems to send a 🌋 tremor and shake the other team’s lock.',
    'Open the vault, then every one of you must hold the chest together. The other team can stop you once, if all of them hold together first.',
    '🏆 Score: gems left + 25 for the treasure. Winning team 10 pts each, the others 4.',
];

export default function RrfLobbyScreen({ group, playerId, onEditTeams }: Props) {
    const isHost = group.hostId === playerId;
    const from = sessionTeams(group);
    const expeditions = group.rrfLobby?.expeditions ?? DEFAULT_EXPEDITIONS;
    const [starting, setStarting] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const nameOf = (id: string) => (id === playerId ? 'You' : group.players.find((p) => p.id === id)?.name ?? 'Someone');

    const start = async () => {
        if (starting) return;
        setStarting(true);
        try {
            setProblem(await startRrf(group));
        } finally {
            setStarting(false);
        }
    };

    return (
        <Ruin
            kicker={`${group.players.length} EXPLORERS`}
            footer={
                isHost ? (
                    <>
                        {problem && <Text style={styles.problem}>{problem}</Text>}
                        {from.ok ? (
                            <GoldButton label={starting ? 'Lighting the torches…' : 'Start the expedition 🔦'} onPress={start} disabled={starting} />
                        ) : (
                            <GoldButton label="👥 Set up the teams" onPress={onEditTeams} />
                        )}
                    </>
                ) : (
                    <Text style={styles.waiting}>{from.ok ? 'Waiting for the host to start…' : 'Waiting for the host to set up 2 teams…'}</Text>
                )
            }
        >
            <Text style={styles.title}>Race Before the Roof Falls!</Text>
            <Text style={styles.sub}>Two teams. Three doors. One treasure. The walls are already shaking.</Text>
            <HowToPlay game="roof-race" details={RULES} theme={{ text: RR.sand, muted: RR.sandMuted, accent: RR.gold, sheet: RR.bg, panel: RR.panel, sheetText: RR.sand, sheetMuted: RR.sandMuted, numberText: RR.goldInk }} />

            {from.ok ? (
                <>
                    <View style={styles.teams}>
                        {TEAM_IDS.map((id) => {
                            const T = TEAM[id];
                            const side = from.sides[id];
                            return (
                                <View key={id} style={[styles.team, { borderColor: T.color, backgroundColor: T.deep }]}>
                                    <Text style={[styles.teamName, { color: T.color }]}>
                                        {T.emoji} {T.name}
                                    </Text>
                                    <View style={styles.session}>
                                        <View style={[styles.dot, { backgroundColor: side.color }]} />
                                        <Text style={styles.sessionName} numberOfLines={1}>
                                            {side.name}
                                        </Text>
                                    </View>
                                    <View style={{ gap: 6 }}>
                                        {from.teams[id].map((p) => (
                                            <View key={p} style={styles.member}>
                                                <Text style={[styles.memberText, p === playerId && { color: RR.gold }]} numberOfLines={1}>
                                                    {nameOf(p)}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                    {from.watching.length > 0 && (
                        <Text style={styles.hint}>
                            Not on a team, watching this one: {from.watching.map(nameOf).join(', ')}
                        </Text>
                    )}
                    {isHost && <GhostButton label="👥 Edit teams" onPress={onEditTeams} />}
                </>
            ) : (
                <View style={styles.noTeams}>
                    <Text style={styles.noTeamsTitle}>👥 Two teams needed</Text>
                    <Text style={styles.noTeamsText}>{from.problem}</Text>
                </View>
            )}

            <Text style={styles.label}>EXPEDITIONS</Text>
            <View style={styles.row}>
                {EXPEDITION_OPTIONS.map((n) => {
                    const on = expeditions === n;
                    return (
                        <TouchableOpacity key={n} style={[styles.opt, on && styles.optOn]} disabled={!isHost} onPress={() => rrfSetExpeditions(group.id, playerId, n)}>
                            <Text style={[styles.optBig, on && { color: RR.gold }]}>{n}</Text>
                            <Text style={styles.optSub}>{n === 1 ? '~5 min' : n === 3 ? '~15 min' : '~25 min'}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

        </Ruin>
    );
}

const styles = StyleSheet.create({
    title: { color: RR.gold, fontSize: 30, fontWeight: '900', fontFamily: CARVED },
    sub: { color: RR.sandMuted, fontSize: 15, lineHeight: 21 },
    teams: { flexDirection: 'row', gap: 10 },
    team: { flex: 1, borderWidth: 2, borderRadius: 16, padding: 12, gap: 8 },
    teamName: { fontSize: 16, fontWeight: '900' },
    session: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -4 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    sessionName: { flex: 1, color: RR.sandMuted, fontSize: 13, fontWeight: '800' },
    member: { backgroundColor: '#00000040', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10 },
    memberText: { color: RR.sand, fontSize: 14, fontWeight: '800' },
    hint: { color: RR.sandDim, fontSize: 12, textAlign: 'center' },
    noTeams: { backgroundColor: RR.panel, borderRadius: 16, borderWidth: 1.5, borderColor: RR.goldDeep, padding: 14, gap: 6 },
    noTeamsTitle: { color: RR.gold, fontSize: 17, fontWeight: '900' },
    noTeamsText: { color: RR.sand, fontSize: 14, lineHeight: 20 },
    label: { color: RR.sandMuted, fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 6 },
    row: { flexDirection: 'row', gap: 10 },
    opt: { flex: 1, backgroundColor: RR.panel, borderRadius: 14, borderWidth: 2, borderColor: RR.line, paddingVertical: 10, alignItems: 'center' },
    optOn: { borderColor: RR.gold, backgroundColor: RR.panelHi },
    optBig: { color: RR.sand, fontSize: 22, fontWeight: '900' },
    optSub: { color: RR.sandDim, fontSize: 11, fontWeight: '700' },
    rule: { color: RR.sand, fontSize: 14, lineHeight: 20 },
    problem: { color: RR.danger, textAlign: 'center', fontWeight: '800' },
    waiting: { color: RR.sandMuted, textAlign: 'center', paddingVertical: 8 },
});
