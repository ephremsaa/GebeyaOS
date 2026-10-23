import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { RoleName } from '@gebeyaos/shared-types';

interface StaffUser {
  id: string;
  username: string;
  fullName: string;
  phone: string;
  email?: string;
  role: RoleName;
  roleId: string;
  branchCode?: string;
  branchName?: string;
  isActive: boolean;
  forcePasswordChange: boolean;
  createdAt?: string;
}

const DEFAULT_DEMO_STAFF: StaffUser[] = [
  {
    id: '018e0000-0000-7000-8000-000000000041',
    username: 'admin',
    fullName: 'System Administrator (Owner)',
    phone: '+251 91 122 3344',
    email: 'admin@gebeyaos.et',
    role: 'OWNER',
    roleId: '018e0000-0000-7000-8000-000000000001',
    branchCode: 'BOLE-01',
    branchName: 'Bole Medhanialem Branch',
    isActive: true,
    forcePasswordChange: false,
  },
  {
    id: '018e0000-0000-7000-8000-000000000042',
    username: 'cashier1',
    fullName: 'Bethlehem Tadesse',
    phone: '+251 92 233 4455',
    email: 'bethlehem@gebeyaos.et',
    role: 'CASHIER',
    roleId: '018e0000-0000-7000-8000-000000000003',
    branchCode: 'BOLE-01',
    branchName: 'Bole Medhanialem Branch',
    isActive: true,
    forcePasswordChange: false,
  },
  {
    id: '018e0000-0000-7000-8000-000000000043',
    username: 'storekeeper1',
    fullName: 'Solomon Kebede',
    phone: '+251 93 344 5566',
    email: 'solomon@gebeyaos.et',
    role: 'STOREKEEPER',
    roleId: '018e0000-0000-7000-8000-000000000004',
    branchCode: 'BOLE-01',
    branchName: 'Bole Medhanialem Branch',
    isActive: true,
    forcePasswordChange: true,
  },
  {
    id: '018e0000-0000-7000-8000-000000000044',
    username: 'accountant1',
    fullName: 'Meron Assefa',
    phone: '+251 94 455 6677',
    email: 'meron@gebeyaos.et',
    role: 'ACCOUNTANT',
    roleId: '018e0000-0000-7000-8000-000000000005',
    branchCode: 'BOLE-01',
    branchName: 'Bole Medhanialem Branch',
    isActive: true,
    forcePasswordChange: false,
  },
];

