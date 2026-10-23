export type RoleName = 
  | 'OWNER' 
  | 'HQ_ADMIN' 
  | 'BRANCH_MANAGER' 
  | 'CASHIER' 
  | 'STOREKEEPER' 
  | 'ACCOUNTANT';

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
