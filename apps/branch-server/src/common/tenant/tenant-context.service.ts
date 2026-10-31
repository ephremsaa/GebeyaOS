import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  tenantId: string;
  branchId?: string;
  userId?: string;
  username?: string;
  role?: string;
  isPlatformAdmin?: boolean;
}

const defaultAsyncLocalStorage = new AsyncLocalStorage<TenantContext>();

@Injectable()
export class TenantContextService {
  private readonly asyncLocalStorage: AsyncLocalStorage<TenantContext> = defaultAsyncLocalStorage;

  /**
   * Runs a function inside the provided tenant context.
   */
  runWithContext<T>(context: TenantContext, fn: () => Promise<T> | T): Promise<T> | T {
    return this.asyncLocalStorage.run(context, fn);
  }

  /**
   * Gets the active tenant ID from the current async execution context.
   */
  getTenantId(): string | undefined {
    return this.asyncLocalStorage.getStore()?.tenantId;
  }

  /**
   * Gets the active branch ID from the current async execution context.
   */
  getBranchId(): string | undefined {
    return this.asyncLocalStorage.getStore()?.branchId;
  }

  /**
   * Gets the full active tenant context.
   */
  getContext(): TenantContext | undefined {
    return this.asyncLocalStorage.getStore();
  }

  /**
   * Sets or updates the active tenant context in place if a store exists.
   */
  setContext(context: Partial<TenantContext>): void {
    const store = this.asyncLocalStorage.getStore();
    if (store) {
      Object.assign(store, context);
    }
  }

  /**
   * Sets the tenant ID in the active context.
   */
  setTenantId(tenantId: string): void {
    const store = this.asyncLocalStorage.getStore();
    if (store) {
      store.tenantId = tenantId;
    }
  }
}

