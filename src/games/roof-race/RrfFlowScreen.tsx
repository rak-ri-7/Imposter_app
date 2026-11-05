// src/games/roof-race/RrfFlowScreen.tsx
// 🏛️ Race Before the Roof Falls: picks the screen for where the game (and
// your team) is, and keeps the timed steps moving (useRrfTicker).
import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, BackHandler, Alert } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../../App';
import { useGroup } from '../../shared/hooks/useGroup';
import { useHostFailover } from '../../shared/hooks/useHostFailover';
import { returnToMenu } from '../../shared/firebase/groups';
import { teamOf } from './logic/engine';
import { endRrfEarly, isRrfState } from './logic/game';
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

    useEffect(() => {
        if (group?.currentGame === 'menu') navigation.replace('GameMenu', { groupId, playerId });
    }, [group?.currentGame]);

    // ── Android back: the host can end the game ──────────────────────
    const alertOpen = useRef(false);
    useEffect(() => {
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            if (!group || alertOpen.current) return true;
            alertOpen.current = true;
            const done = () => {
                alertOpen.current = false;
            };
            if (isHost && gs && gs.phase !== 'over') {
                Alert.alert(
                    'End Race Before the Roof Falls?',
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
