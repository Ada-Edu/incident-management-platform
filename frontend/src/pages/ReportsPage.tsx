import { Download } from 'lucide-react';
import { useDashboard } from '@/hooks/useDashboard';
import { useIncidents } from '@/hooks/useIncidents';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChartCard } from '@/components/dashboard/Charts';
import { KpiCard } from '@/components/dashboard/KpiCard';

/** CSV export helper (client-side; PDF/Excel can be added via a report edge fn). */
function exportCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? '')).join(',')),
  ].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const { data } = useDashboard();
  const { data: incidents } = useIncidents({ pageSize: 100 });
  const k = data?.kpis;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Reports</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportCsv((incidents?.rows ?? []) as unknown as Record<string, unknown>[], 'incidents.csv')}>
            <Download className="size-4" /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Download className="size-4" /> Export PDF
          </Button>
        </div>
      </div>

      {k && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label="SLA Compliance" value={k.sla_compliance_pct ?? '—'} suffix="%" accent="text-green-600" />
          <KpiCard label="Avg Resolution" value={k.avg_resolution_hours ?? '—'} suffix="h" />
          <KpiCard label="Avg First Response" value={k.avg_first_response_hours ?? '—'} suffix="h" />
          <KpiCard label="Breached" value={k.breached} accent="text-destructive" />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Developer Performance (incidents handled)</CardTitle></CardHeader>
          <CardContent>{data && <BarChartCard data={data.byDeveloper} />}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Team Performance</CardTitle></CardHeader>
          <CardContent>{data && <BarChartCard data={data.byTeam} />}</CardContent>
        </Card>
      </div>

      <p className="text-sm text-muted-foreground">
        Monthly SLA compliance, resolution performance and customer-trend reports build on the same
        views. PDF/Excel export can be generated server-side via a report edge function for
        pixel-perfect output.
      </p>
    </div>
  );
}
