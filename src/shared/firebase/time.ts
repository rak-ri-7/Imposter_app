// src/shared/firebase/time.ts
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from './config';

let cachedOffsetMs = 0;
let synced = false;

// Compares this device's local clock against Firestore's server clock by
// round-tripping through a throwaway field on the group's own document
// (which every client already has write access to, unlike a new top-level
// collection). getServerNow() then corrects for the measured difference on
// every subsequent call.
export const syncServerTimeOffset = async (groupId: string): Promise<void> => {
    try {
        const ref = doc(db, 'groups', groupId);
        const localBefore = Date.now();
        await updateDoc(ref, { _timeSyncPing: serverTimestamp() });
        const snap = await getDoc(ref);
        const localAfter = Date.now();
        const serverMs = snap.data()?._timeSyncPing?.toMillis?.();
        if (serverMs) {
            const localMid = (localBefore + localAfter) / 2;
            cachedOffsetMs = serverMs - localMid;
        }
        synced = true;
    } catch (e) {
        console.warn('time sync failed, falling back to local clock', e);
        synced = true;
    }
};

export const getServerNow = (): number => Date.now() + cachedOffsetMs;

export const isTimeSynced = (): boolean => synced;