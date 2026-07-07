import type { AppRole } from './types';

/** Ordered workflow used by the incident timeline component. */
export const WORKFLOW_STAGES = [
  { key: 'new', name: 'New' },
  { key: 'assigned', name: 'Assigned' },
  { key: 'in_progress', name: 'In Progress' },
  { key: 'testing', name: 'Testing' },
  { key: 'resolved', name: 'Resolved' },
  { key: 'closed', name: 'Closed' },
] as const;

export const ROLE_LABELS: Record<AppRole, string> = {
  client: 'Client',
  developer: 'Developer',
  manager: 'Team Lead / Manager',
  administrator: 'Administrator',
};

/** Fallback badge colours by status key (server also provides colours). */
export const STATUS_COLORS: Record<string, string> = {
  new: '#64748b',
  open: '#3b82f6',
  assigned: '#6366f1',
  in_progress: '#8b5cf6',
  waiting_customer: '#f59e0b',
  waiting_third_party: '#f97316',
  testing: '#14b8a6',
  ready_for_deployment: '#0ea5e9',
  resolved: '#22c55e',
  closed: '#6b7280',
};
