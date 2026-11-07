// 🗿 The Final Seal. Everyone tumbled into a lower chamber. Each player has
// one tile and one clue about where it goes; only you can place your tile.
// Talk it through, fill every slot, push. The first team through claims.
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Group, RrfGameState, RrfTeam } from '../../../shared/types';
import { rivalOf } from '../logic/engine';
import { presentOf, rrfPlaceSeal, rrfPushSeal } from '../logic/game';
import Ruin, { TimerPill } from '../components/Ruin';
import { GoldButton } from '../components/Bits';
import { useServerNow } from '../../../shared/hooks/useServerNow';
import { CARVED, RR, TEAM, clock } from '../theme';

type Props = { group: Group; gs: RrfGameState; playerId: string; team: RrfTeam };

export default function RrfSealScreen({ group, gs, playerId, team }: Props) {
    const now = useServerNow();
    const seal = team.seal!;
    const present = presentOf(group);
    const nameOf = (id: string) => (id === playerId ? 'You' : group.players.find((p) => p.id === id)?.name ?? 'Someone');
    const mineTile = seal.tiles.find((t) => t.owner === playerId);
    // Tiles whose owner left can be placed by anyone.
    const canMove = (tileId: string) => {
        const t = seal.tiles.find((x) => x.id === tileId)!;
        return t.owner === playerId || !present.includes(t.owner);
    };
    const [picked, setPicked] = useState<string | null>(null);
    const holding = picked ?? mineTile?.id ?? null;
    const n = seal.tiles.length;
    const slotTile = (slot: number) => seal.tiles.find((t) => seal.placed[t.id] === slot);
    const allPlaced = Object.keys(seal.placed).length === n;
    const locked = now < seal.lockedUntil;
    const rival = gs.teams[rivalOf(team.id)];
    const rivalPlaced = Object.keys(rival.seal?.placed ?? {}).length;
    const left = gs.phaseEndsAt - now;
    const by = gs.interruptedBy ? TEAM[gs.interruptedBy] : null;
    const orphans = seal.tiles.filter((t) => !present.includes(t.owner));

    return (
        <Ruin
            kicker="THE FINAL SEAL"
            right={<TimerPill text={clock(left)} urgent={left < 15000} />}
            footer={
                <GoldButton
                    label={locked ? `Locked… ${Math.ceil((seal.lockedUntil - now) / 1000)} s` : allPlaced ? 'Push the seal' : `${n - Object.keys(seal.placed).length} tile${n - Object.keys(seal.placed).length === 1 ? '' : 's'} still to place`}
                    onPress={() => rrfPushSeal(group.id, playerId)}
                    disabled={!allPlaced || locked}
                />
            }
        >
            <Text style={styles.title}>Everyone tumbles down!</Text>
            <Text style={styles.sub}>
                {by ? `${by.name} shook the chest loose. ` : ''}A second seal blocks the treasure. Every hand must turn its stone: only you can place your tile, and only you know your clue. The first team through claims the chest.
            </Text>

            {mineTile && (
                <View style={styles.mine}>
                    <Text style={styles.mineTile}>{mineTile.emoji}</Text>
                    <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.mineLabel}>YOUR TILE · YOUR CLUE</Text>
                        <Text style={styles.mineClue}>“{mineTile.clue}”</Text>
                    </View>
                </View>
            )}

            <Text style={styles.label}>THE SEAL · tap a slot to put {holding && holding !== mineTile?.id ? 'that tile' : 'your tile'} there</Text>
            <View style={styles.slots}>
                {Array.from({ length: n }, (_, i) => {
                    const t = slotTile(i);
                    return (
                        <TouchableOpacity
                            key={i}
                            style={[styles.slot, t && styles.slotFull, t?.owner === playerId && styles.slotMine]}
                            onPress={() => {
                                if (t && canMove(t.id) && t.id === holding) rrfPlaceSeal(group.id, playerId, t.id, -1);
                                else if (holding && canMove(holding)) rrfPlaceSeal(group.id, playerId, holding, i);
                                setPicked(null);
                            }}
                        >
                            {t ? (
                                <>
                                    <Text style={styles.slotEmoji}>{t.emoji}</Text>
                                    <Text style={styles.slotName} numberOfLines={1}>
                                        {nameOf(t.owner)}
                                    </Text>
                                </>
                            ) : (
                                <Text style={styles.slotNum}>{i + 1}</Text>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>
            <Text style={styles.hint}>Tap your placed tile to take it back. Slot 1 is the first, slot {n} the last.</Text>

            <Text style={styles.label}>YOUR TEAM’S TILES</Text>
            <View style={{ gap: 6 }}>
                {seal.tiles.map((t) => (
                    <Text key={t.id} style={styles.teamTile}>
                        {t.emoji} {nameOf(t.owner)}
                        {seal.placed[t.id] !== undefined ? ` · slot ${seal.placed[t.id] + 1}` : ' · not placed'}
                    </Text>
                ))}
            </View>
            {orphans.length > 0 && (
                <View style={{ gap: 6 }}>
                    <Text style={styles.hint}>These players left. Anyone can place their tile (their clue is gone, so work it out):</Text>
                    <View style={styles.orphans}>
                        {orphans.map((t) => (
                            <TouchableOpacity key={t.id} style={[styles.orphan, picked === t.id && styles.orphanOn]} onPress={() => setPicked(picked === t.id ? null : t.id)}>
                                <Text style={styles.slotEmoji}>{t.emoji}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            )}
            {seal.wrong > 0 && <Text style={styles.wrong}>Wrong order {seal.wrong}×. Each wrong push locks the seal for 5 s.</Text>}
            <Text style={styles.rival}>
                {TEAM[rival.id].emoji} {TEAM[rival.id].name}: {rivalPlaced} of {rival.seal?.tiles.length ?? 0} tiles placed
                {rival.seal && rival.seal.wrong ? ` · ${rival.seal.wrong} wrong push${rival.seal.wrong === 1 ? '' : 'es'}` : ''}
            </Text>
            <Text style={styles.hint}>Nobody gets through in time? The team with more gems takes the treasure.</Text>
        </Ruin>
    );
}

const styles = StyleSheet.create({
    title: { color: RR.gold, fontSize: 28, fontWeight: '900', fontFamily: CARVED },
    sub: { color: RR.sand, fontSize: 14, lineHeight: 20 },
    mine: { flexDirection: 'row', gap: 14, alignItems: 'center', backgroundColor: RR.parchment, borderRadius: 18, padding: 14 },
    mineTile: { fontSize: 46 },
    mineLabel: { color: RR.inkMuted, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
    mineClue: { color: RR.ink, fontSize: 19, fontWeight: '900' },
    label: { color: RR.sandDim, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
    slots: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
    slot: { width: 64, height: 78, borderRadius: 14, borderWidth: 2, borderStyle: 'dashed', borderColor: RR.line, alignItems: 'center', justifyContent: 'center', backgroundColor: RR.bgDeep },
    slotFull: { borderStyle: 'solid', borderColor: RR.sandDim, backgroundColor: RR.panelHi },
    slotMine: { borderColor: RR.gold },
    slotEmoji: { fontSize: 30 },
    slotName: { color: RR.sandMuted, fontSize: 10, fontWeight: '800', maxWidth: 58 },
    slotNum: { color: RR.sandDim, fontSize: 18, fontWeight: '900' },
    hint: { color: RR.sandDim, fontSize: 12, textAlign: 'center' },
    teamTile: { color: RR.sand, fontSize: 14, fontWeight: '700' },
    orphans: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
    orphan: { width: 56, height: 56, borderRadius: 12, backgroundColor: RR.panel, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: RR.line },
    orphanOn: { borderColor: RR.gold },
    wrong: { color: RR.danger, fontWeight: '800', textAlign: 'center' },
    rival: { color: RR.sandMuted, fontSize: 13, fontWeight: '800', textAlign: 'center' },
});
