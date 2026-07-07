import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Users2, Plug, Sparkles, Tags } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ROLE_LABELS } from '@/lib/constants';
import type { Profile } from '@/lib/types';

export function AdminPage() {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const { data: users } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').order('created_at');
      return (data ?? []) as Profile[];
    },
  });

  const { data: syncLog } = useQuery({
    queryKey: ['sync-log'],
    queryFn: async () => {
      const { data } = await supabase.from('zendesk_sync_log').select('*').order('started_at', { ascending: false }).limit(10);
      return data ?? [];
    },
  });

  async function runSync() {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await api.zendeskSync('manual');
      setSyncMsg(`Sync complete: ${res.created} created, ${res.updated} updated, ${res.errors} errors.`);
    } catch (e) {
      setSyncMsg(`Sync failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Administration</h1>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users"><Users2 className="size-4" /> Users</TabsTrigger>
          <TabsTrigger value="zendesk"><Plug className="size-4" /> Zendesk</TabsTrigger>
          <TabsTrigger value="ai"><Sparkles className="size-4" /> AI</TabsTrigger>
          <TabsTrigger value="config"><Tags className="size-4" /> Categories</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Active</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>{u.full_name ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                      <TableCell><Badge>{ROLE_LABELS[u.role]}</Badge></TableCell>
                      <TableCell>{u.is_active ? 'Yes' : 'No'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="zendesk">
          <Card>
            <CardHeader><CardTitle className="text-base">Zendesk Integration</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Credentials are configured as edge-function secrets (ZENDESK_SUBDOMAIN / ZENDESK_EMAIL /
                ZENDESK_API_TOKEN). Trigger a manual sync or review recent runs below.
              </p>
              <div className="flex items-center gap-3">
                <Button onClick={runSync} disabled={syncing}>
                  <RefreshCw className={`size-4 ${syncing ? 'animate-spin' : ''}`} /> Sync now
                </Button>
                {syncMsg && <span className="text-sm text-muted-foreground">{syncMsg}</span>}
              </div>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Started</TableHead><TableHead>Trigger</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead>Updated</TableHead><TableHead>Errors</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {(syncLog ?? []).map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{new Date(r.started_at).toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{r.trigger_type}</TableCell>
                      <TableCell><Badge color={r.status === 'success' ? '#22c55e' : r.status === 'failed' ? '#dc2626' : '#f59e0b'}>{r.status}</Badge></TableCell>
                      <TableCell>{r.created_count}</TableCell>
                      <TableCell>{r.updated_count}</TableCell>
                      <TableCell>{r.error_count}</TableCell>
                    </TableRow>
                  ))}
                  {(!syncLog || syncLog.length === 0) && (
                    <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No sync runs yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai">
          <Card>
            <CardHeader><CardTitle className="text-base">AI Configuration</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Provider and model are set via the <code>ai.config</code> system setting and the
              <code> OPENAI_API_KEY</code> edge-function secret.</p>
              <p>Auto-suggest confidence threshold controls when the assistant recommends
              self-resolution before creating a ticket.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config">
          <Card>
            <CardHeader><CardTitle className="text-base">Categories & Priorities</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Categories, priorities, severities, statuses and SLA policies are stored in
              admin-managed reference tables and seeded on first run. CRUD editors plug directly
              into those tables (admin-only writes are already enforced by RLS).
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
