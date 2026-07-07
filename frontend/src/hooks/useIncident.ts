import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { IncidentView } from '@/lib/types';

export interface Comment {
  id: string;
  body: string;
  is_internal: boolean;
  source: string;
  created_at: string;
  author_id: string | null;
  author?: { full_name: string | null; email: string } | null;
}

export interface StatusHistoryRow {
  id: string;
  to_status_id: string;
  entered_at: string;
  exited_at: string | null;
  status_key?: string;
  status_name?: string;
}

/** Full incident detail: the incident row, its comments and status history. */
export function useIncident(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: ['incident', id],
    queryFn: async () => {
      const [{ data: incident, error: e1 }, { data: comments }, { data: history }] =
        await Promise.all([
          supabase.from('v_incidents').select('*').eq('id', id).single(),
          supabase
            .from('incident_comments')
            .select('*, author:profiles(full_name, email)')
            .eq('incident_id', id)
            .order('created_at'),
          supabase
            .from('incident_status_history')
            .select('*, status:statuses!to_status_id(key, name)')
            .eq('incident_id', id)
            .order('entered_at'),
        ]);
      if (e1) throw e1;
      return {
        incident: incident as IncidentView,
        comments: (comments ?? []) as Comment[],
        history: (history ?? []).map((h: any) => ({
          ...h,
          status_key: h.status?.key,
          status_name: h.status?.name,
        })) as StatusHistoryRow[],
      };
    },
  });
}
