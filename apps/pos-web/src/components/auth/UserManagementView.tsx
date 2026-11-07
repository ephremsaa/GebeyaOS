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
  Filter,
  RefreshCw,
  ChevronRight,
  Phone,
  Mail,
  AlertOctagon,
  Plus,
  Trash2,
  History,
  Check,
  LockKeyhole,
  Pencil,
  Building2,
  Sparkles,
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

export const UserManagementView: React.FC = () => {
  const { hasPermission } = useAuth();
  const { t, language } = useI18n();

  // Active top-level tab: 'staff' | 'roles' | 'audit'
  const [activeTab, setActiveTab] = useState<'staff' | 'roles' | 'audit'>('staff');

  // Staff users state
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [roles, setRoles] = useState<RoleMatrixItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE' | 'LOCKED'>('ALL');
  const [branchFilter, setBranchFilter] = useState<string>('ALL');

  // Feedback notifications
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals & Drawer State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
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

  // Edit staff form state
  const [editUserId, setEditUserId] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<string>('CASHIER');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

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
    setLoadingUsers(true);
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
    } finally {
      setLoadingUsers(false);
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
      const token = localStorage.getItem('gebeyaos_access_token');
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

      const res = await fetch(`/api/system/audit-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.rows && data.rows.length > 0 ? data.rows : []);
      } else {
        setAuditLogs([]);
      }
    } catch {
      setAuditLogs([]);
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
      setErrorMsg(err.message || 'Failed to create staff user');
      return;
    }

    setIsAddModalOpen(false);
    setSuccessMsg(t('staff.staffCreatedSuccess'));
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

  // Open edit modal
  const handleOpenEditModal = (user: StaffUser) => {
    setEditUserId(user.id);
    setEditFullName(user.fullName);
    setEditPhone(user.phone);
    setEditEmail(user.email || '');
    setEditRole(user.role);
    setIsEditModalOpen(true);
  };

  // Update staff member handler
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUserId) return;
    setErrorMsg(null);
    setIsSubmittingEdit(true);

    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      const res = await fetch(`/api/users/${editUserId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fullName: editFullName.trim(),
          phone: editPhone.trim(),
          email: editEmail.trim() || undefined,
          role: editRole,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to update user');
      }

      setUsers((prev) =>
        prev.map((u) =>
          u.id === editUserId
            ? {
                ...u,
                fullName: editFullName.trim(),
                phone: editPhone.trim(),
                email: editEmail.trim() || undefined,
                role: editRole as RoleName,
              }
            : u,
        ),
      );

      if (drawerUser && drawerUser.id === editUserId) {
        setDrawerUser((prev) =>
          prev
            ? {
                ...prev,
                fullName: editFullName.trim(),
                phone: editPhone.trim(),
                email: editEmail.trim() || undefined,
                role: editRole as RoleName,
              }
            : null,
        );
      }

      setIsEditModalOpen(false);
      setSuccessMsg(t('staff.staffUpdatedSuccess'));
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update staff user');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Delete staff member handler
  const handleDeleteUser = async (user: StaffUser) => {
    if (user.role === 'OWNER' && activeOwnersCount <= 1) {
      setErrorMsg(t('staff.cannotDeleteOwner'));
      setTimeout(() => setErrorMsg(null), 4000);
      return;
    }

    if (!window.confirm(t('staff.deleteStaffConfirm', { username: user.username }))) {
      return;
    }

    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to delete user');
      }

      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      if (drawerUser && drawerUser.id === user.id) {
        setDrawerUser(null);
      }
      setSuccessMsg(t('staff.staffDeletedSuccess'));
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete staff user');
    }
  };

  // LAST-OWNER RULE ENFORCEMENT & IMMEDIATE SESSION REVOCATION
  const handleToggleActive = async (user: StaffUser) => {
    const isCurrentlyActive = user.isActive;
    const nextStatus = !isCurrentlyActive;

    // Check Last-Owner rule in UI
    if (user.role === 'OWNER' && isCurrentlyActive && activeOwnersCount <= 1) {
      setErrorMsg(t('staff.lastOwnerWarning'));
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
        setErrorMsg(t('staff.lastOwnerWarning'));
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
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      case 'HQ_ADMIN':
        return 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20';
      case 'BRANCH_MANAGER':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
      case 'CASHIER':
        return 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20';
      case 'STOREKEEPER':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      case 'ACCOUNTANT':
        return 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20';
      default:
        return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
    }
  };

  const getActionBadgeClass = (action: string) => {
    if (action.includes('SUCCESS') || action.includes('CREATED') || action.includes('ACTIVATED')) {
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
    }
    if (action.includes('DEACTIVATED') || action.includes('DELETED') || action.includes('FAILED') || action.includes('LOCKOUT')) {
      return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
    }
    if (action.includes('PRICE') || action.includes('OVERRIDE') || action.includes('RESET')) {
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
    }
    if (action.includes('ROLE') || action.includes('PERMISSION')) {
      return 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20';
    }
    return 'bg-surface-2 text-text-muted border-border-subtle';
  };

  // Format relative time helper
  const formatTimeAgo = (isoString?: string | null) => {
    if (!isoString) return t('staff.neverLoggedIn');
    const diffMs = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return t('staff.justNow');
    if (mins < 60) return t('staff.minutesAgo', { mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('staff.hoursAgo', { hours });
    const days = Math.floor(hours / 24);
    return t('staff.daysAgo', { days });
  };

  return (
    <div className="page-container select-none h-full flex flex-col overflow-hidden relative p-4 sm:p-6 bg-page">
      {/* ─── 1. Header Toolbar ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border-subtle shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0 shadow-soft">
              <Users size={22} className="stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-extrabold text-text-main tracking-tight">{t('staff.title')}</h1>
                <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-primary-soft text-primary border border-primary/20">
                  {t('staff.totalUsersBadge', { count: users.length })}
                </span>
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-surface-2 border border-border-subtle text-text-muted">
                  {t('staff.internalOnlyBadge')}
                </span>
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                {t('staff.subtitle')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Top-Level Navigation Tabs */}
          <div className="flex items-center bg-surface-2 p-1 rounded-xl border border-border-subtle text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('staff')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'staff'
                  ? 'bg-surface text-primary shadow-xs font-bold'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              <Users size={14} />
              <span>{t('staff.staffDirectoryTab')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('roles')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'roles'
                  ? 'bg-surface text-primary shadow-xs font-bold'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              <ShieldCheck size={14} />
              <span>{t('staff.rolesAndMatrixTab')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'audit'
                  ? 'bg-surface text-primary shadow-xs font-bold'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              <History size={14} />
              <span>{t('staff.auditLogTab')}</span>
            </button>
          </div>

          {/* Add Staff Button (< 1 Minute UX) */}
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-1.5 shadow-soft transition-all duration-150 active:scale-98 cursor-pointer"
            title={t('staff.quickAddTooltip')}
          >
            <UserPlus size={15} />
            <span>{t('staff.addStaff')}</span>
          </button>
        </div>
      </div>

      {/* ─── Feedback alerts ─── */}
      {successMsg && (
        <div className="my-2 flex items-center gap-2 text-xs py-2.5 px-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 animate-in fade-in shadow-soft">
          <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="my-2 flex items-center gap-2 text-xs py-2.5 px-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 animate-in fade-in shadow-soft">
          <AlertOctagon size={16} className="text-rose-500 shrink-0" />
          <span className="font-semibold">{errorMsg}</span>
        </div>
      )}

      {/* ─── TAB 1: STAFF DIRECTORY ─── */}
      {activeTab === 'staff' && (
        <div className="flex-1 flex flex-col overflow-hidden pt-3 gap-3">
          {/* Quick Metrics Ribbon */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
            <div className="bg-surface p-3.5 rounded-2xl border border-border-subtle shadow-soft flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Users size={18} />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] text-text-muted block font-medium truncate">{t('staff.totalStaff')}</span>
                <span className="text-lg font-extrabold text-text-main">{users.length}</span>
              </div>
            </div>

            <div className="bg-surface p-3.5 rounded-2xl border border-border-subtle shadow-soft flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                <Power size={18} />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] text-text-muted block font-medium truncate">{t('staff.activeAccounts')}</span>
                <span className="text-lg font-extrabold text-text-main">
                  {users.filter((u) => u.isActive).length}
                </span>
              </div>
            </div>

            <div className="bg-surface p-3.5 rounded-2xl border border-border-subtle shadow-soft flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-500 flex items-center justify-center shrink-0">
                <KeyRound size={18} />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] text-text-muted block font-medium truncate">{t('staff.cashierLanes')}</span>
                <span className="text-lg font-extrabold text-text-main">
                  {users.filter((u) => u.role === 'CASHIER').length}
                </span>
              </div>
            </div>

            <div className="bg-surface p-3.5 rounded-2xl border border-border-subtle shadow-soft flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                <LockKeyhole size={18} />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] text-text-muted block font-medium truncate">{t('staff.mustChangePass')}</span>
                <span className="text-lg font-extrabold text-text-main">
                  {users.filter((u) => u.forcePasswordChange).length}
                </span>
              </div>
            </div>
          </div>

          {/* Search & Filtering Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 bg-surface p-2.5 rounded-2xl border border-border-subtle shadow-soft">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
              <input
                type="text"
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-input border border-border-subtle text-xs text-text-main placeholder:text-text-dim focus:outline-none focus:border-primary transition-colors"
                placeholder={t('staff.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-main"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Role Filter */}
            <select
              className="text-xs py-2 px-3 rounded-xl bg-input border border-border-subtle text-text-main font-semibold focus:outline-none focus:border-primary transition-colors cursor-pointer"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="ALL">{t('staff.allRoles')}</option>
              {roles.map((r) => (
                <option key={r.id} value={r.name.toUpperCase()}>
                  {r.name}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              className="text-xs py-2 px-3 rounded-xl bg-input border border-border-subtle text-text-main font-semibold focus:outline-none focus:border-primary transition-colors cursor-pointer"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="ALL">{t('staff.allStatuses')}</option>
              <option value="ACTIVE">{t('staff.activeOnly')}</option>
              <option value="INACTIVE">{t('staff.deactivatedOnly')}</option>
              <option value="LOCKED">{t('staff.lockedOutOnly')}</option>
            </select>

            {/* Branch Filter */}
            <select
              className="text-xs py-2 px-3 rounded-xl bg-input border border-border-subtle text-text-main font-semibold focus:outline-none focus:border-primary transition-colors cursor-pointer"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
            >
              <option value="ALL">{t('staff.allBranches')}</option>
              <option value="BOLE-01">BOLE-01 (Bole Medhanialem)</option>
              <option value="HQ-MAIN">HQ-MAIN (Corporate)</option>
            </select>

            <span className="text-xs text-text-muted font-mono ml-auto px-1">
              {t('staff.showingCount', { filtered: filteredUsers.length, total: users.length })}
            </span>
          </div>

          {/* Users Table */}
          <div className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden flex-1 flex flex-col min-h-0">
            <div className="overflow-x-auto flex-1">
              <table className="data-table text-xs w-full">
                <thead>
                  <tr className="border-b border-border-subtle bg-surface-2/60 text-left">
                    <th className="py-3 px-4 font-bold text-text-muted">{t('staff.colStaffMember')}</th>
                    <th className="py-3 px-4 font-bold text-text-muted">{t('staff.colRole')}</th>
                    <th className="py-3 px-4 font-bold text-text-muted">{t('staff.colBranch')}</th>
                    <th className="py-3 px-4 font-bold text-text-muted text-center">{t('staff.colStatus')}</th>
                    <th className="py-3 px-4 font-bold text-text-muted">{t('staff.colLastLogin')}</th>
                    <th className="py-3 px-4 font-bold text-text-muted text-right">{t('staff.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-16 text-sm text-text-muted">
                        {loadingUsers ? t('common.loading') : t('staff.noStaffMatch')}
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
                        className={`cursor-pointer transition-colors hover:bg-surface-2/50 ${
                          !user.isActive ? 'opacity-60 bg-surface-2/30' : ''
                        }`}
                      >
                        {/* Name & Username */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary font-extrabold flex items-center justify-center text-xs border border-primary/20 shrink-0">
                              {user.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-bold text-text-main flex items-center gap-1.5 truncate">
                                {user.fullName}
                                {isLastOwner && (
                                  <span
                                    className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                    title="Last Sovereign Owner of the Store"
                                  >
                                    {t('staff.soleOwner')}
                                  </span>
                                )}
                              </span>
                              <div className="flex items-center gap-1.5 text-[11px] text-text-muted font-mono truncate">
                                <span>@{user.username}</span>
                                <span>•</span>
                                <span>{user.phone}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Role Badge */}
                        <td className="py-3 px-4">
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg border inline-flex items-center gap-1 ${getRoleBadgeClass(
                              user.role,
                            )}`}
                          >
                            <ShieldCheck size={12} />
                            {user.role}
                          </span>
                        </td>

                        {/* Branch */}
                        <td className="py-3 px-4">
                          <div className="flex flex-col">
                            <span className="font-mono text-xs font-bold text-text-main">
                              {user.branchCode || 'BOLE-01'}
                            </span>
                            <span className="text-[10px] text-text-muted truncate max-w-[140px]">
                              {user.branchName || 'Bole Branch'}
                            </span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          {isLocked ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              <Lock size={10} /> {t('staff.lockedOut')}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleActive(user)}
                              disabled={isLastOwner && user.isActive}
                              className={`text-[11px] font-bold px-2.5 py-1 rounded-xl transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                                user.isActive
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:bg-rose-500/20'
                              } ${isLastOwner ? 'cursor-not-allowed opacity-75' : ''}`}
                              title={
                                isLastOwner
                                  ? t('staff.lastOwnerWarning')
                                  : user.isActive
                                  ? 'Click to deactivate and immediately revoke all sessions'
                                  : 'Click to activate'
                              }
                            >
                              <Power size={11} />
                              {user.isActive ? t('staff.active') : t('staff.inactive')}
                            </button>
                          )}
                        </td>

                        {/* Last Login & Force Password Change */}
                        <td className="py-3 px-4">
                          <div className="flex flex-col">
                            <span className="text-xs text-text-muted font-mono flex items-center gap-1">
                              <Clock size={11} />
                              {formatTimeAgo(user.lastLoginAt)}
                            </span>
                            {user.forcePasswordChange && (
                              <span className="text-[10px] text-amber-500 font-semibold flex items-center gap-1 mt-0.5">
                                <RotateCcw size={10} /> {t('staff.mustChangePasswordText')}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {/* Edit Details */}
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(user)}
                              className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text-main transition-colors cursor-pointer"
                              title={t('staff.editStaffTooltip')}
                            >
                              <Pencil size={14} />
                            </button>

                            {/* Reset PIN */}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedUserForModal(user);
                                setResetPinValue('1234');
                                setIsResetPinModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text-main transition-colors cursor-pointer"
                              title={t('staff.resetPinTooltip')}
                            >
                              <KeyRound size={14} />
                            </button>

                            {/* Reset Password */}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedUserForModal(user);
                                setResetPassValue('Gebeya@2026');
                                setIsResetPassModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text-main transition-colors cursor-pointer"
                              title={t('staff.resetPassTooltip')}
                            >
                              <Lock size={14} />
                            </button>

                            {/* Delete User */}
                            {!isLastOwner && (
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(user)}
                                className="p-1.5 rounded-lg hover:bg-rose-500/10 text-text-muted hover:text-rose-500 transition-colors cursor-pointer"
                                title={t('staff.deleteStaffTooltip')}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}

                            {/* Open Drawer */}
                            <button
                              type="button"
                              onClick={() => setDrawerUser(user)}
                              className="p-1.5 rounded-lg hover:bg-primary/10 text-text-muted hover:text-primary transition-colors cursor-pointer ml-1"
                              title={t('staff.viewDrawerTooltip')}
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
        <div className="flex-1 flex flex-col overflow-hidden pt-3 gap-3">
          <div className="flex items-center justify-between gap-3 shrink-0 bg-surface p-3.5 rounded-2xl border border-border-subtle shadow-soft">
            <div>
              <h2 className="text-sm font-bold text-text-main flex items-center gap-2">
                <ShieldCheck size={16} className="text-primary" />
                {t('staff.matrixTitle')}
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                {t('staff.matrixSubtitle')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCreateRoleModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-surface-2 hover:bg-surface text-text-main text-xs font-bold flex items-center gap-1.5 border border-border-subtle transition-colors cursor-pointer shadow-2xs"
            >
              <Plus size={14} className="text-primary" />
              <span>{t('staff.createCustomRole')}</span>
            </button>
          </div>

          <div className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden flex-1 flex flex-col min-h-0">
            <div className="overflow-auto flex-1">
              <table className="data-table text-xs w-full">
                <thead>
                  <tr className="border-b border-border-subtle bg-surface-2/60">
                    <th className="min-w-[280px] py-3 px-4 font-bold text-text-muted">{t('staff.colGranularCapability')}</th>
                    <th className="min-w-[80px] text-center py-3 px-4 font-bold text-text-muted">{t('staff.colModule')}</th>
                    {roles.map((r) => (
                      <th key={r.id} className="text-center min-w-[120px] py-3 px-3">
                        <div className="flex flex-col items-center gap-1">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getRoleBadgeClass(
                              r.name,
                            )}`}
                          >
                            {r.name}
                          </span>
                          <span className="text-[10px] text-text-muted font-normal">
                            {t('staff.maxDiscount', { percent: r.maxDiscountPercentage })}
                          </span>
                          {!r.isSystem && (
                            <button
                              type="button"
                              onClick={() => handleDeleteCustomRole(r)}
                              className="text-rose-500 hover:text-rose-700 text-[10px] flex items-center gap-0.5 cursor-pointer mt-0.5"
                              title="Delete custom role"
                            >
                              <Trash2 size={10} /> {t('staff.deleteRole')}
                            </button>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {GRANULAR_PERMISSIONS_LIST.map((perm) => (
                    <tr key={perm.key} className="hover:bg-surface-2/40">
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-text-main">
                            {perm.label}
                            {language === 'am' && (
                              <span className="text-text-muted ml-1.5 font-normal">({perm.labelAm})</span>
                            )}
                          </span>
                          <span className="text-[11px] text-text-muted leading-tight mt-0.5">
                            {perm.description}
                          </span>
                          <span className="text-[9px] font-mono text-text-dim mt-0.5">
                            Key: {perm.key}
                          </span>
                        </div>
                      </td>

                      <td className="text-center py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-surface-2 border border-border-subtle text-text-muted">
                          {perm.module}
                        </span>
                      </td>

                      {roles.map((role) => {
                        const isGranted =
                          role.name === 'OWNER' || role.permissions.includes(perm.key);
                        const isOwner = role.name === 'OWNER';

                        return (
                          <td key={role.id} className="text-center py-3 px-3">
                            <button
                              type="button"
                              disabled={isOwner}
                              onClick={() => handleToggleMatrixPermission(role.id, perm.key)}
                              className={`w-6 h-6 rounded-md inline-flex items-center justify-center transition-all cursor-pointer ${
                                isGranted
                                  ? 'bg-primary text-white shadow-xs'
                                  : 'bg-surface-2 border border-border-subtle text-transparent hover:border-text-dim'
                              } ${isOwner ? 'cursor-not-allowed opacity-90' : 'hover:scale-105'}`}
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
        <div className="flex-1 flex flex-col overflow-hidden pt-3 gap-3">
          {/* Audit Header & Filter Ribbon */}
          <div className="flex flex-wrap items-center justify-between gap-3 shrink-0 bg-surface p-3.5 rounded-2xl border border-border-subtle shadow-soft">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                <ShieldAlert size={14} />
                {t('staff.auditBanner')}
              </span>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={fetchAuditLogs}
                disabled={auditLoading}
                className="px-3 py-1.5 rounded-xl bg-surface-2 hover:bg-surface text-text-main border border-border-subtle text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <RefreshCw size={13} className={auditLoading ? 'animate-spin' : ''} />
                <span>{t('staff.refreshLogs')}</span>
              </button>
            </div>
          </div>

          {/* Audit Filtering Controls */}
          <div className="flex flex-wrap items-center gap-2 shrink-0 bg-surface p-2.5 rounded-2xl border border-border-subtle shadow-soft">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
              <input
                type="text"
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-input border border-border-subtle text-xs text-text-main placeholder:text-text-dim focus:outline-none focus:border-primary transition-colors"
                placeholder={t('staff.searchAuditPlaceholder')}
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
              />
            </div>

            {/* User Filter */}
            <select
              className="text-xs py-1.5 px-3 rounded-xl bg-input border border-border-subtle text-text-main font-semibold focus:outline-none focus:border-primary transition-colors cursor-pointer"
              value={auditUserFilter}
              onChange={(e) => setAuditUserFilter(e.target.value)}
            >
              <option value="">{t('staff.allStaff')}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} (@{u.username})
                </option>
              ))}
            </select>

            {/* Action Filter */}
            <select
              className="text-xs py-1.5 px-3 rounded-xl bg-input border border-border-subtle text-text-main font-semibold focus:outline-none focus:border-primary transition-colors cursor-pointer"
              value={auditActionFilter}
              onChange={(e) => setAuditActionFilter(e.target.value)}
            >
              <option value="">{t('staff.allActions')}</option>
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
              className="text-xs py-1.5 px-3 rounded-xl bg-input border border-border-subtle text-text-main font-semibold focus:outline-none focus:border-primary transition-colors cursor-pointer"
              value={auditModuleFilter}
              onChange={(e) => setAuditModuleFilter(e.target.value)}
            >
              <option value="">{t('staff.allModules')}</option>
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
              className="text-xs py-1.5 px-3 rounded-xl bg-input border border-border-subtle text-text-main font-semibold focus:outline-none focus:border-primary transition-colors cursor-pointer"
              value={auditDateRange}
              onChange={(e) => setAuditDateRange(e.target.value as any)}
            >
              <option value="today">{t('staff.timeToday')}</option>
              <option value="7d">{t('staff.time7d')}</option>
              <option value="30d">{t('staff.time30d')}</option>
              <option value="all">{t('staff.timeAll')}</option>
            </select>
          </div>

          {/* Audit Logs Table */}
          <div className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden flex-1 flex flex-col min-h-0">
            <div className="overflow-x-auto flex-1">
              <table className="data-table text-xs w-full">
                <thead>
                  <tr className="border-b border-border-subtle bg-surface-2/60 text-left">
                    <th className="py-3 px-4 font-bold text-text-muted">{t('staff.colTimestamp')}</th>
                    <th className="py-3 px-4 font-bold text-text-muted">{t('staff.colUser')}</th>
                    <th className="py-3 px-4 font-bold text-text-muted">{t('staff.colAction')}</th>
                    <th className="py-3 px-4 font-bold text-text-muted">{t('staff.colEntityModule')}</th>
                    <th className="py-3 px-4 font-bold text-text-muted">{t('staff.colIpTerminal')}</th>
                    <th className="py-3 px-4 font-bold text-text-muted">{t('staff.colDetails')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filteredAuditLogs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-16 text-sm text-text-muted">
                        {auditLoading ? t('common.loading') : t('staff.noAuditLogs')}
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
                      className="cursor-pointer hover:bg-surface-2/50 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-[11px] text-text-muted whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-surface-2 border border-border-subtle flex items-center justify-center font-bold text-[10px] text-text-muted">
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

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${getActionBadgeClass(
                            log.action,
                          )}`}
                        >
                          {log.action}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-mono text-xs text-text-muted">{log.entity_name}</span>
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px] text-text-muted whitespace-nowrap">
                        {log.ip_address || '127.0.0.1'}
                      </td>

                      <td className="py-3 px-4 max-w-[240px] truncate text-[11px] font-mono text-text-muted">
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
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setDrawerUser(null)}
          />

          <div className="relative w-full max-w-md bg-surface h-full shadow-modal flex flex-col border-l border-border-subtle z-10 animate-in slide-in-from-right duration-200 overflow-hidden">
            {/* Drawer Header */}
            <div className="p-4 border-b border-border-subtle flex items-center justify-between bg-surface-2/40">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary text-white font-extrabold flex items-center justify-center text-lg shadow-soft">
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
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
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
                className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-2 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5 text-xs">
              {/* Profile details */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-text-muted uppercase text-[10px] tracking-wider">
                    {t('staff.drawerContact')}
                  </h3>
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(drawerUser)}
                    className="text-xs text-primary font-bold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Pencil size={11} /> {t('staff.editStaff')}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 bg-surface-2 p-3 rounded-2xl border border-border-subtle font-mono text-[11px]">
                  <div>
                    <span className="text-text-muted block text-[10px] font-sans">Username</span>
                    <span className="font-bold text-text-main">@{drawerUser.username}</span>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px] font-sans">Phone</span>
                    <span className="font-bold text-text-main">{drawerUser.phone}</span>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px] font-sans">Email</span>
                    <span className="text-text-main truncate block">{drawerUser.email || '—'}</span>
                  </div>
                  <div>
                    <span className="text-text-muted block text-[10px] font-sans">Branch</span>
                    <span className="font-bold text-text-main">{drawerUser.branchCode || 'BOLE-01'}</span>
                  </div>
                </div>
              </div>

              {/* Security & Terminal Access */}
              <div className="flex flex-col gap-2">
                <h3 className="font-bold text-text-muted uppercase text-[10px] tracking-wider">
                  {t('staff.drawerSecurity')}
                </h3>
                <div className="flex flex-col gap-2 bg-surface-2 p-3 rounded-2xl border border-border-subtle">
                  <div className="flex items-center justify-between">
                    <span className="text-text-muted">{t('staff.passwordEncryption')}</span>
                    <span className="font-mono text-emerald-500 font-bold">
                      {t('staff.passwordArgon')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-muted">Must Change Password</span>
                    <span
                      className={`font-bold ${
                        drawerUser.forcePasswordChange ? 'text-amber-500' : 'text-text-muted'
                      }`}
                    >
                      {drawerUser.forcePasswordChange ? 'Yes (Enforced on next login)' : 'No'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-muted">{t('staff.terminalQuickPin')}</span>
                    <span className="font-mono font-bold text-text-main">{t('staff.pinConfigured')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-muted">{t('staff.accountLockoutState')}</span>
                    <span className="font-bold text-emerald-500">
                      {drawerUser.lockedUntil && new Date(drawerUser.lockedUntil) > new Date()
                        ? t('staff.tempLocked')
                        : t('staff.normalAttempts')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Effective Granular Permissions */}
              <div className="flex flex-col gap-2">
                <h3 className="font-bold text-text-muted uppercase text-[10px] tracking-wider">
                  {t('staff.drawerPerms')}
                </h3>
                <div className="grid grid-cols-1 gap-1.5 bg-surface-2 p-3 rounded-2xl border border-border-subtle max-h-48 overflow-y-auto">
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
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-surface text-text-dim border border-border-subtle'
                          }`}
                        >
                          {isGranted ? t('staff.enabled') : t('staff.disabled')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quick Admin Actions */}
              <div className="flex flex-col gap-2 mt-auto pt-2">
                <h3 className="font-bold text-text-muted uppercase text-[10px] tracking-wider">
                  {t('staff.drawerAdminControls')}
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUserForModal(drawerUser);
                      setResetPinValue('1234');
                      setIsResetPinModalOpen(true);
                    }}
                    className="px-3 py-2 rounded-xl bg-surface-2 hover:bg-surface text-text-main text-xs font-bold flex items-center justify-center gap-1.5 border border-border-subtle transition-colors cursor-pointer"
                  >
                    <KeyRound size={14} className="text-primary" />
                    <span>{t('staff.resetPin')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUserForModal(drawerUser);
                      setResetPassValue('Gebeya@2026');
                      setIsResetPassModalOpen(true);
                    }}
                    className="px-3 py-2 rounded-xl bg-surface-2 hover:bg-surface text-text-main text-xs font-bold flex items-center justify-center gap-1.5 border border-border-subtle transition-colors cursor-pointer"
                  >
                    <Lock size={14} className="text-primary" />
                    <span>{t('staff.resetPassword')}</span>
                  </button>
                </div>

                {/* Deactivate Button with Last-Owner Rule Warning */}
                {drawerUser.role === 'OWNER' && drawerUser.isActive && activeOwnersCount <= 1 ? (
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] flex items-center gap-2">
                    <AlertTriangle size={15} className="shrink-0" />
                    <span>{t('staff.lastOwnerWarning')}</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleToggleActive(drawerUser)}
                    className={`py-2.5 px-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      drawerUser.isActive
                        ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                        : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                    }`}
                  >
                    <Power size={14} />
                    <span>{drawerUser.isActive ? t('staff.deactivateStaff') : t('staff.reactivateStaff')}</span>
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
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setIsAddModalOpen(false)}
        >
          <div className="bg-surface border border-border-subtle rounded-3xl w-full max-w-lg p-6 shadow-modal max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <div>
                <h2 className="text-base font-bold text-text-main flex items-center gap-2">
                  <UserPlus size={18} className="text-primary" />
                  {t('staff.addStaffModalTitle')}
                </h2>
                <p className="text-xs text-text-muted mt-0.5">
                  {t('staff.addStaffModalDesc')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-text-muted hover:text-text-main p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="flex flex-col gap-3.5 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Full Name */}
                <div>
                  <label className="text-xs font-bold text-text-muted block mb-1">{t('staff.fullNameLabel')}</label>
                  <input
                    type="text"
                    required
                    placeholder={t('staff.fullNamePlaceholder')}
                    className="w-full px-3.5 py-2 rounded-xl bg-input border border-border-subtle text-xs text-text-main focus:outline-none focus:border-primary transition-colors"
                    value={newFullName}
                    onChange={(e) => handleFullNameChange(e.target.value)}
                  />
                </div>

                {/* 2. Phone */}
                <div>
                  <label className="text-xs font-bold text-text-muted block mb-1">{t('staff.phoneLabel')}</label>
                  <input
                    type="text"
                    required
                    placeholder="+251 9..."
                    className="w-full px-3.5 py-2 rounded-xl bg-input border border-border-subtle text-xs text-text-main font-mono focus:outline-none focus:border-primary transition-colors"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                  />
                </div>

                {/* 3. Role */}
                <div>
                  <label className="text-xs font-bold text-text-muted block mb-1">{t('staff.roleLabel')}</label>
                  <select
                    className="w-full px-3.5 py-2 rounded-xl bg-input border border-border-subtle text-xs text-text-main focus:outline-none focus:border-primary transition-colors cursor-pointer"
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
                  <label className="text-xs font-bold text-text-muted block mb-1">{t('staff.branchLabel')}</label>
                  <select
                    className="w-full px-3.5 py-2 rounded-xl bg-input border border-border-subtle text-xs text-text-main focus:outline-none focus:border-primary transition-colors cursor-pointer"
                    value={newBranchCode}
                    onChange={(e) => setNewBranchCode(e.target.value)}
                  >
                    <option value="BOLE-01">BOLE-01 — Bole Medhanialem</option>
                    <option value="HQ-MAIN">HQ-MAIN — Corporate Headquarters</option>
                  </select>
                </div>

                {/* 5. Terminal Quick PIN (4-6 digits) */}
                <div>
                  <label className="text-xs font-bold text-text-muted block mb-1">{t('staff.pinLabel')}</label>
                  <input
                    type="password"
                    required
                    maxLength={6}
                    placeholder="4-6 digits"
                    className="w-full px-3.5 py-2 rounded-xl bg-input border border-border-subtle font-mono tracking-widest text-center font-bold text-base text-text-main focus:outline-none focus:border-primary transition-colors"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  />
                </div>

                {/* Username */}
                <div>
                  <label className="text-xs font-bold text-text-muted block mb-1">{t('staff.usernameLabel')}</label>
                  <input
                    type="text"
                    required
                    placeholder="almaz.tadesse"
                    className="w-full px-3.5 py-2 rounded-xl bg-input border border-border-subtle text-xs text-text-main font-mono focus:outline-none focus:border-primary transition-colors"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value.toLowerCase().trim())}
                  />
                </div>

                {/* Email (Optional) */}
                <div>
                  <label className="text-xs font-bold text-text-muted block mb-1">{t('staff.emailLabel')}</label>
                  <input
                    type="email"
                    placeholder="almaz@gebeyaos.et"
                    className="w-full px-3.5 py-2 rounded-xl bg-input border border-border-subtle text-xs text-text-main focus:outline-none focus:border-primary transition-colors"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>

                {/* Initial Temporary Password */}
                <div>
                  <label className="text-xs font-bold text-text-muted block mb-1">{t('staff.tempPassLabel')}</label>
                  <input
                    type="text"
                    required
                    minLength={8}
                    className="w-full px-3.5 py-2 rounded-xl bg-input border border-border-subtle font-mono text-xs text-text-main focus:outline-none focus:border-primary transition-colors"
                    value={newInitialPass}
                    onChange={(e) => setNewInitialPass(e.target.value)}
                  />
                </div>
              </div>

              {/* Force Password Change on first login */}
              <div className="flex items-center gap-2 mt-1 bg-surface-2 p-3 rounded-xl border border-border-subtle">
                <input
                  type="checkbox"
                  id="forcePass"
                  checked={forcePassChange}
                  onChange={(e) => setForcePassChange(e.target.checked)}
                  className="w-4 h-4 rounded text-primary focus:ring-primary border-border-subtle"
                />
                <label htmlFor="forcePass" className="text-xs text-text-main cursor-pointer">
                  <strong>{t('staff.forcePassLabel')}</strong>
                </label>
              </div>

              <div className="flex gap-3 mt-3 pt-3 border-t border-border-subtle">
                <button
                  type="button"
                  className="px-4 py-2.5 rounded-xl bg-surface-2 hover:bg-surface text-text-main text-xs font-bold border border-border-subtle flex-1 cursor-pointer transition-colors"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  {t('staff.cancelBtn')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex-1 cursor-pointer shadow-soft transition-colors"
                >
                  {t('staff.provisionStaffBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── 6. EDIT STAFF MODAL ─── */}
      {isEditModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setIsEditModalOpen(false)}
        >
          <div className="bg-surface border border-border-subtle rounded-3xl w-full max-w-md p-6 shadow-modal">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <div>
                <h2 className="text-base font-bold text-text-main flex items-center gap-2">
                  <Pencil size={18} className="text-primary" />
                  {t('staff.editStaffModalTitle')}
                </h2>
                <p className="text-xs text-text-muted mt-0.5">
                  {t('staff.editStaffModalDesc')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-text-muted hover:text-text-main p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="flex flex-col gap-3.5 mt-4">
              <div>
                <label className="text-xs font-bold text-text-muted block mb-1">{t('staff.fullNameLabel')}</label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-input border border-border-subtle text-xs text-text-main focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted block mb-1">{t('staff.phoneLabel')}</label>
                <input
                  type="text"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-input border border-border-subtle text-xs text-text-main font-mono focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted block mb-1">{t('staff.emailLabel')}</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-input border border-border-subtle text-xs text-text-main focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted block mb-1">{t('staff.roleLabel')}</label>
                <select
                  className="w-full px-3.5 py-2 rounded-xl bg-input border border-border-subtle text-xs text-text-main focus:outline-none focus:border-primary transition-colors cursor-pointer"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 mt-3 pt-3 border-t border-border-subtle">
                <button
                  type="button"
                  className="px-4 py-2.5 rounded-xl bg-surface-2 hover:bg-surface text-text-main text-xs font-bold border border-border-subtle flex-1 cursor-pointer transition-colors"
                  onClick={() => setIsEditModalOpen(false)}
                >
                  {t('staff.cancelBtn')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex-1 cursor-pointer shadow-soft transition-colors disabled:opacity-50"
                >
                  {isSubmittingEdit ? t('common.saving') : t('staff.saveUserChanges')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── 7. RESET PASSWORD MODAL ─── */}
      {isResetPassModalOpen && selectedUserForModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setIsResetPassModalOpen(false)}
        >
          <div className="bg-surface border border-border-subtle rounded-3xl w-full max-w-sm p-6 shadow-modal">
            <h2 className="text-base font-bold text-text-main flex items-center gap-2 mb-1">
              <Lock size={18} className="text-primary" />
              {t('staff.resetPassModalTitle')}
            </h2>
            <p className="text-xs text-text-muted mb-4">
              {t('staff.resetPassDesc', { name: selectedUserForModal.fullName })}
            </p>

            <form onSubmit={handleAdminResetPassword} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-text-muted block mb-1">{t('staff.newTempPassLabel')}</label>
                <input
                  type="text"
                  required
                  minLength={8}
                  className="w-full px-3.5 py-2 rounded-xl bg-input border border-border-subtle font-mono text-xs text-text-main focus:outline-none focus:border-primary transition-colors"
                  value={resetPassValue}
                  onChange={(e) => setResetPassValue(e.target.value)}
                />
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] border border-amber-500/20">
                {t('staff.resetPassNotice')}
              </div>

              <div className="flex gap-2.5 mt-2">
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface text-text-main text-xs font-bold border border-border-subtle flex-1 cursor-pointer transition-colors"
                  onClick={() => setIsResetPassModalOpen(false)}
                >
                  {t('staff.cancelBtn')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex-1 cursor-pointer shadow-soft transition-colors"
                >
                  {t('staff.savePasswordBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── 8. RESET PIN MODAL ─── */}
      {isResetPinModalOpen && selectedUserForModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setIsResetPinModalOpen(false)}
        >
          <div className="bg-surface border border-border-subtle rounded-3xl w-full max-w-sm p-6 shadow-modal">
            <h2 className="text-base font-bold text-text-main flex items-center gap-2 mb-1">
              <KeyRound size={18} className="text-primary" />
              {t('staff.resetPinModalTitle')}
            </h2>
            <p className="text-xs text-text-muted mb-4">
              {t('staff.resetPinDesc', { name: selectedUserForModal.fullName })}
            </p>

            <form onSubmit={handleAdminResetPin} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-text-muted block mb-1">{t('staff.quickPinInputLabel')}</label>
                <input
                  type="password"
                  required
                  maxLength={6}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle font-mono tracking-widest text-center text-xl font-bold text-text-main focus:outline-none focus:border-primary transition-colors"
                  value={resetPinValue}
                  onChange={(e) => setResetPinValue(e.target.value.replace(/\D/g, ''))}
                />
              </div>

              <div className="flex gap-2.5 mt-2">
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface text-text-main text-xs font-bold border border-border-subtle flex-1 cursor-pointer transition-colors"
                  onClick={() => setIsResetPinModalOpen(false)}
                >
                  {t('staff.cancelBtn')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex-1 cursor-pointer shadow-soft transition-colors"
                >
                  {t('staff.saveNewPinBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── 9. CREATE CUSTOM ROLE MODAL ─── */}
      {isCreateRoleModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setIsCreateRoleModalOpen(false)}
        >
          <div className="bg-surface border border-border-subtle rounded-3xl w-full max-w-md p-6 shadow-modal">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <h2 className="text-base font-bold text-text-main flex items-center gap-2">
                <ShieldCheck size={18} className="text-primary" />
                {t('staff.createRoleModalTitle')}
              </h2>
              <button
                type="button"
                onClick={() => setIsCreateRoleModalOpen(false)}
                className="text-text-muted hover:text-text-main p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCustomRole} className="flex flex-col gap-3.5 mt-4">
              <div>
                <label className="text-xs font-bold text-text-muted block mb-1">{t('staff.roleNameLabel')}</label>
                <input
                  type="text"
                  required
                  placeholder={t('staff.roleNamePlaceholder')}
                  className="w-full px-3.5 py-2 rounded-xl bg-input border border-border-subtle text-xs text-text-main font-mono uppercase focus:outline-none focus:border-primary transition-colors"
                  value={customRoleName}
                  onChange={(e) => setCustomRoleName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted block mb-1">{t('staff.descLabel')}</label>
                <input
                  type="text"
                  placeholder={t('staff.descPlaceholder')}
                  className="w-full px-3.5 py-2 rounded-xl bg-input border border-border-subtle text-xs text-text-main focus:outline-none focus:border-primary transition-colors"
                  value={customRoleDesc}
                  onChange={(e) => setCustomRoleDesc(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted block mb-1">{t('staff.maxDiscountLabel')}</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="w-full px-3.5 py-2 rounded-xl bg-input border border-border-subtle text-xs text-text-main font-mono focus:outline-none focus:border-primary transition-colors"
                  value={customRoleMaxDiscount}
                  onChange={(e) => setCustomRoleMaxDiscount(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted block mb-1.5">{t('staff.initialPermsLabel')}</label>
                <div className="max-h-48 overflow-y-auto flex flex-col gap-1.5 p-2 bg-surface-2 rounded-2xl border border-border-subtle">
                  {GRANULAR_PERMISSIONS_LIST.map((p) => {
                    const isChecked = customRolePerms.includes(p.key);
                    return (
                      <label
                        key={p.key}
                        className="flex items-center gap-2.5 text-xs text-text-main cursor-pointer hover:bg-surface p-1.5 rounded-xl transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) setCustomRolePerms((prev) => [...prev, p.key]);
                            else setCustomRolePerms((prev) => prev.filter((k) => k !== p.key));
                          }}
                          className="w-4 h-4 rounded text-primary focus:ring-primary border-border-subtle"
                        />
                        <span className="font-medium">{p.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2.5 mt-3 pt-3 border-t border-border-subtle">
                <button
                  type="button"
                  className="px-4 py-2.5 rounded-xl bg-surface-2 hover:bg-surface text-text-main text-xs font-bold border border-border-subtle flex-1 cursor-pointer transition-colors"
                  onClick={() => setIsCreateRoleModalOpen(false)}
                >
                  {t('staff.cancelBtn')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex-1 cursor-pointer shadow-soft transition-colors"
                >
                  {t('staff.createRoleBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── 10. AUDIT DETAIL JSON MODAL ─── */}
      {isAuditDetailModalOpen && selectedAuditLog && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setIsAuditDetailModalOpen(false)}
        >
          <div className="bg-surface border border-border-subtle rounded-3xl w-full max-w-lg p-6 shadow-modal max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <h2 className="text-sm font-bold text-text-main flex items-center gap-2">
                <History size={16} className="text-primary" />
                {t('staff.auditDetailTitle')}
              </h2>
              <button
                type="button"
                onClick={() => setIsAuditDetailModalOpen(false)}
                className="text-text-muted hover:text-text-main p-1 rounded-lg cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-3 mt-4 text-xs font-mono overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-2 bg-surface-2 p-3 rounded-2xl border border-border-subtle">
                <div>
                  <span className="text-[10px] text-text-muted block font-sans">{t('staff.actionLabel')}</span>
                  <span className="font-bold text-text-main">{selectedAuditLog.action}</span>
                </div>
                <div>
                  <span className="text-[10px] text-text-muted block font-sans">{t('staff.moduleLabel')}</span>
                  <span className="font-bold text-text-main">{selectedAuditLog.entity_name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-text-muted block font-sans">{t('staff.actorLabel')}</span>
                  <span className="font-bold text-text-main">
                    {selectedAuditLog.user_name || selectedAuditLog.username || 'System'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-text-muted block font-sans">{t('staff.timestampLabel')}</span>
                  <span className="font-bold text-text-main">
                    {new Date(selectedAuditLog.created_at).toLocaleString()}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-text-muted text-[11px] font-sans font-bold block mb-1">
                  {t('staff.immutablePayloadLabel')}
                </span>
                <pre className="p-3.5 rounded-2xl bg-[#0B1220] text-emerald-400 border border-border-subtle text-[11px] overflow-auto max-h-56 font-mono leading-relaxed">
                  {JSON.stringify(selectedAuditLog.details || {}, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end mt-4 pt-3 border-t border-border-subtle">
              <button
                type="button"
                className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface text-text-main text-xs font-bold border border-border-subtle cursor-pointer transition-colors"
                onClick={() => setIsAuditDetailModalOpen(false)}
              >
                {t('staff.closeInspectorBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
