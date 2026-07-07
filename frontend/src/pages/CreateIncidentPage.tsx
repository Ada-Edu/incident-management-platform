import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useReferenceData, useCustomers } from '@/hooks/useReferenceData';
import { useCreateIncident } from '@/hooks/useMutations';
import { useAuth } from '@/auth/AuthProvider';
import { api } from '@/lib/api';
import type { AiAssistantResponse } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AiAssistantPanel } from '@/components/incidents/AiAssistantPanel';

export function CreateIncidentPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: ref } = useReferenceData();
  const { data: customers } = useCustomers();
  const createIncident = useCreateIncident();

  const [form, setForm] = useState({
    title: '',
    description: '',
    category_id: '',
    subcategory_id: '',
    priority_id: '',
    severity_id: '',
    environment_id: '',
    customer_id: '',
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [ai, setAi] = useState<AiAssistantResponse | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const topLevelCats = ref?.categories.filter((c) => !c.parent_id) ?? [];
  const subCats = ref?.categories.filter((c) => c.parent_id === form.category_id) ?? [];

  async function runAssistant() {
    if (!form.title.trim()) return;
    setAiLoading(true);
    try {
      setAi(await api.aiAssistant({ title: form.title, description: form.description }));
    } catch {
      setAi(null);
    } finally {
      setAiLoading(false);
    }
  }

  async function submit(selfResolved = false) {
    if (!profile) return;
    const newStatus = ref?.statuses.find((s) => s.key === 'new');
    const created = await createIncident.mutateAsync({
      title: form.title,
      description: form.description,
      category_id: form.category_id || undefined,
      subcategory_id: form.subcategory_id || undefined,
      priority_id: form.priority_id || undefined,
      severity_id: form.severity_id || undefined,
      environment_id: form.environment_id || undefined,
      customer_id: form.customer_id || undefined,
      reporter_id: profile.id,
      status_id: newStatus!.id,
      ai_confidence: ai?.confidence ?? null,
      ai_self_resolved: selfResolved,
    });
    navigate(`/incidents/${created.id}`);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold">Log a New Incident</h1>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Form */}
        <Card>
          <CardHeader><CardTitle className="text-base">Incident details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title *</Label>
              <Input id="title" value={form.title} onChange={(e) => set('title', e.target.value)}
                placeholder="Short summary of the issue" onBlur={runAssistant} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" rows={5} value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="What happened, steps to reproduce, impact…" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category_id} onChange={(e) => { set('category_id', e.target.value); set('subcategory_id', ''); }}>
                  <option value="">Select…</option>
                  {topLevelCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Subcategory</Label>
                <Select value={form.subcategory_id} onChange={(e) => set('subcategory_id', e.target.value)} disabled={!subCats.length}>
                  <option value="">Select…</option>
                  {subCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority_id} onChange={(e) => set('priority_id', e.target.value)}>
                  <option value="">Select…</option>
                  {ref?.priorities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <Select value={form.severity_id} onChange={(e) => set('severity_id', e.target.value)}>
                  <option value="">Select…</option>
                  {ref?.severities.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Environment</Label>
                <Select value={form.environment_id} onChange={(e) => set('environment_id', e.target.value)}>
                  <option value="">Select…</option>
                  {ref?.environments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <Select value={form.customer_id} onChange={(e) => set('customer_id', e.target.value)}>
                  <option value="">Select…</option>
                  {customers?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button onClick={() => submit(false)} disabled={!form.title.trim() || createIncident.isPending}>
                {createIncident.isPending ? 'Creating…' : 'Create Incident'}
              </Button>
              <Button variant="outline" onClick={runAssistant} disabled={!form.title.trim() || aiLoading}>
                <Sparkles className="size-4" /> Check for solutions
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* AI assistant */}
        <AiAssistantPanel
          loading={aiLoading}
          result={ai}
          onSelfResolve={ai?.suggest_self_resolution ? () => submit(true) : undefined}
        />
      </div>
    </div>
  );
}
