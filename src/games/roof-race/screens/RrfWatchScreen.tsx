// 👀 For players who aren't on a team (benched, joined late, or simply not
// picked): the whole race at a glance. Where each team is, who holds the
// key, the clock, gems, strikes and the rope, and every hand on the chest.
import { View, Text, StyleSheet } from 'react-native';
import type { Group, RrfGameState, RrfTeam } from '../../../shared/types';
import { TEAM_IDS, here } from '../logic/engine';
import { presentOf } from '../logic/game';
import { scenarioById } from '../data/scenarios';
import Ruin from '../components/Ruin';
import { DoorPath } from '../components/Bits';
import { HoldMeter } from '../components/Hold';
import { useServerNow } from '../../../shared/hooks/useServerNow';
import { CARVED, RR, TEAM, clock, sideLabel } from '../theme';

type Props = { group: Group; gs: RrfGameState; playerId: string };

export default function RrfWatchScreen({ group, gs, playerId }: Props) {
    const now = useServerNow();
    const sc = scenarioById(gs.scenario);
    const present = presentOf(group);
    const nameOf = (id: string) => group.players.find((p) => p.id === id)?.name ?? 'Someone';

    const headline =
        gs.phase === 'seal'
            ? `Everyone tumbled into the Final Seal. ${clock(gs.phaseEndsAt - now)} left.`
            : gs.phase === 'finalClaim'
              ? gs.unguarded
                  ? 'THE CHEST IS UNGUARDED! First team with every hand down takes it.'
                  : `${TEAM[gs.sealWinner!].name} broke the seal first and is claiming the chest.`
              : 'The race is on. You’re watching this one.';

    const where = (t: RrfTeam): string => {
        switch (t.stage) {
            case 'door':
                return `🔑 ${nameOf(t.keyHolder)} at ${sc.doors[t.door]} · ${clock(t.doorEndsAt - now)}${now < t.frozenUntil ? ' · 🌋 shaking!' : ''}${t.torch ? ' · 🔦' : ''}`;
            case 'falling':
                return `💥 ${sc.dooms[t.door]} ${t.ropeUsed ? 'No rope left…' : 'Will they throw the rope?'}`;
            case 'between':
                return `Through ${sc.doors[t.door]} · next door in ${Math.max(0, Math.ceil((t.stageEndsAt - now) / 1000))} s`;
            case 'vault':
                return '👑 At the chest!';
            default:
                return '🪦 Buried';
        }
    };

    return (
        <Ruin kicker={`WATCHING · EXPEDITION ${gs.expedition} OF ${gs.expeditionsTotal}`}>
            <Text style={styles.title}>{sc.name}</Text>
            <Text style={styles.headline}>{headline}</Text>

            {TEAM_IDS.map((id) => {
                const t = gs.teams[id];
                const T = TEAM[id];
                const opened = t.door + (t.stage === 'between' || t.stage === 'vault' ? 1 : 0);
                return (
                    <View key={id} style={[styles.card, { borderColor: T.color }]}>
                        <View style={styles.row}>
                            <Text style={[styles.team, { color: T.color }]} numberOfLines={1}>
                                {T.emoji} {sideLabel(gs, id)}
                            </Text>
                            <Text style={styles.score}>{t.score ? `${t.score} pts · ` : ''}💎 {t.gems}</Text>
                        </View>
                        <Text style={styles.members} numberOfLines={2}>
                            {here(t, present).map(nameOf).join(' · ')}
                        </Text>
                        {gs.phase === 'run' && (
                            <>
                                <DoorPath names={[...sc.doors]} small at={t.stage === 'vault' ? 3 : t.door} done={opened} />
                                <Text style={styles.where}>{where(t)}</Text>
                                <Text style={styles.small}>
                                    ✖ {t.strikes} strike{t.strikes === 1 ? '' : 's'} · 🪢 {t.ropeUsed ? 'rope used' : 'rope ready'}
                                    {t.interruptUsed ? ' · interrupt used' : ''}
                                </Text>
                            </>
                        )}
                        {gs.phase === 'seal' && t.seal && (
                            <Text style={styles.where}>
                                {Object.keys(t.seal.placed).length} of {t.seal.tiles.length} tiles placed
                                {t.seal.wrong ? ` · ${t.seal.wrong} wrong push${t.seal.wrong === 1 ? '' : 'es'}` : ''}
                            </Text>
                        )}
                    </View>
                );
            })}

            {gs.phase === 'run' &&
                TEAM_IDS.filter((id) => gs.teams[id].stage === 'vault').map((id) => {
                    const rival = id === 'tiger' ? 'cobra' : 'tiger';
                    return (
                        <View key={id} style={{ gap: 10 }}>
                            <HoldMeter group={group} gs={gs} team={id} kind="claim" now={now} playerId={playerId} />
                            {gs.teams[rival].stage !== 'vault' && !gs.teams[rival].interruptUsed && (
                                <HoldMeter group={group} gs={gs} team={rival} kind="interrupt" now={now} playerId={playerId} />
                            )}
                        </View>
                    );
                })}
            {gs.phase === 'finalClaim' &&
                TEAM_IDS.filter((id) => gs.unguarded || gs.sealWinner === id).map((id) => (
                    <HoldMeter key={id} group={group} gs={gs} team={id} kind="claim" now={now} playerId={playerId} />
                ))}
        </Ruin>
    );
}

const styles = StyleSheet.create({
    title: { color: RR.gold, fontSize: 26, fontWeight: '900', fontFamily: CARVED },
    headline: { color: RR.sand, fontSize: 15, fontWeight: '700', lineHeight: 21 },
    card: { borderWidth: 1.5, borderRadius: 16, padding: 12, gap: 8, backgroundColor: RR.panel },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    team: { flexShrink: 1, fontSize: 16, fontWeight: '900' },
    score: { color: RR.gold, fontSize: 14, fontWeight: '800' },
    members: { color: RR.sandMuted, fontSize: 13 },
    where: { color: RR.sand, fontSize: 14, fontWeight: '800' },
    small: { color: RR.sandDim, fontSize: 12, fontWeight: '700' },
});
