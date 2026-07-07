import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { DocumentExtraction } from '@/lib/types';

const BUCKET = 'incident-docs';

/** Latest extraction for an incident. Polls while work is in flight. */
export function useLatestExtraction(incidentId: string | undefined) {
  return useQuery({
    enabled: !!incidentId,
    queryKey: ['extraction', incidentId],
    refetchInterval: (q) => {
      const row = q.state.data as DocumentExtraction | null | undefined;
      return row && (row.status === 'pending' || row.status === 'running') ? 2000 : false;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_extractions')
        .select('*')
        .eq('incident_id', incidentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as DocumentExtraction) ?? null;
    },
  });
}

/**
 * Upload a document to Storage, create the extraction row, and start the
 * Temporal workflow via the start-extraction edge function.
 */
export function useStartExtraction(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const path = `${incidentId}/${Date.now()}-${file.name}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
      if (up.error) throw up.error;

      const { data: row, error: insErr } = await supabase
        .from('document_extractions')
        .insert({ incident_id: incidentId, storage_path: path, file_name: file.name, status: 'pending' })
        .select('id')
        .single();
      if (insErr) throw insErr;

      const { error: fnErr } = await supabase.functions.invoke('start-extraction', {
        body: { extraction_id: row.id },
      });
      if (fnErr) throw fnErr;
      return row.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['extraction', incidentId] }),
  });
}
