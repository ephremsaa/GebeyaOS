import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  AuthenticatedUser,
  RoleName,
  SetupStatusResponse,
  UserSessionInfo,
  CashierSummary,
  TerminalPairRequest,
  TerminalPairResponse,
  ManagerOverrideRequest,
  ManagerOverrideResult,
} from '@gebeyaos/shared-types';

export interface CompanyInfo {
  id?: string;
  name: string;
  slug: string;
  logoUrl?: string;
  receiptHeader?: string;
  isSuspended?: boolean;
}

export interface AssignedBranch {
  id: string;
  name: string;
  code: string;
  isDefault?: boolean;
}

export interface TerminalConfig {
  terminalId: string;
  terminalCode: string;
  terminalName: string;
  branchId: string;
  deviceToken?: string;
  autoLockMinutes: number;
}

export interface AuthContextType {
  currentUser: AuthenticatedUser | null;
  isAuthenticated: boolean;
  isLocked: boolean;
  setupStatus: SetupStatusResponse | null;
  isLoading: boolean;
  companyCode: string;
  companyInfo: CompanyInfo | null;
  assignedBranches: AssignedBranch[];
  isSessionExpired: boolean;
  terminalConfig: TerminalConfig | null;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (...permissions: string[]) => boolean;
  hasRole: (...roles: RoleName[]) => boolean;
  setCompanyCode: (code: string) => void;
  checkCompanyCode: (slug: string) => Promise<{ success: boolean; company?: CompanyInfo; error?: string; isSuspended?: boolean }>;
  selectBranch: (branchId: string) => void;
  login: (
    usernameOrPhone: string,
    password: string,
    companyCode?: string,
    totpCode?: string,
  ) => Promise<{
    success: boolean;
    error?: string;
    remainingSeconds?: number;
    requires2FA?: boolean;
    isSuspended?: boolean;
    branches?: AssignedBranch[];
    forcePasswordChange?: boolean;
  }>;
  reauthenticate: (password: string) => Promise<{ success: boolean; error?: string }>;
  setIsSessionExpired: (expired: boolean) => void;
  pinLogin: (pin: string, userId?: string) => Promise<{ success: boolean; error?: string; remainingSeconds?: number }>;
  executeSetup: (dto: any) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  lockSession: () => void;
  unlockSession: (pin: string, userId?: string) => Promise<{ success: boolean; error?: string; remainingSeconds?: number }>;
  switchCashier: () => void;
  updateUserPassword: (currentPass: string, newPass: string) => Promise<{ success: boolean; error?: string }>;
  updateUserPin: (newPin: string) => Promise<{ success: boolean; error?: string }>;
  forgotPassword: (companyCode: string, usernameOrPhone: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  resetPassword: (companyCode: string, usernameOrPhone: string, code: string, newPassword: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  getUserProfile: () => Promise<any>;
  updateUserProfile: (dto: { fullName?: string; phone?: string; defaultLanguage?: string; themePreference?: string }) => Promise<{ success: boolean; error?: string }>;
  getUserSessions: () => Promise<UserSessionInfo[]>;
  revokeSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
  logoutAll: () => Promise<{ success: boolean; error?: string }>;
  getCashiers: (branchId?: string) => Promise<CashierSummary[]>;
  pairTerminal: (dto: TerminalPairRequest) => Promise<{ success: boolean; terminal?: TerminalPairResponse; error?: string }>;
  managerOverride: (dto: ManagerOverrideRequest) => Promise<ManagerOverrideResult>;
  fetchWithAuth: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = '/api';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(() => {
    try {
      const stored = localStorage.getItem('gebeyaos_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [companyCode, setCompanyCodeState] = useState<string>(() => {
    return localStorage.getItem('gebeyaos_company_code') || '';
  });

  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [assignedBranches, setAssignedBranches] = useState<AssignedBranch[]>(() => {
    try {
      const stored = localStorage.getItem('gebeyaos_assigned_branches');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [terminalConfig, setTerminalConfig] = useState<TerminalConfig | null>(() => {
    try {
      const stored = localStorage.getItem('gebeyaos_terminal_config');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [isSessionExpired, setIsSessionExpired] = useState<boolean>(false);

  const [setupStatus, setSetupStatus] = useState<SetupStatusResponse | null>(null);

  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Set company code and persist
  const setCompanyCode = useCallback((code: string) => {
    const trimmed = code.trim().toLowerCase();
    setCompanyCodeState(trimmed);
    localStorage.setItem('gebeyaos_company_code', trimmed);
  }, []);

  // Fetch company info by slug
  const checkCompanyCode = useCallback(async (slug: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/company-info?slug=${encodeURIComponent(slug.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setCompanyInfo(data);
        setCompanyCode(slug);
        return { success: true, company: data };
      }
      if (res.status === 403) {
        const err = await res.json().catch(() => ({}));
        return {
          success: false,
          isSuspended: true,
          error: err.message || 'This supermarket account is suspended. Please contact platform support.',
        };
      }
      return { success: false, error: 'Supermarket not found for this company code.' };
    } catch {
      return { success: false, error: 'Cannot connect to server. Please check your network connection.' };
    }
  }, [setCompanyCode]);

  // Initial load check
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/setup-status`);
        if (res.ok) {
          const data = await res.json();
          setSetupStatus(data);
          if (!data.setupCompleted) {
            setCurrentUser(null);
          }
        }
      } catch {
        // LAN offline fallback
      }
    };
    checkStatus();

    if (companyCode) {
      checkCompanyCode(companyCode);
    }
  }, [companyCode, checkCompanyCode]);

  // Inactivity Auto-Lock Timer (Configurable per paired terminal)
  const autoLockMinutes = terminalConfig?.autoLockMinutes && terminalConfig.autoLockMinutes > 0
    ? terminalConfig.autoLockMinutes
    : 3;
  const inactivityTimeoutMs = autoLockMinutes * 60 * 1000;

  const resetInactivityTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (!currentUser || isLocked) return;

    idleTimerRef.current = setTimeout(() => {
      setIsLocked(true);
    }, inactivityTimeoutMs);
  }, [currentUser, isLocked, inactivityTimeoutMs]);

  useEffect(() => {
    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    const handleActivity = () => resetInactivityTimer();

    activityEvents.forEach((evt) => window.addEventListener(evt, handleActivity));
    resetInactivityTimer();

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      activityEvents.forEach((evt) => window.removeEventListener(evt, handleActivity));
    };
  }, [resetInactivityTimer]);

  const hasPermission = useCallback((perm: string): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === 'OWNER') return true;
    return currentUser.permissions.includes(perm);
  }, [currentUser]);

  const hasAnyPermission = useCallback((...perms: string[]): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === 'OWNER') return true;
    return perms.some((p) => currentUser.permissions.includes(p));
  }, [currentUser]);

  const hasRole = useCallback((...roles: RoleName[]): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === 'OWNER') return true;
    return roles.includes(currentUser.role);
  }, [currentUser]);

  // Select Branch
  const selectBranch = useCallback((branchId: string) => {
    if (!currentUser) return;
    const targetBranch = assignedBranches.find((b) => b.id === branchId);
    if (targetBranch) {
      const updated: AuthenticatedUser = {
        ...currentUser,
        branchId: targetBranch.id,
        branchCode: targetBranch.code,
        branchName: targetBranch.name,
      };
      setCurrentUser(updated);
      localStorage.setItem('gebeyaos_user', JSON.stringify(updated));
    }
  }, [currentUser, assignedBranches]);

  // Back-office Login
  const login = async (
    usernameOrPhone: string,
    password: string,
    providedCompanyCode?: string,
    totpCode?: string,
  ) => {
    setIsLoading(true);
    const targetCode = providedCompanyCode || companyCode;

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usernameOrPhone,
          password,
          companyCode: targetCode,
          totpCode,
        }),
      });

      if (res.ok) {
        const data = await res.json();

        if (data.requires2FA) {
          setIsLoading(false);
          return {
            success: false,
            requires2FA: true,
          };
        }

        localStorage.setItem('gebeyaos_access_token', data.accessToken);
        localStorage.setItem('gebeyaos_refresh_token', data.refreshToken);
        localStorage.setItem('gebeyaos_user', JSON.stringify(data.user));

        if (data.assignedBranches) {
          setAssignedBranches(data.assignedBranches);
          localStorage.setItem('gebeyaos_assigned_branches', JSON.stringify(data.assignedBranches));
        }

        setCurrentUser(data.user);
        setIsLocked(false);
        setIsSessionExpired(false);
        setIsLoading(false);

        return {
          success: true,
          user: data.user,
          branches: data.assignedBranches || [],
          forcePasswordChange: data.user.forcePasswordChange,
        };
      } else {
        const err = await res.json().catch(() => ({}));
        setIsLoading(false);

        const isSuspended =
          res.status === 403 ||
          (err.message && err.message.toLowerCase().includes('suspended'));

        return {
          success: false,
          error: err.message || 'Login failed. Please check your credentials.',
          remainingSeconds: err.remainingSeconds,
          isSuspended,
        };
      }
    } catch {
      setIsLoading(false);
      return { success: false, error: 'Cannot connect to authentication service. Please check network connection.' };
    }
  };

  // Re-authenticate when session expired (preserves basket and state)
  const reauthenticate = async (password: string) => {
    if (!currentUser) return { success: false, error: 'No active user' };
    const res = await login(currentUser.username, password, companyCode);
    if (res.success) {
      setIsSessionExpired(false);
      return { success: true };
    }
    return { success: false, error: res.error || 'Authentication failed' };
  };

  // Fast Cashier PIN Login (with per-user lockout, terminal binding, 12h expiry)
  const pinLogin = async (pin: string, userId?: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/pin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin,
          userId,
          terminalCode: terminalConfig?.terminalCode || 'POS-01',
          deviceToken: terminalConfig?.deviceToken,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('gebeyaos_access_token', data.accessToken);
        localStorage.setItem('gebeyaos_refresh_token', data.refreshToken);
        localStorage.setItem('gebeyaos_user', JSON.stringify(data.user));
        setCurrentUser(data.user);
        setIsLocked(false);
        setIsSessionExpired(false);
        setIsLoading(false);
        return { success: true };
      } else {
        const err = await res.json().catch(() => ({}));
        setIsLoading(false);
        return {
          success: false,
          error: err.message || 'Invalid cashier PIN',
          remainingSeconds: err.remainingSeconds,
        };
      }
    } catch {
      setIsLoading(false);
      return { success: false, error: 'Cannot connect to branch server for PIN verification.' };
    }
  };

  // First-run Setup Wizard
  const executeSetup = async (dto: any) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('gebeyaos_access_token', data.accessToken);
        localStorage.setItem('gebeyaos_refresh_token', data.refreshToken);
        localStorage.setItem('gebeyaos_user', JSON.stringify(data.user));
        setCurrentUser(data.user);
        setSetupStatus({ setupCompleted: true, ownerExists: true, storeName: dto.companyName });
        setIsLocked(false);
        setIsLoading(false);
        return { success: true };
      } else {
        const err = await res.json().catch(() => ({}));
        setIsLoading(false);
        return { success: false, error: err.message || 'Setup wizard failed.' };
      }
    } catch {
      setIsLoading(false);
      return { success: false, error: 'Cannot reach server to complete initial setup.' };
    }
  };

  const logout = async () => {
    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      const refreshToken = localStorage.getItem('gebeyaos_refresh_token');
      if (token) {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch {
      // ignore network errors
    } finally {
      localStorage.removeItem('gebeyaos_access_token');
      localStorage.removeItem('gebeyaos_refresh_token');
      localStorage.removeItem('gebeyaos_user');
      setCurrentUser(null);
      setIsLocked(false);
      setIsSessionExpired(false);
    }
  };

  const lockSession = () => {
    setIsLocked(true);
  };

  const unlockSession = async (pin: string, userId?: string) => {
    const res = await pinLogin(pin, userId);
    if (res.success) {
      setIsLocked(false);
    }
    return res;
  };

  const switchCashier = () => {
    // Preserve current held basket state and lock session
    setIsLocked(true);
  };

  const updateUserPassword = async (currentPass: string, newPass: string) => {
    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword: currentPass, newPassword: newPass }),
      });
      if (res.ok) {
        if (currentUser) {
          const updated = { ...currentUser, forcePasswordChange: false };
          setCurrentUser(updated);
          localStorage.setItem('gebeyaos_user', JSON.stringify(updated));
        }
        return { success: true };
      }
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err.message || 'Failed to update password' };
    } catch {
      return { success: true };
    }
  };

  const updateUserPin = async (newPin: string) => {
    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      const res = await fetch(`${API_BASE}/auth/change-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPin }),
      });
      if (res.ok) return { success: true };
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err.message || 'Failed to update PIN' };
    } catch {
      return { success: true };
    }
  };

  // Forgot Password: SMS / Email code request
  const forgotPassword = async (code: string, usernameOrPhone: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyCode: code, usernameOrPhone }),
      });
      const data = await res.json();
      if (res.ok) {
        return { success: true, message: data.message };
      }
      return { success: false, error: data.message || 'Failed to send reset code' };
    } catch {
      return { success: true, message: 'If the account exists, a reset code has been sent.' };
    }
  };

  // Reset Password using 6-digit code
  const resetPassword = async (code: string, usernameOrPhone: string, resetCode: string, newPassword: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyCode: code,
          usernameOrPhone,
          code: resetCode,
          newPassword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        return { success: true, message: data.message };
      }
      return { success: false, error: data.message || 'Failed to reset password' };
    } catch {
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  // Fetch with automatic Bearer token + Silent 401 Refresh
  const fetchWithAuth = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    let token = localStorage.getItem('gebeyaos_access_token');
    const headers = new Headers(init.headers || {});
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    let response = await fetch(input, { ...init, headers });

    // Handle token expiration
    if (response.status === 401) {
      const refreshToken = localStorage.getItem('gebeyaos_refresh_token');
      if (refreshToken) {
        try {
          const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });

          if (refreshRes.ok) {
            const data = await refreshRes.json();
            localStorage.setItem('gebeyaos_access_token', data.accessToken);
            localStorage.setItem('gebeyaos_refresh_token', data.refreshToken);
            token = data.accessToken;
            headers.set('Authorization', `Bearer ${token}`);
            response = await fetch(input, { ...init, headers });
            return response;
          }
        } catch {
          // Refresh failed
        }
      }

      setIsSessionExpired(true);
    }

    return response;
  };

  // Profile and Sessions API
  const getUserProfile = async () => {
    const res = await fetchWithAuth(`${API_BASE}/auth/profile`);
    if (res.ok) return res.json();
    throw new Error('Failed to load profile');
  };

  const updateUserProfile = async (dto: any) => {
    const res = await fetchWithAuth(`${API_BASE}/auth/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    if (res.ok) {
      const data = await res.json();
      if (currentUser) {
        const updated = {
          ...currentUser,
          fullName: data.user.fullName || currentUser.fullName,
          phone: data.user.phone || currentUser.phone,
        };
        setCurrentUser(updated);
        localStorage.setItem('gebeyaos_user', JSON.stringify(updated));
      }
      return { success: true };
    }
    const err = await res.json().catch(() => ({}));
    return { success: false, error: err.message || 'Failed to update profile' };
  };

  const getUserSessions = async (): Promise<UserSessionInfo[]> => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/auth/sessions`);
      if (res.ok) {
        const data = await res.json();
        return data.sessions || [];
      }
      return [];
    } catch {
      return [];
    }
  };

  const revokeSession = async (sessionId: string) => {
    const res = await fetchWithAuth(`${API_BASE}/auth/sessions/${sessionId}`, {
      method: 'DELETE',
    });
    if (res.ok) return { success: true };
    const err = await res.json().catch(() => ({}));
    return { success: false, error: err.message || 'Failed to revoke session' };
  };

  const logoutAll = async () => {
    const res = await fetchWithAuth(`${API_BASE}/auth/logout-all`, {
      method: 'POST',
    });
    if (res.ok) {
      await logout();
      return { success: true };
    }
    const err = await res.json().catch(() => ({}));
    return { success: false, error: err.message || 'Failed to sign out of all devices' };
  };

  // Get active cashiers for lock screen
  const getCashiers = async (branchId?: string): Promise<CashierSummary[]> => {
    try {
      const targetBranch = branchId || currentUser?.branchId || terminalConfig?.branchId;
      const url = targetBranch
        ? `${API_BASE}/auth/cashiers?branchId=${encodeURIComponent(targetBranch)}`
        : `${API_BASE}/auth/cashiers`;
      const res = await fetch(url);
      if (res.ok) {
        return res.json();
      }
      return [];
    } catch {
      return [];
    }
  };

  // Pair POS Terminal
  const pairTerminal = async (dto: TerminalPairRequest): Promise<{ success: boolean; terminal?: TerminalPairResponse; error?: string }> => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/auth/terminals/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      });
      if (res.ok) {
        const data: TerminalPairResponse = await res.json();
        const conf: TerminalConfig = {
          terminalId: data.terminalId,
          terminalCode: data.terminalCode,
          terminalName: data.terminalName,
          branchId: data.branchId,
          deviceToken: data.deviceToken,
          autoLockMinutes: data.autoLockMinutes,
        };
        setTerminalConfig(conf);
        localStorage.setItem('gebeyaos_terminal_config', JSON.stringify(conf));
        return { success: true, terminal: data };
      }
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err.message || 'Failed to pair terminal' };
    } catch {
      return { success: false, error: 'Connection failed while pairing terminal' };
    }
  };

  // Manager Override
  const managerOverride = async (dto: ManagerOverrideRequest): Promise<ManagerOverrideResult> => {
    try {
      const res = await fetch(`${API_BASE}/auth/manager-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...dto,
          branchId: currentUser?.branchId || terminalConfig?.branchId,
          cashierId: currentUser?.id,
        }),
      });
      if (res.ok) {
        return res.json();
      }
      const err = await res.json().catch(() => ({}));
      return { authorized: false, error: err.message || 'Invalid manager PIN' };
    } catch {
      return { authorized: false, error: 'Cannot connect to authentication service for manager override.' };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: !!currentUser,
        isLocked,
        setupStatus,
        isLoading,
        companyCode,
        companyInfo,
        assignedBranches,
        isSessionExpired,
        terminalConfig,
        hasPermission,
        hasAnyPermission,
        hasRole,
        setCompanyCode,
        checkCompanyCode,
        selectBranch,
        login,
        reauthenticate,
        setIsSessionExpired,
        pinLogin,
        executeSetup,
        logout,
        lockSession,
        unlockSession,
        switchCashier,
        updateUserPassword,
        updateUserPin,
        forgotPassword,
        resetPassword,
        getUserProfile,
        updateUserProfile,
        getUserSessions,
        revokeSession,
        logoutAll,
        getCashiers,
        pairTerminal,
        managerOverride,
        fetchWithAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
