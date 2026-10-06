import { initializeApp } from 'firebase/app';
import { getFirestore, setLogLevel } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
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
export const auth = getAuth(app);