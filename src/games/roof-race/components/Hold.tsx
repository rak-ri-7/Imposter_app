// ✋ Press-and-hold: claiming the chest, interrupting a claim, stealing.
// Every player on a team must hold together; this shows whose hands are
// down and how far the team's hold has got.
import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Vibration, AppState } from 'react-native';
import type { Group, RrfGameState, RrfHold, RrfTeamId } from '../../../shared/types';
import { CLAIM_HOLD_MS, INTERRUPT_COST, INTERRUPT_HOLD_MS, here, holdDoneAt, holdKind } from '../logic/engine';
import { presentOf, rrfHoldDown, rrfHoldUp } from '../logic/game';
import { getServerNow } from '../../../shared/firebase/time';
import { RR, TEAM } from '../theme';

type BtnProps = { group: Group; gs: RrfGameState; playerId: string; label: string; holdingLabel: string; color?: string; big?: boolean };

const RESEND_MS = 700;

// The button shows "holding" only once the server has the hold. While the
// finger is down and the server hasn't got it (a busy moment with the
// whole team pressing at once), the press is sent again; likewise a
// release the server missed.
export function HoldButton({ group, gs, playerId, label, holdingLabel, color = RR.gold, big = true }: BtnProps) {
    const [down, setDown] = useState(false);
    const downRef = useRef(false);
    const pressedAt = useRef(0);
    const confirmed = !!gs.holds[playerId];
    const canHold = holdKind(gs, playerId) !== null;

    const release = () => {
        if (!downRef.current) return;
        downRef.current = false;
        setDown(false);
        rrfHoldUp(group.id, playerId);
    };
    useEffect(() => {
        if (!down || confirmed || !canHold) return;
        const t = setInterval(() => {
            if (downRef.current) rrfHoldDown(group.id, playerId, pressedAt.current);
        }, RESEND_MS);
        return () => clearInterval(t);
    }, [down, confirmed, canHold]);
    useEffect(() => {
        if (down || !confirmed) return;
        const t = setInterval(() => rrfHoldUp(group.id, playerId), RESEND_MS);
        return () => clearInterval(t);
    }, [down, confirmed]);
    // Let go if the screen goes away or the app really goes to the
    // background (not for a moment's notification shade: 'inactive').
    useEffect(() => {
        const sub = AppState.addEventListener('change', (s) => {
            if (s === 'background') release();
        });
        return () => {
            sub.remove();
            release();
        };
    }, []);
    const lit = down && confirmed;
    return (
        <Pressable
            onPressIn={() => {
                downRef.current = true;
                pressedAt.current = getServerNow();
                setDown(true);
                Vibration.vibrate(30);
                rrfHoldDown(group.id, playerId, pressedAt.current);
            }}
            onPressOut={release}
            style={[styles.btn, big && styles.big, { borderColor: color, backgroundColor: lit ? color : RR.panel }]}
        >
            <Text style={styles.hand}>✋</Text>
            <Text style={[styles.btnText, { color: lit ? RR.goldInk : color }]}>{lit ? holdingLabel : down ? 'Pressing… keep holding' : label}</Text>
        </Pressable>
    );
}

