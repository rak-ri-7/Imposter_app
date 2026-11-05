// 💥 The roof is coming down. The explorers have a few seconds to throw the
// team's one rope to the key-holder. And if nobody does: buried.
import { useEffect } from 'react';
import { View, Text, StyleSheet, Vibration } from 'react-native';
import type { Group, RrfGameState, RrfTeam } from '../../../shared/types';
import { RETRY_MS, STRIKE_GEMS, rivalOf } from '../logic/engine';
import { rrfRope } from '../logic/game';
import { scenarioById } from '../data/scenarios';
import Ruin, { TimerPill } from '../components/Ruin';
import { GoldButton, RivalStrip } from '../components/Bits';
import { useServerNow } from '../../../shared/hooks/useServerNow';
import { CARVED, RR, clock } from '../theme';

type Props = { group: Group; gs: RrfGameState; playerId: string; team: RrfTeam };

export function RrfFallingScreen({ group, gs, playerId, team }: Props) {
    const now = useServerNow(100);
    const sc = scenarioById(gs.scenario);
    const kh = group.players.find((p) => p.id === team.keyHolder)?.name ?? 'your key-holder';
    const isKey = team.keyHolder === playerId;
    const left = team.stageEndsAt - now;
    useEffect(() => {
        Vibration.vibrate([0, 300, 150, 300]);
    }, []);

    return (
        <Ruin kicker={sc.doors[team.door].toUpperCase()} right={<TimerPill text={clock(left)} urgent />} tint="#1E0D0A">
            <Text style={styles.rocks}>🪨 💥 🪨</Text>
            <Text style={styles.title}>{sc.dooms[team.door]}</Text>
            {team.ropeUsed ? (
                <Text style={styles.text}>The rope is gone. There’s nothing left to save {isKey ? 'you' : kh}…</Text>
            ) : isKey ? (
                <Text style={styles.text}>SHOUT FOR THE ROPE! Only your teammates can throw it.</Text>
            ) : (
                <>
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>🪢 Throw your rescue rope to {kh}?</Text>
                        <Text style={styles.cardText}>
                            The team survives and tries this door again with a new lock ({RETRY_MS / 1000} s, no gems for it), and takes a strike (−{STRIKE_GEMS} 💎). One rope per expedition.
                        </Text>
                    </View>
                    <GoldButton label="Throw the rope 🪢" onPress={() => rrfRope(group.id, playerId)} />
                    <Text style={styles.small}>Do nothing and the team is buried for this expedition.</Text>
                </>
            )}
            <RivalStrip rival={gs.teams[rivalOf(team.id)]} doorNames={[...sc.doors]} />
        </Ruin>
    );
}

// 🪦 Out of this expedition: watch the other team.
export function RrfBuriedScreen({ gs, team }: Props) {
    const sc = scenarioById(gs.scenario);
    return (
        <Ruin kicker="BURIED" tint="#0B0B0C">
            <Text style={styles.rocks}>🪦</Text>
            <Text style={styles.title}>Buried under {sc.name.split(' of ')[0].toLowerCase()} rubble.</Text>
            <Text style={styles.text}>
                You’re out of this expedition, but you keep your {team.gems} 💎 for the score. Watch the other team… and hope the roof gets them too.
            </Text>
            <RivalStrip rival={gs.teams[rivalOf(team.id)]} doorNames={[...sc.doors]} />
        </Ruin>
    );
}

const styles = StyleSheet.create({
    rocks: { fontSize: 64, textAlign: 'center', marginTop: 10 },
    title: { color: '#FF8A6B', fontSize: 30, fontWeight: '900', fontFamily: CARVED, textAlign: 'center' },
    text: { color: '#F0C9BC', fontSize: 16, fontWeight: '700', lineHeight: 23, textAlign: 'center' },
    card: { borderRadius: 18, padding: 14, backgroundColor: '#00000066', borderWidth: 2, borderColor: '#8C3A22', gap: 6 },
    cardTitle: { color: RR.gold, fontSize: 17, fontWeight: '900' },
    cardText: { color: '#E8C9BC', fontSize: 14, lineHeight: 20, fontWeight: '600' },
    small: { color: '#C09080', fontSize: 12, textAlign: 'center' },
});
