// Through a door! A short breather: the gems you just won, who holds the
// key next, the race so far, and the 🌋 tremor (one proposes, a teammate
// confirms).
import { View, Text, StyleSheet } from 'react-native';
import type { Group, RrfGameState, RrfTeam } from '../../../shared/types';
import { TREMOR_COST, TREMOR_MS, here, rivalOf, tremorProblem } from '../logic/engine';
import { presentOf, rrfAnswerTremor, rrfProposeTremor } from '../logic/game';
import { scenarioById } from '../data/scenarios';
import Ruin, { TimerPill } from '../components/Ruin';
import { DoorPath, GhostButton, GoldButton, RivalStrip } from '../components/Bits';
import { RivalClaimBanner } from '../components/Hold';
import { useServerNow } from '../../../shared/hooks/useServerNow';
import { CARVED, RR, TEAM, clock } from '../theme';

type Props = { group: Group; gs: RrfGameState; playerId: string; team: RrfTeam };

export default function RrfBetweenScreen({ group, gs, playerId, team }: Props) {
    const now = useServerNow();
    const sc = scenarioById(gs.scenario);
    const present = presentOf(group);
    const nameOf = (id: string) => (id === playerId ? 'You' : group.players.find((p) => p.id === id)?.name ?? 'Someone');
    const rival = gs.teams[rivalOf(team.id)];
    const R = TEAM[rival.id];
    const last = team.doorLog.filter((d) => d.door === team.door).at(-1);
    const people = here(team, present);
    const nextKey = people.length ? people[team.keyTurn % people.length] : null;
    const why = tremorProblem(gs, team);
    const prop = team.tremorProposal;
    const left = team.stageEndsAt - now;

    return (
        <Ruin kicker={`THROUGH ${sc.doors[team.door].toUpperCase()}`} right={<TimerPill text={clock(left)} />}>
            <Text style={styles.title}>The door grinds open!</Text>
            <Text style={styles.gems}>
                {last?.how === 'rope' || team.retry ? 'Made it, no gems for that one.' : `+${last?.gems ?? 0} 💎`}
                {'  '}
                <Text style={styles.total}>({team.gems} 💎 now)</Text>
            </Text>
            <DoorPath names={[...sc.doors]} at={team.door + 1} done={team.door + 1} />
            {nextKey && (
                <Text style={styles.next}>
                    🔑 {nameOf(nextKey)} {nextKey === playerId ? 'hold' : 'holds'} the key at {sc.doors[team.door + 1]}. Next door in {Math.max(0, Math.ceil(left / 1000))} s…
                </Text>
            )}

            <RivalClaimBanner group={group} gs={gs} playerId={playerId} team={team.id} now={now} />

            <View style={styles.tremor}>
                <Text style={styles.tremorTitle}>🌋 Send a tremor?</Text>
                <Text style={styles.tremorText}>
                    Shake {R.name}’s lock: it freezes for {TREMOR_MS / 1000} s and their tiles fall out. Costs {TREMOR_COST} of your gems. One player proposes, a teammate says yes.
                </Text>
                {prop ? (
                    prop.by === playerId ? (
                        <>
                            <Text style={styles.wait}>Waiting for a teammate to say yes…</Text>
                            <GhostButton label="Cancel" onPress={() => rrfAnswerTremor(group.id, playerId, false)} color={RR.sandMuted} />
                        </>
                    ) : (
                        <>
                            <Text style={styles.wait}>{nameOf(prop.by)} wants to shake them!</Text>
                            <GoldButton label={`Yes, shake them 💎×${TREMOR_COST}`} onPress={() => rrfAnswerTremor(group.id, playerId, true)} />
                            <GhostButton label="No, save the gems" onPress={() => rrfAnswerTremor(group.id, playerId, false)} color={RR.sandMuted} />
                        </>
                    )
                ) : why ? (
                    <Text style={styles.wait}>{team.tremorSentAfter === team.door ? 'Tremor sent! 🌋' : why}</Text>
                ) : (
                    <GoldButton label={`Propose a tremor 💎×${TREMOR_COST}`} onPress={() => rrfProposeTremor(group.id, playerId)} />
                )}
            </View>

            <RivalStrip rival={rival} doorNames={[...sc.doors]} />
        </Ruin>
    );
}

const styles = StyleSheet.create({
    title: { color: RR.gold, fontSize: 28, fontWeight: '900', fontFamily: CARVED },
    gems: { color: RR.gold, fontSize: 30, fontWeight: '900' },
    total: { color: RR.sandMuted, fontSize: 16, fontWeight: '800' },
    next: { color: RR.sand, fontSize: 15, fontWeight: '700', lineHeight: 21 },
    tremor: { backgroundColor: '#2A140E', borderRadius: 18, padding: 14, gap: 10, borderWidth: 1.5, borderColor: '#6A2A1A' },
    tremorTitle: { color: '#FFB199', fontSize: 18, fontWeight: '900' },
    tremorText: { color: '#E8C9BC', fontSize: 14, lineHeight: 20 },
    wait: { color: RR.sand, fontSize: 14, fontWeight: '800' },
});
