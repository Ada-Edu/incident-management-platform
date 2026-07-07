import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Send } from 'lucide-react';
import { useIncident } from '@/hooks/useIncident';
import { useReferenceData, useAssignees } from '@/hooks/useReferenceData';
import { useUpdateIncident, useAddComment } from '@/hooks/useMutations';
import { useAuth } from '@/auth/AuthProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/incidents/StatusBadge';
import { PriorityBadge } from '@/components/incidents/PriorityBadge';
import { SlaCountdown } from '@/components/incidents/SlaCountdown';
import { WorkflowTimeline } from '@/components/incidents/WorkflowTimeline';
import { ExtractionPanel } from '@/components/incidents/ExtractionPanel';
import { formatDate } from '@/lib/utils';

export function IncidentDetailPage() {
  const { id } = useParams();
  const { profile, can } = useAuth();
  const { data, isLoading } = useIncident(id);
  const { data: ref } = useReferenceData();
  const { data: assignees } = useAssignees();
  const update = useUpdateIncident(id!);
  const addComment = useAddComment(id!);
  const [comment, setComment] = useState('');
  const [internal, setInternal] = useState(false);

  if (isLoading || !data) {
    return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64" /></div>;
  }

  const inc = data.incident;
  const canEdit = can('incident.update.status');
  const canAssign = can('incident.assign');

  async function postComment() {
    if (!comment.trim() || !profile) return;
    await addComment.mutateAsync({ body: comment, is_internal: internal, author_id: profile.id });
    setComment('');
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link to="/incidents" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to incidents
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-muted-foreground">{inc.incident_number}</span>
            <StatusBadge status={inc.status} statusKey={inc.status_key} color={inc.status_color} />
            <PriorityBadge priority={inc.priority} color={inc.priority_color} />
            {inc.zendesk_ticket_id && (
              <span className="text-xs text-muted-foreground">Zendesk #{inc.zendesk_ticket_id}</span>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-semibold">{inc.title}</h1>
        </div>
        {!inc.is_terminal && (
          <Card className="w-auto">
            <CardContent className="flex items-center gap-4 px-4 py-3">
              <div className="text-sm">
                <p className="text-muted-foreground">Resolution SLA</p>
                <SlaCountdown dueAt={inc.sla_resolve_due} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Description</CardTitle></CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">
              {inc.description || 'No description provided.'}
            </CardContent>
          </Card>

          {/* Resolution knowledge (visible once populated) */}
          {(inc.root_cause || inc.resolution_notes || inc.workaround) && (
            <Card>
              <CardHeader><CardTitle className="text-base">Resolution</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {inc.root_cause && <div><p className="font-medium">Root cause</p><p className="text-muted-foreground">{inc.root_cause}</p></div>}
                {inc.resolution_notes && <div><p className="font-medium">Resolution notes</p><p className="text-muted-foreground">{inc.resolution_notes}</p></div>}
                {inc.workaround && <div><p className="font-medium">Workaround</p><p className="text-muted-foreground">{inc.workaround}</p></div>}
              </CardContent>
            </Card>
          )}

          {/* Document Field Extraction */}
          <ExtractionPanel incidentId={inc.id} />

          {/* Comments / activity */}
          <Card>
            <CardHeader><CardTitle className="text-base">Comments & Activity</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {data.comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
              {data.comments.map((c) => (
                <div key={c.id} className="rounded-md border p-3 text-sm">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-medium">{c.author?.full_name ?? c.author?.email ?? 'System'}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.is_internal && <span className="mr-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-600">internal</span>}
                      {formatDate(c.created_at)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-muted-foreground">{c.body}</p>
                </div>
              ))}

              <div className="space-y-2 border-t pt-4">
                <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment or technical note…" />
                <div className="flex items-center justify-between">
                  {profile?.role !== 'client' ? (
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                      Internal note (hidden from client)
                    </label>
                  ) : <span />}
                  <Button size="sm" onClick={postComment} disabled={!comment.trim() || addComment.isPending}>
                    <Send className="size-4" /> Post
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Workflow</CardTitle></CardHeader>
            <CardContent><WorkflowTimeline currentKey={inc.status_key} history={data.history} /></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Field label="Status">
                {canEdit ? (
                  <Select value={inc.status_id} onChange={(e) => update.mutate({ status_id: e.target.value })}>
                    {ref?.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                ) : inc.status}
              </Field>
              <Field label="Assignee">
                {canAssign ? (
                  <Select value={inc.assigned_to ?? ''} onChange={(e) => update.mutate({ assigned_to: e.target.value || null })}>
                    <option value="">Unassigned</option>
                    {assignees?.map((a) => <option key={a.id} value={a.id}>{a.full_name ?? a.email}</option>)}
                  </Select>
                ) : (inc.assignee_name ?? 'Unassigned')}
              </Field>
              <Field label="Team">{inc.team_name ?? '—'}</Field>
              <Field label="Category">{inc.category ?? '—'}</Field>
              <Field label="Severity">{inc.severity ?? '—'}</Field>
              <Field label="Environment">{inc.environment ?? '—'}</Field>
              <Field label="Customer">{inc.customer ?? '—'}</Field>
              <Field label="Reporter">{inc.reporter_name ?? '—'}</Field>
              <Field label="Created">{formatDate(inc.created_at)}</Field>
              <Field label="Updated">{formatDate(inc.updated_at)}</Field>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
