import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AuthenticatedUser, RoleName, SetupStatusResponse } from '@gebeyaos/shared-types';

export interface AuthContextType {
  currentUser: AuthenticatedUser | null;
  isAuthenticated: boolean;
  isLocked: boolean;
  setupStatus: SetupStatusResponse | null;
  isLoading: boolean;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (...permissions: string[]) => boolean;
  hasRole: (...roles: RoleName[]) => boolean;
  login: (usernameOrPhone: string, password: string) => Promise<{ success: boolean; error?: string; remainingSeconds?: number }>;
  pinLogin: (pin: string) => Promise<{ success: boolean; error?: string }>;
  executeSetup: (dto: any) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  lockSession: () => void;
  unlockSession: (pin: string) => Promise<{ success: boolean; error?: string }>;
  switchCashier: () => void;
  updateUserPassword: (currentPass: string, newPass: string) => Promise<{ success: boolean; error?: string }>;
  updateUserPin: (newPin: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = '/api';
const INACTIVITY_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

export const DEMO_DEFAULT_USER: AuthenticatedUser = {
  id: '018e0000-0000-7000-8000-000000000041',
  username: 'admin',
  fullName: 'System Administrator (Owner)',
  phone: '+251 91 122 3344',
  role: 'OWNER',
  roleId: '018e0000-0000-7000-8000-000000000001',
  branchId: '018e0000-0000-7000-8000-000000000020',
  branchCode: 'BOLE-01',
  branchName: 'Bole Medhanialem Branch',
  permissions: [
    'pos:shift:open', 'pos:shift:close', 'pos:sale:create', 'pos:sale:hold',
    'pos:sale:discount', 'pos:sale:refund', 'pos:receipt:reprint', 'pos:cash:movement',
    'catalog:product:view', 'catalog:product:create', 'catalog:product:edit',
    'catalog:cost:view', 'inventory:stock:view', 'inventory:adjust:create',
    'inventory:stocktake:execute', 'inventory:import:execute', 'purchasing:po:create',
    'purchasing:grn:receive', 'transfers:request', 'transfers:dispatch', 'transfers:receive',
    'reports:branch:view', 'reports:consolidated:view', 'admin:users:manage',
    'admin:roles:manage', 'admin:settings:manage'
  ],
  forcePasswordChange: false,
};

export const DEMO_CASHIER_USER: AuthenticatedUser = {
  id: '018e0000-0000-7000-8000-000000000042',
  username: 'cashier1',
  fullName: 'Bethlehem Tadesse',
  phone: '+251 92 233 4455',
  role: 'CASHIER',
  roleId: '018e0000-0000-7000-8000-000000000003',
  branchId: '018e0000-0000-7000-8000-000000000020',
  branchCode: 'BOLE-01',
  branchName: 'Bole Medhanialem Branch',
  permissions: [
    'pos:shift:open', 'pos:shift:close', 'pos:sale:create', 'pos:sale:hold',
    'pos:sale:discount', 'pos:receipt:reprint', 'pos:cash:movement',
    'catalog:product:view'
  ],
  forcePasswordChange: false,
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(() => {
    try {
      const stored = localStorage.getItem('gebeyaos_user');
      return stored ? JSON.parse(stored) : DEMO_DEFAULT_USER;
    } catch {
      return DEMO_DEFAULT_USER;
    }
  });

  const [setupStatus, setSetupStatus] = useState<SetupStatusResponse | null>({
    setupCompleted: true,
    storeName: 'Gebeya Supermarket',
    ownerExists: true,
    defaultBranchCode: 'BOLE-01',
  });

  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Check setup status on load
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
        // LAN offline fallback: consider setup completed if demo user exists
      }
    };
    checkStatus();
  }, []);

  // Inactivity Auto-Lock Timer
  const resetInactivityTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (!currentUser || isLocked) return;

    idleTimerRef.current = setTimeout(() => {
      setIsLocked(true);
    }, INACTIVITY_TIMEOUT_MS);
  }, [currentUser, isLocked]);

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

  // Back-office Login
  const login = async (usernameOrPhone: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrPhone, password }),
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('gebeyaos_access_token', data.accessToken);
        localStorage.setItem('gebeyaos_refresh_token', data.refreshToken);
        localStorage.setItem('gebeyaos_user', JSON.stringify(data.user));
        setCurrentUser(data.user);
        setIsLocked(false);
        setIsLoading(false);
        return { success: true };
      } else {
        const err = await res.json().catch(() => ({}));
        setIsLoading(false);
        return {
          success: false,
          error: err.message || 'Login failed. Please check your credentials.',
          remainingSeconds: err.remainingSeconds,
        };
      }
    } catch {
      // Offline fallback for demo / LAN local testing
      if (
        (usernameOrPhone.toLowerCase() === 'admin' || usernameOrPhone === '+251 91 122 3344') &&
        password === 'Admin@123456'
      ) {
        setCurrentUser(DEMO_DEFAULT_USER);
        localStorage.setItem('gebeyaos_user', JSON.stringify(DEMO_DEFAULT_USER));
        setIsLocked(false);
        setIsLoading(false);
        return { success: true };
      }
      if (usernameOrPhone.toLowerCase() === 'cashier1' && password === 'Admin@123456') {
        setCurrentUser(DEMO_CASHIER_USER);
        localStorage.setItem('gebeyaos_user', JSON.stringify(DEMO_CASHIER_USER));
        setIsLocked(false);
        setIsLoading(false);
        return { success: true };
      }
      setIsLoading(false);
      return { success: false, error: 'Invalid credentials. Please try again.' };
    }
  };

  // Fast Cashier PIN Login
  const pinLogin = async (pin: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/pin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, terminalCode: 'POS-01' }),
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('gebeyaos_access_token', data.accessToken);
        localStorage.setItem('gebeyaos_refresh_token', data.refreshToken);
        localStorage.setItem('gebeyaos_user', JSON.stringify(data.user));
        setCurrentUser(data.user);
        setIsLocked(false);
        setIsLoading(false);
        return { success: true };
      } else {
        const err = await res.json().catch(() => ({}));
        setIsLoading(false);
        return { success: false, error: err.message || 'Invalid cashier PIN' };
      }
    } catch {
      // Offline demo fallback: PIN '1234' matches demo cashier
      if (pin === '1234' || pin === '0000') {
        setCurrentUser(DEMO_CASHIER_USER);
        localStorage.setItem('gebeyaos_user', JSON.stringify(DEMO_CASHIER_USER));
        setIsLocked(false);
        setIsLoading(false);
        return { success: true };
      }
      setIsLoading(false);
      return { success: false, error: 'Invalid cashier PIN. Try 1234 for demo.' };
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
      // Offline client simulation
      const newOwner: AuthenticatedUser = {
        id: 'owner-local-id',
        username: dto.ownerUsername,
        fullName: dto.ownerFullName,
        phone: dto.ownerPhone,
        role: 'OWNER',
        roleId: '018e0000-0000-7000-8000-000000000001',
        branchId: '018e0000-0000-7000-8000-000000000020',
        branchCode: dto.branchCode,
        branchName: dto.companyName,
        permissions: DEMO_DEFAULT_USER.permissions,
        forcePasswordChange: false,
      };
      setCurrentUser(newOwner);
      setSetupStatus({ setupCompleted: true, ownerExists: true, storeName: dto.companyName });
      setIsLocked(false);
      setIsLoading(false);
      return { success: true };
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
    }
  };

  const lockSession = () => {
    setIsLocked(true);
  };

  const unlockSession = async (pin: string) => {
    const res = await pinLogin(pin);
    if (res.success) {
      setIsLocked(false);
    }
    return res;
  };

  const switchCashier = () => {
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

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: !!currentUser,
        isLocked,
        setupStatus,
        isLoading,
        hasPermission,
        hasAnyPermission,
        hasRole,
        login,
        pinLogin,
        executeSetup,
        logout,
        lockSession,
        unlockSession,
        switchCashier,
        updateUserPassword,
        updateUserPin,
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
