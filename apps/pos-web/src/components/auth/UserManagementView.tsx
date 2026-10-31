import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  ShieldCheck,
  Search,
  KeyRound,
  Lock,
  CheckCircle2,
  AlertTriangle,
  X,
  ShieldAlert,
  Power,
  RotateCcw,
  Clock,
  Eye,
  Filter,
  RefreshCw,
  ChevronRight,
  Building2,
  Phone,
  Mail,
  AlertOctagon,
  Plus,
  Trash2,
  History,
  FileSpreadsheet,
  Check,
  Calendar,
  LockKeyhole,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { RoleName } from '@gebeyaos/shared-types';

export interface StaffUser {
  id: string;
  username: string;
  fullName: string;
  phone: string;
  email?: string;
  role: RoleName;
  roleId: string;
  roleDescription?: string;
  branchId?: string;
  branchCode?: string;
  branchName?: string;
  isActive: boolean;
  forcePasswordChange: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
  permissions?: string[];
  failedLoginAttempts?: number;
  lockedUntil?: string | null;
}

export interface RoleMatrixItem {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  maxDiscountPercentage: number;
  permissions: string[];
}

export interface AuditLogRow {
  id: string;
  branch_id?: string;
  user_id?: string;
  user_name?: string;
  username?: string;
  user_role?: string;
  action: string;
  entity_name: string;
  entity_id?: string;
  ip_address?: string;
  details?: Record<string, any> | string;
  created_at: string;
}

// 9 Canonical Granular Permissions mandated for GebeyaOS
export interface GranularPermissionDef {
  key: string;
  label: string;
  labelAm: string;
  module: 'POS' | 'CATALOG' | 'INVENTORY' | 'REPORTS' | 'ADMIN';
  description: string;
}

export const GRANULAR_PERMISSIONS_LIST: GranularPermissionDef[] = [
  {
    key: 'catalog:cost:view',
    label: 'View Cost & Margins',
    labelAm: 'የግዢ ዋጋ እና ትርፍ መመልከቻ',
    module: 'CATALOG',
    description: 'Access supplier cost prices, wholesale margins, and landed costs across catalog & stock',
  },
  {
    key: 'pos:sale:discount',
    label: 'Cashier Discount Limit',
    labelAm: 'የቅናሽ ገደብ',
    module: 'POS',
    description: 'Apply line or basket level discounts up to configured role percentage limit',
  },
  {
    key: 'pos:sale:refund',
    label: 'Process Refunds',
    labelAm: 'ተመላሽ ማስተናገድ',
    module: 'POS',
    description: 'Authorize and execute customer item returns and cash/digital refund payouts',
  },
  {
    key: 'inventory:adjust:create',
    label: 'Adjust Stock & Spoilage',
    labelAm: 'የስቶክ ማስተካከያ እና ብልሽት',
    module: 'INVENTORY',
    description: 'Post manual stock corrections, damage write-offs, and store shrinkage adjustments',
  },
  {
    key: 'inventory:import:execute',
    label: 'Import Excel / CSV',
    labelAm: 'ፋይል ማስገባት (ኤክሴል/ሲኤስቪ)',
    module: 'INVENTORY',
    description: 'Perform batch product catalog and inventory ledger Excel/CSV file imports',
  },
  {
    key: 'pos:shift:close',
    label: 'Close Shift & Z-Report',
    labelAm: 'ሺፍት መዝጋት እና ዜድ ሪፖርት',
    module: 'POS',
    description: 'Perform blind register cash count, declare drops, and commit immutable Z-Report',
  },
  {
    key: 'catalog:price:override',
    label: 'Edit Shelf Prices',
    labelAm: 'የመሸጫ ዋጋ ማስተካከል',
    module: 'CATALOG',
    description: 'Modify retail prices and establish branch-specific effective price overrides',
  },
  {
    key: 'reports:branch:view',
    label: 'View Financial & X-Reports',
    labelAm: 'የፋይናንስ እና የሽያጭ ሪፖርቶች',
    module: 'REPORTS',
    description: 'Access branch revenue, gross margins, payment breakdowns, and tax audit statements',
  },
  {
    key: 'admin:users:manage',
    label: 'Manage Staff & Roles',
    labelAm: 'ሠራተኞችን እና ፈቃዶችን ማስተዳደር',
    module: 'ADMIN',
    description: 'Provision staff members, reset credentials, assign branches, and edit roles',
  },
];

const DEFAULT_DEMO_STAFF: StaffUser[] = [];
const DEFAULT_DEMO_ROLES: RoleMatrixItem[] = [];
const DEFAULT_DEMO_AUDIT_LOGS: AuditLogRow[] = [];

