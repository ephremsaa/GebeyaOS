export type TenantStatus = 'trial' | 'active' | 'suspended';
export type TenantPlan = 'starter' | 'growth' | 'enterprise';

export interface TenantUsageSummary {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  plan: TenantPlan;
  country: string;
  defaultLanguage: string;
  maxBranches: number;
  maxTerminals: number;
  maxUsers: number;
  branchCount: number;
  terminalCount: number;
  userCount: number;
  lastSyncAt: string | null;
  createdAt: string;
}

export type PlatformAdminRole = 'SUPER_ADMIN' | 'SUPPORT' | 'BILLING';

export interface PlatformAdminUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role?: PlatformAdminRole;
  totpEnabled?: boolean;
  tokenVersion?: number;
  lastLoginAt?: string | null;
}

export interface PlatformLoginResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  admin: PlatformAdminUser;
}

export interface PlatformLoginInitResponse {
  requires2fa: boolean;
  isEnrollment?: boolean;
  tempToken: string;
  secret?: string;
  qrCodeUri?: string;
  backupCodes?: string[];
  accessToken?: string;
  expiresIn?: number;
  admin: PlatformAdminUser;
}

export interface Platform2FAVerifyRequest {
  tempToken: string;
  code: string;
  rememberDevice?: boolean;
}

export interface PlatformChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface PlatformReauthRequest {
  password: string;
  totpCode: string;
}

export interface Platform2FASetupResponse {
  secret: string;
  qrCodeUri: string;
  backupCodes: string[];
}

export interface PlatformSessionInfo {
  id: string;
  adminId: string;
  deviceInfo?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  expiresAt: string;
  isCurrent?: boolean;
}

export interface CreateTenantRequest {
  name: string;
  slug?: string;
  plan: TenantPlan;
  ownerName: string;
  ownerEmailOrPhone: string;
  maxBranches?: number;
  maxTerminals?: number;
  maxUsers?: number;
}

export interface CreatedTenantResult {
  tenant: TenantUsageSummary;
  inviteToken: string;
  inviteLink: string;
}

export interface SupportAccessRequest {
  reason: string;
  durationHours: number;
}

export interface SupportAccessSession {
  id: string;
  tenantId: string;
  tenantName: string;
  adminId: string;
  reason: string;
  token: string;
  expiresAt: string;
  createdAt: string;
}

export interface PlatformAuditLogEntry {
  id: string;
  adminId: string;
  adminUsername?: string;
  action: string;
  tenantId?: string | null;
  tenantName?: string | null;
  details: Record<string, any>;
  ipAddress?: string | null;
  createdAt: string;
}

