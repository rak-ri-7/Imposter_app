import { initializeApp } from 'firebase/app';
import { getFirestore, setLogLevel } from 'firebase/firestore';
import { initializeAuth, getAuth, getReactNativePersistence, Auth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
setLogLevel('error'); // or 'silent' to suppress entirely

const firebaseConfig = {
    apiKey: "AIzaSyAk8KOKBlwfwzRFRTTvW_nvcvy-NRL3tb8",
    authDomain: "imposter-game-a588f.firebaseapp.com",
    projectId: "imposter-game-a588f",
    storageBucket: "imposter-game-a588f.firebasestorage.app",
    messagingSenderId: "757613732440",
    appId: "1:757613732440:web:637e90f21b4fc653b2602d"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
// Keep the anonymous sign-in on the phone. Without this, every app restart
// signs in as a brand-new user, so a player who restarts mid-game can't get
// back in as themselves.
const createAuth = (): Auth => {
    try {
        return initializeAuth(app, {
            persistence: getReactNativePersistence(AsyncStorage),
        });
    } catch {
        // Already initialised (e.g. after a Fast Refresh in development).
        return getAuth(app);
    }
};
export const auth = createAuth();