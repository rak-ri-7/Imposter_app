// src/shared/hooks/useChat.ts
// The group chat's messages, plus how many arrived since you last looked
// (remembered on this phone, per group).
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage, listenToChat } from '../firebase/chat';

const readKey = (groupId: string) => `chatRead:${groupId}`;

export const useChat = (groupId: string, playerId: string) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    // Why the chat can't load (a Firestore error code), or null when it's fine.
    const [blocked, setBlocked] = useState<string | null>(null);
    const [lastRead, setLastRead] = useState<number | null>(null);
    const [attempt, setAttempt] = useState(0); // bumped to listen again
    const retry = useCallback(() => setAttempt((n) => n + 1), []);

    useEffect(() => {
        AsyncStorage.getItem(readKey(groupId))
            .then((v) => setLastRead(v ? Number(v) || 0 : 0))
            .catch(() => setLastRead(0));
        return listenToChat(
            groupId,
            (m) => {
                setBlocked(null);
                setMessages(m);
            },
            (e) => {
                const code = (e as { code?: string })?.code ?? String(e);
                console.warn('[chat] listen failed:', code, e);
                setBlocked(code);
            }
        );
    }, [groupId, attempt]);

    const markRead = useCallback(() => {
        const newest = messages.length ? messages[messages.length - 1].at : 0;
        const at = Math.max(newest, lastRead ?? 0);
        if (at === lastRead) return;
        setLastRead(at);
        AsyncStorage.setItem(readKey(groupId), String(at)).catch(() => {});
    }, [messages, lastRead, groupId]);

    const unread =
        lastRead === null ? 0 : messages.filter((m) => m.playerId !== playerId && !m.pending && m.at > lastRead).length;

    return { messages, unread, markRead, blocked, retry };
};
