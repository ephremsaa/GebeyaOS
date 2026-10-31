import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Building2,
  Users,
  HardDrive,
  RefreshCw,
  Plus,
  Key,
  Shield,
  Eye,
  Check,
  Copy,
  AlertTriangle,
  X,
  Clock,
  ArrowRight,
  LogOut,
  Search,
  ExternalLink,
  Lock,
  Download,
  Trash2,
  Laptop,
  KeyRound,
  QrCode,
  CheckCircle2,
  HelpCircle,
  ShieldCheck,
  FileText,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import {
  TenantUsageSummary,
  TenantPlan,
  PlatformAdminUser,
  PlatformAuditLogEntry,
  SupportAccessSession,
  PlatformSessionInfo,
  PlatformAdminRole,
  TenantApplicationItem,
} from '@gebeyaos/shared-types';
import { calculatePasswordStrength } from '../../utils/password-meter';

const API_BASE = '/api/platform';

export const PlatformAdminConsole: React.FC<{ onExit?: () => void }> = ({ onExit }) => {
  // Authentication state
  const [platformToken, setPlatformToken] = useState<string | null>(
    () => sessionStorage.getItem('gebeyaos_platform_token') || localStorage.getItem('gebeyaos_platform_token'),
  );
  const [platformRefreshToken, setPlatformRefreshToken] = useState<string | null>(
    () => sessionStorage.getItem('gebeyaos_platform_refresh_token') || localStorage.getItem('gebeyaos_platform_refresh_token'),
  );
  const [adminUser, setAdminUser] = useState<PlatformAdminUser | null>(() => {
    const raw = sessionStorage.getItem('gebeyaos_platform_admin') || localStorage.getItem('gebeyaos_platform_admin');
    return raw ? JSON.parse(raw) : null;
  });
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(false);

  // Login form state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // 2FA Stage: 'none' | 'challenge' | 'enrollment'
  const [twoFaStage, setTwoFaStage] = useState<'none' | 'challenge' | 'enrollment'>('none');
  const [twoFaTempToken, setTwoFaTempToken] = useState<string>('');
  const [twoFaCode, setTwoFaCode] = useState<string>('');
  const [twoFaRememberDevice, setTwoFaRememberDevice] = useState<boolean>(false);
  const [isUsingBackupCode, setIsUsingBackupCode] = useState<boolean>(false);
  const [enrollmentSecret, setEnrollmentSecret] = useState<string>('');
  const [enrollmentQrUri, setEnrollmentQrUri] = useState<string>('');
  const [enrollmentBackupCodes, setEnrollmentBackupCodes] = useState<string[]>([]);
  const [copiedBackupCodes, setCopiedBackupCodes] = useState<boolean>(false);
  const [copiedSecretKey, setCopiedSecretKey] = useState<boolean>(false);
  const [isVerifying2Fa, setIsVerifying2Fa] = useState<boolean>(false);
  const [twoFaError, setTwoFaError] = useState<string | null>(null);

  // View state
  const [currentTab, setCurrentTab] = useState<'tenants' | 'applications' | 'audit' | 'sessions'>('tenants');
  const [tenants, setTenants] = useState<TenantUsageSummary[]>([]);
  const [applications, setApplications] = useState<TenantApplicationItem[]>([]);
  const [isLoadingApplications, setIsLoadingApplications] = useState(false);
  const [applicationFilter, setApplicationFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [selectedApplicationForReject, setSelectedApplicationForReject] = useState<TenantApplicationItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [approvingAppId, setApprovingAppId] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<PlatformAuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showResetSuccessModal, setShowResetSuccessModal] = useState<any | null>(null);
  const [createdTenantResult, setCreatedTenantResult] = useState<any | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<TenantUsageSummary | null>(null);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planToUpdate, setPlanToUpdate] = useState<TenantPlan>('growth');

  // Active Support Session
  const [activeSupportSession, setActiveSupportSession] = useState<SupportAccessSession | null>(() => {
    const raw = sessionStorage.getItem('gebeyaos_active_support_session');
    return raw ? JSON.parse(raw) : null;
  });

  // Sessions state
  const [sessionsList, setSessionsList] = useState<PlatformSessionInfo[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  // Change password inputs
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);
  const [changePasswordSuccess, setChangePasswordSuccess] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Sensitive action re-auth state
  const [showReauthModal, setShowReauthModal] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthTotp, setReauthTotp] = useState('');
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [isSubmittingReauth, setIsSubmittingReauth] = useState(false);
  const [cachedReauthToken, setCachedReauthToken] = useState<string | null>(null);
  const [cachedReauthExpiry, setCachedReauthExpiry] = useState<number>(0);
  const [pendingAction, setPendingAction] = useState<((token: string) => Promise<void>) | null>(null);

  // Create form inputs
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantSlug, setNewTenantSlug] = useState('');
  const [newTenantPlan, setNewTenantPlan] = useState<TenantPlan>('growth');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newOwnerContact, setNewOwnerContact] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Support Access form inputs
  const [supportReason, setSupportReason] = useState('');
  const [supportDuration, setSupportDuration] = useState<number>(2);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [isRequestingSupport, setIsRequestingSupport] = useState(false);

  // Export & Delete state
  const [exportingTenantId, setExportingTenantId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletingTenant, setIsDeletingTenant] = useState(false);

  // Copy feedback
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Load platform data when authenticated
  useEffect(() => {
    if (platformToken) {
      loadTenants();
      loadApplications();
      loadAuditLogs();
      loadSessions();
    }
  }, [platformToken]);

  const loadApplications = async () => {
    if (!platformToken) return;
    setIsLoadingApplications(true);
    try {
      const res = await fetch(`${API_BASE}/applications`, {
        headers: { Authorization: `Bearer ${platformToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setApplications(Array.isArray(data) ? data : []);
      } else {
        setApplications([]);
      }
    } catch {
      setApplications([]);
    } finally {
      setIsLoadingApplications(false);
    }
  };

  const handleApproveApplication = async (app: TenantApplicationItem) => {
    if (!platformToken) return;
    setApprovingAppId(app.id);
    try {
      const res = await fetch(`${API_BASE}/applications/${app.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${platformToken}`,
        },
      });
      const data = await res.json();
      if (res.ok) {
        setCreatedTenantResult({
          tenant: data.tenant,
          inviteToken: data.inviteToken,
          inviteLink: data.inviteLink,
        });
        await loadApplications();
        await loadTenants();
      } else {
        alert(data.message || 'Failed to approve application');
      }
    } catch {
      alert('Network error approving application');
    } finally {
      setApprovingAppId(null);
    }
  };

  const handleRejectApplication = async () => {
    if (!platformToken || !selectedApplicationForReject) return;
    setIsRejecting(true);
    try {
      const res = await fetch(`${API_BASE}/applications/${selectedApplicationForReject.id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${platformToken}`,
        },
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (res.ok) {
        setSelectedApplicationForReject(null);
        setRejectReason('');
        await loadApplications();
      } else {
        const data = await res.json();
        alert(data.message || 'Failed to reject application');
      }
    } catch {
      alert('Network error rejecting application');
    } finally {
      setIsRejecting(false);
    }
  };

  // Auto-refresh token rotation before expiration (access token = 15m; rotate every 12m)
  useEffect(() => {
    if (!platformRefreshToken || !platformToken) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: platformRefreshToken }),
        });
        if (res.ok) {
          const data = await res.json();
          setPlatformToken(data.accessToken);
          setPlatformRefreshToken(data.refreshToken);
          sessionStorage.setItem('gebeyaos_platform_token', data.accessToken);
          sessionStorage.setItem('gebeyaos_platform_refresh_token', data.refreshToken);
          if (localStorage.getItem('gebeyaos_platform_token')) {
            localStorage.setItem('gebeyaos_platform_token', data.accessToken);
            localStorage.setItem('gebeyaos_platform_refresh_token', data.refreshToken);
          }
        } else if (res.status === 401) {
          handleLogout();
        }
      } catch {
        // network hiccup, retry next tick
      }
    }, 12 * 60 * 1000);

    return () => clearInterval(interval);
  }, [platformRefreshToken, platformToken]);

  const loadTenants = async () => {
    if (!platformToken) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/tenants`, {
        headers: { Authorization: `Bearer ${platformToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTenants(Array.isArray(data) ? data : []);
        setIsOfflineMode(false);
      } else if (res.status === 401 || res.status === 403) {
        handleLogout();
      } else {
        setTenants([]);
      }
    } catch {
      setTenants([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    if (!platformToken) return;
    try {
      const res = await fetch(`${API_BASE}/audit-logs?limit=50`, {
        headers: { Authorization: `Bearer ${platformToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(Array.isArray(data) ? data : []);
      } else {
        setAuditLogs([]);
      }
    } catch {
      setAuditLogs([]);
    }
  };

  const loadSessions = async () => {
    if (!platformToken) return;
    setIsLoadingSessions(true);
    try {
      const res = await fetch(`${API_BASE}/sessions`, {
        headers: { Authorization: `Bearer ${platformToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSessionsList(data);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingSessions(false);
    }
  };

  // Step 1: Password Login & 2FA Initialization
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginUsername.trim(),
          password: loginPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setLoginError(data.message || 'Authentication failed. Please check operator credentials.');
        return;
      }

      // Mandatory 2FA flow
      if (data.requires2fa) {
        setTwoFaTempToken(data.tempToken);
        setTwoFaError(null);
        setTwoFaCode('');
        setIsUsingBackupCode(false);

        if (data.isEnrollment) {
          setTwoFaStage('enrollment');
          setEnrollmentSecret(data.secret || '');
          setEnrollmentQrUri(data.qrCodeUri || '');
          setEnrollmentBackupCodes(data.backupCodes || []);
        } else {
          setTwoFaStage('challenge');
        }

        if (data.admin) {
          setAdminUser(data.admin);
        }
        return;
      }

      // Fallback if 2FA was already completed
      if (data.accessToken) {
        completeLoginSession(data);
      }
    } catch {
      setLoginError('Cannot connect to Platform API. Server may be offline or unreachable.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Step 2: 2FA Verification (TOTP or Backup Code)
  const handleVerify2Fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFaError(null);
    setIsVerifying2Fa(true);

    try {
      const res = await fetch(`${API_BASE}/2fa/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tempToken: twoFaTempToken,
          code: twoFaCode.trim(),
          rememberDevice: twoFaRememberDevice,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        completeLoginSession(data);
        setTwoFaStage('none');
      } else {
        setTwoFaError(data.message || 'Invalid verification code. Please check your authenticator.');
      }
    } catch {
      setTwoFaError('Failed to verify two-factor code. Please try again.');
    } finally {
      setIsVerifying2Fa(false);
    }
  };

  const completeLoginSession = (data: any) => {
    setPlatformToken(data.accessToken);
    setPlatformRefreshToken(data.refreshToken || null);
    setAdminUser(data.admin);
    setIsOfflineMode(false);

    sessionStorage.setItem('gebeyaos_platform_token', data.accessToken);
    if (data.refreshToken) {
      sessionStorage.setItem('gebeyaos_platform_refresh_token', data.refreshToken);
    }
    sessionStorage.setItem('gebeyaos_platform_admin', JSON.stringify(data.admin));

    if (twoFaRememberDevice) {
      localStorage.setItem('gebeyaos_platform_token', data.accessToken);
      if (data.refreshToken) {
        localStorage.setItem('gebeyaos_platform_refresh_token', data.refreshToken);
      }
      localStorage.setItem('gebeyaos_platform_admin', JSON.stringify(data.admin));
    }
  };

  const handleLogout = async () => {
    try {
      if (platformToken && platformRefreshToken) {
        await fetch(`${API_BASE}/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${platformToken}`,
          },
          body: JSON.stringify({ refreshToken: platformRefreshToken }),
        });
      }
    } catch {}

    setPlatformToken(null);
    setPlatformRefreshToken(null);
    setAdminUser(null);
    setTwoFaStage('none');
    sessionStorage.removeItem('gebeyaos_platform_token');
    sessionStorage.removeItem('gebeyaos_platform_refresh_token');
    sessionStorage.removeItem('gebeyaos_platform_admin');
    sessionStorage.removeItem('gebeyaos_active_support_session');
    localStorage.removeItem('gebeyaos_platform_token');
    localStorage.removeItem('gebeyaos_platform_refresh_token');
    localStorage.removeItem('gebeyaos_platform_admin');
    setActiveSupportSession(null);
  };

  // Sensitive Actions Guard: Requires Password + TOTP Re-authentication
  const executeWithReauth = async (action: (reauthToken: string) => Promise<void>) => {
    // Check if we already have a valid cached reauth token (< 5 minutes)
    if (cachedReauthToken && Date.now() < cachedReauthExpiry) {
      await action(cachedReauthToken);
      return;
    }

    setPendingAction(() => action);
    setReauthPassword('');
    setReauthTotp('');
    setReauthError(null);
    setShowReauthModal(true);
  };

  const handleReauthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReauthError(null);
    setIsSubmittingReauth(true);

    try {
      const res = await fetch(`${API_BASE}/reauth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${platformToken}`,
        },
        body: JSON.stringify({
          password: reauthPassword,
          totpCode: reauthTotp.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.reauthToken) {
        const token = data.reauthToken;
        setCachedReauthToken(token);
        setCachedReauthExpiry(Date.now() + 5 * 60 * 1000); // 5 min cache
        setShowReauthModal(false);

        if (pendingAction) {
          await pendingAction(token);
          setPendingAction(null);
        }
      } else {
        setReauthError(data.message || 'Invalid password or 2FA code.');
      }
    } catch {
      setReauthError('Re-authentication failed. Please check network.');
    } finally {
      setIsSubmittingReauth(false);
    }
  };

  // Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePasswordError(null);
    setChangePasswordSuccess(null);

    if (newPasswordInput !== confirmPasswordInput) {
      setChangePasswordError('New passwords do not match');
      return;
    }

    const strength = calculatePasswordStrength(newPasswordInput);
    if (!strength.isValid) {
      setChangePasswordError(strength.errors[0] || 'Password does not meet complexity requirements');
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await fetch(`${API_BASE}/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${platformToken}`,
        },
        body: JSON.stringify({
          currentPassword: currentPasswordInput,
          newPassword: newPasswordInput,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setChangePasswordSuccess(data.message || 'Password changed successfully!');
        setCurrentPasswordInput('');
        setNewPasswordInput('');
        setConfirmPasswordInput('');
        setTimeout(() => {
          setShowChangePasswordModal(false);
          setChangePasswordSuccess(null);
        }, 2000);
      } else {
        setChangePasswordError(data.message || 'Failed to update master password');
      }
    } catch {
      setChangePasswordError('Network error while changing password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Revoke a session
  const handleRevokeSession = async (sessionId: string) => {
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${platformToken}` },
      });
      if (res.ok) {
        await loadSessions();
      }
    } catch {}
  };

  // Revoke all other sessions
  const handleRevokeAllSessions = async () => {
    if (!window.confirm('Revoke all other active operator sessions? You will remain signed in on this device.')) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/logout-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${platformToken}` },
      });
      if (res.ok) {
        await loadSessions();
      }
    } catch {}
  };

  // Create Tenant
  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setIsSubmittingCreate(true);
    try {
      const res = await fetch(`${API_BASE}/tenants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${platformToken}`,
        },
        body: JSON.stringify({
          name: newTenantName.trim(),
          slug: newTenantSlug.trim() || undefined,
          plan: newTenantPlan,
          ownerName: newOwnerName.trim(),
          ownerEmailOrPhone: newOwnerContact.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCreatedTenantResult(data);
        setShowCreateModal(false);
        setNewTenantName('');
        setNewTenantSlug('');
        setNewOwnerName('');
        setNewOwnerContact('');
        loadTenants();
        loadAuditLogs();
      } else {
        setCreateError(data.message || 'Failed to create tenant.');
      }
    } catch {
      // Offline fallback
      const newId = '01900000-0000-7000-8000-' + Math.random().toString(16).slice(2, 14);
      const newSlug = newTenantSlug.trim() || newTenantName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const createdTenant: TenantUsageSummary = {
        id: newId,
        name: newTenantName.trim(),
        slug: newSlug,
        status: 'active',
        plan: newTenantPlan,
        country: 'ET',
        defaultLanguage: 'am',
        maxBranches: newTenantPlan === 'enterprise' ? 10 : newTenantPlan === 'growth' ? 5 : 3,
        maxTerminals: newTenantPlan === 'enterprise' ? 30 : newTenantPlan === 'growth' ? 10 : 5,
        maxUsers: newTenantPlan === 'enterprise' ? 100 : newTenantPlan === 'growth' ? 30 : 15,
        branchCount: 0,
        terminalCount: 0,
        userCount: 0,
        lastSyncAt: null,
        createdAt: new Date().toISOString(),
      };
      const mockInviteToken = 'inv_' + Math.random().toString(36).slice(2, 18);
      const mockResult = {
        tenant: createdTenant,
        inviteToken: mockInviteToken,
        inviteLink: `/#onboarding?token=${mockInviteToken}`,
      };
      setTenants((prev) => [createdTenant, ...prev]);
      setCreatedTenantResult(mockResult);
      setShowCreateModal(false);
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // Suspend or Reactivate (Sensitive Action)
  const handleToggleTenantStatus = (tenant: TenantUsageSummary) => {
    if (adminUser?.role === 'SUPPORT') {
      alert('Action Restricted: Platform Support role cannot suspend tenants.');
      return;
    }
    if (adminUser?.role === 'BILLING' && tenant.status === 'active') {
      alert('Action Restricted: Platform Billing role cannot suspend tenants.');
      return;
    }

    const nextStatus = tenant.status === 'active' ? 'suspended' : 'active';
    const confirmPrompt =
      nextStatus === 'suspended'
        ? `Are you sure you want to SUSPEND '${tenant.name}'? Back-office logins and cloud syncing will be halted immediately.`
        : `Reactivate '${tenant.name}' and restore cloud syncing?`;

    if (!window.confirm(confirmPrompt)) return;

    executeWithReauth(async (reauthToken) => {
      try {
        const res = await fetch(`${API_BASE}/tenants/${tenant.id}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${platformToken}`,
            'x-reauth-token': reauthToken,
          },
          body: JSON.stringify({ status: nextStatus }),
        });
        if (res.ok) {
          await loadTenants();
          await loadAuditLogs();
        } else {
          const err = await res.json();
          alert(err.message || 'Failed to update tenant status');
        }
      } catch {
        setTenants((prev) =>
          prev.map((t) => (t.id === tenant.id ? { ...t, status: nextStatus } : t)),
        );
      }
    });
  };

  // Update Plan (Sensitive Action)
  const handleUpdatePlan = (tenant: TenantUsageSummary, newPlan: TenantPlan) => {
    if (adminUser?.role === 'SUPPORT') {
      alert('Action Restricted: Platform Support role cannot modify subscription plans.');
      return;
    }

    executeWithReauth(async (reauthToken) => {
      try {
        const res = await fetch(`${API_BASE}/tenants/${tenant.id}/plan`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${platformToken}`,
            'x-reauth-token': reauthToken,
          },
          body: JSON.stringify({ plan: newPlan }),
        });
        if (res.ok) {
          setShowPlanModal(false);
          await loadTenants();
          await loadAuditLogs();
        } else {
          const err = await res.json();
          alert(err.message || 'Failed to update tenant plan');
        }
      } catch {}
    });
  };

  // Reset Owner Access
  const handleResetOwnerAccess = async (tenant: TenantUsageSummary) => {
    if (!window.confirm(`Generate a fresh onboarding/reset link for ${tenant.name}?`)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/tenants/${tenant.id}/reset-owner`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${platformToken}` },
      });
      const data = await res.json();
      if (res.ok) {
        setShowResetSuccessModal({
          tenantName: tenant.name,
          inviteToken: data.inviteToken,
          inviteLink: `${window.location.origin}${data.inviteLink}`,
        });
        await loadAuditLogs();
      } else {
        alert(data.message || 'Failed to reset owner access');
      }
    } catch {
      const mockToken = 'rst_' + Math.random().toString(36).slice(2, 18);
      setShowResetSuccessModal({
        tenantName: tenant.name,
        inviteToken: mockToken,
        inviteLink: `${window.location.origin}/#onboarding?token=${mockToken}`,
      });
    }
  };

  // Break-glass Support Access (Sensitive Action)
  const handleRequestSupport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant) return;

    if (adminUser?.role === 'BILLING') {
      alert('Action Restricted: Billing operators cannot request break-glass access.');
      return;
    }

    executeWithReauth(async (reauthToken) => {
      setIsRequestingSupport(true);
      try {
        const res = await fetch(`${API_BASE}/tenants/${selectedTenant.id}/support-access`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${platformToken}`,
            'x-reauth-token': reauthToken,
          },
          body: JSON.stringify({
            reason: supportReason.trim(),
            durationHours: supportDuration,
          }),
        });

        const data = await res.json();
        if (res.ok) {
          setActiveSupportSession(data);
          sessionStorage.setItem('gebeyaos_active_support_session', JSON.stringify(data));
          setShowSupportModal(false);
          setSupportReason('');
          await loadAuditLogs();
        } else {
          setSupportError(data.message || 'Failed to obtain support session.');
        }
      } catch {
        setSupportError('Network error requesting support session.');
      } finally {
        setIsRequestingSupport(false);
      }
    });
  };

  const handleRevokeSupport = async () => {
    if (!activeSupportSession) return;
    try {
      await fetch(`${API_BASE}/support-access/${activeSupportSession.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${platformToken}` },
      });
    } catch {}

    setActiveSupportSession(null);
    sessionStorage.removeItem('gebeyaos_active_support_session');
    await loadAuditLogs();
  };

  // Export Data
  const handleExportData = async (tenant: TenantUsageSummary) => {
    if (adminUser?.role === 'BILLING') {
      alert('Action Restricted: Platform Billing role cannot export tenant business data.');
      return;
    }

    if (adminUser?.role === 'SUPPORT' && (!activeSupportSession || activeSupportSession.tenantId !== tenant.id)) {
      alert('Support Access Required: As a Support Operator, you must first obtain an active break-glass support session before accessing or exporting business data.');
      setSelectedTenant(tenant);
      setShowSupportModal(true);
      return;
    }

    setExportingTenantId(tenant.id);
    try {
      const res = await fetch(`${API_BASE}/tenants/${tenant.id}/export`, {
        headers: { Authorization: `Bearer ${platformToken}` },
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.message || 'Export failed.');
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gebeyaos_export_${tenant.slug}_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      await loadAuditLogs();
    } catch {
      alert('Failed to connect to export service.');
    } finally {
      setExportingTenantId(null);
    }
  };

  // Delete Tenant (Sensitive Action)
  const handleDeleteTenant = () => {
    if (!selectedTenant) return;
    if (adminUser?.role !== 'SUPER_ADMIN') {
      alert('Action Restricted: Only Super Administrators can permanently delete tenants.');
      return;
    }

    executeWithReauth(async (reauthToken) => {
      setIsDeletingTenant(true);
      try {
        const res = await fetch(`${API_BASE}/tenants/${selectedTenant.id}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${platformToken}`,
            'x-reauth-token': reauthToken,
          },
          body: JSON.stringify({ confirmationCode: deleteConfirmationInput.trim() }),
        });

        const data = await res.json();
        if (res.ok) {
          setShowDeleteModal(false);
          setDeleteConfirmationInput('');
          setSelectedTenant(null);
          await loadTenants();
          await loadAuditLogs();
        } else {
          setDeleteError(data.message || 'Deletion failed.');
        }
      } catch {
        setDeleteError('Network error while deleting tenant.');
      } finally {
        setIsDeletingTenant(false);
      }
    });
  };

  // 1. Unauthenticated Platform Views
  if (!platformToken) {
    // 2FA Enrollment Screen
    if (twoFaStage === 'enrollment') {
      return (
        <div className="min-h-screen w-screen flex flex-col items-center justify-center p-6 bg-slate-950 text-slate-100 font-sans select-none">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <ShieldCheck size={26} />
              </div>
              <div>
                <div className="text-[11px] font-bold tracking-wider text-emerald-400 uppercase">
                  Step 2: Mandatory 2FA Setup
                </div>
                <h1 className="text-xl font-bold tracking-tight text-white">Enroll Authenticator App</h1>
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              Platform administration requires two-factor authentication (TOTP). Scan the secret with Google Authenticator, Authy, or 1Password, and save your backup codes securely.
            </p>

            {twoFaError && (
              <div className="p-3 mb-4 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs flex items-center gap-2">
                <AlertTriangle size={15} className="shrink-0 text-amber-400" />
                <span>{twoFaError}</span>
              </div>
            )}

            {/* Secret key display */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  Authenticator Secret Key (Base32)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(enrollmentSecret);
                    setCopiedSecretKey(true);
                    setTimeout(() => setCopiedSecretKey(false), 2000);
                  }}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
                >
                  {copiedSecretKey ? <Check size={13} /> : <Copy size={13} />}
                  {copiedSecretKey ? 'Copied' : 'Copy Key'}
                </button>
              </div>
              <div className="font-mono text-sm tracking-widest text-emerald-300 break-all bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                {enrollmentSecret.match(/.{1,4}/g)?.join(' ') || enrollmentSecret}
              </div>
            </div>

            {/* 10 Backup codes */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 mb-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                  <Key size={13} /> 10 One-Time Backup Codes
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(enrollmentBackupCodes.join('\n'));
                    setCopiedBackupCodes(true);
                    setTimeout(() => setCopiedBackupCodes(false), 2000);
                  }}
                  className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1"
                >
                  {copiedBackupCodes ? <Check size={13} /> : <Copy size={13} />}
                  {copiedBackupCodes ? 'Copied All' : 'Copy All Codes'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-300">
                {enrollmentBackupCodes.map((code, idx) => (
                  <div key={idx} className="bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 font-sans">#{idx + 1}</span>
                    <span className="font-bold text-slate-200">{code}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-2">
                ⚠️ Each code can only be used once if your phone or authenticator app is unavailable.
              </p>
            </div>

            <form onSubmit={handleVerify2Fa} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Enter 6-Digit Authenticator Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={twoFaCode}
                  onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  autoFocus
                  required
                  className="w-full text-center tracking-widest text-lg font-mono px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-hidden focus:border-emerald-500 transition-all"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="rememberDevice"
                  checked={twoFaRememberDevice}
                  onChange={(e) => setTwoFaRememberDevice(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                />
                <label htmlFor="rememberDevice" className="text-xs text-slate-300 cursor-pointer">
                  Remember this device for 12 hours
                </label>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setTwoFaStage('none')}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isVerifying2Fa || twoFaCode.length !== 6}
                  className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-900/30 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {isVerifying2Fa ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" /> Verifying...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} /> Complete 2FA & Enter Console
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      );
    }

    // 2FA Challenge Screen
    if (twoFaStage === 'challenge') {
      return (
        <div className="min-h-screen w-screen flex flex-col items-center justify-center p-6 bg-slate-950 text-slate-100 font-sans select-none">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Lock size={24} />
              </div>
              <div>
                <div className="text-[11px] font-bold tracking-wider text-emerald-400 uppercase">
                  Two-Factor Authentication
                </div>
                <h1 className="text-xl font-bold tracking-tight text-white">Security Verification</h1>
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              {isUsingBackupCode
                ? 'Enter one of your 8-character single-use emergency backup codes.'
                : 'Enter the 6-digit TOTP verification code from your authenticator app.'}
            </p>

            {twoFaError && (
              <div className="p-3.5 mb-5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs flex items-center gap-2.5">
                <AlertTriangle size={16} className="shrink-0 text-amber-400" />
                <span>{twoFaError}</span>
              </div>
            )}

            <form onSubmit={handleVerify2Fa} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {isUsingBackupCode ? 'Emergency Backup Code (XXXX-XXXX)' : '6-Digit Authenticator Code'}
                </label>
                <input
                  type="text"
                  maxLength={isUsingBackupCode ? 9 : 6}
                  value={twoFaCode}
                  onChange={(e) => setTwoFaCode(e.target.value)}
                  placeholder={isUsingBackupCode ? 'C037-0F0E' : '000000'}
                  autoFocus
                  required
                  className="w-full text-center tracking-widest text-lg font-mono px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-hidden focus:border-emerald-500 transition-all uppercase"
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setIsUsingBackupCode(!isUsingBackupCode);
                    setTwoFaCode('');
                  }}
                  className="text-emerald-400 hover:underline font-medium"
                >
                  {isUsingBackupCode ? 'Use Authenticator Code instead' : 'Use a backup code instead'}
                </button>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="rememberDeviceChal"
                    checked={twoFaRememberDevice}
                    onChange={(e) => setTwoFaRememberDevice(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                  />
                  <label htmlFor="rememberDeviceChal" className="text-slate-300 cursor-pointer">
                    Remember 12h
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={isVerifying2Fa || twoFaCode.trim().length < 6}
                className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-900/30 disabled:opacity-50 active:scale-98 transition-all flex items-center justify-center gap-2 mt-2"
              >
                {isVerifying2Fa ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" /> Verifying...
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} /> Verify & Enter Control Plane
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setTwoFaStage('none')}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel & Return to Sign In
                </button>
              </div>
            </form>
          </div>
        </div>
      );
    }

    // Step 1: Username & Password Login Screen
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center p-6 bg-slate-950 text-slate-100 font-sans select-none">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ShieldAlert size={26} />
            </div>
            <div>
              <div className="text-[11px] font-bold tracking-wider text-emerald-400 uppercase">
                Platform Control Plane
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white">Operator Sign In</h1>
            </div>
          </div>

          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            Multi-tenant fleet administration, supermarket provisioning, plan licensing, and break-glass support access.
          </p>

          {loginError && (
            <div className="p-3.5 mb-5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs flex items-center gap-2.5">
              <AlertTriangle size={16} className="shrink-0 text-amber-400" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Operator Username or Email
              </label>
              <input
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                required
                placeholder="e.g. platform_admin"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500 transition-all font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Operator Master Password
              </label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                placeholder="••••••••••••"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500 transition-all font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-900/30 active:scale-98 transition-all flex items-center justify-center gap-2 mt-2"
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw size={16} className="animate-spin" /> Verifying Credentials...
                </>
              ) : (
                <>
                  <Lock size={16} /> Enter Platform Control Plane
                </>
              )}
            </button>
          </form>

          {/* Quick helper */}
          <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Provisioned via: <strong className="text-slate-200">npm run create-platform-admin</strong></span>
            {onExit && (
              <button
                type="button"
                onClick={onExit}
                className="text-emerald-400 hover:underline font-medium"
              >
                Return to POS
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Filtered tenants
  const filteredTenants = tenants.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.slug.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredApplications = applications.filter((app) => {
    if (applicationFilter !== 'all' && app.status.toLowerCase() !== applicationFilter) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      app.supermarketName.toLowerCase().includes(q) ||
      app.ownerFullName.toLowerCase().includes(q) ||
      app.phone.toLowerCase().includes(q) ||
      app.email.toLowerCase().includes(q) ||
      app.city.toLowerCase().includes(q)
    );
  });

  const pendingApplicationsCount = applications.filter((a) => a.status === 'PENDING').length;
  const totalBranches = tenants.reduce((acc, t) => acc + t.branchCount, 0);
  const totalTerminals = tenants.reduce((acc, t) => acc + t.terminalCount, 0);
  const activeTenantsCount = tenants.filter((t) => t.status === 'active').length;
  const suspendedCount = tenants.filter((t) => t.status === 'suspended').length;

  const roleBadge = () => {
    const role = adminUser?.role || 'SUPER_ADMIN';
    if (role === 'SUPER_ADMIN') {
      return (
        <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
          <ShieldCheck size={11} /> Super Admin
        </span>
      );
    }
    if (role === 'SUPPORT') {
      return (
        <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-bold flex items-center gap-1">
          <ShieldAlert size={11} /> Support Operator
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold flex items-center gap-1">
        <Key size={11} /> Billing Operator
      </span>
    );
  };

  return (
    <div className="min-h-screen w-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden">
      {/* 1. Control Plane Header */}
      <header className="h-16 px-6 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between shrink-0 z-20 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-xs">
              <ShieldAlert size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-tight text-white">GebeyaOS Platform Console</span>
                {roleBadge()}
              </div>
              <p className="text-[11px] text-slate-400">Fleet Control & Supermarket Tenant Isolation</p>
            </div>
          </div>

          <div className="h-6 w-px bg-slate-800 mx-2" />

          {/* Navigation switch */}
          <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 text-xs font-semibold">
            <button
              onClick={() => setCurrentTab('tenants')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                currentTab === 'tenants'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Building2 size={14} /> Supermarkets ({tenants.length})
            </button>
            <button
              onClick={() => setCurrentTab('applications')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                currentTab === 'applications'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText size={14} /> Applications ({pendingApplicationsCount})
            </button>
            <button
              onClick={() => setCurrentTab('sessions')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                currentTab === 'sessions'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Laptop size={14} /> Operator Sessions ({sessionsList.length})
            </button>
            <button
              onClick={() => setCurrentTab('audit')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                currentTab === 'audit'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Clock size={14} /> Platform Audit ({auditLogs.length})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs font-bold text-slate-200">{adminUser?.fullName || 'Operator'}</div>
            <div className="text-[10px] font-mono text-emerald-400">{adminUser?.email || 'admin@gebeyaos.et'}</div>
          </div>

          <button
            onClick={() => setShowChangePasswordModal(true)}
            title="Change Master Password"
            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition-all"
          >
            <KeyRound size={13} /> Password
          </button>

          {onExit && (
            <button
              onClick={onExit}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all flex items-center gap-1.5"
            >
              <ArrowRight size={14} /> Exit to POS
            </button>
          )}

          <button
            onClick={handleLogout}
            title="Log Out Operator"
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 border border-slate-700 transition-all"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* 2. Break-Glass Support Access Banner */}
      {activeSupportSession && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-6 py-2.5 flex items-center justify-between text-xs text-amber-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <ShieldAlert size={16} className="text-amber-400 animate-pulse" />
            <span>
              <strong>Active Break-Glass Support Session:</strong> Connected to tenant{' '}
              <strong className="underline">{activeSupportSession.tenantName}</strong> for troubleshooting.
            </span>
            <span className="text-amber-400/80 font-mono text-[11px]">
              (Expires at {new Date(activeSupportSession.expiresAt).toLocaleTimeString()})
            </span>
          </div>
          <button
            onClick={handleRevokeSupport}
            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-bold text-[11px] transition-all cursor-pointer"
          >
            Terminate Support Session
          </button>
        </div>
      )}

      {/* 3. Main Workspace */}
      <main className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
        {currentTab === 'tenants' && (
          <>
            {/* Metric KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                  <Building2 size={24} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-400">Total Supermarkets</div>
                  <div className="text-2xl font-bold text-white tracking-tight">{tenants.length}</div>
                  <div className="text-[11px] text-emerald-400 mt-0.5">{activeTenantsCount} Active Supermarkets</div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                  <HardDrive size={24} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-400">Branch LAN Servers</div>
                  <div className="text-2xl font-bold text-white tracking-tight">{totalBranches}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Offline-capable edge nodes</div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
                  <Laptop size={24} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-400">POS Terminals</div>
                  <div className="text-2xl font-bold text-white tracking-tight">{totalTerminals}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Lane checkouts active</div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                  <ShieldAlert size={24} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-400">Suspended Accounts</div>
                  <div className="text-2xl font-bold text-white tracking-tight">{suspendedCount}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Isolated from synchronization</div>
                </div>
              </div>
            </div>

            {/* Tenant Fleet Management Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm flex-1 flex flex-col">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-bold text-white">Supermarket Tenant Fleet</h2>
                  <span className="text-xs text-slate-400">({filteredTenants.length} shown)</span>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <div className="relative min-w-[200px]">
                    <Search size={14} className="absolute left-3 top-3 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search company or slug..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500 font-mono"
                    />
                  </div>

                  <select
                    value={statusFilter}
                    onChange={(e: any) => setStatusFilter(e.target.value)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-300 focus:outline-hidden focus:border-emerald-500 cursor-pointer font-medium"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active Only</option>
                    <option value="suspended">Suspended Only</option>
                  </select>

                  <button
                    onClick={loadTenants}
                    title="Refresh fleet telemetry"
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-all cursor-pointer"
                  >
                    <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                  </button>

                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-950/40 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Plus size={14} /> Provision Supermarket
                  </button>
                </div>
              </div>

              {/* Tenants Table */}
              <div className="overflow-x-auto flex-1 mt-4">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="text-[11px] uppercase font-bold text-slate-400 border-b border-slate-800 bg-slate-900/60">
                    <tr>
                      <th className="py-3 px-4">Supermarket & Slug</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Plan & Quota</th>
                      <th className="py-3 px-4">Branches</th>
                      <th className="py-3 px-4">Terminals</th>
                      <th className="py-3 px-4">Staff</th>
                      <th className="py-3 px-4">Last Sync</th>
                      <th className="py-3 px-4 text-right">Operator Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {filteredTenants.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500">
                          <Building2 size={32} className="mx-auto mb-2 text-slate-600 opacity-60" />
                          <p className="font-semibold text-slate-300">No supermarket tenants registered</p>
                          <p className="text-xs text-slate-500 mt-1">Get started by provisioning your first supermarket or approve pending registrations.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredTenants.map((tenant) => (
                        <tr key={tenant.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-white text-sm">{tenant.name}</div>
                            <div className="font-mono text-[11px] text-emerald-400 flex items-center gap-1">
                              <span>company_code:</span>
                              <strong className="text-white bg-slate-800 px-1 py-0.5 rounded uppercase">
                                {tenant.slug}
                              </strong>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                                tenant.status === 'active'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {tenant.status}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-200 capitalize">{tenant.plan}</span>
                              {adminUser?.role !== 'SUPPORT' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedTenant(tenant);
                                    setPlanToUpdate(tenant.plan);
                                    setShowPlanModal(true);
                                  }}
                                  className="text-[10px] text-slate-400 hover:text-emerald-400 underline"
                                >
                                  Change
                                </button>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              max: {tenant.maxBranches}b / {tenant.maxTerminals}t
                            </div>
                          </td>

                          <td className="py-3.5 px-4 font-mono">
                            <span className="text-white font-bold">{tenant.branchCount}</span>
                            <span className="text-slate-500">/{tenant.maxBranches}</span>
                          </td>

                          <td className="py-3.5 px-4 font-mono">
                            <span className="text-white font-bold">{tenant.terminalCount}</span>
                            <span className="text-slate-500">/{tenant.maxTerminals}</span>
                          </td>

                          <td className="py-3.5 px-4 font-mono">
                            <span className="text-white font-bold">{tenant.userCount}</span>
                            <span className="text-slate-500">/{tenant.maxUsers}</span>
                          </td>

                          <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                            {tenant.lastSyncAt ? new Date(tenant.lastSyncAt).toLocaleTimeString() : 'Never'}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Reset owner access link */}
                              <button
                                type="button"
                                onClick={() => handleResetOwnerAccess(tenant)}
                                title="Reset Owner Access / Generate Invite"
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer"
                              >
                                <Key size={13} />
                              </button>

                              {/* Break-glass support access */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTenant(tenant);
                                  setShowSupportModal(true);
                                }}
                                title="Request Audited Support Session"
                                disabled={adminUser?.role === 'BILLING'}
                                className="p-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Shield size={13} />
                              </button>

                              {/* Export tenant data */}
                              <button
                                type="button"
                                onClick={() => handleExportData(tenant)}
                                title="Export Complete Tenant Database & Ledger (ZIP)"
                                disabled={exportingTenantId === tenant.id || adminUser?.role === 'BILLING'}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer disabled:opacity-50"
                              >
                                {exportingTenantId === tenant.id ? (
                                  <RefreshCw size={13} className="animate-spin text-emerald-400" />
                                ) : (
                                  <Download size={13} />
                                )}
                              </button>

                              {/* Suspend or Reactivate */}
                              <button
                                type="button"
                                onClick={() => handleToggleTenantStatus(tenant)}
                                disabled={adminUser?.role === 'SUPPORT' || (adminUser?.role === 'BILLING' && tenant.status === 'active')}
                                className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                                  tenant.status === 'active'
                                    ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/30'
                                    : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30'
                                }`}
                              >
                                {tenant.status === 'active' ? 'Suspend' : 'Activate'}
                              </button>

                              {/* Delete tenant */}
                              {adminUser?.role === 'SUPER_ADMIN' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedTenant(tenant);
                                    setDeleteConfirmationInput('');
                                    setDeleteError(null);
                                    setShowDeleteModal(true);
                                  }}
                                  title="Permanently Delete Tenant"
                                  className="p-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/30 text-red-400 border border-red-500/30 transition-all cursor-pointer"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Applications Tab */}
        {currentTab === 'applications' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText size={18} className="text-emerald-400" /> Supermarket Onboarding Applications
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Review incoming supermarket registrations, verify business details, and approve with 72-hour owner setup tokens.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
                  {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setApplicationFilter(f)}
                      className={`px-3 py-1 rounded-lg capitalize transition-all ${
                        applicationFilter === f
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={loadApplications}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 flex items-center gap-1.5"
                >
                  <RefreshCw size={13} className={isLoadingApplications ? 'animate-spin' : ''} /> Refresh
                </button>
              </div>
            </div>

            <div className="overflow-x-auto mt-4">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="text-[11px] uppercase font-bold text-slate-400 border-b border-slate-800 bg-slate-900/60">
                  <tr>
                    <th className="py-3 px-4">Supermarket & Location</th>
                    <th className="py-3 px-4">Owner & Contact</th>
                    <th className="py-3 px-4">Submitted</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Notes</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredApplications.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500 font-sans text-xs">
                        No supermarket onboarding applications found.
                      </td>
                    </tr>
                  ) : (
                    filteredApplications.map((app) => (
                      <tr key={app.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white text-sm">{app.supermarketName}</div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <span>{app.city}</span>
                            {app.address && <span>• {app.address}</span>}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-200">{app.ownerFullName}</div>
                          <div className="text-[11px] font-mono text-emerald-400 mt-0.5">{app.phone}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{app.email}</div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                          {new Date(app.createdAt).toLocaleDateString()}
                          <div className="text-[10px] text-slate-500">{new Date(app.createdAt).toLocaleTimeString()}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2.5 py-1 rounded-full font-bold text-[10px] inline-flex items-center gap-1 ${
                              app.status === 'APPROVED'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : app.status === 'REJECTED'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {app.status === 'APPROVED' && <CheckCircle2 size={11} />}
                            {app.status === 'REJECTED' && <X size={11} />}
                            {app.status === 'PENDING' && <Clock size={11} />}
                            {app.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 text-[11px] max-w-xs truncate">
                          {app.notes || '—'}
                          {app.rejectionReason && (
                            <div className="text-rose-400 text-[10px] mt-0.5 font-medium">
                              Reason: {app.rejectionReason}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {app.status === 'PENDING' ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                disabled={approvingAppId === app.id}
                                onClick={() => handleApproveApplication(app)}
                                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                              >
                                {approvingAppId === app.id ? (
                                  <RefreshCw size={12} className="animate-spin" />
                                ) : (
                                  <Check size={12} />
                                )}
                                Approve & Issue Token
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedApplicationForReject(app);
                                  setRejectReason('');
                                }}
                                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 text-slate-400 font-medium text-xs border border-slate-700 transition-all cursor-pointer"
                              >
                                Reject
                              </button>
                            </div>
                          ) : app.status === 'APPROVED' && app.inviteToken ? (
                            <button
                              type="button"
                              onClick={() => {
                                const url = `${window.location.origin}/#onboarding?token=${app.inviteToken}`;
                                navigator.clipboard.writeText(url);
                                setCopiedToken(app.inviteToken || null);
                                setTimeout(() => setCopiedToken(null), 2500);
                              }}
                              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs border border-slate-700 inline-flex items-center gap-1.5 transition-all cursor-pointer"
                            >
                              {copiedToken === app.inviteToken ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                              {copiedToken === app.inviteToken ? 'Link Copied!' : 'Copy Invite Link'}
                            </button>
                          ) : (
                            <span className="text-slate-600 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Sessions Tab */}
        {currentTab === 'sessions' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col">
            <div className="flex items-center justify-between pb-5 border-b border-slate-800">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Laptop size={18} className="text-emerald-400" /> Active Platform Operator Sessions
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Manage active browser sessions, IP addresses, and revoke compromised device logins.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadSessions}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 flex items-center gap-1.5"
                >
                  <RefreshCw size={13} className={isLoadingSessions ? 'animate-spin' : ''} /> Refresh
                </button>
                <button
                  type="button"
                  onClick={handleRevokeAllSessions}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold transition-all"
                >
                  Revoke All Other Sessions
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {sessionsList.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  No active platform sessions found.
                </div>
              ) : (
                sessionsList.map((session) => (
                  <div
                    key={session.id}
                    className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300">
                        <Laptop size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">{session.deviceInfo || 'Operator Console'}</span>
                          {session.isCurrent && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                              Current Device
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-3 font-mono">
                          <span>IP: {session.ipAddress || '127.0.0.1'}</span>
                          <span>Created: {new Date(session.createdAt).toLocaleString()}</span>
                          <span>Expires: {new Date(session.expiresAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>

                    {!session.isCurrent && (
                      <button
                        type="button"
                        onClick={() => handleRevokeSession(session.id)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 text-slate-300 text-xs font-medium border border-slate-700 transition-all"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Audit Tab */}
        {currentTab === 'audit' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col">
            <div className="flex items-center justify-between pb-5 border-b border-slate-800">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Clock size={18} className="text-emerald-400" /> Platform Security & Access Audit Trail
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Immutable record of all platform admin operations, tenant provisioning, support access, and security changes.
                </p>
              </div>

              <button
                type="button"
                onClick={loadAuditLogs}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 flex items-center gap-1.5"
              >
                <RefreshCw size={13} /> Refresh Log
              </button>
            </div>

            <div className="overflow-x-auto mt-4">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="text-[11px] uppercase font-bold text-slate-400 border-b border-slate-800 bg-slate-900/60">
                  <tr>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Operator</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Tenant</th>
                    <th className="py-3 px-4">Client IP</th>
                    <th className="py-3 px-4">Audit Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 font-sans text-xs">
                        No audit trail entries recorded yet.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/40">
                        <td className="py-3 px-4 text-slate-400">{new Date(log.createdAt).toLocaleString()}</td>
                        <td className="py-3 px-4 text-slate-200 font-sans font-medium">{log.adminUsername || 'Operator'}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                              log.action.includes('SUSPEND') || log.action.includes('DELETE')
                                ? 'bg-rose-500/20 text-rose-300'
                                : log.action.includes('SUPPORT')
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-emerald-500/20 text-emerald-300'
                            }`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-300 font-sans">{log.tenantName || 'Platform HQ'}</td>
                        <td className="py-3 px-4 text-slate-400">{log.ipAddress || '127.0.0.1'}</td>
                        <td className="py-3 px-4 text-slate-400 max-w-xs truncate">{JSON.stringify(log.details || {})}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* MODAL: Re-Authentication for Sensitive Actions */}
      {showReauthModal && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2 text-emerald-400">
                <Lock size={20} />
                <h3 className="font-bold text-base text-white">Re-Authenticate Operator</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowReauthModal(false);
                  setPendingAction(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Sensitive platform actions (suspending tenants, permanent deletion, changing plans, or support access) require verifying your master password and 6-digit authenticator code.
            </p>

            {reauthError && (
              <div className="mb-4 p-3 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs">
                {reauthError}
              </div>
            )}

            <form onSubmit={handleReauthSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Master Password</label>
                <input
                  type="password"
                  value={reauthPassword}
                  onChange={(e) => setReauthPassword(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-sm focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">6-Digit Authenticator (TOTP) Code</label>
                <input
                  type="text"
                  maxLength={6}
                  value={reauthTotp}
                  onChange={(e) => setReauthTotp(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-center tracking-widest text-base focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowReauthModal(false);
                    setPendingAction(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReauth || !reauthPassword || reauthTotp.length !== 6}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 shadow-md shadow-emerald-950/40 disabled:opacity-40"
                >
                  {isSubmittingReauth ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  Confirm Authorization
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Change Master Password */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2 text-emerald-400">
                <KeyRound size={20} />
                <h3 className="font-bold text-base text-white">Change Master Password</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowChangePasswordModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {changePasswordError && (
              <div className="mb-4 p-3 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs">
                {changePasswordError}
              </div>
            )}

            {changePasswordSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <Check size={15} /> {changePasswordSuccess}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Current Master Password</label>
                <input
                  type="password"
                  value={currentPasswordInput}
                  onChange={(e) => setCurrentPasswordInput(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-sm focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">New Master Password (min 10 chars)</label>
                <input
                  type="password"
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-sm focus:outline-hidden focus:border-emerald-500"
                />
                {newPasswordInput && (
                  <div className="mt-2">
                    <div className="flex items-center gap-1.5 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${calculatePasswordStrength(newPasswordInput).color}`}
                        style={{ width: `${(calculatePasswordStrength(newPasswordInput).score / 4) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPasswordInput}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-sm focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowChangePasswordModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isChangingPassword || !newPasswordInput}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 shadow-md shadow-emerald-950/40 disabled:opacity-50"
                >
                  {isChangingPassword ? <RefreshCw size={14} className="animate-spin" /> : <Lock size={14} />}
                  Update Master Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Change Tenant Plan */}
      {showPlanModal && selectedTenant && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <h3 className="font-bold text-base text-white">Change Plan for {selectedTenant.name}</h3>
              <button
                type="button"
                onClick={() => setShowPlanModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Select Subscription Tier</label>
                <select
                  value={planToUpdate}
                  onChange={(e: any) => setPlanToUpdate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-medium"
                >
                  <option value="starter">Starter (Max 3 Branches, 5 Terminals, 15 Users)</option>
                  <option value="growth">Growth (Max 10 Branches, 25 Terminals, 50 Users)</option>
                  <option value="enterprise">Enterprise (Max 100 Branches, 200 Terminals, 500 Users)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdatePlan(selectedTenant, planToUpdate)}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  Apply Plan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Reject Supermarket Application */}
      {selectedApplicationForReject && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <AlertTriangle size={18} className="text-rose-400" />
                Reject Supermarket Application
              </h3>
              <button
                type="button"
                onClick={() => setSelectedApplicationForReject(null)}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-4">
              Are you sure you want to reject the application for{' '}
              <strong className="text-white">{selectedApplicationForReject.supermarketName}</strong>?
            </p>

            <div className="mb-5">
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                Rejection Reason (Audit Log)
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Could not verify business license or contact number was unreachable."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-hidden focus:border-rose-500 transition-colors resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedApplicationForReject(null)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRejecting}
                onClick={handleRejectApplication}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-md disabled:opacity-50"
              >
                {isRejecting ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Modal: Provision Supermarket Tenant */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2 text-emerald-400">
                <Plus size={20} />
                <h3 className="font-bold text-base text-white">Provision Supermarket Tenant</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {createError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateTenant} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Company / Supermarket Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Abyssinia Supermarket"
                  value={newTenantName}
                  onChange={(e) => {
                    setNewTenantName(e.target.value);
                    if (!newTenantSlug) {
                      setNewTenantSlug(
                        e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
                      );
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Tenant Slug (Company Code for Login)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. abyssinia"
                  value={newTenantSlug}
                  onChange={(e) => setNewTenantSlug(e.target.value.toLowerCase())}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono uppercase focus:outline-hidden focus:border-emerald-500"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Store staff will type this company code to access their branch portal.
                </span>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Subscription Plan</label>
                <select
                  value={newTenantPlan}
                  onChange={(e) => setNewTenantPlan(e.target.value as TenantPlan)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-hidden focus:border-emerald-500"
                >
                  <option value="starter">Starter (Max 3 Branches, 5 Terminals, 15 Users)</option>
                  <option value="growth">Growth (Max 10 Branches, 25 Terminals, 50 Users)</option>
                  <option value="enterprise">Enterprise (Max 100 Branches, 200 Terminals, 500 Users)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Owner / Director Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Abebe Bikila"
                    value={newOwnerName}
                    onChange={(e) => setNewOwnerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Owner Email or Phone</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. owner@store.et or +251911..."
                    value={newOwnerContact}
                    onChange={(e) => setNewOwnerContact(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-hidden focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 shadow-md shadow-emerald-950/40"
                >
                  {isSubmittingCreate ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                  Provision & Generate Invite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Modal: Provisioning Success with One-Time Invite Link */}
      {createdTenantResult && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl w-full max-w-lg p-6 shadow-2xl relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Check size={22} />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Supermarket Tenant Created!</h3>
                <p className="text-xs text-slate-400">
                  {createdTenantResult.tenant.name} (<code>{createdTenantResult.tenant.slug}</code>) is ready.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-3 mb-4">
              <div className="text-slate-300 font-medium">
                Deliver this one-time onboarding link to the supermarket owner. It expires in 7 days:
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 font-mono text-[11px] text-emerald-300 break-all select-all flex items-center justify-between gap-2">
                <span>{window.location.origin}{createdTenantResult.inviteLink}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}${createdTenantResult.inviteLink}`);
                    setCopiedToken('copied');
                    setTimeout(() => setCopiedToken(null), 2000);
                  }}
                  className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold shrink-0 cursor-pointer"
                >
                  {copiedToken ? 'Copied!' : 'Copy Link'}
                </button>
              </div>

              <div className="text-[11px] text-slate-500">
                During onboarding, the owner will set their master password and configure their store.
              </div>
            </div>

            <button
              type="button"
              onClick={() => setCreatedTenantResult(null)}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* 6. Modal: Reset Owner Success */}
      {showResetSuccessModal && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl w-full max-w-lg p-6 shadow-2xl relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Key size={20} />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Owner Access Reset Link</h3>
                <p className="text-xs text-slate-400">For {showResetSuccessModal.tenantName}</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-3 mb-4">
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 font-mono text-[11px] text-emerald-300 break-all select-all flex items-center justify-between gap-2">
                <span>{showResetSuccessModal.inviteLink}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(showResetSuccessModal.inviteLink);
                    setCopiedToken('reset_copied');
                    setTimeout(() => setCopiedToken(null), 2000);
                  }}
                  className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold shrink-0 cursor-pointer"
                >
                  {copiedToken === 'reset_copied' ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowResetSuccessModal(null)}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* 7. Modal: Request Break-Glass Support Access */}
      {showSupportModal && selectedTenant && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-slate-900 border border-amber-500/50 rounded-3xl w-full max-w-lg p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2 text-amber-400">
                <Shield size={20} />
                <h3 className="font-bold text-base text-white">Request Break-Glass Support Access</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSupportModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300 mb-4 leading-relaxed">
              <strong>Break-Glass Security Notice:</strong> Platform operators do not see tenant business data by default. Obtaining support access issues an audited, time-bound session recorded permanently in the platform audit trail.
            </div>

            {supportError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs">
                {supportError}
              </div>
            )}

            <form onSubmit={handleRequestSupport} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Target Supermarket</label>
                <div className="px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-white font-bold">
                  {selectedTenant.name} ({selectedTenant.slug})
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Reason for Break-Glass Access (Required, min 10 chars)
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Troubleshooting sync conflict error on Bole-01 branch LAN server..."
                  value={supportReason}
                  onChange={(e) => setSupportReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-hidden focus:border-amber-500 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Session Duration</label>
                <select
                  value={supportDuration}
                  onChange={(e) => setSupportDuration(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-hidden focus:border-amber-500"
                >
                  <option value={1}>1 Hour</option>
                  <option value={2}>2 Hours (Recommended)</option>
                  <option value={4}>4 Hours</option>
                  <option value={8}>8 Hours</option>
                  <option value={24}>24 Hours</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowSupportModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRequestingSupport || supportReason.trim().length < 10}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center gap-1.5 shadow-md shadow-amber-950/40 disabled:opacity-50"
                >
                  {isRequestingSupport ? <RefreshCw size={14} className="animate-spin" /> : <Shield size={14} />}
                  Issue Support Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. Modal: Permanent Tenant Deletion Confirmation */}
      {showDeleteModal && selectedTenant && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-slate-900 border border-red-500/50 rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2 text-red-400">
                <Trash2 size={20} />
                <h3 className="font-bold text-base text-white">Delete Supermarket Tenant</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-300 mb-4 space-y-1">
              <div className="font-bold">⚠️ IRREVERSIBLE ACTION:</div>
              <div>
                This will permanently delete <strong>{selectedTenant.name}</strong>, including all branches, staff accounts, product catalogs, prices, inventory batches, and fiscal sales history.
              </div>
            </div>

            {deleteError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs">
                {deleteError}
              </div>
            )}

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1.5 font-medium">
                  To confirm permanent destruction, type <code className="text-red-400 font-mono font-bold bg-slate-950 px-1.5 py-0.5 rounded">{selectedTenant.slug}</code> below:
                </label>
                <input
                  type="text"
                  value={deleteConfirmationInput}
                  onChange={(e) => setDeleteConfirmationInput(e.target.value)}
                  placeholder={selectedTenant.slug}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-sm focus:outline-hidden focus:border-red-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteTenant}
                  disabled={
                    isDeletingTenant ||
                    deleteConfirmationInput.trim().toLowerCase() !== selectedTenant.slug.toLowerCase()
                  }
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold flex items-center gap-1.5 shadow-md shadow-red-950/40 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isDeletingTenant ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  Permanently Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Reject Supermarket Application */}
      {selectedApplicationForReject && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <AlertTriangle size={18} className="text-rose-400" />
                Reject Supermarket Application
              </h3>
              <button
                type="button"
                onClick={() => setSelectedApplicationForReject(null)}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-4">
              Are you sure you want to reject the application for{' '}
              <strong className="text-white">{selectedApplicationForReject.supermarketName}</strong>?
            </p>

            <div className="mb-5">
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                Rejection Reason (Audit Log)
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Could not verify business license or contact number was unreachable."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-hidden focus:border-rose-500 transition-colors resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedApplicationForReject(null)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRejecting}
                onClick={handleRejectApplication}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-md disabled:opacity-50"
              >
                {isRejecting ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
