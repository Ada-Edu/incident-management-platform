import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge conditional class names, de-duplicating Tailwind utilities. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format an ISO timestamp as a short human-readable string. */
export function formatDate(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** Render seconds-remaining as a compact SLA countdown, e.g. "2h 14m" or "Breached". */
export function formatCountdown(seconds?: number | null): { label: string; breached: boolean } {
  if (seconds == null) return { label: '—', breached: false };
  const breached = seconds < 0;
  const abs = Math.abs(seconds);
  const d = Math.floor(abs / 86400);
  const h = Math.floor((abs % 86400) / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const parts = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return { label: breached ? `Breached ${parts} ago` : `${parts} left`, breached };
}
