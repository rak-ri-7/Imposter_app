import { useEffect, useState } from "react";
import { getServerNow } from "../../shared/firebase/time";

// The server clock, re-read every `everyMs` (re-renders the caller).
export const useServerNow = (everyMs = 100): number => {
  const [now, setNow] = useState(getServerNow());
  useEffect(() => {
    const t = setInterval(() => setNow(getServerNow()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
};
