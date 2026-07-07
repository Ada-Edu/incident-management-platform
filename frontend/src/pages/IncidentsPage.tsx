import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, PlusCircle } from 'lucide-react';
import { useIncidents, type IncidentFilters } from '@/hooks/useIncidents';
import { useReferenceData } from '@/hooks/useReferenceData';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/incidents/StatusBadge';
import { PriorityBadge } from '@/components/incidents/PriorityBadge';
import { SlaCountdown } from '@/components/incidents/SlaCountdown';
import { formatDate } from '@/lib/utils';

export function IncidentsPage() {
  const { can } = useAuth();
  const { data: ref } = useReferenceData();
  const [filters, setFilters] = useState<IncidentFilters>({ page: 0, pageSize: 25 });
  const [searchInput, setSearchInput] = useState('');
  const { data, isLoading, isFetching } = useIncidents(filters);

  const set = (patch: Partial<IncidentFilters>) => setFilters((f) => ({ ...f, page: 0, ...patch }));
  const totalPages = data ? Math.ceil(data.count / data.pageSize) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Incidents</h1>
          <p className="text-sm text-muted-foreground">{data?.count ?? 0} total</p>
        </div>
        {can('incident.create') && (
          <Button asChild>
            <Link to="/incidents/new"><PlusCircle className="size-4" /> Log Incident</Link>
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <form
            className="relative flex-1 min-w-[220px]"
            onSubmit={(e) => { e.preventDefault(); set({ search: searchInput }); }}
          >
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search number or title…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </form>
          <Select className="w-40" value={filters.statusId ?? ''} onChange={(e) => set({ statusId: e.target.value || undefined })}>
            <option value="">All statuses</option>
            {ref?.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select className="w-40" value={filters.priorityId ?? ''} onChange={(e) => set({ priorityId: e.target.value || undefined })}>
            <option value="">All priorities</option>
            {ref?.priorities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select className="w-40" value={filters.teamId ?? ''} onChange={(e) => set({ teamId: e.target.value || undefined })}>
            <option value="">All teams</option>
            {ref?.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={!!filters.slaBreached}
              onChange={(e) => set({ slaBreached: e.target.checked || undefined })}
            />
            SLA breached
          </label>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}><Skeleton className="h-6 w-full" /></TableCell>
                  </TableRow>
                ))}
              {!isLoading && data?.rows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">No incidents match your filters.</TableCell></TableRow>
              )}
              {data?.rows.map((inc) => (
                <TableRow key={inc.id} className="cursor-pointer">
                  <TableCell className="font-mono text-xs">
                    <Link to={`/incidents/${inc.id}`} className="text-primary hover:underline">{inc.incident_number}</Link>
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate">
                    <Link to={`/incidents/${inc.id}`}>{inc.title}</Link>
                  </TableCell>
                  <TableCell><StatusBadge status={inc.status} statusKey={inc.status_key} color={inc.status_color} /></TableCell>
                  <TableCell><PriorityBadge priority={inc.priority} color={inc.priority_color} /></TableCell>
                  <TableCell className="text-sm">{inc.assignee_name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                  <TableCell className="text-sm">{inc.customer ?? '—'}</TableCell>
                  <TableCell>{inc.is_terminal ? <span className="text-muted-foreground">—</span> : <SlaCountdown dueAt={inc.sla_resolve_due} />}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(inc.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {(filters.page ?? 0) + 1} of {totalPages}{isFetching ? ' · updating…' : ''}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={(filters.page ?? 0) === 0}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 0) - 1 }))}>Previous</Button>
            <Button variant="outline" size="sm" disabled={(filters.page ?? 0) + 1 >= totalPages}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 0) + 1 }))}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