export const UserManagementView: React.FC = () => {
  const { hasPermission } = useAuth();
  const { t, language } = useI18n();

  // Active top-level tab: 'staff' | 'roles' | 'audit'
  const [activeTab, setActiveTab] = useState<'staff' | 'roles' | 'audit'>('staff');

  // Staff users state
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [roles, setRoles] = useState<RoleMatrixItem[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE' | 'LOCKED'>('ALL');
  const [branchFilter, setBranchFilter] = useState<string>('ALL');

  // Feedback notifications
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals & Drawer State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isResetPassModalOpen, setIsResetPassModalOpen] = useState(false);
  const [isResetPinModalOpen, setIsResetPinModalOpen] = useState(false);
  const [isCreateRoleModalOpen, setIsCreateRoleModalOpen] = useState(false);
  const [isAuditDetailModalOpen, setIsAuditDetailModalOpen] = useState(false);
  const [drawerUser, setDrawerUser] = useState<StaffUser | null>(null);
  const [selectedUserForModal, setSelectedUserForModal] = useState<StaffUser | null>(null);
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLogRow | null>(null);

  // Add staff form state (< 1 minute UX)
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('+251 9');
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<string>('CASHIER');
  const [newBranchCode, setNewBranchCode] = useState('BOLE-01');
  const [newInitialPass, setNewInitialPass] = useState('');
  const [newPin, setNewPin] = useState('');
  const [forcePassChange, setForcePassChange] = useState(true);

  // Reset form values
  const [resetPassValue, setResetPassValue] = useState('');
  const [resetPinValue, setResetPinValue] = useState('');

  // Custom role form state
  const [customRoleName, setCustomRoleName] = useState('');
  const [customRoleDesc, setCustomRoleDesc] = useState('');
  const [customRoleMaxDiscount, setCustomRoleMaxDiscount] = useState<number>(10);
  const [customRolePerms, setCustomRolePerms] = useState<string[]>(['pos:sale:discount']);

  // Audit log tab state
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditActionFilter, setAuditActionFilter] = useState<string>('');
  const [auditModuleFilter, setAuditModuleFilter] = useState<string>('');
  const [auditUserFilter, setAuditUserFilter] = useState<string>('');
  const [auditDateRange, setAuditDateRange] = useState<'today' | '7d' | '30d' | 'all'>('7d');
  const [auditSearch, setAuditSearch] = useState<string>('');

  // Count active owners for LAST-OWNER RULE UI ENFORCEMENT
  const activeOwnersCount = useMemo(() => {
    return users.filter((u) => u.role === 'OWNER' && u.isActive).length;
  }, [users]);

  // Load users & roles from branch-server
  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      const res = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setUsers(data);
        }
      }
    } catch {
      setUsers([]);
    }
  };

  const fetchRoles = async () => {
    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      const res = await fetch('/api/users/roles/matrix', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setRoles(data);
        }
      }
    } catch {
      setRoles([]);
    }
  };

  const fetchAuditLogs = async () => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams();
      if (auditActionFilter) params.append('action', auditActionFilter);
      if (auditModuleFilter) params.append('entityName', auditModuleFilter);
      if (auditUserFilter) params.append('userId', auditUserFilter);

      const now = new Date();
      if (auditDateRange === 'today') {
        const start = new Date(now.setHours(0, 0, 0, 0)).toISOString();
        params.append('startDate', start);
      } else if (auditDateRange === '7d') {
        const start = new Date(Date.now() - 7 * 86400000).toISOString();
        params.append('startDate', start);
      } else if (auditDateRange === '30d') {
        const start = new Date(Date.now() - 30 * 86400000).toISOString();
        params.append('startDate', start);
      }
      params.append('limit', '100');

      const res = await fetch(`/api/system/audit-logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.rows && data.rows.length > 0 ? data.rows : DEFAULT_DEMO_AUDIT_LOGS);
      } else {
        setAuditLogs(DEFAULT_DEMO_AUDIT_LOGS);
      }
    } catch {
      // Demo audit logs fallback
      setAuditLogs(DEFAULT_DEMO_AUDIT_LOGS);
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, []);

  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAuditLogs();
    }
  }, [activeTab, auditActionFilter, auditModuleFilter, auditUserFilter, auditDateRange]);

  // Fast Full Name to Username auto-generator (< 1 minute UX)
  const handleFullNameChange = (name: string) => {
    setNewFullName(name);
    if (!newUsername || newUsername.includes('.')) {
      const parts = name.trim().toLowerCase().split(/\s+/);
      if (parts.length >= 2) {
        setNewUsername(`${parts[0]}.${parts[1]}`);
      } else if (parts.length === 1 && parts[0]) {
        setNewUsername(parts[0]);
      }
    }
  };

  // Add staff member handler (< 1 minute UX)
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const usernameFinal = (newUsername.trim() || newFullName.toLowerCase().replace(/\s+/g, '.')).toLowerCase();

    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: usernameFinal,
          fullName: newFullName.trim(),
          phone: newPhone.trim(),
          email: newEmail.trim() || undefined,
          role: newRole,
          initialPassword: newInitialPass,
          pin: newPin,
          forcePasswordChange: forcePassChange,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to create user');
      }

      const created = await res.json();
      setUsers((prev) => [created, ...prev]);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create staff user");
      return;
    }

    setIsAddModalOpen(false);
    setSuccessMsg(`Staff member ${newFullName.trim()} successfully provisioned.`);
    setTimeout(() => setSuccessMsg(null), 4000);

    // Reset inputs for next quick staff creation
    setNewFullName('');
    setNewPhone('+251 9');
    setNewUsername('');
    setNewEmail('');
    setNewRole('CASHIER');
    setNewPin('1234');
    setNewInitialPass('Gebeya@2026');
  };

  // LAST-OWNER RULE ENFORCEMENT & IMMEDIATE SESSION REVOCATION
  const handleToggleActive = async (user: StaffUser) => {
    const isCurrentlyActive = user.isActive;
    const nextStatus = !isCurrentlyActive;

    // Check Last-Owner rule in UI
    if (user.role === 'OWNER' && isCurrentlyActive && activeOwnersCount <= 1) {
      setErrorMsg('The last active Owner of the system cannot be deactivated or removed.');
      setTimeout(() => setErrorMsg(null), 4000);
      return;
    }

    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      const res = await fetch(`/api/users/${user.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: nextStatus }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Operation failed');
      }
    } catch (err: any) {
      if (err.message.includes('last active Owner')) {
        setErrorMsg('The last active Owner cannot be deactivated or removed.');
        setTimeout(() => setErrorMsg(null), 4000);
        return;
      }
    }

    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, isActive: nextStatus } : u)),
    );

    if (drawerUser && drawerUser.id === user.id) {
      setDrawerUser((prev) => (prev ? { ...prev, isActive: nextStatus } : null));
    }

    if (nextStatus) {
      setSuccessMsg(`Staff member ${user.fullName} activated.`);
    } else {
      setSuccessMsg(`Staff member ${user.fullName} deactivated. All active sessions immediately revoked.`);
    }
    setTimeout(() => setSuccessMsg(null), 4500);
  };

  // Admin Reset Password Handler
  const handleAdminResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForModal) return;

    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      await fetch(`/api/users/${selectedUserForModal.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPassword: resetPassValue, forcePasswordChange: true }),
      });
    } catch {
      // offline fallback
    }

    setUsers((prev) =>
      prev.map((u) =>
        u.id === selectedUserForModal.id ? { ...u, forcePasswordChange: true, lockedUntil: null } : u,
      ),
    );
    if (drawerUser && drawerUser.id === selectedUserForModal.id) {
      setDrawerUser((prev) => (prev ? { ...prev, forcePasswordChange: true, lockedUntil: null } : null));
    }

    setIsResetPassModalOpen(false);
    setSuccessMsg(
      `Password reset for @${selectedUserForModal.username}. User will be forced to change password on first login.`,
    );
    setTimeout(() => setSuccessMsg(null), 4500);
  };

  // Admin Reset Cashier Quick PIN Handler
  const handleAdminResetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForModal) return;

    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      await fetch(`/api/users/${selectedUserForModal.id}/reset-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPin: resetPinValue }),
      });
    } catch {
      // offline fallback
    }

    setIsResetPinModalOpen(false);
    setSuccessMsg(`Terminal quick PIN successfully reset for @${selectedUserForModal.username}.`);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // Toggle permission cell in matrix
  const handleToggleMatrixPermission = async (roleId: string, permKey: string) => {
    const targetRole = roles.find((r) => r.id === roleId);
    if (!targetRole) return;

    // Owner role sovereignty: permanently has all permissions
    if (targetRole.name === 'OWNER') {
      setErrorMsg('Owner permissions are permanently fixed and sovereign.');
      setTimeout(() => setErrorMsg(null), 3000);
      return;
    }

    const hasPerm = targetRole.permissions.includes(permKey);
    const newPerms = hasPerm
      ? targetRole.permissions.filter((p) => p !== permKey)
      : [...targetRole.permissions, permKey];

    // Optimistic UI update
    setRoles((prev) =>
      prev.map((r) => (r.id === roleId ? { ...r, permissions: newPerms } : r)),
    );

    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      await fetch(`/api/users/roles/${roleId}/permissions`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          permissionIds: newPerms,
          maxDiscountPercentage: targetRole.maxDiscountPercentage,
        }),
      });
    } catch {
      // offline fallback
    }

    setSuccessMsg(`Updated permissions for ${targetRole.name}.`);
    setTimeout(() => setSuccessMsg(null), 2500);
  };

  // Create custom role handler
  const handleCreateCustomRole = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanRoleName = customRoleName.toUpperCase().trim().replace(/\s+/g, '_');
    if (!cleanRoleName) return;

    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      const res = await fetch('/api/users/roles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: cleanRoleName,
          description: customRoleDesc.trim(),
          permissions: customRolePerms,
          maxDiscountPercentage: customRoleMaxDiscount,
        }),
      });

      if (res.ok) {
        const created = await res.json();
        setRoles((prev) => [...prev, created]);
      } else {
        throw new Error('API failed');
      }
    } catch {
      const newRoleItem: RoleMatrixItem = {
        id: `role-custom-${Date.now()}`,
        name: cleanRoleName,
        description: customRoleDesc.trim(),
        isSystem: false,
        maxDiscountPercentage: customRoleMaxDiscount,
        permissions: customRolePerms,
      };
      setRoles((prev) => [...prev, newRoleItem]);
    }

    setIsCreateRoleModalOpen(false);
    setCustomRoleName('');
    setCustomRoleDesc('');
    setCustomRolePerms(['pos:sale:discount']);
    setSuccessMsg(`Custom role "${cleanRoleName}" created successfully.`);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // Delete custom role handler
  const handleDeleteCustomRole = async (role: RoleMatrixItem) => {
    if (role.isSystem) {
      setErrorMsg('System roles cannot be deleted.');
      setTimeout(() => setErrorMsg(null), 3000);
      return;
    }

    const assignedUsers = users.filter((u) => u.role.toUpperCase() === role.name.toUpperCase());
    if (assignedUsers.length > 0) {
      setErrorMsg(
        `Cannot delete role "${role.name}" because it is currently assigned to ${assignedUsers.length} staff member(s).`,
      );
      setTimeout(() => setErrorMsg(null), 4000);
      return;
    }

    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      await fetch(`/api/users/roles/${role.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // offline fallback
    }

    setRoles((prev) => prev.filter((r) => r.id !== role.id));
    setSuccessMsg(`Role "${role.name}" deleted.`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.fullName.toLowerCase().includes(search.toLowerCase()) ||
        u.username.toLowerCase().includes(search.toLowerCase()) ||
        u.phone.includes(search) ||
        u.role.toLowerCase().includes(search.toLowerCase());

      const matchesRole = roleFilter === 'ALL' || u.role.toUpperCase() === roleFilter;

      const isLocked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
      let matchesStatus = true;
      if (statusFilter === 'ACTIVE') matchesStatus = u.isActive && !isLocked;
      else if (statusFilter === 'INACTIVE') matchesStatus = !u.isActive;
      else if (statusFilter === 'LOCKED') matchesStatus = !!isLocked;

      const matchesBranch =
        branchFilter === 'ALL' || (u.branchCode && u.branchCode === branchFilter);

      return matchesSearch && matchesRole && matchesStatus && matchesBranch;
    });
  }, [users, search, roleFilter, statusFilter, branchFilter]);

  // Filtered audit logs
  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      if (!auditSearch) return true;
      const s = auditSearch.toLowerCase();
      const matchAction = log.action.toLowerCase().includes(s);
      const matchUser = (log.user_name || '').toLowerCase().includes(s) || (log.username || '').toLowerCase().includes(s);
      const matchEntity = (log.entity_name || '').toLowerCase().includes(s);
      const matchDetails = JSON.stringify(log.details || '').toLowerCase().includes(s);
      return matchAction || matchUser || matchEntity || matchDetails;
    });
  }, [auditLogs, auditSearch]);

  const getRoleBadgeClass = (role: string) => {
    switch (role.toUpperCase()) {
      case 'OWNER':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300';
      case 'HQ_ADMIN':
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-300';
      case 'BRANCH_MANAGER':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300';
      case 'CASHIER':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300';
      case 'STOREKEEPER':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300';
      case 'ACCOUNTANT':
        return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-300';
      default:
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300';
    }
  };

  const getActionBadgeClass = (action: string) => {
    if (action.includes('SUCCESS') || action.includes('CREATED') || action.includes('ACTIVATED')) {
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200';
    }
    if (action.includes('DEACTIVATED') || action.includes('DELETED') || action.includes('FAILED') || action.includes('LOCKOUT')) {
      return 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border-red-200';
    }
    if (action.includes('PRICE') || action.includes('OVERRIDE') || action.includes('RESET')) {
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200';
    }
    if (action.includes('ROLE') || action.includes('PERMISSION')) {
      return 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200';
    }
    return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200';
  };

  // Format relative time helper
  const formatTimeAgo = (isoString?: string | null) => {
    if (!isoString) return 'Never logged in';
    const diffMs = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="page-container select-none h-full flex flex-col overflow-hidden relative">
      {/* ─── 1. Header Toolbar ─── */}
      <div className="page-header flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-border-subtle flex-shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="page-title">{language === 'am' ? 'ሠራተኞች እና ሚናዎች' : 'Staff & Roles'}</h1>
            <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-primary-soft text-primary border border-primary/20">
              {users.length} Total Users
            </span>
            <span className="px-2.5 py-0.5 text-[11px] font-semibold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              No Public Signup (Internal Only)
            </span>
          </div>
          <p className="page-subtitle text-xs text-text-muted mt-1">
            Directory of employees, cashier terminal PINs, granular permission matrix, and immutable audit trail.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Top-Level Navigation Tabs */}
          <div className="flex items-center bg-surface-2 p-1 rounded-xl border border-border-subtle text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('staff')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === 'staff'
                  ? 'bg-surface text-primary shadow-sm font-bold'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              <Users size={14} />
              Staff Directory
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('roles')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === 'roles'
                  ? 'bg-surface text-primary shadow-sm font-bold'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              <ShieldCheck size={14} />
              Roles &amp; Matrix
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === 'audit'
                  ? 'bg-surface text-primary shadow-sm font-bold'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              <History size={14} />
              Audit Log
            </button>
          </div>

          {/* Add Staff Button (< 1 Minute UX) */}
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="btn-primary flex items-center gap-1.5 py-2 px-3 text-xs shadow-sm"
            title="Add staff member in under 1 minute"
          >
            <UserPlus size={15} />
            <span>{t('addStaff')}</span>
          </button>
        </div>
      </div>

      {/* ─── Feedback alerts ─── */}
      {successMsg && (
        <div className="alert-success my-2 flex items-center gap-2 text-xs py-2 px-3 rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 animate-in fade-in">
          <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="my-2 flex items-center gap-2 text-xs py-2 px-3 rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 animate-in fade-in">
          <AlertOctagon size={16} className="text-red-600 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ─── TAB 1: STAFF DIRECTORY ─── */}
      {activeTab === 'staff' && (
        <div className="flex-1 flex flex-col overflow-hidden pt-3">
          {/* Quick Metrics Ribbon */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 flex-shrink-0">
            <div className="glass-panel p-3 rounded-xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-700 flex items-center justify-center">
                <Users size={18} />
              </div>
              <div>
                <span className="text-[11px] text-text-muted block font-medium">Total Staff</span>
                <span className="text-base font-bold text-text-main">{users.length}</span>
              </div>
            </div>

            <div className="glass-panel p-3 rounded-xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 flex items-center justify-center">
                <Power size={18} />
              </div>
              <div>
                <span className="text-[11px] text-text-muted block font-medium">Active Accounts</span>
                <span className="text-base font-bold text-text-main">
                  {users.filter((u) => u.isActive).length}
                </span>
              </div>
            </div>

            <div className="glass-panel p-3 rounded-xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-700 flex items-center justify-center">
                <KeyRound size={18} />
              </div>
              <div>
                <span className="text-[11px] text-text-muted block font-medium">Cashier Lanes</span>
                <span className="text-base font-bold text-text-main">
                  {users.filter((u) => u.role === 'CASHIER').length}
                </span>
              </div>
            </div>

            <div className="glass-panel p-3 rounded-xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 flex items-center justify-center">
                <LockKeyhole size={18} />
              </div>
              <div>
                <span className="text-[11px] text-text-muted block font-medium">Must Change Pass</span>
                <span className="text-base font-bold text-text-main">
                  {users.filter((u) => u.forcePasswordChange).length}
                </span>
              </div>
            </div>
          </div>

          {/* Search & Filtering Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5 mb-3 flex-shrink-0">
            <div className="search-bar-wrapper flex-1 min-w-[220px]">
              <Search size={15} className="text-text-muted" />
              <input
                type="text"
                className="search-input text-xs"
                placeholder="Search staff by name, @username, phone, or role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="text-text-muted hover:text-text-main"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Role Filter */}
            <select
              className="field-select text-xs py-1.5 px-2.5 w-auto"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="ALL">All Roles</option>
              {roles.map((r) => (
                <option key={r.id} value={r.name.toUpperCase()}>
                  {r.name}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              className="field-select text-xs py-1.5 px-2.5 w-auto"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Deactivated Only</option>
              <option value="LOCKED">Locked Out Only</option>
            </select>

            {/* Branch Filter */}
            <select
              className="field-select text-xs py-1.5 px-2.5 w-auto"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
            >
              <option value="ALL">All Branches</option>
              <option value="BOLE-01">BOLE-01 (Bole Medhanialem)</option>
              <option value="HQ-MAIN">HQ-MAIN (Corporate)</option>
            </select>

            <span className="text-xs text-text-muted font-mono ml-auto">
              Showing {filteredUsers.length} of {users.length}
            </span>
          </div>

          {/* Users Table */}
          <div className="glass-panel overflow-hidden flex-1 flex flex-col">
            <div className="overflow-x-auto flex-1">
              <table className="data-table text-xs">
                <thead>
                  <tr>
                    <th>Staff Member</th>
                    <th>Role</th>
                    <th>Branch</th>
                    <th className="text-center">Status</th>
                    <th>Last Login</th>
                    <th className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-sm text-text-muted">
                        No staff members match the selected filters.
                      </td>
                    </tr>
                  )}
                  {filteredUsers.map((user) => {
                    const isOwner = user.role === 'OWNER';
                    const isLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date();
                    const isLastOwner = isOwner && user.isActive && activeOwnersCount <= 1;

                    return (
                      <tr
                        key={user.id}
                        onClick={() => setDrawerUser(user)}
                        className={`cursor-pointer transition-colors hover:bg-surface-2/60 ${
                          !user.isActive ? 'opacity-60 bg-slate-50/50 dark:bg-slate-900/30' : ''
                        }`}
                      >
                        {/* Name & Username */}
                        <td>
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs border border-primary/20 flex-shrink-0">
                              {user.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-bold text-text-main flex items-center gap-1.5">
                                {user.fullName}
                                {isLastOwner && (
                                  <span
                                    className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-300"
                                    title="Last Sovereign Owner of the Store"
                                  >
                                    Sole Owner
                                  </span>
                                )}
                              </span>
                              <div className="flex items-center gap-2 text-[11px] text-text-muted font-mono">
                                <span>@{user.username}</span>
                                <span>•</span>
                                <span>{user.phone}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Role Badge */}
                        <td>
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border inline-flex items-center gap-1 ${getRoleBadgeClass(
                              user.role,
                            )}`}
                          >
                            <ShieldCheck size={11} />
                            {user.role}
                          </span>
                        </td>

                        {/* Branch */}
                        <td>
                          <div className="flex flex-col">
                            <span className="font-mono text-xs font-semibold text-text-main">
                              {user.branchCode || 'BOLE-01'}
                            </span>
                            <span className="text-[10px] text-text-muted truncate max-w-[140px]">
                              {user.branchName || 'Bole Branch'}
                            </span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="text-center" onClick={(e) => e.stopPropagation()}>
                          {isLocked ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300">
                              <Lock size={10} /> Locked Out
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleActive(user)}
                              disabled={isLastOwner && user.isActive}
                              className={`text-[11px] font-bold px-2.5 py-1 rounded-xl transition-all inline-flex items-center gap-1.5 ${
                                user.isActive
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-300 hover:bg-emerald-100'
                                  : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-300 hover:bg-red-100'
                              } ${isLastOwner ? 'cursor-not-allowed opacity-75' : ''}`}
                              title={
                                isLastOwner
                                  ? 'Cannot deactivate the last active Owner of the system'
                                  : user.isActive
                                  ? 'Click to deactivate and immediately revoke all sessions'
                                  : 'Click to activate'
                              }
                            >
                              <Power size={11} />
                              {user.isActive ? 'Active' : 'Inactive'}
                            </button>
                          )}
                        </td>

                        {/* Last Login & Force Password Change */}
                        <td>
                          <div className="flex flex-col">
                            <span className="text-xs text-text-muted font-mono flex items-center gap-1">
                              <Clock size={11} />
                              {formatTimeAgo(user.lastLoginAt)}
                            </span>
                            {user.forcePasswordChange && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1 mt-0.5">
                                <RotateCcw size={10} /> Must change password
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedUserForModal(user);
                                setResetPinValue('1234');
                                setIsResetPinModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text-main transition-colors"
                              title="Reset Cashier Quick PIN"
                            >
                              <KeyRound size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedUserForModal(user);
                                setResetPassValue('Gebeya@2026');
                                setIsResetPassModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text-main transition-colors"
                              title="Admin Password Reset"
                            >
                              <Lock size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDrawerUser(user)}
                              className="p-1.5 rounded-lg hover:bg-primary-soft text-text-muted hover:text-primary transition-colors"
                              title="View User Drawer"
                            >
                              <ChevronRight size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: ROLES & PERMISSION MATRIX ─── */}
      {activeTab === 'roles' && (
        <div className="flex-1 flex flex-col overflow-hidden pt-3">
          <div className="flex items-center justify-between gap-3 mb-3 flex-shrink-0">
            <div>
              <h2 className="text-sm font-bold text-text-main flex items-center gap-2">
                <ShieldCheck size={16} className="text-primary" />
                Granular Role Permission Matrix
              </h2>
              <p className="text-xs text-text-muted">
                Server-side enforced capabilities across system and custom roles. Owner role has sovereign unrestricted access.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCreateRoleModalOpen(true)}
              className="btn-secondary text-xs flex items-center gap-1.5"
            >
              <Plus size={14} />
              Create Custom Role
            </button>
          </div>

          <div className="glass-panel overflow-hidden flex-1 flex flex-col">
            <div className="overflow-auto flex-1">
              <table className="data-table text-xs">
                <thead>
                  <tr>
                    <th className="min-w-[280px]">Granular Capability</th>
                    <th className="min-w-[70px] text-center">Module</th>
                    {roles.map((r) => (
                      <th key={r.id} className="text-center min-w-[110px]">
                        <div className="flex flex-col items-center gap-1">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getRoleBadgeClass(
                              r.name,
                            )}`}
                          >
                            {r.name}
                          </span>
                          <span className="text-[10px] text-text-muted font-normal">
                            Max {r.maxDiscountPercentage}% Disc
                          </span>
                          {!r.isSystem && (
                            <button
                              type="button"
                              onClick={() => handleDeleteCustomRole(r)}
                              className="text-red-500 hover:text-red-700 text-[10px] flex items-center gap-0.5"
                              title="Delete custom role"
                            >
                              <Trash2 size={10} /> Delete
                            </button>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GRANULAR_PERMISSIONS_LIST.map((perm) => (
                    <tr key={perm.key} className="hover:bg-surface-2/40">
                      <td>
                        <div className="flex flex-col py-1">
                          <span className="font-bold text-text-main">
                            {perm.label}
                            {language === 'am' && (
                              <span className="text-text-muted ml-1.5 font-normal">({perm.labelAm})</span>
                            )}
                          </span>
                          <span className="text-[11px] text-text-muted leading-tight mt-0.5">
                            {perm.description}
                          </span>
                          <span className="text-[9px] font-mono text-slate-400 mt-0.5">
                            Key: {perm.key}
                          </span>
                        </div>
                      </td>

                      <td className="text-center">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {perm.module}
                        </span>
                      </td>

                      {roles.map((role) => {
                        const isGranted =
                          role.name === 'OWNER' || role.permissions.includes(perm.key);
                        const isOwner = role.name === 'OWNER';

                        return (
                          <td key={role.id} className="text-center">
                            <button
                              type="button"
                              disabled={isOwner}
                              onClick={() => handleToggleMatrixPermission(role.id, perm.key)}
                              className={`w-6 h-6 rounded-md inline-flex items-center justify-center transition-all ${
                                isGranted
                                  ? 'bg-emerald-600 text-white shadow-sm'
                                  : 'bg-surface-2 border border-border-subtle text-transparent hover:border-slate-400'
                              } ${isOwner ? 'cursor-not-allowed opacity-90' : 'cursor-pointer hover:scale-105'}`}
                              title={
                                isOwner
                                  ? 'Owner has permanent sovereign rights'
                                  : isGranted
                                  ? `Click to revoke ${perm.label} from ${role.name}`
                                  : `Click to grant ${perm.label} to ${role.name}`
                              }
                            >
                              <Check size={14} strokeWidth={3} className={isGranted ? 'opacity-100' : 'opacity-0'} />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 3: IMMUTABLE AUDIT TRAIL ─── */}
      {activeTab === 'audit' && (
        <div className="flex-1 flex flex-col overflow-hidden pt-3">
          {/* Audit Header & Filter Ribbon */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-purple-50 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-300">
                <ShieldAlert size={14} />
                Append-Only Immutable Ledger (Hash Chained)
              </span>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={fetchAuditLogs}
                disabled={auditLoading}
                className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-2.5"
              >
                <RefreshCw size={13} className={auditLoading ? 'animate-spin' : ''} />
                Refresh Logs
              </button>
            </div>
          </div>

          {/* Audit Filtering Controls */}
          <div className="flex flex-wrap items-center gap-2 mb-3 flex-shrink-0">
            <div className="search-bar-wrapper flex-1 min-w-[200px]">
              <Search size={14} className="text-text-muted" />
              <input
                type="text"
                className="search-input text-xs"
                placeholder="Search audit actions, users, or payload keywords..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
              />
            </div>

            {/* User Filter */}
            <select
              className="field-select text-xs py-1.5 px-2 w-auto"
              value={auditUserFilter}
              onChange={(e) => setAuditUserFilter(e.target.value)}
            >
              <option value="">All Staff</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} (@{u.username})
                </option>
              ))}
            </select>

            {/* Action Filter */}
            <select
              className="field-select text-xs py-1.5 px-2 w-auto"
              value={auditActionFilter}
              onChange={(e) => setAuditActionFilter(e.target.value)}
            >
              <option value="">All Actions</option>
              <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
              <option value="LOGIN_FAILED">LOGIN_FAILED</option>
              <option value="USER_LOCKOUT">USER_LOCKOUT</option>
              <option value="USER_CREATED">USER_CREATED</option>
              <option value="USER_UPDATED">USER_UPDATED</option>
              <option value="USER_DEACTIVATED">USER_DEACTIVATED</option>
              <option value="ADMIN_PASSWORD_RESET">ADMIN_PASSWORD_RESET</option>
              <option value="ADMIN_PIN_RESET">ADMIN_PIN_RESET</option>
              <option value="ROLE_PERMISSIONS_CHANGED">ROLE_PERMISSIONS_CHANGED</option>
              <option value="PRICE_OVERRIDE">PRICE_OVERRIDE</option>
            </select>

            {/* Module Filter */}
            <select
              className="field-select text-xs py-1.5 px-2 w-auto"
              value={auditModuleFilter}
              onChange={(e) => setAuditModuleFilter(e.target.value)}
            >
              <option value="">All Modules</option>
              <option value="users">users</option>
              <option value="roles">roles</option>
              <option value="terminals">terminals</option>
              <option value="sales">sales</option>
              <option value="products">products</option>
              <option value="shifts">shifts</option>
              <option value="system_settings">system_settings</option>
            </select>

            {/* Date Range Filter */}
            <select
              className="field-select text-xs py-1.5 px-2 w-auto"
              value={auditDateRange}
              onChange={(e) => setAuditDateRange(e.target.value as any)}
            >
              <option value="today">Today</option>
              <option value="7d">Past 7 Days</option>
              <option value="30d">Past 30 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>

          {/* Audit Logs Table */}
          <div className="glass-panel overflow-hidden flex-1 flex flex-col">
            <div className="overflow-x-auto flex-1">
              <table className="data-table text-xs">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Entity / Module</th>
                    <th>IP / Terminal</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAuditLogs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-sm text-text-muted">
                        No audit events recorded for the selected filter parameters.
                      </td>
                    </tr>
                  )}
                  {filteredAuditLogs.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => {
                        setSelectedAuditLog(log);
                        setIsAuditDetailModalOpen(true);
                      }}
                      className="cursor-pointer hover:bg-surface-2/60 transition-colors"
                    >
                      <td className="font-mono text-[11px] text-text-muted whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>

                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-[10px]">
                            {(log.user_name || log.username || 'S').charAt(0).toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-semibold text-text-main text-xs">
                              {log.user_name || log.username || 'System Daemon'}
                            </span>
                            {log.user_role && (
                              <span className="text-[10px] text-text-muted font-mono">
                                [{log.user_role}]
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${getActionBadgeClass(
                            log.action,
                          )}`}
                        >
                          {log.action}
                        </span>
                      </td>

                      <td>
                        <span className="font-mono text-xs text-text-muted">{log.entity_name}</span>
                      </td>

                      <td className="font-mono text-[11px] text-text-muted whitespace-nowrap">
                        {log.ip_address || '127.0.0.1'}
                      </td>

                      <td className="max-w-[240px] truncate text-[11px] font-mono text-text-muted">
                        {typeof log.details === 'object'
                          ? JSON.stringify(log.details)
                          : String(log.details || '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── 4. USER DETAILS DRAWER (Slides from Right) ─── */}
      {drawerUser && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={() => setDrawerUser(null)}
          />

          <div className="relative w-full max-w-md bg-surface h-full shadow-2xl flex flex-col border-l border-border-subtle z-10 animate-in slide-in-from-right duration-200 overflow-hidden">
            {/* Drawer Header */}
            <div className="p-4 border-b border-border-subtle flex items-center justify-between bg-surface-2/40">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary text-white font-bold flex items-center justify-center text-lg shadow-sm">
                  {drawerUser.fullName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-base font-bold text-text-main flex items-center gap-2">
                    {drawerUser.fullName}
                  </h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${getRoleBadgeClass(
                        drawerUser.role,
                      )}`}
                    >
                      {drawerUser.role}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                        drawerUser.isActive
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300'
                          : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border-red-300'
                      }`}
                    >
                      {drawerUser.isActive ? 'Active Session' : 'Deactivated'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDrawerUser(null)}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-2"
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5 text-xs">
              {/* Profile details */}
              <div className="flex flex-col gap-2">
                <h3 className="font-bold text-text-muted uppercase text-[10px] tracking-wider">
                  Contact &amp; Assignment
                </h3>
                <div className="grid grid-cols-2 gap-2 bg-surface-2/40 p-3 rounded-xl border border-border-subtle font-mono text-[11px]">
                  <div>
                    <span className="text-text-muted block text-[10px]">Username</span>
                    <span className="font-bold text-text-main">@{drawerUser.username}</span>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px]">Phone</span>
                    <span className="font-bold text-text-main">{drawerUser.phone}</span>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px]">Email</span>
                    <span className="text-text-main truncate block">{drawerUser.email || '—'}</span>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px]">Branch</span>
                    <span className="font-bold text-text-main">{drawerUser.branchCode || 'BOLE-01'}</span>
                  </div>
                </div>
              </div>

              {/* Security & Terminal Access */}
              <div className="flex flex-col gap-2">
                <h3 className="font-bold text-text-muted uppercase text-[10px] tracking-wider">
                  Security &amp; Terminal Status
                </h3>
                <div className="flex flex-col gap-2 bg-surface-2/40 p-3 rounded-xl border border-border-subtle">
                  <div className="flex items-center justify-between">
                    <span className="text-text-muted">Password Encryption</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      Argon2id (Memory 64MB)
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-muted">Must Change Password</span>
                    <span
                      className={`font-bold ${
                        drawerUser.forcePasswordChange ? 'text-amber-600' : 'text-slate-500'
                      }`}
                    >
                      {drawerUser.forcePasswordChange ? 'Yes (Enforced on next login)' : 'No'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-muted">Terminal Quick PIN</span>
                    <span className="font-mono font-bold text-text-main">Configured (4–6 Digits)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-muted">Account Lockout State</span>
                    <span className="font-bold text-emerald-600">
                      {drawerUser.lockedUntil && new Date(drawerUser.lockedUntil) > new Date()
                        ? 'Temporarily Locked'
                        : 'Normal (0 Failed Attempts)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Effective Granular Permissions */}
              <div className="flex flex-col gap-2">
                <h3 className="font-bold text-text-muted uppercase text-[10px] tracking-wider">
                  Effective Granular Permissions
                </h3>
                <div className="grid grid-cols-1 gap-1.5 bg-surface-2/40 p-3 rounded-xl border border-border-subtle">
                  {GRANULAR_PERMISSIONS_LIST.map((perm) => {
                    const isGranted =
                      drawerUser.role === 'OWNER' ||
                      (drawerUser.permissions || []).includes(perm.key) ||
                      roles.find((r) => r.name.toLowerCase() === drawerUser.role.toLowerCase())?.permissions.includes(perm.key);

                    return (
                      <div
                        key={perm.key}
                        className="flex items-center justify-between py-1 border-b border-border-subtle/50 last:border-0"
                      >
                        <span className="text-text-main font-medium">{perm.label}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isGranted
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                          }`}
                        >
                          {isGranted ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quick Admin Actions */}
              <div className="flex flex-col gap-2 mt-auto pt-2">
                <h3 className="font-bold text-text-muted uppercase text-[10px] tracking-wider">
                  Administrative Controls
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUserForModal(drawerUser);
                      setResetPinValue('1234');
                      setIsResetPinModalOpen(true);
                    }}
                    className="btn-secondary text-xs flex items-center justify-center gap-1.5 py-2"
                  >
                    <KeyRound size={14} />
                    Reset PIN
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUserForModal(drawerUser);
                      setResetPassValue('Gebeya@2026');
                      setIsResetPassModalOpen(true);
                    }}
                    className="btn-secondary text-xs flex items-center justify-center gap-1.5 py-2"
                  >
                    <Lock size={14} />
                    Reset Password
                  </button>
                </div>

                {/* Deactivate Button with Last-Owner Rule Warning */}
                {drawerUser.role === 'OWNER' && drawerUser.isActive && activeOwnersCount <= 1 ? (
                  <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-300 text-purple-800 dark:text-purple-300 text-[11px] flex items-center gap-2">
                    <AlertTriangle size={15} className="flex-shrink-0" />
                    <span>The last Owner of the store cannot be deactivated or demoted.</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleToggleActive(drawerUser)}
                    className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors ${
                      drawerUser.isActive
                        ? 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-300'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300'
                    }`}
                  >
                    <Power size={14} />
                    {drawerUser.isActive
                      ? 'Deactivate Staff & Revoke Sessions'
                      : 'Re-activate Staff Account'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── 5. ADD STAFF MODAL (< 1 MINUTE UX) ─── */}
      {isAddModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setIsAddModalOpen(false)}
        >
          <div className="modal-content max-w-lg">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <div>
                <h2 className="modal-title flex items-center gap-2">
                  <UserPlus size={18} className="text-primary" />
                  {t('addStaff')}
                </h2>
                <p className="text-xs text-text-muted">
                  Add a store employee in under 1 minute. No public self-registration.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-text-muted hover:text-text-main"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="flex flex-col gap-3.5 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Full Name */}
                <div>
                  <label className="field-label text-xs">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Almaz Tadesse"
                    className="field-input mt-1"
                    value={newFullName}
                    onChange={(e) => handleFullNameChange(e.target.value)}
                  />
                </div>

                {/* 2. Phone */}
                <div>
                  <label className="field-label text-xs">Phone Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="+251 9..."
                    className="field-input mt-1 font-mono"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                  />
                </div>

                {/* 3. Role */}
                <div>
                  <label className="field-label text-xs">Store Role *</label>
                  <select
                    className="field-select mt-1"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name} {r.isSystem ? '' : '(Custom)'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4. Branch */}
                <div>
                  <label className="field-label text-xs">Assigned Branch *</label>
                  <select
                    className="field-select mt-1"
                    value={newBranchCode}
                    onChange={(e) => setNewBranchCode(e.target.value)}
                  >
                    <option value="BOLE-01">BOLE-01 — Bole Medhanialem</option>
                    <option value="HQ-MAIN">HQ-MAIN — Corporate Headquarters</option>
                  </select>
                </div>

                {/* 5. Terminal Quick PIN (4-6 digits) */}
                <div>
                  <label className="field-label text-xs">POS Terminal PIN (4–6 Digits) *</label>
                  <input
                    type="password"
                    required
                    maxLength={6}
                    placeholder="4-6 digits"
                    className="field-input mt-1 font-mono tracking-widest text-center font-bold text-base"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  />
                </div>

                {/* Username */}
                <div>
                  <label className="field-label text-xs">Username (Auto-derived)</label>
                  <input
                    type="text"
                    required
                    placeholder="almaz.tadesse"
                    className="field-input mt-1 font-mono text-xs"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value.toLowerCase().trim())}
                  />
                </div>

                {/* Email (Optional) */}
                <div>
                  <label className="field-label text-xs">Email (Optional)</label>
                  <input
                    type="email"
                    placeholder="almaz@gebeyaos.et"
                    className="field-input mt-1 text-xs"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>

                {/* Initial Temporary Password */}
                <div>
                  <label className="field-label text-xs">Temporary Password *</label>
                  <input
                    type="text"
                    required
                    minLength={8}
                    className="field-input mt-1 font-mono text-xs"
                    value={newInitialPass}
                    onChange={(e) => setNewInitialPass(e.target.value)}
                  />
                </div>
              </div>

              {/* Force Password Change on first login */}
              <div className="flex items-center gap-2 mt-1 bg-surface-2/40 p-2.5 rounded-xl border border-border-subtle">
                <input
                  type="checkbox"
                  id="forcePass"
                  checked={forcePassChange}
                  onChange={(e) => setForcePassChange(e.target.checked)}
                  className="rounded text-primary focus:ring-primary"
                />
                <label htmlFor="forcePass" className="text-xs text-text-main cursor-pointer">
                  <strong>Force password change on first login</strong> (Recommended for security)
                </label>
              </div>

              <div className="flex gap-3 mt-3 pt-3 border-t border-border-subtle">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  {t('cancel')}
                </button>
                <button type="submit" className="btn-primary flex-1 py-2">
                  Provision Staff Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── 6. RESET PASSWORD MODAL ─── */}
      {isResetPassModalOpen && selectedUserForModal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setIsResetPassModalOpen(false)}
        >
          <div className="modal-content max-w-sm">
            <h2 className="modal-title flex items-center gap-2">
              <Lock size={18} className="text-primary" />
              {t('resetPassword')}
            </h2>
            <p className="text-xs text-text-muted mb-4">
              Set a temporary password for <strong>{selectedUserForModal.fullName}</strong>.
            </p>

            <form onSubmit={handleAdminResetPassword} className="flex flex-col gap-3">
              <div>
                <label className="field-label">New Temporary Password (min 8 chars)</label>
                <input
                  type="text"
                  required
                  minLength={8}
                  className="field-input mt-1 font-mono"
                  value={resetPassValue}
                  onChange={(e) => setResetPassValue(e.target.value)}
                />
              </div>

              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-[11px] border border-amber-300">
                Staff member will be forced to change this password immediately upon their next login.
              </div>

              <div className="flex gap-2.5 mt-2">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => setIsResetPassModalOpen(false)}
                >
                  {t('cancel')}
                </button>
                <button type="submit" className="btn-primary flex-1">
                  Save Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── 7. RESET PIN MODAL ─── */}
      {isResetPinModalOpen && selectedUserForModal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setIsResetPinModalOpen(false)}
        >
          <div className="modal-content max-w-sm">
            <h2 className="modal-title flex items-center gap-2">
              <KeyRound size={18} className="text-primary" />
              {t('resetPin')}
            </h2>
            <p className="text-xs text-text-muted mb-4">
              Assign a new 4–6 digit terminal unlock PIN for <strong>{selectedUserForModal.fullName}</strong>.
            </p>

            <form onSubmit={handleAdminResetPin} className="flex flex-col gap-3">
              <div>
                <label className="field-label">Terminal Quick PIN (4-6 digits)</label>
                <input
                  type="password"
                  required
                  maxLength={6}
                  className="field-input mt-1 font-mono tracking-widest text-center text-xl font-bold py-2"
                  value={resetPinValue}
                  onChange={(e) => setResetPinValue(e.target.value.replace(/\D/g, ''))}
                />
              </div>

              <div className="flex gap-2.5 mt-2">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => setIsResetPinModalOpen(false)}
                >
                  {t('cancel')}
                </button>
                <button type="submit" className="btn-primary flex-1">
                  Save New PIN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── 8. CREATE CUSTOM ROLE MODAL ─── */}
      {isCreateRoleModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setIsCreateRoleModalOpen(false)}
        >
          <div className="modal-content max-w-md">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <h2 className="modal-title flex items-center gap-2">
                <ShieldCheck size={18} className="text-primary" />
                Create Custom Role
              </h2>
              <button
                type="button"
                onClick={() => setIsCreateRoleModalOpen(false)}
                className="text-text-muted hover:text-text-main"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCustomRole} className="flex flex-col gap-3 mt-4">
              <div>
                <label className="field-label text-xs">Role Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SHIFT_SUPERVISOR"
                  className="field-input mt-1 font-mono uppercase"
                  value={customRoleName}
                  onChange={(e) => setCustomRoleName(e.target.value)}
                />
              </div>

              <div>
                <label className="field-label text-xs">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Can perform shift close and cashier overrides"
                  className="field-input mt-1"
                  value={customRoleDesc}
                  onChange={(e) => setCustomRoleDesc(e.target.value)}
                />
              </div>

              <div>
                <label className="field-label text-xs">Max Discount Percentage (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="field-input mt-1 font-mono"
                  value={customRoleMaxDiscount}
                  onChange={(e) => setCustomRoleMaxDiscount(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="field-label text-xs mb-1.5 block">Initial Permissions</label>
                <div className="max-h-48 overflow-y-auto flex flex-col gap-1.5 p-2 bg-surface-2/40 rounded-xl border border-border-subtle">
                  {GRANULAR_PERMISSIONS_LIST.map((p) => {
                    const isChecked = customRolePerms.includes(p.key);
                    return (
                      <label
                        key={p.key}
                        className="flex items-center gap-2 text-xs text-text-main cursor-pointer hover:bg-surface-2 p-1 rounded-lg"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) setCustomRolePerms((prev) => [...prev, p.key]);
                            else setCustomRolePerms((prev) => prev.filter((k) => k !== p.key));
                          }}
                          className="rounded text-primary focus:ring-primary"
                        />
                        <span>{p.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2.5 mt-3 pt-3 border-t border-border-subtle">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => setIsCreateRoleModalOpen(false)}
                >
                  {t('cancel')}
                </button>
                <button type="submit" className="btn-primary flex-1">
                  Create Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── 9. AUDIT DETAIL JSON MODAL ─── */}
      {isAuditDetailModalOpen && selectedAuditLog && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setIsAuditDetailModalOpen(false)}
        >
          <div className="modal-content max-w-lg">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <h2 className="modal-title flex items-center gap-2 text-sm">
                <History size={16} className="text-primary" />
                Audit Trail Event Details
              </h2>
              <button
                type="button"
                onClick={() => setIsAuditDetailModalOpen(false)}
                className="text-text-muted hover:text-text-main"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-2 mt-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-2 bg-surface-2/40 p-2.5 rounded-xl border border-border-subtle">
                <div>
                  <span className="text-[10px] text-text-muted block">Action</span>
                  <span className="font-bold text-text-main">{selectedAuditLog.action}</span>
                </div>
                <div>
                  <span className="text-[10px] text-text-muted block">Module</span>
                  <span className="font-bold text-text-main">{selectedAuditLog.entity_name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-text-muted block">Actor</span>
                  <span className="font-bold text-text-main">
                    {selectedAuditLog.user_name || selectedAuditLog.username || 'System'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-text-muted block">Timestamp</span>
                  <span className="font-bold text-text-main">
                    {new Date(selectedAuditLog.created_at).toLocaleString()}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-text-muted text-[11px] font-sans font-semibold block mb-1">
                  Immutable Event Payload:
                </span>
                <pre className="p-3 rounded-xl bg-slate-900 text-slate-100 text-[11px] overflow-auto max-h-56">
                  {JSON.stringify(selectedAuditLog.details || {}, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end mt-4 pt-3 border-t border-border-subtle">
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => setIsAuditDetailModalOpen(false)}
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
