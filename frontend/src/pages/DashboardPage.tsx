import {
  Ticket,
  FolderOpen,
  CheckCircle2,
  Loader2,
  Flame,
  AlertTriangle,
  Gauge,
  Timer,
} from 'lucide-react';
import { useDashboard } from '@/hooks/useDashboard';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { BarChartCard, PieChartCard, TrendChartCard } from '@/components/dashboard/Charts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function DashboardPage() {
  const { data, isLoading } = useDashboard();
  const k = data?.kpis;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Executive Dashboard</h1>
        <p className="text-sm text-muted-foreground">Live overview · refreshes every 30s</p>
      </div>

      {isLoading || !k ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label="Total Incidents" value={k.total_incidents} icon={<Ticket className="size-5" />} />
          <KpiCard label="Open" value={k.open_incidents} icon={<FolderOpen className="size-5" />} />
          <KpiCard label="In Progress" value={k.in_progress} icon={<Loader2 className="size-5" />} />
          <KpiCard label="Closed" value={k.closed_incidents} icon={<CheckCircle2 className="size-5" />} />
          <KpiCard label="Critical" value={k.critical_incidents} accent="text-destructive" icon={<Flame className="size-5" />} />
          <KpiCard label="SLA Breached" value={k.breached} accent="text-orange-500" icon={<AlertTriangle className="size-5" />} />
          <KpiCard label="SLA Compliance" value={k.sla_compliance_pct ?? '—'} suffix="%" accent="text-green-600" icon={<Gauge className="size-5" />} />
          <KpiCard label="Avg Resolution" value={k.avg_resolution_hours ?? '—'} suffix="h" icon={<Timer className="size-5" />} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Incidents by Priority</CardTitle></CardHeader>
          <CardContent>{data && <PieChartCard data={data.byPriority} />}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Incidents by Category</CardTitle></CardHeader>
          <CardContent>{data && <BarChartCard data={data.byCategory} />}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Incidents by Team</CardTitle></CardHeader>
          <CardContent>{data && <BarChartCard data={data.byTeam} />}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Daily Trend (30 days)</CardTitle></CardHeader>
          <CardContent>{data && <TrendChartCard data={data.trend} />}</CardContent>
        </Card>
      </div>
    </div>
  );
}
