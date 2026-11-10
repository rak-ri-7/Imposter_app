// src/shared/components/ChatSheet.tsx
// 💬 The group chat, opened from the game menu. Newest messages at the
// bottom, quick one-tap replies, and the host can long-press a message to
// remove it.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import type { Group } from '../types';
import { CHAT_MAX_LEN, ChatMessage, deleteChatMessage, sendChatMessage } from '../firebase/chat';
import PixelAvatar from '../avatars/PixelAvatar';
import { avatarIdFor } from '../avatars/sprites';
import { display } from '../theme/fonts';
import { padBottom, useBottomInset } from "../hooks/useSafeBottom";

type Props = {
    visible: boolean;
    onClose: () => void;
    group: Group;
    playerId: string;
    messages: ChatMessage[];
    blocked: string | null; // the error code when the chat can't load
    onSeen: () => void;
    onRetry: () => void;
};

const QUICK = ['😂', '🔥', '👏', 'GG!', 'One more?', 'Ready!', 'Brb'];

const clock = (ms: number) => {
    const d = new Date(ms);
    const h = d.getHours();
    return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

export default function ChatSheet({ visible, onClose, group, playerId, messages, blocked, onSeen, onRetry }: Props) {
  const bottomInset = useBottomInset(); // clear of the phone's bottom bar
    const [draft, setDraft] = useState('');
    const [cooling, setCooling] = useState(false);
    const isHost = group.hostId === playerId;
    const me = group.players.find((p) => p.id === playerId);

    // Everything on screen counts as read while the sheet is open.
    useEffect(() => {
        if (visible) onSeen();
    }, [visible, messages.length]);
    // A listener that failed (e.g. before the rules were published) stays
    // dead, so try again each time the chat is opened.
    useEffect(() => {
        if (visible && blocked) onRetry();
    }, [visible]);

    const send = (text: string) => {
        if (cooling || !text.trim() || !me) return;
        setCooling(true);
        setTimeout(() => setCooling(false), 700); // a little brake on spamming
        sendChatMessage(group.id, { id: me.id, name: me.name, avatar: me.avatar }, text).catch(() =>
            Alert.alert('Not sent', 'That message didn’t go through. Check your connection and try again.')
        );
        if (text === draft) setDraft('');
    };

    const remove = (m: ChatMessage) => {
        if (!isHost) return;
        Alert.alert('Remove message?', `“${m.text.slice(0, 80)}” from ${m.name}`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => deleteChatMessage(group.id, m.id).catch(() => {}) },
        ]);
    };

    // Newest first for the upside-down list (keeps the bottom in view).
    const rows = useMemo(() => [...messages].reverse(), [messages]);
    const everyone = [...group.players, ...(group.benchedPlayers ?? [])];
    const avatarOf = (m: ChatMessage) => {
        const p = everyone.find((x) => x.id === m.playerId);
        return p ? avatarIdFor(p, group.players) : m.avatar;
    };

    const list = useRef<FlatList<ChatMessage>>(null);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <Pressable style={styles.dismiss} onPress={onClose} />
                <View style={[styles.sheet, padBottom(styles.sheet, bottomInset)]}>
                    <View style={styles.handle} />
                    <View style={styles.header}>
                        <Text style={styles.title}>💬 Group chat</Text>
                        <TouchableOpacity onPress={onClose} hitSlop={12}>
                            <Text style={styles.close}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    {blocked ? (
                        <View style={styles.empty}>
                            <Text style={styles.emptyTitle}>Chat can’t load</Text>
                            <Text style={styles.emptyText}>
                                {blocked === 'permission-denied'
                                    ? 'The Firestore rules don’t allow the chat yet. Publish the rules in hosting/firestore.rules in the Firebase console.'
                                    : blocked === 'failed-precondition'
                                      ? 'Firestore needs an index for the chat. Check the app’s log for the link to create it.'
                                      : 'Check your connection and reopen the chat.'}
                            </Text>
                            <Text style={styles.errCode}>Error: {blocked}</Text>
                            <TouchableOpacity style={styles.retry} onPress={onRetry}>
                                <Text style={styles.retryText}>Try again</Text>
                            </TouchableOpacity>
                        </View>
                    ) : rows.length === 0 ? (
                        // Shown outside the (inverted) list: inside it, Android
                        // flips it upside down AND mirror-image.
                        <View style={[styles.list, styles.empty]}>
                            <Text style={styles.emptyTitle}>No messages yet</Text>
                            <Text style={styles.emptyText}>Say hi, call the next game, or trash-talk the leader.</Text>
                        </View>
                    ) : (
                        <FlatList
                            ref={list}
                            data={rows}
                            inverted
                            keyExtractor={(m) => m.id}
                            style={styles.list}
                            contentContainerStyle={{ paddingVertical: 8 }}
                            keyboardShouldPersistTaps="handled"
                            renderItem={({ item, index }) => {
                                const mine = item.playerId === playerId;
                                // rows are newest-first: the one above on screen is index + 1
                                const above = rows[index + 1];
                                const startsRun = !above || above.playerId !== item.playerId || item.at - above.at > 5 * 60_000;
                                return (
                                    <Pressable onLongPress={() => remove(item)} delayLongPress={400} style={[styles.row, mine && styles.rowMine, startsRun && { marginTop: 10 }]}>
                                        {!mine && (
                                            <View style={styles.avatarSlot}>
                                                {startsRun && <PixelAvatar avatar={avatarOf(item)} playerId={item.playerId} size={30} />}
                                            </View>
                                        )}
                                        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleThem, item.pending && { opacity: 0.6 }]}>
                                            {!mine && startsRun && <Text style={styles.name}>{item.name}</Text>}
                                            <Text style={[styles.text, mine && styles.textMine]}>{item.text}</Text>
                                            <Text style={[styles.time, mine && styles.timeMine]}>{item.pending ? 'sending…' : clock(item.at)}</Text>
                                        </View>
                                    </Pressable>
                                );
                            }}
                        />
                    )}

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={styles.quickRow}>
                        {QUICK.map((q) => (
                            <TouchableOpacity key={q} style={styles.quick} onPress={() => send(q)} disabled={!!blocked || cooling}>
                                <Text style={styles.quickText}>{q}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <View style={styles.inputRow}>
                        <TextInput
                            style={styles.input}
                            value={draft}
                            onChangeText={setDraft}
                            placeholder="Message the group…"
                            placeholderTextColor="#9A9AAB"
                            maxLength={CHAT_MAX_LEN}
                            multiline
                            editable={!blocked}
                        />
                        <TouchableOpacity
                            style={[styles.send, (!draft.trim() || cooling || blocked) && styles.sendOff]}
                            onPress={() => send(draft)}
                            disabled={!draft.trim() || cooling || !!blocked}
                            accessibilityLabel="Send"
                        >
                            <Text style={styles.sendText}>➤</Text>
                        </TouchableOpacity>
                    </View>
                    {isHost && messages.length > 0 && <Text style={styles.hostHint}>Host: long-press a message to remove it</Text>}
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const NAVY = '#1A1A2E';
const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    dismiss: { flex: 1, minHeight: 60 },
    sheet: {
        height: '85%',
        backgroundColor: '#F7F7FA',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 14,
        paddingBottom: 18,
    },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#D5D5DE', marginTop: 10 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 4 },
    title: { fontSize: 18, ...display, color: NAVY },
    close: { fontSize: 18, color: '#888', fontWeight: '700' },
    list: { flex: 1 },
    empty: { alignItems: 'center', padding: 28, gap: 6 },
    emptyTitle: { color: NAVY, fontSize: 16, fontWeight: '800' },
    emptyText: { color: '#888', fontSize: 13, textAlign: 'center', lineHeight: 19 },
    errCode: { color: '#B0B0BC', fontSize: 11, marginTop: 4 },
    retry: { marginTop: 10, backgroundColor: NAVY, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 9 },
    retryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
    row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 3 },
    rowMine: { justifyContent: 'flex-end' },
    avatarSlot: { width: 30 },
    bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 12, paddingTop: 7, paddingBottom: 5 },
    bubbleThem: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#EAEAEE', borderBottomLeftRadius: 5 },
    bubbleMine: { backgroundColor: NAVY, borderBottomRightRadius: 5 },
    name: { color: '#B08A3E', fontSize: 12, fontWeight: '800', marginBottom: 2 },
    text: { color: NAVY, fontSize: 15, lineHeight: 20 },
    textMine: { color: '#fff' },
    time: { color: '#A0A0AE', fontSize: 10, alignSelf: 'flex-end', marginTop: 2 },
    timeMine: { color: '#9FA3C0' },
    quickRow: { flexDirection: 'row', gap: 6, paddingTop: 8, paddingBottom: 8 },
    quick: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E2EA', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
    quickText: { color: NAVY, fontSize: 13, fontWeight: '700' },
    inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    input: {
        flex: 1,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#E2E2EA',
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 10,
        fontSize: 15,
        color: NAVY,
        maxHeight: 110,
    },
    send: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#C9A45C', alignItems: 'center', justifyContent: 'center' },
    sendOff: { opacity: 0.4 },
    sendText: { color: '#121110', fontSize: 18, fontWeight: '900' },
    hostHint: { color: '#A0A0AE', fontSize: 11, textAlign: 'center', marginTop: 8 },
});
