import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useIncidents } from '@/hooks/useIncidents';
import { useReferenceData } from '@/hooks/useReferenceData';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/incidents/StatusBadge';
import { PriorityBadge } from '@/components/incidents/PriorityBadge';
import { SlaCountdown } from '@/components/incidents/SlaCountdown';
import { WORKFLOW_STAGES } from '@/lib/constants';
import type { IncidentView } from '@/lib/types';

/**
 * Manager console: table + kanban views over the full incident set (RLS grants
 * managers org-wide visibility). A deeper build adds bulk assign/close/export
 * and a timeline view — the data + permissions are already in place.
 */
export function ManagerConsolePage() {
  const [statusId, setStatusId] = useState<string>();
  const { data: ref } = useReferenceData();
  const { data } = useIncidents({ statusId, pageSize: 100 });
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Manager Console</h1>

      <Tabs defaultValue="table">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="table">Table</TabsTrigger>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
          </TabsList>
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={statusId ?? ''}
            onChange={(e) => setStatusId(e.target.value || undefined)}
          >
            <option value="">All statuses</option>
            {ref?.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <TabsContent value="table">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead><TableHead>Title</TableHead>
                    <TableHead>Status</TableHead><TableHead>Priority</TableHead>
                    <TableHead>Assignee</TableHead><TableHead>SLA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((inc) => (
                    <TableRow key={inc.id}>
                      <TableCell className="font-mono text-xs">
                        <Link to={`/incidents/${inc.id}`} className="text-primary hover:underline">{inc.incident_number}</Link>
                      </TableCell>
                      <TableCell className="max-w-[320px] truncate">{inc.title}</TableCell>
                      <TableCell><StatusBadge status={inc.status} statusKey={inc.status_key} color={inc.status_color} /></TableCell>
                      <TableCell><PriorityBadge priority={inc.priority} color={inc.priority_color} /></TableCell>
                      <TableCell className="text-sm">{inc.assignee_name ?? 'Unassigned'}</TableCell>
                      <TableCell>{inc.is_terminal ? '—' : <SlaCountdown dueAt={inc.sla_resolve_due} />}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kanban">
          <div className="flex gap-4 overflow-x-auto pb-4">
            {WORKFLOW_STAGES.map((stage) => {
              const items = rows.filter((r: IncidentView) => r.status_key === stage.key);
              return (
                <div key={stage.key} className="w-64 shrink-0">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-sm font-medium">{stage.name}</span>
                    <span className="text-xs text-muted-foreground">{items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((inc) => (
                      <Link key={inc.id} to={`/incidents/${inc.id}`}>
                        <Card className="hover:border-primary/50">
                          <CardContent className="space-y-2 p-3">
                            <p className="font-mono text-xs text-muted-foreground">{inc.incident_number}</p>
                            <p className="line-clamp-2 text-sm">{inc.title}</p>
                            <PriorityBadge priority={inc.priority} color={inc.priority_color} />
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
