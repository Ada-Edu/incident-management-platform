import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface CreateIncidentInput {
  title: string;
  description: string;
  category_id?: string;
  subcategory_id?: string;
  priority_id?: string;
  severity_id?: string;
  environment_id?: string;
  customer_id?: string;
  reporter_id: string;
  status_id: string;
  ai_confidence?: number | null;
  ai_self_resolved?: boolean;
}

export function useCreateIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateIncidentInput) => {
      const { data, error } = await supabase.from('incidents').insert(input).select('id, incident_number').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateIncident(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase.from('incidents').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incident', id] });
      qc.invalidateQueries({ queryKey: ['incidents'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useAddComment(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { body: string; is_internal: boolean; author_id: string }) => {
      const { error } = await supabase
        .from('incident_comments')
        .insert({ incident_id: incidentId, ...input });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incident', incidentId] }),
  });
}