// One team's hands, and a bar that fills while they hold together.
export function HoldMeter({ group, gs, team, kind, now, playerId }: { group: Group; gs: RrfGameState; team: RrfTeamId; kind: RrfHold['kind']; now: number; playerId: string }) {
    const present = presentOf(group);
    const people = here(gs.teams[team], present);
    const holding = people.filter((p) => gs.holds[p]?.kind === kind);
    const done = holdDoneAt(gs, team, present);
    const dur = kind === 'claim' ? CLAIM_HOLD_MS : INTERRUPT_HOLD_MS;
    const pct = done && done.kind === kind ? Math.min(1, Math.max(0, (now - (done.at - dur)) / dur)) : 0;
    const T = TEAM[team];
    const nameOf = (id: string) => (id === playerId ? 'You' : group.players.find((p) => p.id === id)?.name ?? '?');
    return (
        <View style={[styles.meter, { borderColor: T.color }]}>
            <Text style={[styles.meterTitle, { color: T.color }]}>
                {T.emoji} {T.name}: {holding.length} of {people.length} hands {kind === 'interrupt' ? 'shaking' : 'on the chest'}
            </Text>
            <View style={styles.hands}>
                {people.map((p) => (
                    <View key={p} style={[styles.handChip, gs.holds[p]?.kind === kind && { backgroundColor: T.color }]}>
                        <Text style={[styles.handName, gs.holds[p]?.kind === kind && { color: RR.goldInk }]} numberOfLines={1}>
                            {gs.holds[p]?.kind === kind ? '✋ ' : ''}
                            {nameOf(p)}
                        </Text>
                    </View>
                ))}
            </View>
            <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: T.color }]} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    btn: { borderWidth: 3, borderRadius: 24, paddingVertical: 18, alignItems: 'center', gap: 4 },
    big: { paddingVertical: 34 },
    hand: { fontSize: 40 },
    btnText: { fontSize: 18, fontWeight: '900', textAlign: 'center' },
    meter: { borderWidth: 1.5, borderRadius: 16, padding: 12, gap: 8, backgroundColor: RR.panel },
    meterTitle: { fontSize: 14, fontWeight: '900' },
    hands: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    handChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: RR.panelHi },
    handName: { color: RR.sand, fontSize: 13, fontWeight: '800' },
    track: { height: 10, borderRadius: 5, backgroundColor: RR.bgDeep, overflow: 'hidden' },
    fill: { height: 10, borderRadius: 5 },
});

// Shown on the door screens while the other team is at the chest: hold
// together to knock them down (if you can), or race to your own vault.
export function RivalClaimBanner({ group, gs, playerId, team, now }: { group: Group; gs: RrfGameState; playerId: string; team: RrfTeamId; now: number }) {
    const rivalId: RrfTeamId = team === 'tiger' ? 'cobra' : 'tiger';
    const rival = gs.teams[rivalId];
    const mine = gs.teams[team];
    if (gs.phase !== 'run' || rival.stage !== 'vault' || mine.stage === 'vault') return null;
    const R = TEAM[rivalId];
    const can = !mine.interruptUsed && mine.gems >= INTERRUPT_COST && (mine.stage === 'door' || mine.stage === 'between');
    return (
        <View style={banner.box}>
            <Text style={banner.title}>
                {R.emoji} {R.name} opened their vault!
            </Text>
            <HoldMeter group={group} gs={gs} team={rivalId} kind="claim" now={now} playerId={playerId} />
            {can ? (
                <>
                    <Text style={banner.text}>
                        All of you hold together for {INTERRUPT_HOLD_MS / 1000} s to knock them off the chest (costs {INTERRUPT_COST} 💎). Once per expedition.
                    </Text>
                    <HoldMeter group={group} gs={gs} team={team} kind="interrupt" now={now} playerId={playerId} />
                    <HoldButton group={group} gs={gs} playerId={playerId} label="Hold to shake them!" holdingLabel="Holding… don’t let go!" color={RR.danger} big={false} />
                </>
            ) : (
                <Text style={banner.text}>
                    {mine.interruptUsed
                        ? 'You’ve used your interrupt. Race to your own vault!'
                        : `You need ${INTERRUPT_COST} 💎 to stop them. Race to your own vault!`}
                </Text>
            )}
        </View>
    );
}

const banner = StyleSheet.create({
    box: { backgroundColor: RR.dangerDeep, borderRadius: 18, padding: 12, gap: 10, borderWidth: 2, borderColor: RR.danger },
    title: { color: '#FFB199', fontSize: 18, fontWeight: '900' },
    text: { color: '#FFD9D0', fontSize: 13, fontWeight: '700', lineHeight: 19 },
});
