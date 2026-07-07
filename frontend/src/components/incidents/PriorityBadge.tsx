import { Badge } from '@/components/ui/badge';

export function PriorityBadge({ priority, color }: { priority: string | null; color?: string | null }) {
  if (!priority) return <span className="text-muted-foreground">—</span>;
  return <Badge color={color ?? '#64748b'}>{priority}</Badge>;
}
