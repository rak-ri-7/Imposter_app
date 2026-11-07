// src/games/roof-race/RrfFlowScreen.tsx
// 🏛️ Race Before the Roof Falls: picks the screen for where the game (and
// your team) is, and keeps the timed steps moving (useRrfTicker).
import { useEffect, useRef, type ReactNode } from 'react';
import { View, Text, StyleSheet, BackHandler, Alert } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../../App';
import { useGroup } from '../../shared/hooks/useGroup';
import { registerGameCloser, useMinimizableGame } from '../../shared/hooks/useMinimizableGame';
import { useHostFailover } from '../../shared/hooks/useHostFailover';
import { returnToMenu } from '../../shared/firebase/groups';
import { teamOf } from './logic/engine';
import { endRrfEarly, isRrfState, rrfSetAway } from './logic/game';
import { usePresence } from '../../shared/hooks/usePresence';
import DroppedBanner from '../../shared/components/DroppedBanner';
import { useRrfTicker } from './useRrfTicker';
import RrfLobbyScreen from './screens/RrfLobbyScreen';
import RrfIntroScreen from './screens/RrfIntroScreen';
import RrfDoorScreen from './screens/RrfDoorScreen';
import RrfGuideScreen from './screens/RrfGuideScreen';
import RrfBetweenScreen from './screens/RrfBetweenScreen';
import { RrfBuriedScreen, RrfFallingScreen } from './screens/RrfFallingScreen';
import RrfChestScreen from './screens/RrfChestScreen';
import RrfSealScreen from './screens/RrfSealScreen';
import { RrfExpeditionEndScreen, RrfOverScreen } from './screens/RrfResultScreens';
import RrfWatchScreen from './screens/RrfWatchScreen';
import { RR } from './theme';

// Out of check-ins this much longer than the usual "away" before the game
// carries on without them.
const AWAY_CONFIRM_MS = 5000;

type Props = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'RrfFlow'>;
    route: RouteProp<RootStackParamList, 'RrfFlow'>;
};

export default function RrfFlowScreen({ navigation, route }: Props) {
    const { groupId, playerId } = route.params;
    const { group, loading } = useGroup(groupId);
    useHostFailover(group, playerId);
    const gs = group && isRrfState(group.gameState) ? group.gameState : null;
    const isHost = group?.hostId === playerId;
    useRrfTicker(group, gs, isHost);

    // ── Dropped phones ───────────────────────────────────────────────
    // Every phone checks in. The host marks a player away once they've been
    // gone a few seconds longer than usual (so a quick look at another app
    // doesn't cost anyone the key), and clears it the moment they're back.
    const playing = gs && gs.phase !== 'over' ? [...gs.teams.tiger.members, ...gs.teams.cobra.members] : [];
    const presence = usePresence(groupId, playerId, playing);
    const awayNow = useRef<string[]>([]);
    const awaySince = useRef<Record<string, number>>({});
    awayNow.current = presence.awayIds;
    const storedAway = (gs?.away ?? []).join();
    useEffect(() => {
        if (!isHost || !gs || gs.phase === 'over') return;
        const since = awaySince.current;
        let lastSent = '';
        const t = setInterval(() => {
            const now = Date.now();
            for (const id of Object.keys(since)) if (!awayNow.current.includes(id)) delete since[id];
            for (const id of awayNow.current) since[id] ??= now;
            const confirmed = Object.keys(since).filter((id) => now - since[id] >= AWAY_CONFIRM_MS).sort();
            const want = confirmed.join();
            if (want !== storedAway && want !== lastSent) {
                lastSent = want;
                rrfSetAway(groupId, playerId, confirmed);
            }
        }, 1000);
        return () => clearInterval(t);
    }, [isHost, groupId, storedAway, gs?.phase === 'over', !!gs]);

    // Back / swipe minimises this game; game over takes it away.
  useMinimizableGame(navigation, route, group, 'roof-race', groupId, playerId);

    // ── Android back: the host can end the game ──────────────────────
    const alertOpen = useRef(false);
    useEffect(() => {
        const sub = registerGameCloser(groupId, () => {
            if (!group || alertOpen.current) return true;
            alertOpen.current = true;
            const done = () => {
                alertOpen.current = false;
            };
            if (isHost && gs && gs.phase !== 'over') {
                Alert.alert(
                    'End the race?',
                    'End now and rank the teams (the expedition in progress doesn’t count), or quit with no points.',
                    [
                        { text: 'Keep playing', style: 'cancel', onPress: done },
                        {
                            text: 'End & rank',
                            onPress: async () => {
                                done();
                                await endRrfEarly(group.id, playerId);
                            },
                        },
                        {
                            text: 'Quit, no points',
                            style: 'destructive',
                            onPress: async () => {
                                done();
                                await returnToMenu(group.id);
                            },
                        },
                    ],
                    { cancelable: true, onDismiss: done }
                );
            } else if (isHost && !gs) {
                done();
                returnToMenu(group.id);
            } else {
                Alert.alert('Game in progress', 'Only the host can end the game.', [{ text: 'OK', onPress: done }]);
            }
            return true;
        });
        return () => sub.remove();
    }, [group?.id, isHost, gs?.phase]);

    if (loading || !group) return <Note text="Loading…" />;
    if (group.currentGame === 'menu') return null;
    if (!gs) return <RrfLobbyScreen group={group} playerId={playerId} onEditTeams={() => navigation.navigate('TeamSetup', { groupId, playerId })} />;

    const team = teamOf(gs, playerId);
    const screen = ((): ReactNode => {
        if (gs.phase === 'over') return <RrfOverScreen group={group} gs={gs} playerId={playerId} />;
        if (gs.phase === 'expeditionEnd') return <RrfExpeditionEndScreen group={group} gs={gs} playerId={playerId} />;
        if (gs.phase === 'intro') return <RrfIntroScreen group={group} gs={gs} playerId={playerId} />;
        if (!team) return <RrfWatchScreen group={group} gs={gs} playerId={playerId} />;
        const props = { group, gs, playerId, team };
        if (gs.phase === 'seal') return team.seal ? <RrfSealScreen {...props} /> : <Note text="Everyone tumbles down…" />;
        if (gs.phase === 'finalClaim') return <RrfChestScreen {...props} />;
        switch (team.stage) {
            case 'door':
                if (!team.puzzle) return <Note text="Opening the door…" />;
                return team.keyHolder === playerId ? <RrfDoorScreen {...props} /> : <RrfGuideScreen {...props} />;
            case 'between':
                return <RrfBetweenScreen {...props} />;
            case 'falling':
                return <RrfFallingScreen {...props} />;
            case 'vault':
                return <RrfChestScreen {...props} />;
            case 'buried':
                return <RrfBuriedScreen {...props} />;
            default:
                return null;
        }
    })();
    const awayNames = (gs.away ?? []).filter((id) => id !== playerId).map((id) => group.players.find((p) => p.id === id)?.name ?? 'Someone');
    return (
        <View style={{ flex: 1 }}>
            {screen}
            <DroppedBanner names={awayNames} meOffline={presence.meOffline} note="The key and their clues pass to teammates, and the chest won’t wait for them." />
        </View>
    );
}

function Note({ text }: { text: string }) {
    return (
        <View style={styles.center}>
            <Text style={styles.note}>{text}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, backgroundColor: RR.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
    note: { color: RR.sand, fontSize: 16, textAlign: 'center' },
});
