import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function KpiCard({
  label,
  value,
  icon,
  accent,
  suffix,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  accent?: string;
  suffix?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={cn('mt-1 text-2xl font-semibold', accent)}>
            {value}
            {suffix && <span className="ml-0.5 text-base font-normal text-muted-foreground">{suffix}</span>}
          </p>
        </div>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardContent>
    </Card>
  );
}
