import { useEffect, useState } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { cn, formatCountdown } from '@/lib/utils';

/**
 * Live SLA countdown. Accepts either a due timestamp (preferred, recomputes
 * every second) or a static seconds-remaining value from the server.
 */
export function SlaCountdown({
  dueAt,
  seconds,
  className,
}: {
  dueAt?: string | null;
  seconds?: number | null;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!dueAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [dueAt]);

  const remaining = dueAt
    ? Math.floor((new Date(dueAt).getTime() - now) / 1000)
    : seconds ?? null;
  if (remaining == null) return <span className="text-muted-foreground">No SLA</span>;

  const { label, breached } = formatCountdown(remaining);
  const nearBreach = !breached && remaining < 3600; // < 1h
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-sm font-medium',
        breached ? 'text-destructive' : nearBreach ? 'text-orange-500' : 'text-muted-foreground',
        className,
      )}
    >
      {breached || nearBreach ? <AlertTriangle className="size-3.5" /> : <Clock className="size-3.5" />}
      {label}
    </span>
  );
}
