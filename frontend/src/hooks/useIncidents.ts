import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { IncidentView } from '@/lib/types';

export interface IncidentFilters {
  search?: string;
  statusId?: string;
  priorityId?: string;
  assignedTo?: string;
  teamId?: string;
  customerId?: string;
  slaBreached?: boolean;
  page?: number;
  pageSize?: number;
}

export interface IncidentListResult {
  rows: IncidentView[];
  count: number;
  page: number;
  pageSize: number;
}

/**
 * Paginated, filterable incident list backed by the v_incidents view. RLS scopes
 * rows to what the current user may see, so the same hook works for every role.
 */
export function useIncidents(filters: IncidentFilters = {}) {
  const page = filters.page ?? 0;
  const pageSize = filters.pageSize ?? 25;

  return useQuery<IncidentListResult>({
    queryKey: ['incidents', filters],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from('v_incidents')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);

      if (filters.search) {
        // Fuzzy match on number or title (trigram indexes back these).
        q = q.or(`incident_number.ilike.%${filters.search}%,title.ilike.%${filters.search}%`);
      }
      if (filters.statusId) q = q.eq('status_id', filters.statusId);
      if (filters.priorityId) q = q.eq('priority_id', filters.priorityId);
      if (filters.assignedTo) q = q.eq('assigned_to', filters.assignedTo);
      if (filters.teamId) q = q.eq('assigned_team_id', filters.teamId);
      if (filters.customerId) q = q.eq('customer_id', filters.customerId);
      if (filters.slaBreached) q = q.eq('resolve_breached', true);

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as IncidentView[], count: count ?? 0, page, pageSize };
    },
  });
}
