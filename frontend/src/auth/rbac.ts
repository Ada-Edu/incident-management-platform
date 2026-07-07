/**
 * Client-side RBAC. This is UX-only (hides/shows controls); the DATABASE (RLS)
 * is the real authority. Keep the two in sync.
 */
import type { AppRole } from '@/lib/types';

export type Permission =
  | 'incident.create'
  | 'incident.view.own'
  | 'incident.view.assigned'
  | 'incident.view.all'
  | 'incident.update.status'
  | 'incident.assign'
  | 'incident.bulk'
  | 'dashboard.view'
  | 'reports.view'
  | 'manager.console'
  | 'admin.users'
  | 'admin.settings'
  | 'admin.integrations';

const MATRIX: Record<AppRole, Permission[]> = {
  client: ['incident.create', 'incident.view.own'],
  developer: [
    'incident.view.assigned',
    'incident.update.status',
    'dashboard.view',
  ],
  manager: [
    'incident.create',
    'incident.view.all',
    'incident.update.status',
    'incident.assign',
    'incident.bulk',
    'dashboard.view',
    'reports.view',
    'manager.console',
  ],
  administrator: [
    'incident.create',
    'incident.view.all',
    'incident.update.status',
    'incident.assign',
    'incident.bulk',
    'dashboard.view',
    'reports.view',
    'manager.console',
    'admin.users',
    'admin.settings',
    'admin.integrations',
  ],
};

export function can(role: AppRole | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[role].includes(permission);
}
