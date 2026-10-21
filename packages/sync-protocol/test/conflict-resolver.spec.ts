import { describe, it, expect } from 'vitest';
import {
  ConflictResolver,
  PacketBuilder,
  SyncEvent,
} from '../src';

describe('Sync Protocol & Conflict Resolver', () => {
  const branchId = '00000000-0000-0000-0000-000000000001';

  describe('PacketBuilder', () => {
    it('creates deterministic idempotency key and monotonic UUIDv7 event', () => {
      const event = PacketBuilder.buildSyncEvent(
        branchId,
        'SALE',
        'sale-001',
        'CREATED',
        { grandTotal: 500 },
      );

      expect(event.id).toBeDefined();
      expect(event.idempotencyKey).toBe(
        `${branchId}:SALE:sale-001:CREATED`.toUpperCase(),
      );
      expect(event.aggregateType).toBe('SALE');
      expect(event.payload.grandTotal).toBe(500);
    });

    it('builds batch push request with generated batch ID', () => {
      const event = PacketBuilder.buildSyncEvent(
        branchId,
        'SHIFT',
        'shift-001',
        'CREATED',
        { openingFloat: 1000 },
      );

      const batch = PacketBuilder.buildPushBatch(branchId, [event], 'cursor-prev');

      expect(batch.sourceBranchId).toBe(branchId);
      expect(batch.batchId).toBeDefined();
      expect(batch.cursor).toBe('cursor-prev');
      expect(batch.events).toHaveLength(1);
    });
  });

  describe('ConflictResolver Authority Matrix', () => {
    it('accepts branch-authoritative SALE events (APPLIED_BRANCH)', () => {
      const event = PacketBuilder.buildSyncEvent(
        branchId,
        'SALE',
        'sale-01',
        'CREATED',
        { total: 100 },
      );

      const evalResult = ConflictResolver.evaluateBranchEvent(event);

      expect(evalResult.accepted).toBe(true);
      expect(evalResult.policy).toBe('APPLIED_BRANCH');
    });

    it('accepts branch-authoritative STOCK_LEDGER events (APPLIED_BRANCH)', () => {
      const event = PacketBuilder.buildSyncEvent(
        branchId,
        'STOCK_LEDGER',
        'ledger-01',
        'CREATED',
        { movementType: 'SALE', quantityChange: -5 },
      );

      const evalResult = ConflictResolver.evaluateBranchEvent(event);

      expect(evalResult.accepted).toBe(true);
      expect(evalResult.policy).toBe('APPLIED_BRANCH');
    });

    it('accepts branch-authoritative own PRICE_OVERRIDE events', () => {
      const event = PacketBuilder.buildSyncEvent(
        branchId,
        'PRICE_OVERRIDE',
        'override-01',
        'CREATED',
        { branchId, sellingPrice: 120 },
      );

      const evalResult = ConflictResolver.evaluateBranchEvent(event);

      expect(evalResult.accepted).toBe(true);
      expect(evalResult.policy).toBe('APPLIED_BRANCH');
    });

    it('rejects PRICE_OVERRIDE targeting a different branch', () => {
      const event = PacketBuilder.buildSyncEvent(
        branchId,
        'PRICE_OVERRIDE',
        'override-02',
        'CREATED',
        { branchId: 'other-branch-id', sellingPrice: 150 },
      );

      const evalResult = ConflictResolver.evaluateBranchEvent(event);

      expect(evalResult.accepted).toBe(false);
      expect(evalResult.policy).toBe('APPLIED_HQ');
    });

    it('rejects branch modifications to master PRODUCT catalog (APPLIED_HQ)', () => {
      const event = PacketBuilder.buildSyncEvent(
        branchId,
        'PRODUCT',
        'prod-01',
        'UPDATED',
        { nameEn: 'Modified Master Name' },
      );

      const evalResult = ConflictResolver.evaluateBranchEvent(event);

      expect(evalResult.accepted).toBe(false);
      expect(evalResult.policy).toBe('APPLIED_HQ');
      expect(evalResult.reason).toContain('HQ is solely authoritative');
    });

    it('rejects branch modifications to master SUPPLIER catalog (APPLIED_HQ)', () => {
      const event = PacketBuilder.buildSyncEvent(
        branchId,
        'SUPPLIER',
        'sup-01',
        'UPDATED',
        { name: 'Supplier Name Changed' },
      );

      const evalResult = ConflictResolver.evaluateBranchEvent(event);

      expect(evalResult.accepted).toBe(false);
      expect(evalResult.policy).toBe('APPLIED_HQ');
    });

    it('accepts dual-authority TRANSFER and GRN events', () => {
      const trfEvent = PacketBuilder.buildSyncEvent(
        branchId,
        'TRANSFER',
        'trf-01',
        'CREATED',
        { status: 'DISPATCHED' },
      );
      expect(ConflictResolver.evaluateBranchEvent(trfEvent).accepted).toBe(true);

      const grnEvent = PacketBuilder.buildSyncEvent(
        branchId,
        'GRN',
        'grn-01',
        'CREATED',
        { totalCost: 5000 },
      );
      expect(ConflictResolver.evaluateBranchEvent(grnEvent).accepted).toBe(true);
    });
  });
});
