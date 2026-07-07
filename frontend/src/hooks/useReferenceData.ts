import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Lookup, Profile } from '@/lib/types';

async function fetchTable(table: string, order: string): Promise<Lookup[]> {
  const { data, error } = await supabase.from(table).select('*').order(order);
  if (error) throw error;
  return (data ?? []) as Lookup[];
}

/** All admin-managed lookups, cached aggressively (rarely change). */
export function useReferenceData() {
  return useQuery({
    queryKey: ['reference-data'],
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const [statuses, priorities, severities, environments, categories, teams] = await Promise.all([
        fetchTable('statuses', 'sort_order'),
        fetchTable('priorities', 'rank'),
        fetchTable('severities', 'rank'),
        fetchTable('environments', 'name'),
        fetchTable('categories', 'sort_order'),
        fetchTable('teams', 'name'),
      ]);
      return { statuses, priorities, severities, environments, categories, teams };
    },
  });
}

/** Customers list (for the create form + filters). */
export function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: () => fetchTable('customers', 'name'),
  });
}

/** Developers + managers, for assignment dropdowns. */
export function useAssignees() {
  return useQuery({
    queryKey: ['assignees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, team_id, avatar_url, is_active')
        .in('role', ['developer', 'manager'])
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });
}
