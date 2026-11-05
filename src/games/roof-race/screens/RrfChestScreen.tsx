// 👑 The chest. After opening the vault (or the Final Seal), every player on
// the team holds it together until the bar fills. Let go and it resets…
// and after the Final Seal, letting go leaves the chest up for grabs.
import { View, Text, StyleSheet } from 'react-native';
import type { Group, RrfGameState, RrfTeam, RrfTeamId } from '../../../shared/types';
import { CLAIM_HOLD_MS, INTERRUPT_COST, holdKind, rivalOf } from '../logic/engine';
import { scenarioById } from '../data/scenarios';
import Ruin, { TimerPill } from '../components/Ruin';
import { HoldButton, HoldMeter } from '../components/Hold';
import { useServerNow } from '../../../shared/hooks/useServerNow';
import { CARVED, RR, TEAM, clock } from '../theme';

type Props = { group: Group; gs: RrfGameState; playerId: string; team: RrfTeam };

export default function RrfChestScreen({ group, gs, playerId, team }: Props) {
    const now = useServerNow(100);
    const sc = scenarioById(gs.scenario);
    const rivalId: RrfTeamId = rivalOf(team.id);
    const rival = gs.teams[rivalId];
    const R = TEAM[rivalId];
    const kind = holdKind(gs, playerId);
    const final = gs.phase === 'finalClaim';
    const mineToClaim = final ? gs.sealWinner === team.id : team.stage === 'vault';
    const rivalCanInterrupt = !final && !rival.interruptUsed && rival.gems >= INTERRUPT_COST && (rival.stage === 'door' || rival.stage === 'between');
    const secs = CLAIM_HOLD_MS / 1000;

    let title: string;
    let text: string;
    if (final && gs.unguarded) {
        title = 'THE CHEST IS UNGUARDED!';
        text = `Grab it! The first team with every hand down for ${secs} s takes ${sc.treasure}.`;
    } else if (final && !mineToClaim) {
        title = `${R.emoji} ${R.name} broke the seal first`;
        text = `Watch their hands. If one of them lets go mid-hold, or they take too long (${clock(gs.phaseEndsAt - now)}), the chest is up for grabs. Be ready!`;
    } else if (final) {
        title = 'The seal is broken!';
        text = `Every hand on the chest for ${secs} s. Nobody can stop you now… but if one of you lets go, ${R.name} can grab it. Don’t take too long: ${clock(gs.phaseEndsAt - now)}.`;
    } else {
        title = `${sc.treasure[0].toUpperCase()}${sc.treasure.slice(1)}!`;
        text = rivalCanInterrupt
            ? `Every hand on the chest for ${secs} s. Quick: ${R.name} has the gems to knock you off it, if all of them hold together first.`
            : `Every hand on the chest for ${secs} s and it’s yours.`;
    }

    return (
        <Ruin
            kicker={final ? 'THE FINAL CLAIM' : 'THE VAULT IS OPEN'}
            right={final && !gs.unguarded ? <TimerPill text={clock(gs.phaseEndsAt - now)} /> : undefined}
            tint={final && gs.unguarded ? '#1F1610' : RR.bg}
        >
            <Text style={styles.chest}>👑</Text>
            <Text style={[styles.title, final && gs.unguarded && { color: '#E8A15E' }]}>{title}</Text>
            <Text style={styles.text}>{text}</Text>

            {final && gs.fumble && !gs.unguarded && (
                <View style={styles.fumble}>
                    <Text style={styles.fumbleText}>
                        {gs.fumble.pid === playerId ? 'You let go! Press again NOW!' : `${group.players.find((p) => p.id === gs.fumble!.pid)?.name ?? 'Someone'} let go! A second to grab it again…`}
                    </Text>
                </View>
            )}
            {kind === 'claim' ? (
                <HoldButton group={group} gs={gs} playerId={playerId} label="Press and hold the chest" holdingLabel="Holding… everyone together!" />
            ) : (
                <View style={styles.waitBox}>
                    <Text style={styles.wait}>✋ Hands off… for now.</Text>
                </View>
            )}

            {(mineToClaim || gs.unguarded) && <HoldMeter group={group} gs={gs} team={team.id} kind="claim" now={now} playerId={playerId} />}
            {final && (gs.sealWinner === rivalId || gs.unguarded) && <HoldMeter group={group} gs={gs} team={rivalId} kind="claim" now={now} playerId={playerId} />}
            {!final && rivalCanInterrupt && <HoldMeter group={group} gs={gs} team={rivalId} kind="interrupt" now={now} playerId={playerId} />}
            {!final && rival.stage === 'vault' && <HoldMeter group={group} gs={gs} team={rivalId} kind="claim" now={now} playerId={playerId} />}
            <Text style={styles.gems}>
                {TEAM[team.id].emoji} {team.gems} 💎 · {R.emoji} {rival.gems} 💎
            </Text>
        </Ruin>
    );
}

const styles = StyleSheet.create({
    chest: { fontSize: 72, textAlign: 'center', marginTop: 4 },
    title: { color: RR.gold, fontSize: 28, fontWeight: '900', fontFamily: CARVED, textAlign: 'center' },
    text: { color: RR.sand, fontSize: 15, fontWeight: '700', lineHeight: 21, textAlign: 'center' },
    waitBox: { borderRadius: 24, borderWidth: 2, borderColor: RR.line, borderStyle: 'dashed', paddingVertical: 30, alignItems: 'center' },
    wait: { color: RR.sandMuted, fontSize: 17, fontWeight: '900' },
    gems: { color: RR.sandMuted, textAlign: 'center', fontWeight: '800' },
    fumble: { backgroundColor: RR.dangerDeep, borderRadius: 14, padding: 12, borderWidth: 1.5, borderColor: RR.danger },
    fumbleText: { color: '#FFD9D0', fontSize: 15, fontWeight: '900', textAlign: 'center' },
});
