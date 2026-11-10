// src/shared/components/ProfileSheet.tsx
// 👤 "You": opened from your avatar at the top of the game menu. Change your
// avatar and the name you go by here, set the real name the all-time board
// uses, switch sounds on or off, or leave the group.
import { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import type { Group } from '../types';
import PixelAvatar from '../avatars/PixelAvatar';
import AvatarPicker from '../avatars/AvatarPicker';
import { avatarIdFor, avatarById } from '../avatars/sprites';
import { setPlayerAvatar, setPlayerName } from '../firebase/groups';
import { saveAvatar, savePlayerName, saveSession } from '../utils/session';
import { isMuted, setMuted } from '../audio/sounds';
import { display } from '../theme/fonts';
import { padBottom, useBottomInset } from "../hooks/useSafeBottom";

type Props = {
    visible: boolean;
    onClose: () => void;
    group: Group;
    playerId: string;
    realName: string;
    onSaveRealName: (name: string) => Promise<boolean>;
    onLeave: () => void;
};

export default function ProfileSheet({ visible, onClose, group, playerId, realName, onSaveRealName, onLeave }: Props) {
  const bottomInset = useBottomInset(); // clear of the phone's bottom bar
    const me = group.players.find((p) => p.id === playerId) ?? group.benchedPlayers?.find((p) => p.id === playerId);
    const isHost = group.hostId === playerId;
    const [picking, setPicking] = useState(false);
    const [name, setName] = useState(me?.name ?? '');
    const [real, setReal] = useState(realName);
    const [busy, setBusy] = useState<null | 'name' | 'real'>(null);
    const [sounds, setSounds] = useState(!isMuted());

    // Fresh values each time it opens.
    useEffect(() => {
        if (!visible) return;
        setName(me?.name ?? '');
        setReal(realName);
        setSounds(!isMuted());
    }, [visible]);

    const taken = useMemo(() => {
        const t: Record<string, string> = {};
        for (const p of [...group.players, ...(group.benchedPlayers ?? [])]) if (p.avatar && p.id !== playerId) t[p.avatar] = p.name;
        return t;
    }, [group.players, group.benchedPlayers, playerId]);

    if (!me) return null;
    const avatar = avatarIdFor(me, group.players);
    const nameChanged = name.trim().replace(/\s+/g, ' ') !== me.name;
    const realChanged = real.trim().replace(/\s+/g, ' ') !== realName;

    const pick = async (id: string) => {
        setPicking(false);
        saveAvatar(id);
        const ok = await setPlayerAvatar(group.id, playerId, id).catch(() => false);
        if (!ok) Alert.alert('Just taken', 'Someone else picked that one a moment ago. Choose another.');
    };

    const saveName = async () => {
        if (busy || !nameChanged) return;
        setBusy('name');
        try {
            const problem = await setPlayerName(group.id, playerId, name);
            if (problem) return Alert.alert('Can’t use that name', problem);
            const clean = name.trim().replace(/\s+/g, ' ');
            setName(clean);
            savePlayerName(clean);
            saveSession(group.id, playerId, clean);
        } catch {
            Alert.alert('Not saved', 'Check your connection and try again.');
        } finally {
            setBusy(null);
        }
    };

    const saveReal = async () => {
        if (busy || !realChanged) return;
        setBusy('real');
        try {
            if (await onSaveRealName(real)) setReal(real.trim().replace(/\s+/g, ' '));
        } finally {
            setBusy(null);
        }
    };

    const toggleSounds = (on: boolean) => {
        setSounds(on);
        setMuted(!on);
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <Pressable style={styles.dismiss} onPress={onClose} />
                <View style={[styles.sheet, padBottom(styles.sheet, bottomInset)]}>
                    <View style={styles.handle} />
                    <View style={styles.header}>
                        <Text style={styles.title}>👤 You</Text>
                        <TouchableOpacity onPress={onClose} hitSlop={12}>
                            <Text style={styles.close}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
                        <View style={styles.hero}>
                            <TouchableOpacity onPress={() => setPicking(true)} accessibilityLabel="Change your avatar">
                                <PixelAvatar avatar={avatar} size={96} />
                                <View style={styles.editBadge}>
                                    <Text style={styles.editBadgeText}>✎</Text>
                                </View>
                            </TouchableOpacity>
                            <Text style={styles.heroName}>{me.name}</Text>
                            <Text style={styles.heroSub}>
                                {isHost ? '👑 Host · ' : ''}
                                {avatarById(me.avatar)?.name ?? 'Tap to pick an avatar'} · {group.scores?.[playerId] ?? 0} pts this session
                            </Text>
                        </View>

                        <Text style={styles.label}>YOUR NAME IN THIS GROUP</Text>
                        <View style={styles.inputRow}>
                            <TextInput
                                style={styles.input}
                                value={name}
                                onChangeText={setName}
                                maxLength={16}
                                placeholder="Your name"
                                placeholderTextColor="#AAA"
                                returnKeyType="done"
                                onSubmitEditing={saveName}
                            />
                            <TouchableOpacity style={[styles.save, (!nameChanged || !!busy) && styles.saveOff]} onPress={saveName} disabled={!nameChanged || !!busy}>
                                <Text style={styles.saveText}>{busy === 'name' ? '…' : 'Save'}</Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.label}>REAL NAME (ALL-TIME BOARD)</Text>
                        <View style={styles.inputRow}>
                            <TextInput
                                style={styles.input}
                                value={real}
                                onChangeText={setReal}
                                maxLength={30}
                                placeholder="e.g. Rakesh"
                                placeholderTextColor="#AAA"
                                autoCapitalize="words"
                                returnKeyType="done"
                                onSubmitEditing={saveReal}
                            />
                            <TouchableOpacity style={[styles.save, (!realChanged || !!busy) && styles.saveOff]} onPress={saveReal} disabled={!realChanged || !!busy}>
                                <Text style={styles.saveText}>{busy === 'real' ? '…' : 'Save'}</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.help}>
                            Whatever name you play under, this phone’s points go to your real name on the 🌍 All-time board. Use the same one on every phone. Leave it empty to stay off the board.
                        </Text>

                        <View style={styles.switchRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.switchTitle}>🔊 Sounds</Text>
                                <Text style={styles.switchSub}>Ticks, booms and jump-scares on this phone</Text>
                            </View>
                            <Switch value={sounds} onValueChange={toggleSounds} trackColor={{ true: '#C9A45C', false: '#D5D5DE' }} thumbColor="#fff" />
                        </View>

                        <TouchableOpacity style={styles.leave} onPress={onLeave}>
                            <Text style={styles.leaveText}>Leave group</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
            <AvatarPicker visible={picking} selected={me.avatar} taken={taken} onPick={pick} onClose={() => setPicking(false)} />
        </Modal>
    );
}

