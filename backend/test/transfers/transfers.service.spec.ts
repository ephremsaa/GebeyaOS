import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransfersService } from '../../src/modules/transfers/transfers.service';
import { DatabaseService } from '../../src/common/database/database.service';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { BadRequestException } from '@nestjs/common';

describe('TransfersService', () => {
  let service: TransfersService;
  let mockDb: Partial<DatabaseService>;
  let mockInventoryService: Partial<InventoryService>;
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
      allocateFefo: vi.fn().mockResolvedValue({
        allocations: [
          {
            batchId: 'batch-src-1',
            batchNumber: 'LOT-100',
            expiryDate: '2027-01-01',
            unitCost: 150.0,
            allocatedQuantity: 20,
          },
        ],
        remainingDeficit: 0,
      }),
      recordMovement: vi.fn().mockResolvedValue({} as any),
    };

    service = new TransfersService(
      mockDb as DatabaseService,
      mockInventoryService as InventoryService,
    );
  });

  describe('requestTransfer', () => {
    it('throws BadRequestException if source and destination branches are identical', async () => {
      await expect(
        service.requestTransfer('user-1', {
          source_branch_id: 'branch-1',
          destination_branch_id: 'branch-1',
          items: [{ product_id: 'prod-1', requested_quantity: 10 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a transfer request in REQUESTED status', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'trf-1',
              transfer_number: 'TRF-12345678',
              source_branch_id: 'branch-1',
              destination_branch_id: 'branch-2',
              status: 'REQUESTED',
            },
          ],
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ cost_price: '150.0' }] })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'trf-item-1', requested_quantity: 20 }],
        });

      const result = await service.requestTransfer('user-1', {
        source_branch_id: 'branch-1',
        destination_branch_id: 'branch-2',
        items: [{ product_id: 'prod-1', requested_quantity: 20 }],
      });

      expect(result.status).toBe('REQUESTED');
      expect(result.transfer_number).toBe('TRF-12345678');
    });
  });

  describe('dispatchTransfer', () => {
    it('deducts inventory from source branch and transitions status to IN_TRANSIT', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'trf-1',
              source_branch_id: 'branch-1',
              destination_branch_id: 'branch-2',
              status: 'APPROVED',
            },
          ],
        }) // Transfer query
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // Update transfer item
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'trf-1', status: 'IN_TRANSIT' }],
        }); // Update transfer

      const dispatched = await service.dispatchTransfer('trf-1', 'user-clerk', {
        items: [
          {
            transfer_item_id: 'trf-item-1',
            product_id: 'prod-1',
            dispatched_quantity: 20,
          },
        ],
      });

      expect(dispatched.status).toBe('IN_TRANSIT');
      expect(mockInventoryService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          branchId: 'branch-1',
          movementType: 'TRANSFER_OUT',
          quantityChange: -20,
        }),
        mockClient,
      );
    });
  });

  describe('receiveTransfer', () => {
    it('handles short-shipment discrepancy and transitions status to DISCREPANCY', async () => {
      // 1. Transfer query (IN_TRANSIT)
      mockClient.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'trf-1',
              transfer_number: 'TRF-12345678',
              source_branch_id: 'branch-1',
              destination_branch_id: 'branch-2',
              status: 'IN_TRANSIT',
            },
          ],
        })
        // 2. Transfer item query (dispatched: 20 units)
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'trf-item-1',
              product_id: 'prod-1',
              batch_number: 'LOT-100',
              expiry_date: '2027-01-01',
              unit_cost: '150.0000',
              dispatched_quantity: '20.000',
            },
          ],
        })
        // 3. Update transfer item
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        // 4. Batch upsert at destination
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'dest-batch-1' }] })
        // 5. Update transfer status
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'trf-1', status: 'DISCREPANCY' }],
        });

      // Receiving only 18 units (2 units damaged in transit)
      const received = await service.receiveTransfer('trf-1', 'user-dest', {
        items: [
          {
            transfer_item_id: 'trf-item-1',
            received_quantity: 18,
            discrepancy_reason: '2 jars broken during transit',
          },
        ],
      });

      expect(received.status).toBe('DISCREPANCY');
      expect(received.has_discrepancy).toBe(true);
      expect(received.discrepancy_units).toBe(2);

      // Verify destination received 18 units into its stock ledger
      expect(mockInventoryService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          branchId: 'branch-2',
          movementType: 'TRANSFER_IN',
          quantityChange: 18,
          unitCost: 150.0,
        }),
        mockClient,
      );
    });
  });
});
