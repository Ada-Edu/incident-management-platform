import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ChartDatum, DashboardKpis } from '@/lib/types';

async function view<T>(name: string): Promise<T[]> {
  const { data, error } = await supabase.from(name).select('*');
  if (error) throw error;
  return (data ?? []) as T[];
}

/** Executive dashboard data: KPIs + chart breakdowns. Refetches periodically. */
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    refetchInterval: 30_000, // near-real-time refresh
    queryFn: async () => {
      const [kpiRows, byPriority, byCategory, byTeam, byDeveloper, trend] = await Promise.all([
        view<DashboardKpis>('v_dashboard_kpis'),
        view<ChartDatum>('v_incidents_by_priority'),
        view<ChartDatum>('v_incidents_by_category'),
        view<ChartDatum>('v_incidents_by_team'),
        view<ChartDatum>('v_incidents_by_developer'),
        view<{ day: string; value: number }>('v_incident_daily_trend'),
      ]);
      return {
        kpis: kpiRows[0] ?? null,
        byPriority,
        byCategory,
        byTeam,
        byDeveloper,
        trend,
      };
    },
  });
}
