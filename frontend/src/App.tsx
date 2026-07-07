import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { IncidentsPage } from '@/pages/IncidentsPage';
import { CreateIncidentPage } from '@/pages/CreateIncidentPage';
import { IncidentDetailPage } from '@/pages/IncidentDetailPage';
import { DocumentExtractionPage } from '@/pages/DocumentExtractionPage';
import { ManagerConsolePage } from '@/pages/ManagerConsolePage';
import { ReportsPage } from '@/pages/ReportsPage';
import { AdminPage } from '@/pages/AdminPage';
import type { ReactNode } from 'react';
import type { Permission } from '@/auth/rbac';

/** Wrap a page in the shell + auth/permission guard. */
function Shell({ children, permission }: { children: ReactNode; permission?: Permission }) {
  return (
    <ProtectedRoute permission={permission}>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}

/** Landing page: staff see the dashboard; clients go straight to their incidents. */
function Home() {
  const { can } = useAuth();
  return can('dashboard.view') ? <DashboardPage /> : <Navigate to="/incidents" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />

          <Route path="/" element={<Shell><Home /></Shell>} />
          <Route path="/incidents" element={<Shell><IncidentsPage /></Shell>} />
          <Route path="/incidents/new" element={<Shell permission="incident.create"><CreateIncidentPage /></Shell>} />
          <Route path="/incidents/:id" element={<Shell><IncidentDetailPage /></Shell>} />
          <Route path="/extraction" element={<Shell><DocumentExtractionPage /></Shell>} />
          <Route path="/console" element={<Shell permission="manager.console"><ManagerConsolePage /></Shell>} />
          <Route path="/reports" element={<Shell permission="reports.view"><ReportsPage /></Shell>} />
          <Route path="/admin" element={<Shell permission="admin.settings"><AdminPage /></Shell>} />

          <Route path="*" element={<Shell><div className="py-24 text-center text-muted-foreground">Page not found.</div></Shell>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
