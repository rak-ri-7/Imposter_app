// src/shared/components/GameInfoSheet.tsx
// ℹ️ A game's details before anyone commits: its poster, who it suits, how
// long it takes and how it works. The host starts it from here; everyone
// else can read up while they wait, or ask the host for it in the chat.
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { Group } from '../types';
import { GameDefinition, KIND_LABEL, fitFor, minutesLabel, playersLabel } from '../../games/registry';
import { POSTER_BY_GAME } from '../assets/posters';
import { sendChatMessage } from '../firebase/chat';
import StepSlides from './StepSlides';
import { display } from '../theme/fonts';

type Props = {
    game: GameDefinition | null;
    onClose: () => void;
    group: Group;
    playerId: string;
    onPlay: (game: GameDefinition) => void;
};

export default function GameInfoSheet({ game, onClose, group, playerId, onPlay }: Props) {
    const [asked, setAsked] = useState<string | null>(null);
    if (!game) return null;
    const isHost = group.hostId === playerId;
    const host = group.players.find((p) => p.id === group.hostId);
    const me = group.players.find((p) => p.id === playerId);
    const n = group.players.length;
    const fit = fitFor(game, n);
    const fitLine =
        fit === 'short'
            ? `Needs ${game.minPlayers}+ players. You have ${n}, so invite ${game.minPlayers - n} more.`
            : fit === 'over'
              ? `Up to ${game.maxPlayers} players. You have ${n}: the host picks who plays.`
              : fit === 'best'
                ? `Great for your ${n} players.`
                : `Works with ${n}. Best with ${game.bestFor[0]}–${game.bestFor[1]}.`;
    const poster = POSTER_BY_GAME[game.id];
    const canStart = isHost && fit !== 'short' && game.available !== false;

    const ask = () => {
        if (!me || asked === game.id) return;
        setAsked(game.id);
        sendChatMessage(group.id, { id: me.id, name: me.name, avatar: me.avatar }, `🙋 Can we play ${game.name}?`).catch(() => setAsked(null));
    };

    return (
        <Modal visible transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <Pressable style={styles.dismiss} onPress={onClose} />
                <View style={styles.sheet}>
                    <ScrollView bounces={false} contentContainerStyle={{ paddingBottom: 12 }}>
                        <View style={styles.banner}>
                            {poster ? (
                                <Image source={poster} style={styles.poster} resizeMode="cover" />
                            ) : (
                                <View style={[styles.poster, { backgroundColor: '#1A1A2E' }]} />
                            )}
                            <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
                                <Defs>
                                    <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
                                        <Stop offset="0.35" stopColor="#0B0C0E" stopOpacity="0" />
                                        <Stop offset="1" stopColor="#0B0C0E" stopOpacity="0.95" />
                                    </LinearGradient>
                                </Defs>
                                <Rect x="0" y="0" width="100%" height="100%" fill="url(#fade)" />
                            </Svg>
                            <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={10}>
                                <Text style={styles.closeText}>✕</Text>
                            </TouchableOpacity>
                            <View style={styles.bannerText}>
                                {game.isNew && <Text style={styles.newTag}>NEW</Text>}
                                <Text style={styles.name}>
                                    {game.emoji} {game.name}
                                </Text>
                                <Text style={styles.desc}>{game.description}</Text>
                            </View>
                        </View>

                        <View style={styles.body}>
                            <View style={styles.facts}>
                                <Fact top="Players" value={playersLabel(game)} />
                                <Fact top="Best with" value={`${game.bestFor[0]}–${game.bestFor[1]}`} />
                                <Fact top="Takes" value={minutesLabel(game)} />
                            </View>
                            <View style={styles.tags}>
                                <Text style={styles.tag}>{KIND_LABEL[game.kind]}</Text>
                                {game.tags.map((t) => (
                                    <Text key={t} style={styles.tag}>
                                        {t}
                                    </Text>
                                ))}
                            </View>

                            <View style={[styles.fit, fit === 'best' && styles.fitBest, fit === 'short' && styles.fitShort]}>
                                <Text style={styles.fitText}>
                                    {fit === 'best' ? '⭐ ' : fit === 'short' ? '⚠️ ' : '👥 '}
                                    {fitLine}
                                </Text>
                            </View>

                            {game.teamPlay && (
                                <View style={styles.teamNote}>
                                    <Text style={styles.teamNoteText}>
                                        👥 {game.teamPlay.need === 'required' ? 'Team game' : 'Team mode'}: {game.teamPlay.note}
                                        {group.teamsEnabled && group.teams?.length ? ` Your teams: ${group.teams.map((t) => t.name).join(', ')}.` : ''}
                                    </Text>
                                </View>
                            )}

                            <Text style={styles.label}>HOW IT WORKS</Text>
                            <StepSlides
                                game={game.id}
                                colors={{ card: '#FFFFFF', text: NAVY, muted: '#8A8A99', accent: NAVY, numberText: '#FFFFFF', frame: '#E2E2EA' }}
                            />
                            <Text style={styles.more}>The full rules and settings are on the game’s own start screen.</Text>
                        </View>
                    </ScrollView>

                    <View style={styles.footer}>
                        {isHost ? (
                            <TouchableOpacity style={[styles.play, !canStart && styles.playOff]} disabled={!canStart} onPress={() => onPlay(game)}>
                                <Text style={styles.playText}>{fit === 'short' ? `Needs ${game.minPlayers}+ players` : `Play ${game.name} →`}</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity style={[styles.play, styles.ask, asked === game.id && styles.playOff]} disabled={asked === game.id} onPress={ask}>
                                <Text style={[styles.playText, { color: '#fff' }]}>
                                    {asked === game.id ? `✓ Asked ${host?.name ?? 'the host'} in the chat` : `🙋 Ask ${host?.name ?? 'the host'} to play this`}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>
        </Modal>
    );
}

function Fact({ top, value }: { top: string; value: string }) {
    return (
        <View style={styles.fact}>
            <Text style={styles.factTop}>{top}</Text>
            <Text style={styles.factValue}>{value}</Text>
        </View>
    );
}

const NAVY = '#1A1A2E';
const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
    dismiss: { flex: 1, minHeight: 50 },
    sheet: { maxHeight: '92%', backgroundColor: '#F7F7FA', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
    banner: { height: 230, justifyContent: 'flex-end' },
    poster: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
    closeBtn: { position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
    closeText: { color: '#fff', fontSize: 15, fontWeight: '800' },
    bannerText: { padding: 18, gap: 4 },
    newTag: { alignSelf: 'flex-start', backgroundColor: '#C9A45C', color: '#121110', fontSize: 11, fontWeight: '900', letterSpacing: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
    name: { color: '#fff', fontSize: 24, ...display },
    desc: { color: '#D9D6CF', fontSize: 14 },
    body: { padding: 18, paddingTop: 14 },
    facts: { flexDirection: 'row', gap: 8 },
    fact: { flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#EAEAEE', paddingVertical: 10, alignItems: 'center' },
    factTop: { color: '#999', fontSize: 11, fontWeight: '700' },
    factValue: { color: NAVY, fontSize: 16, fontWeight: '900', marginTop: 2 },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
    tag: { backgroundColor: '#ECECF3', color: NAVY, fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' },
    fit: { marginTop: 12, backgroundColor: '#ECECF3', borderRadius: 12, padding: 12 },
    fitBest: { backgroundColor: '#E3F5EA' },
    fitShort: { backgroundColor: '#FDEAEA' },
    fitText: { color: NAVY, fontSize: 14, fontWeight: '700' },
    teamNote: { marginTop: 8, backgroundColor: '#EEF2FB', borderRadius: 12, padding: 12 },
    teamNoteText: { color: NAVY, fontSize: 13, lineHeight: 19 },
    label: { color: '#888', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginTop: 18, marginBottom: 8 },
    step: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: NAVY, color: '#fff', fontSize: 12, fontWeight: '900', textAlign: 'center', lineHeight: 22, overflow: 'hidden' },
    stepText: { flex: 1, color: NAVY, fontSize: 14, lineHeight: 20 },
    more: { color: '#999', fontSize: 12, marginTop: 10 },
    footer: { padding: 14, paddingBottom: 24, borderTopWidth: 1, borderTopColor: '#EAEAEE', backgroundColor: '#F7F7FA' },
    play: { backgroundColor: '#C9A45C', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
    playOff: { opacity: 0.45 },
    ask: { backgroundColor: NAVY },
    playText: { color: '#121110', fontSize: 16, ...display },
});
