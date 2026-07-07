import { Badge } from '@/components/ui/badge';
import { STATUS_COLORS } from '@/lib/constants';

export function StatusBadge({ status, statusKey, color }: { status: string; statusKey?: string; color?: string | null }) {
  const resolved = color ?? (statusKey ? STATUS_COLORS[statusKey] : undefined) ?? '#64748b';
  return <Badge color={resolved}>{status}</Badge>;
}
