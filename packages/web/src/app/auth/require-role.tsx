import type { ReactNode } from 'react';
import { ForbiddenPage } from '../pages/forbidden-page';
import { useUserGroups } from './use-user-groups';

export function RequireRole({
  role,
  children,
}: {
  role: string;
  children: ReactNode;
}) {
  const groups = useUserGroups();
  if (!groups.includes(role)) {
    return <ForbiddenPage role={role} />;
  }
  return <>{children}</>;
}
