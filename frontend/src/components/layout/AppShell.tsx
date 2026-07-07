import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Ticket,
  PlusCircle,
  Users2,
  BarChart3,
  Settings,
  LogOut,
  ShieldAlert,
  ScanText,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import type { Permission } from '@/auth/rbac';
import { ROLE_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { ChatbotWidget } from '@/components/chatbot/ChatbotWidget';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  permission?: Permission;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard className="size-4" />, permission: 'dashboard.view' },
  { to: '/incidents', label: 'Incidents', icon: <Ticket className="size-4" /> },
  { to: '/incidents/new', label: 'Log Incident', icon: <PlusCircle className="size-4" />, permission: 'incident.create' },
  { to: '/extraction', label: 'Document Extraction', icon: <ScanText className="size-4" /> },
  { to: '/console', label: 'Manager Console', icon: <Users2 className="size-4" />, permission: 'manager.console' },
  { to: '/reports', label: 'Reports', icon: <BarChart3 className="size-4" />, permission: 'reports.view' },
  { to: '/admin', label: 'Administration', icon: <Settings className="size-4" />, permission: 'admin.settings' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut, can } = useAuth();
  const navigate = useNavigate();

  const visibleNav = NAV.filter((n) => !n.permission || can(n.permission));

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col border-r bg-card md:flex">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <ShieldAlert className="size-6 text-primary" />
          <div>
            <p className="text-sm font-semibold leading-tight">Incident Platform</p>
            <p className="text-xs text-muted-foreground">AI-Powered ITSM</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main column */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b bg-card px-6 py-3">
          <div className="md:hidden">
            <span className="font-semibold">Incident Platform</span>
          </div>
          <div className="flex flex-1 items-center justify-end gap-4">
            <div className="text-right">
              <p className="text-sm font-medium">{profile?.full_name ?? profile?.email}</p>
              <p className="text-xs text-muted-foreground">
                {profile ? ROLE_LABELS[profile.role] : ''}
              </p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {(profile?.full_name ?? profile?.email ?? '?').slice(0, 1).toUpperCase()}
            </div>
            <button
              onClick={async () => {
                await signOut();
                navigate('/login');
              }}
              className="text-muted-foreground hover:text-foreground"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>

      <ChatbotWidget />
    </div>
  );
}
