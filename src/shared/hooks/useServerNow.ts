import { useEffect, useState } from 'react';
import { getServerNow } from '../firebase/time';

// The server clock, re-read every `everyMs` (re-renders the caller).
// Shared by every game with a countdown on screen.
export const useServerNow = (everyMs = 250): number => {
    const [now, setNow] = useState(getServerNow());
    useEffect(() => {
        const t = setInterval(() => setNow(getServerNow()), everyMs);
        return () => clearInterval(t);
    }, [everyMs]);
    return now;
};
