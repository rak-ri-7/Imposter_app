// src/shared/firebase/chat.ts
// The group chat. Each message is its own small document at
// groups/{groupId}/messages/{id}, outside the group document, so chatting
// never collides with game writes and the group document stays small.
//
// Firestore rules need to allow this path (see the note in the chat sheet
// for the snippet). `expireAt` lets a TTL policy on the "messages"
// collection group clear old chats away with their groups.
import {
    Timestamp,
    addDoc,
    collection,
    deleteDoc,
    doc,
    limitToLast,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

export const CHAT_MAX_LEN = 300;
export const CHAT_KEEP = 100; // how many recent messages the app loads
const CHAT_TTL_MS = 2 * 24 * 60 * 60 * 1000;

export type ChatMessage = {
    id: string;
    playerId: string;
    name: string;
    avatar?: string;
    text: string;
    at: number; // server time, ms (an estimate until the server confirms)
    pending: boolean; // not on the server yet
};

export const sendChatMessage = (
    groupId: string,
    from: { id: string; name: string; avatar?: string },
    text: string
): Promise<unknown> => {
    const clean = text.replace(/\s+\n/g, '\n').trim().slice(0, CHAT_MAX_LEN);
    if (!clean) return Promise.resolve();
    return addDoc(collection(db, 'groups', groupId, 'messages'), {
        playerId: from.id,
        name: from.name,
        ...(from.avatar ? { avatar: from.avatar } : {}),
        text: clean,
        at: serverTimestamp(),
        expireAt: Timestamp.fromMillis(Date.now() + CHAT_TTL_MS),
    });
};

// The host can remove a message.
export const deleteChatMessage = (groupId: string, messageId: string) =>
    deleteDoc(doc(db, 'groups', groupId, 'messages', messageId));

export const listenToChat = (
    groupId: string,
    callback: (messages: ChatMessage[]) => void,
    onError?: (e: Error) => void
): (() => void) =>
    onSnapshot(
        query(collection(db, 'groups', groupId, 'messages'), orderBy('at'), limitToLast(CHAT_KEEP)),
        { includeMetadataChanges: true },
        (snap) => {
            const out: ChatMessage[] = [];
            snap.forEach((d) => {
                const m = d.data({ serverTimestamps: 'estimate' });
                const at = m.at && typeof m.at.toMillis === 'function' ? m.at.toMillis() : Date.now();
                out.push({
                    id: d.id,
                    playerId: String(m.playerId ?? ''),
                    name: String(m.name ?? 'Someone'),
                    avatar: typeof m.avatar === 'string' ? m.avatar : undefined,
                    text: String(m.text ?? ''),
                    at,
                    pending: d.metadata.hasPendingWrites,
                });
            });
            callback(out);
        },
        (e) => onError?.(e)
    );
