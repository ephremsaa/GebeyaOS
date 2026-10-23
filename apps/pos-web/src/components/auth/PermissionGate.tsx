import React from 'react';
import { useAuth } from '../../auth/AuthContext';
import { RoleName } from '@gebeyaos/shared-types';

interface PermissionGateProps {
  permission?: string;
  permissions?: string[];
  role?: RoleName;
  roles?: RoleName[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const PermissionGate: React.FC<PermissionGateProps> = ({
  permission,
  permissions,
  role,
  roles,
  fallback = null,
  children,
}) => {
  const { hasPermission, hasAnyPermission, hasRole } = useAuth();

  let hasAccess = true;

  if (permission && !hasPermission(permission)) {
    hasAccess = false;
  }

  if (permissions && permissions.length > 0 && !hasAnyPermission(...permissions)) {
    hasAccess = false;
  }

  if (role && !hasRole(role)) {
    hasAccess = false;
  }

  if (roles && roles.length > 0 && !hasRole(...roles)) {
    hasAccess = false;
  }

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
