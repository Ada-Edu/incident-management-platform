/** Shared domain types. Mirrors the public schema + v_incidents view. */

export type AppRole = 'client' | 'developer' | 'manager' | 'administrator';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  team_id: string | null;
  avatar_url: string | null;
  is_active: boolean;
}

/** Row shape returned by the v_incidents view. */
export interface IncidentView {
  id: string;
  incident_number: string;
  zendesk_ticket_id: string | null;
  title: string;
  description: string | null;
  root_cause: string | null;
  resolution_notes: string | null;
  workaround: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  first_responded_at: string | null;
  sla_response_due: string | null;
  sla_resolve_due: string | null;
  response_breached: boolean;
  resolve_breached: boolean;
  ai_confidence: number | null;
  ai_self_resolved: boolean;
  category: string | null;
  category_id: string | null;
  subcategory: string | null;
  priority: string | null;
  priority_rank: number | null;
  priority_color: string | null;
  priority_id: string | null;
  severity: string | null;
  severity_rank: number | null;
  environment: string | null;
  status_key: string;
  status: string;
  status_color: string | null;
  status_id: string;
  is_open: boolean;
  is_terminal: boolean;
  customer: string | null;
  customer_id: string | null;
  reporter_name: string | null;
  reporter_id: string | null;
  assignee_name: string | null;
  assigned_to: string | null;
  team_name: string | null;
  assigned_team_id: string | null;
  sla_seconds_remaining: number | null;
}

export interface Lookup {
  id: string;
  key: string;
  name: string;
  color?: string | null;
  rank?: number | null;
  sort_order?: number | null;
  parent_id?: string | null;
}

export interface DashboardKpis {
  total_incidents: number;
  open_incidents: number;
  closed_incidents: number;
  in_progress: number;
  critical_incidents: number;
  high_priority: number;
  breached: number;
  sla_compliance_pct: number | null;
  avg_resolution_hours: number | null;
  avg_first_response_hours: number | null;
}

export interface ChartDatum {
  label: string;
  value: number;
  color?: string | null;
}

export type ExtractionStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export interface ExtractionResult {
  parties: { name: string; role: string | null }[];
  key_dates: { label: string; date: string }[];
  key_terms: { label: string; value: string }[];
}

export interface DocumentExtraction {
  id: string;
  incident_id: string;
  attachment_id: string | null;
  storage_path: string;
  file_name: string | null;
  status: ExtractionStatus;
  failure_reason: string | null;
  page_count: number | null;
  model_id: string | null;
  result: ExtractionResult;
  created_at: string;
  updated_at: string;
}

export interface AiAssistantResponse {
  summary: string;
  root_cause: string;
  resolution_steps: string[];
  workaround: string;
  faqs: string[];
  confidence: number;
  suggest_self_resolution: boolean;
  similar: {
    source_type: string;
    source_id: string;
    similarity: number;
    reference: string | null;
  }[];
}
