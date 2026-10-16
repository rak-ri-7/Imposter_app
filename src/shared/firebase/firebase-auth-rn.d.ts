// Firebase ships getReactNativePersistence only in its React Native build;
// its published typings leave it out. Metro picks the RN build at runtime,
// so this just tells TypeScript the function exists.
import type { Persistence } from 'firebase/auth';

declare module 'firebase/auth' {
    export function getReactNativePersistence(storage: {
        setItem(key: string, value: string): Promise<void>;
        getItem(key: string): Promise<string | null>;
        removeItem(key: string): Promise<void>;
    }): Persistence;
}
