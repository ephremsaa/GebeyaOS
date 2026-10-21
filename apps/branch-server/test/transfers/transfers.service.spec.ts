import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransfersService } from '../../src/modules/transfers/transfers.service';
import { DatabaseService } from '../../src/common/database/database.service';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('TransfersService', () => {
  let service: TransfersService;
  let mockDb: any;
  let mockInventoryService: any;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
    };

    mockDb = {
      query: vi.fn(),
      withTransaction: vi.fn(async (cb) => cb(mockClient)),
    };

    mockInventoryService = {
      allocateBatchesForSale: vi.fn().mockResolvedValue({
        allocations: [
          {
            batchId: 'batch-src-01',
            batchNumber: 'B-SRC-01',
            expiryDate: '2026-12-01',
            quantity: 20,
          },
        ],
        totalAllocated: 20,
        unallocatedQuantity: 0,
        fullyAllocated: true,
      }),
      recordMovementInTransaction: vi.fn().mockResolvedValue({
        id: 'ledger-trf-01',
        balanceAfter: 80,
      }),
    };

    service = new TransfersService(
      mockDb as unknown as DatabaseService,
      mockInventoryService as unknown as InventoryService,
    );
  });

  describe('createTransfer', () => {
    it('creates transfer requisition with sequential tracking number', async () => {
      // 1. Destination branch exists
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'branch-dest' }],
      });

      // 2. Count query for number
      mockClient.query.mockResolvedValueOnce({
        rows: [{ count: '1' }],
      });

      // 3. Insert transfers
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'trf-01',
            transfer_number: 'TRF-20261021-0002',
            source_branch_id: 'branch-src',
            destination_branch_id: 'branch-dest',
            status: 'REQUESTED',
            notes: 'Stock rebalance',
            requested_by: 'user-01',
            created_at: new Date('2026-10-21T10:00:00Z'),
            updated_at: new Date('2026-10-21T10:00:00Z'),
          },
        ],
      });

      // 4. Product lookup for cost
      mockClient.query.mockResolvedValueOnce({
        rows: [{ cost_price: '50.0000' }],
      });

      // 5. Insert transfer_items
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'ti-01',
            transfer_id: 'trf-01',
            product_id: 'prod-01',
            batch_id: null,
            batch_number: null,
            expiry_date: null,
            unit_cost: '50.0000',
            requested_quantity: '20.000',
            dispatched_quantity: '0.000',
            received_quantity: '0.000',
            discrepancy_quantity: '0.000',
            discrepancy_reason: null,
          },
        ],
      });

      const trf = await service.createTransfer('branch-src', 'user-01', {
        destinationBranchId: 'branch-dest',
        notes: 'Stock rebalance',
        items: [{ productId: 'prod-01', requestedQuantity: 20 }],
      });

      expect(trf.transferNumber).toBe('TRF-20261021-0002');
      expect(trf.status).toBe('REQUESTED');
      expect(trf.items).toHaveLength(1);
      expect(trf.items![0].requestedQuantity).toBe(20);
    });

    it('rejects transfer when source and destination branch are identical', async () => {
      await expect(
        service.createTransfer('branch-01', 'user-01', {
          destinationBranchId: 'branch-01',
          items: [{ productId: 'prod-01', requestedQuantity: 5 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('dispatchTransfer', () => {
    it('dispatches transfer, allocates batch via FEFO, and records TRANSFER_OUT from source', async () => {
      // 1. Select transfer FOR UPDATE
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'trf-01',
            transfer_number: 'TRF-20261021-0001',
            source_branch_id: 'branch-src',
            status: 'APPROVED',
          },
        ],
      });

      // 2. Select transfer_items
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'ti-01',
            product_id: 'prod-01',
            batch_id: null,
            batch_number: null,
            expiry_date: null,
            unit_cost: '50.0000',
            requested_quantity: '20.000',
          },
        ],
      });

      // (allocateBatchesForSale & recordMovementInTransaction are mocked)

      // 3. Update transfer_items
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      // 4. Update transfers status = DISPATCHED
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      // getTransfer query mocks:
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'trf-01',
            transfer_number: 'TRF-20261021-0001',
            source_branch_id: 'branch-src',
            destination_branch_id: 'branch-dest',
            status: 'DISPATCHED',
            requested_by: 'user-01',
            dispatched_by: 'dispatcher-01',
            dispatched_at: new Date('2026-10-21T12:00:00Z'),
            created_at: new Date('2026-10-21T10:00:00Z'),
            updated_at: new Date('2026-10-21T12:00:00Z'),
          },
        ],
      });
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'ti-01',
            transfer_id: 'trf-01',
            product_id: 'prod-01',
            batch_id: 'batch-src-01',
            batch_number: 'B-SRC-01',
            expiry_date: new Date('2026-12-01'),
            unit_cost: '50.0000',
            requested_quantity: '20.000',
            dispatched_quantity: '20.000',
            received_quantity: '0.000',
            discrepancy_quantity: '20.000',
          },
        ],
      });

      const result = await service.dispatchTransfer(
        'trf-01',
        'branch-src',
        'dispatcher-01',
        {},
      );

      expect(result.status).toBe('DISPATCHED');
      expect(result.dispatchedBy).toBe('dispatcher-01');
      expect(mockInventoryService.recordMovementInTransaction).toHaveBeenCalledWith(
        mockClient,
        'branch-src',
        expect.objectContaining({
          productId: 'prod-01',
          movementType: 'TRANSFER_OUT',
          quantityChange: -20,
        }),
      );
    });
  });

  describe('receiveTransfer', () => {
    it('receives transfer with exact quantity, adds TRANSFER_IN to destination, and updates AVCO', async () => {
      // 1. Select transfer FOR UPDATE
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'trf-01',
            transfer_number: 'TRF-20261021-0001',
            destination_branch_id: 'branch-dest',
            status: 'DISPATCHED',
          },
        ],
      });

      // 2. Select transfer items
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'ti-01',
            product_id: 'prod-01',
            batch_number: 'B-SRC-01',
            expiry_date: new Date('2026-12-01'),
            unit_cost: '50.0000',
            dispatched_quantity: '20.000',
          },
        ],
      });

      // 3. Update transfer_items received_quantity
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      // 4. Insert or update batches at destination
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'batch-dest-01' }],
      });

      // (recordMovementInTransaction mocked)

      // 5. Query product cost at destination (e.g. 45 ETB)
      mockClient.query.mockResolvedValueOnce({
        rows: [{ cost_price: '45.0000' }],
      });

      // 6. Query destination on-hand balance (e.g. 30 on hand after receipt -> 10 prior)
      mockClient.query.mockResolvedValueOnce({
        rows: [{ balance_after: '30.000' }],
      });

      // 7. Update products cost_price
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      // 8. Update transfers status = RECEIVED
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      // getTransfer query mocks:
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'trf-01',
            transfer_number: 'TRF-20261021-0001',
            source_branch_id: 'branch-src',
            destination_branch_id: 'branch-dest',
            status: 'RECEIVED',
            requested_by: 'user-01',
            received_by: 'receiver-01',
            received_at: new Date('2026-10-21T15:00:00Z'),
            created_at: new Date('2026-10-21T10:00:00Z'),
            updated_at: new Date('2026-10-21T15:00:00Z'),
          },
        ],
      });
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'ti-01',
            transfer_id: 'trf-01',
            product_id: 'prod-01',
            batch_number: 'B-SRC-01',
            unit_cost: '50.0000',
            requested_quantity: '20.000',
            dispatched_quantity: '20.000',
            received_quantity: '20.000',
            discrepancy_quantity: '0.000',
          },
        ],
      });

      const result = await service.receiveTransfer(
        'trf-01',
        'branch-dest',
        'receiver-01',
        {
          items: [{ transferItemId: 'ti-01', receivedQuantity: 20 }],
        },
      );

      expect(result.status).toBe('RECEIVED');
      expect(mockInventoryService.recordMovementInTransaction).toHaveBeenCalledWith(
        mockClient,
        'branch-dest',
        expect.objectContaining({
          productId: 'prod-01',
          movementType: 'TRANSFER_IN',
          quantityChange: 20,
        }),
      );
    });

    it('flags transfer as DISCREPANCY when received quantity is less than dispatched', async () => {
      // 1. Select transfer
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'trf-02',
            transfer_number: 'TRF-20261021-0002',
            destination_branch_id: 'branch-dest',
            status: 'DISPATCHED',
          },
        ],
      });

      // 2. Select transfer items (dispatched 20)
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'ti-02',
            product_id: 'prod-01',
            batch_number: 'B-SRC-01',
            unit_cost: '50.0000',
            dispatched_quantity: '20.000',
          },
        ],
      });

      // 3. Update transfer_items received_quantity (received 18, 2 damaged in transit)
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      // 4. Batch destination
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'batch-dest-02' }],
      });

      // 5. Product cost
      mockClient.query.mockResolvedValueOnce({
        rows: [{ cost_price: '50.0000' }],
      });

      // 6. Balance after
      mockClient.query.mockResolvedValueOnce({
        rows: [{ balance_after: '18.000' }],
      });

      // 7. Update product cost
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      // 8. Update transfers status = DISCREPANCY
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      // getTransfer query mocks:
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'trf-02',
            transfer_number: 'TRF-20261021-0002',
            source_branch_id: 'branch-src',
            destination_branch_id: 'branch-dest',
            status: 'DISCREPANCY',
            requested_by: 'user-01',
            received_by: 'receiver-01',
            received_at: new Date('2026-10-21T16:00:00Z'),
            created_at: new Date('2026-10-21T10:00:00Z'),
            updated_at: new Date('2026-10-21T16:00:00Z'),
          },
        ],
      });
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'ti-02',
            transfer_id: 'trf-02',
            product_id: 'prod-01',
            dispatched_quantity: '20.000',
            received_quantity: '18.000',
            discrepancy_quantity: '2.000',
            discrepancy_reason: 'DAMAGED_IN_TRANSIT',
          },
        ],
      });

      const result = await service.receiveTransfer(
        'trf-02',
        'branch-dest',
        'receiver-01',
        {
          items: [
            {
              transferItemId: 'ti-02',
              receivedQuantity: 18,
              discrepancyReason: 'DAMAGED_IN_TRANSIT',
            },
          ],
        },
      );

      expect(result.status).toBe('DISCREPANCY');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = $1"),
        expect.arrayContaining(['DISCREPANCY']),
      );
    });
  });

  describe('cancelTransfer', () => {
    it('cancels transfer in REQUESTED status', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'trf-01', status: 'CANCELLED' }],
      });

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'trf-01',
            transfer_number: 'TRF-01',
            source_branch_id: 'branch-src',
            destination_branch_id: 'branch-dest',
            status: 'CANCELLED',
            requested_by: 'user-01',
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const cancelled = await service.cancelTransfer('trf-01');
      expect(cancelled.status).toBe('CANCELLED');
    });

    it('rejects cancelling a transfer that is already dispatched', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(service.cancelTransfer('trf-dispatched')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
