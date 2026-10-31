export type RoleName = 
  | 'OWNER' 
  | 'HQ_ADMIN' 
  | 'BRANCH_MANAGER' 
  | 'CASHIER' 
  | 'STOREKEEPER' 
  | 'ACCOUNTANT'
  | (string & {});

export const GRANULAR_PERMISSIONS = {
  VIEW_COST: 'catalog:cost:view',
  DISCOUNT_LIMIT: 'pos:sale:discount',
  REFUND: 'pos:sale:refund',
  ADJUST_STOCK: 'inventory:adjust:create',
  IMPORT: 'inventory:import:execute',
  CLOSE_SHIFT: 'pos:shift:close',
  EDIT_PRICES: 'catalog:price:override',
  VIEW_REPORTS: 'reports:branch:view',
  MANAGE_USERS: 'admin:users:manage',
} as const;

export interface Permission {
  id: string;
  module: string;
  description: string;
}

export interface Role {
  id: string;
  name: RoleName;
  description?: string;
  isSystem: boolean;
  maxDiscountPercentage: number;
  permissions: string[];
}

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  tenantSlug?: string;
  tenantName?: string;
  username: string;
  fullName: string;
  email?: string;
  phone?: string;
  role: RoleName;
  roleId: string;
  branchId: string;
  branchCode?: string;
  branchName?: string;
  permissions: string[];
  forcePasswordChange: boolean;
}

export interface BranchSyncTokenPayload {
  sub: string; // branchId
  branchId: string;
  tenantId: string;
  type: 'BRANCH_SYNC';
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthenticatedUser;
}

export interface SetupStatusResponse {
  setupCompleted: boolean;
  storeName?: string;
  ownerExists: boolean;
  defaultBranchCode?: string;
}

export type PasswordStrengthScore = 0 | 1 | 2 | 3 | 4;

export interface PasswordValidationResult {
  isValid: boolean;
  score: PasswordStrengthScore;
  errors: string[];
}

export interface UserSessionInfo {
  id: string;
  device: string;
  ip: string;
  userAgent?: string;
  createdAt: string;
  expiresAt: string;
  isCurrent?: boolean;
}

export interface ManagerOverrideRequest {
  managerPin: string;
  action: string;
  requiredPermission: string;
  amount?: number;
  notes?: string;
}

export interface ManagerOverrideResult {
  authorized: boolean;
  supervisorId?: string;
  supervisorName?: string;
  supervisorRole?: string;
  error?: string;
}

export interface ForgotPasswordRequest {
  companyCode: string;
  usernameOrPhone: string;
}

export interface ResetPasswordRequest {
  companyCode: string;
  usernameOrPhone: string;
  code: string;
  newPassword: string;
}

export interface TerminalPairRequest {
  terminalCode: string;
  terminalName: string;
  branchId: string;
  deviceToken?: string;
  autoLockMinutes?: number;
}

export interface TerminalPairResponse {
  terminalId: string;
  terminalCode: string;
  terminalName: string;
  branchId: string;
  deviceToken: string;
  autoLockMinutes: number;
}

export interface CashierSummary {
  id: string;
  username: string;
  fullName: string;
  phone?: string;
  role: string;
  branchId?: string;
  isLocked: boolean;
  lockRemainingSeconds?: number;
}
