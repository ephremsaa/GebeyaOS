import {
  SyncAggregateType,
  ConflictResolutionPolicy,
  ConflictRecord,
  SyncEvent,
} from './sync.types';

export interface EvaluationResult {
  accepted: boolean;
  policy: ConflictResolutionPolicy;
  reason: string;
}

/**
 * Evaluates incoming sync events against the GebeyaOS Authority Matrix.
 * 
 * Matrix Summary:
 * - HQ Authoritative: Global Products, Categories, Units of Measure, Suppliers.
 * - Branch Authoritative: Sales, Shifts, Cash Movements, Local Stock Ledger, Branch Price Overrides.
 * - Dual/Handshake: Transfers and Goods Received Notes.
 */
export class ConflictResolver {
  /**
   * Resolves whether an event pushed from a branch should be accepted by HQ.
   */
  public static evaluateBranchEvent(
    event: SyncEvent,
    expectedTenantId?: string,
  ): EvaluationResult {
    const { aggregateType, sourceBranchId, payload, tenantId } = event;

    // Defense-in-depth: Reject any cross-tenant event attempt
    if (expectedTenantId) {
      if (tenantId && tenantId !== expectedTenantId) {
        return {
          accepted: false,
          policy: 'APPLIED_HQ',
          reason: `Cross-tenant event rejected: event tenantId (${tenantId}) does not match authenticated branch tenant (${expectedTenantId}).`,
        };
      }
      if (payload?.tenant_id && payload.tenant_id !== expectedTenantId) {
        return {
          accepted: false,
          policy: 'APPLIED_HQ',
          reason: `Cross-tenant event rejected: event payload tenant_id (${payload.tenant_id}) does not match authenticated branch tenant (${expectedTenantId}).`,
        };
      }
    }

    switch (aggregateType) {
      // 1. Branch Authoritative: Sales & POS Transactions
      case 'SALE':
      case 'SHIFT':
        return {
          accepted: true,
          policy: 'APPLIED_BRANCH',
          reason: 'Branch is solely authoritative for POS sales transactions and cashier shift sessions.',
        };

      // 2. Branch Authoritative: Local Stock Movements
      case 'STOCK_LEDGER':
        return {
          accepted: true,
          policy: 'APPLIED_BRANCH',
          reason: 'Branch owns local inventory stock movements and physical stock takes.',
        };

      // 3. Branch Authoritative: Local Price Overrides
      case 'PRICE_OVERRIDE':
        if (payload.branchId && payload.branchId !== sourceBranchId) {
          return {
            accepted: false,
            policy: 'APPLIED_HQ',
            reason: 'Branch cannot push price overrides for another branch.',
          };
        }
        return {
          accepted: true,
          policy: 'APPLIED_BRANCH',
          reason: 'Branch is authoritative for its own branch-level shelf price overrides.',
        };

      // 4. Dual Handshake: GRN & Receiving
      case 'GRN':
        return {
          accepted: true,
          policy: 'APPLIED_BRANCH',
          reason: 'Branch is authoritative for physical goods receipt and landed cost allocation.',
        };

      // 5. Dual Handshake: Transfers
      case 'TRANSFER':
        return {
          accepted: true,
          policy: 'APPLIED_BRANCH',
          reason: 'Inter-branch transfer events follow the state machine handshake.',
        };

      // 6. HQ Authoritative: Master Catalog, Roles & Suppliers
      case 'PRODUCT':
      case 'CATEGORY':
      case 'SUPPLIER':
      case 'ROLE':
        return {
          accepted: false,
          policy: 'APPLIED_HQ',
          reason: `HQ is solely authoritative for master ${aggregateType.toLowerCase()} catalog. Branch modifications are superseded by HQ.`,
        };

      // 7. Security & Audit Trail (Branch Authoritative, Accepted by HQ)
      case 'AUDIT_LOG':
        return {
          accepted: true,
          policy: 'APPLIED_BRANCH',
          reason: 'Branch is authoritative for its local security, authentication, and audit event logs.',
        };

      // 8. User Management (Branch -> HQ for local administrative deactivations & status changes)
      case 'USER':
        return {
          accepted: true,
          policy: 'APPLIED_BRANCH',
          reason: 'Branch local user administrative actions sync to HQ.',
        };

      default:
        return {
          accepted: false,
          policy: 'MANUAL_REQUIRED',
          reason: `Unrecognized aggregate type: ${aggregateType}`,
        };
    }
  }

  /**
   * Generates a conflict record when an event is rejected or superseded.
   */
  public static createConflictRecord(
    event: SyncEvent,
    evalResult: EvaluationResult,
  ): ConflictRecord {
    return {
      eventId: event.id,
      idempotencyKey: event.idempotencyKey,
      aggregateType: event.aggregateType,
      policy: evalResult.policy,
      reason: evalResult.reason,
    };
  }
}