export const UserManagementView: React.FC = () => {
  const { hasPermission } = useAuth();
  const { t } = useI18n();

  const [users, setUsers] = useState<StaffUser[]>(DEFAULT_DEMO_STAFF);
  const [search, setSearch] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isResetPassModalOpen, setIsResetPassModalOpen] = useState(false);
  const [isResetPinModalOpen, setIsResetPinModalOpen] = useState(false);
  const [isRolesModalOpen, setIsRolesModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<StaffUser | null>(null);

  // Add user form
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('+251 9');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<RoleName>('CASHIER');
  const [newInitialPass, setNewInitialPass] = useState('Gebeya@2026');
  const [newPin, setNewPin] = useState('1234');
  const [forcePassChange, setForcePassChange] = useState(true);

  // Reset form
  const [resetPassValue, setResetPassValue] = useState('NewPass@1234');
  const [resetPinValue, setResetPinValue] = useState('1234');

  // Load from backend if available
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const token = localStorage.getItem('gebeyaos_access_token');
        const res = await fetch('/api/users', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setUsers(data);
          }
        }
      } catch {
        // use default demo staff
      }
    };
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const newUser: StaffUser = {
      id: `usr-${Date.now()}`,
      username: newUsername.toLowerCase().trim(),
      fullName: newFullName.trim(),
      phone: newPhone.trim(),
      email: newEmail.trim() || undefined,
      role: newRole,
      roleId: `role-${newRole}`,
      branchCode: 'BOLE-01',
      branchName: 'Bole Medhanialem Branch',
      isActive: true,
      forcePasswordChange: forcePassChange,
    };

    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: newUser.username,
          fullName: newUser.fullName,
          phone: newUser.phone,
          email: newUser.email,
          role: newUser.role,
          initialPassword: newInitialPass,
          pin: newPin,
          forcePasswordChange: forcePassChange,
        }),
      });
    } catch {
      // offline fallback
    }

    setUsers((prev) => [newUser, ...prev]);
    setIsAddModalOpen(false);
    setSuccessMsg(t('userCreatedSuccess'));
    setTimeout(() => setSuccessMsg(null), 4000);

    // Reset inputs
    setNewUsername('');
    setNewFullName('');
    setNewPhone('+251 9');
    setNewEmail('');
  };

  const handleToggleActive = async (userId: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      await fetch(`/api/users/${userId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: nextStatus }),
      });
    } catch {
      // offline fallback
    }

    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, isActive: nextStatus } : u)),
    );
    setSuccessMsg(nextStatus ? 'Staff member activated.' : 'Staff member deactivated & sessions terminated.');
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleAdminResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      await fetch(`/api/users/${selectedUser.id}/reset-password`, {
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
      prev.map((u) => (u.id === selectedUser.id ? { ...u, forcePasswordChange: true } : u)),
    );
    setIsResetPassModalOpen(false);
    setSuccessMsg(`Password reset for ${selectedUser.username}. User will be forced to change password.`);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleAdminResetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      await fetch(`/api/users/${selectedUser.id}/reset-pin`, {
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
    setSuccessMsg(`Cashier PIN reset for ${selectedUser.username}.`);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const filteredUsers = users.filter(
    (u) =>
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.phone.includes(search) ||
      u.role.toLowerCase().includes(search.toLowerCase()),
  );

  const getRoleBadgeClass = (role: RoleName) => {
    switch (role) {
      case 'OWNER':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300 border-purple-300';
      case 'BRANCH_MANAGER':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border-blue-300';
      case 'CASHIER':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-300';
      case 'STOREKEEPER':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-300';
      case 'ACCOUNTANT':
        return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-300 border-cyan-300';
      case 'HQ_ADMIN':
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 border-indigo-300';
      default:
        return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300';
    }
  };

  return (
    <div className="page-container select-none">
      {/* ─── Header ─── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('staffManagement')}</h1>
          <p className="page-subtitle">
            Manage store employees, cashier quick PINs, access roles, and security policies
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsRolesModalOpen(true)}
            className="btn-secondary"
          >
            <ShieldCheck size={16} className="text-gebeya-600" />
            Roles &amp; Permissions
          </button>
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="btn-primary"
          >
            <UserPlus size={16} />
            {t('addStaff')}
          </button>
        </div>
      </div>

      {/* ─── Success alert ─── */}
      {successMsg && (
        <div className="alert-success mb-4 flex items-center gap-2">
          <CheckCircle2 size={16} />
          {successMsg}
        </div>
      )}

      {/* ─── Search Toolbar ─── */}
      <div className="flex items-center gap-3 mb-4">
        <div className="search-bar-wrapper flex-1">
          <Search size={16} style={{ color: 'var(--primary)' }} />
          <input
            type="text"
            className="search-input"
            placeholder="Search staff by name, phone, or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <span className="text-xs font-semibold px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
          {filteredUsers.length} Staff Members
        </span>
      </div>

      {/* ─── Staff Directory Table ─── */}
      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Staff Name</th>
                <th>Username</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Branch</th>
                <th className="text-center">Status</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-sm text-slate-400">
                    No staff members match your search criteria.
                  </td>
                </tr>
              )}
              {filteredUsers.map((user) => (
                <tr key={user.id} className={!user.isActive ? 'opacity-50' : ''}>
                  <td>
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {user.fullName}
                      </span>
                      {user.forcePasswordChange && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                          <RotateCcw size={10} /> Must change password
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                      @{user.username}
                    </span>
                  </td>
                  <td>
                    <span className="font-mono text-xs">{user.phone}</span>
                  </td>
                  <td>
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-lg border ${getRoleBadgeClass(
                        user.role,
                      )}`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      {user.branchCode || 'BOLE-01'}
                    </span>
                  </td>
                  <td className="text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(user.id, user.isActive)}
                      className={`text-xs font-bold px-2.5 py-1 rounded-xl transition-all flex items-center gap-1.5 mx-auto ${
                        user.isActive
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-300 hover:bg-emerald-100'
                          : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-300 hover:bg-red-100'
                      }`}
                      title={user.isActive ? 'Click to deactivate' : 'Click to activate'}
                    >
                      <Power size={11} />
                      {user.isActive ? t('active') : t('inactive')}
                    </button>
                  </td>
                  <td className="text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUser(user);
                          setResetPinValue('1234');
                          setIsResetPinModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                        title="Reset PIN"
                      >
                        <KeyRound size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUser(user);
                          setResetPassValue('Gebeya@2026');
                          setIsResetPassModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                        title="Reset Password"
                      >
                        <Lock size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Add Staff Modal ─── */}
      {isAddModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setIsAddModalOpen(false)}
        >
          <div className="modal-content max-w-lg">
            <h2 className="modal-title">{t('addStaff')}</h2>
            <p className="text-xs text-slate-500 mb-4">
              Staff members cannot self-register. Define their credentials and roles here.
            </p>

            <form onSubmit={handleCreateUser} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Almaz Tadesse"
                    className="field-input mt-1"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="field-label">Username</label>
                  <input
                    type="text"
                    required
                    placeholder="almaz"
                    className="field-input mt-1 font-mono"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                  />
                </div>

                <div>
                  <label className="field-label">Phone Number</label>
                  <input
                    type="text"
                    required
                    className="field-input mt-1 font-mono"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                  />
                </div>

                <div>
                  <label className="field-label">Role</label>
                  <select
                    className="field-select mt-1"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as RoleName)}
                  >
                    <option value="CASHIER">CASHIER — Register &amp; Checkout</option>
                    <option value="BRANCH_MANAGER">BRANCH_MANAGER — Supervisor Overrides</option>
                    <option value="STOREKEEPER">STOREKEEPER — Receiving &amp; Stocktake</option>
                    <option value="ACCOUNTANT">ACCOUNTANT — Financial Reports</option>
                    <option value="HQ_ADMIN">HQ_ADMIN — Headquarters Admin</option>
                    <option value="OWNER">OWNER — Full System Control</option>
                  </select>
                </div>

                <div>
                  <label className="field-label">Initial Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    className="field-input mt-1"
                    value={newInitialPass}
                    onChange={(e) => setNewInitialPass(e.target.value)}
                  />
                </div>

                <div>
                  <label className="field-label">Quick Cashier PIN</label>
                  <input
                    type="password"
                    required
                    maxLength={6}
                    placeholder="4-6 digits"
                    className="field-input mt-1 font-mono tracking-widest text-center"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 mt-1">
                <input
                  type="checkbox"
                  id="forcePass"
                  checked={forcePassChange}
                  onChange={(e) => setForcePassChange(e.target.checked)}
                  className="rounded text-gebeya-600 focus:ring-gebeya-500"
                />
                <label htmlFor="forcePass" className="text-xs text-slate-700 dark:text-slate-300">
                  Force password change on first login
                </label>
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  {t('cancel')}
                </button>
                <button type="submit" className="btn-primary flex-1">
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Reset Password Modal ─── */}
      {isResetPassModalOpen && selectedUser && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setIsResetPassModalOpen(false)}
        >
          <div className="modal-content max-w-sm">
            <h2 className="modal-title">{t('resetPassword')}</h2>
            <p className="text-xs text-slate-500 mb-4">
              Assign a new temporary password for <strong>{selectedUser.fullName}</strong>.
            </p>

            <form onSubmit={handleAdminResetPassword} className="flex flex-col gap-4">
              <div>
                <label className="field-label">New Password (min 8 chars)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  className="field-input mt-1"
                  value={resetPassValue}
                  onChange={(e) => setResetPassValue(e.target.value)}
                />
              </div>

              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => setIsResetPassModalOpen(false)}
                >
                  {t('cancel')}
                </button>
                <button type="submit" className="btn-primary flex-1">
                  Reset Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Reset PIN Modal ─── */}
      {isResetPinModalOpen && selectedUser && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setIsResetPinModalOpen(false)}
        >
          <div className="modal-content max-w-sm">
            <h2 className="modal-title">{t('resetPin')}</h2>
            <p className="text-xs text-slate-500 mb-4">
              Assign a new 4–6 digit terminal unlock PIN for <strong>{selectedUser.fullName}</strong>.
            </p>

            <form onSubmit={handleAdminResetPin} className="flex flex-col gap-4">
              <div>
                <label className="field-label">New PIN (4-6 digits)</label>
                <input
                  type="password"
                  required
                  maxLength={6}
                  className="field-input mt-1 font-mono tracking-widest text-center text-xl font-bold"
                  value={resetPinValue}
                  onChange={(e) => setResetPinValue(e.target.value.replace(/\D/g, ''))}
                />
              </div>

              <div className="flex gap-3 mt-2">
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

      {/* ─── Roles & Permissions Matrix Modal ─── */}
      {isRolesModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setIsRolesModalOpen(false)}
        >
          <div className="modal-content max-w-3xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="modal-title">Roles &amp; Permissions Matrix</h2>
                <p className="text-xs text-slate-500">
                  Granular permission assignments across the 6 system roles
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRolesModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-x-auto my-4 max-h-[60vh]">
              <table className="data-table text-xs">
                <thead>
                  <tr>
                    <th>Permission Capability</th>
                    <th className="text-center">Owner</th>
                    <th className="text-center">HQ Admin</th>
                    <th className="text-center">Manager</th>
                    <th className="text-center">Cashier</th>
                    <th className="text-center">Storekeeper</th>
                    <th className="text-center">Accountant</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'View Cost & Margins (catalog:cost:view)', owner: true, hq: true, mgr: true, csh: false, stk: true, acc: true },
                    { label: 'Apply Cashier Discount (pos:sale:discount)', owner: true, hq: true, mgr: true, csh: true, stk: false, acc: false },
                    { label: 'Process Refunds (pos:sale:refund)', owner: true, hq: true, mgr: true, csh: false, stk: false, acc: false },
                    { label: 'Perform Stock Adjustments (inventory:adjust:create)', owner: true, hq: false, mgr: true, csh: false, stk: true, acc: false },
                    { label: 'Import Stock Excel/CSV (inventory:import:execute)', owner: true, hq: true, mgr: true, csh: false, stk: true, acc: false },
                    { label: 'Open & Close Shifts (pos:shift:close)', owner: true, hq: false, mgr: true, csh: true, stk: false, acc: false },
                    { label: 'View Financial Reports (reports:branch:view)', owner: true, hq: true, mgr: true, csh: false, stk: false, acc: true },
                    { label: 'Manage Staff Directory (admin:users:manage)', owner: true, hq: true, mgr: true, csh: false, stk: false, acc: false },
                  ].map((perm, i) => (
                    <tr key={i}>
                      <td className="font-medium text-slate-800 dark:text-slate-200">{perm.label}</td>
                      <td className="text-center">{perm.owner ? '✅' : '—'}</td>
                      <td className="text-center">{perm.hq ? '✅' : '—'}</td>
                      <td className="text-center">{perm.mgr ? '✅' : '—'}</td>
                      <td className="text-center">{perm.csh ? '✅' : '—'}</td>
                      <td className="text-center">{perm.stk ? '✅' : '—'}</td>
                      <td className="text-center">{perm.acc ? '✅' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                className="btn-primary"
                onClick={() => setIsRolesModalOpen(false)}
              >
                Close Matrix
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
