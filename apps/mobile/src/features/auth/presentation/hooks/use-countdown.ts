import { useCallback, useEffect, useState } from 'react';

/** Seconds remaining until an action (e.g. resending a code) is allowed again. */
export function useCountdown(initialSeconds = 0) {
  const [endsAt, setEndsAt] = useState(() => Date.now() + initialSeconds * 1000);
  const [now, setNow] = useState(Date.now);
  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000));

  useEffect(() => {
    if (remaining === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [remaining]);

  const start = useCallback((seconds: number) => {
    const current = Date.now();
    setNow(current);
    setEndsAt(current + seconds * 1000);
  }, []);

  return { remaining, start };
}
