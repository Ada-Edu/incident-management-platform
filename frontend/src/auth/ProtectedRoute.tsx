/** Route guard: requires an authenticated session and (optionally) a permission. */
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import type { Permission } from './rbac';

export function ProtectedRoute({
  children,
  permission,
}: {
  children: ReactNode;
  permission?: Permission;
}) {
  const { session, loading, can } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (permission && !can(permission)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 py-24 text-center">
        <h2 className="text-xl font-semibold">Access denied</h2>
        <p className="text-muted-foreground">
          You don't have permission to view this page.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