const NAVY = '#1A1A2E';
const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    dismiss: { flex: 1, minHeight: 60 },
    sheet: {
        maxHeight: '90%',
        backgroundColor: '#F7F7FA',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 18,
        paddingBottom: 24,
    },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#D5D5DE', marginTop: 10 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
    title: { fontSize: 18, ...display, color: NAVY },
    close: { fontSize: 18, color: '#888', fontWeight: '700' },
    hero: { alignItems: 'center', gap: 4, marginBottom: 18 },
    editBadge: {
        position: 'absolute',
        right: -6,
        bottom: -6,
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: '#C9A45C',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        borderColor: '#F7F7FA',
    },
    editBadgeText: { color: '#121110', fontSize: 14, fontWeight: '900' },
    heroName: { color: NAVY, fontSize: 22, fontWeight: '900', marginTop: 10 },
    heroSub: { color: '#888', fontSize: 13 },
    label: { color: '#888', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginTop: 12, marginBottom: 6 },
    inputRow: { flexDirection: 'row', gap: 8 },
    input: {
        flex: 1,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#E2E2EA',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 16,
        color: NAVY,
    },
    save: { backgroundColor: NAVY, borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' },
    saveOff: { opacity: 0.3 },
    saveText: { color: '#fff', fontWeight: '800', fontSize: 14 },
    help: { color: '#999', fontSize: 12, lineHeight: 17, marginTop: 6 },
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#E2E2EA',
        borderRadius: 14,
        padding: 14,
        marginTop: 20,
        gap: 10,
    },
    switchTitle: { color: NAVY, fontSize: 15, fontWeight: '800' },
    switchSub: { color: '#999', fontSize: 12, marginTop: 2 },
    leave: { marginTop: 20, borderRadius: 14, borderWidth: 1.5, borderColor: '#F3C4C8', paddingVertical: 14, alignItems: 'center' },
    leaveText: { color: '#E63946', fontSize: 15, fontWeight: '800' },
});
