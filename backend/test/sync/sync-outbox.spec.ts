import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncOutboxService } from '../../src/modules/sync/sync-outbox.service';
import { DatabaseService } from '../../src/common/database/database.service';

describe('SyncOutboxService', () => {
  let service: SyncOutboxService;
  let mockDb: Partial<DatabaseService>;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
    };
    mockDb = {
      query: vi.fn(),
      withTransaction: vi.fn(async (cb) => cb(mockClient)),
    };

    service = new SyncOutboxService(mockDb as DatabaseService);
  });

  describe('queueEvent', () => {
    it('inserts event into sync_outbox with PENDING status within caller transaction', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });

      const eventId = await service.queueEvent(
        mockClient,
        'branch-1',
        'SALE',
        'sale-123',
        'INSERT',
        { receipt_number: 'REC-001', grand_total: 500.0 },
      );

      expect(eventId).toBeDefined();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sync_outbox'),
        expect.arrayContaining(['branch-1', 'SALE', 'sale-123', 'INSERT']),
      );
    });
  });

  describe('fetchPendingBatch', () => {
    it('fetches ordered slice after cursor sequence', async () => {
      (mockDb.query as any).mockResolvedValueOnce({
        rowCount: 2,
        rows: [
          { id: 'ev-1', sequence_no: 101, entity_type: 'SALE', status: 'PENDING' },
          { id: 'ev-2', sequence_no: 102, entity_type: 'SALE', status: 'PENDING' },
        ],
      });

      const batch = await service.fetchPendingBatch('branch-1', 100, 100);

      expect(batch).toHaveLength(2);
      expect(batch[0].sequence_no).toBe(101);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('sequence_no > $2'),
        ['branch-1', 100, 100],
      );
    });
  });

  describe('acknowledgeBatch', () => {
    it('marks events as ACKNOWLEDGED and updates checkpoint high-water mark', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rowCount: 2, rows: [] }) // update sync_outbox
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // upsert sync_checkpoints

      await service.acknowledgeBatch('branch-1', ['ev-1', 'ev-2'], 102);

      expect(mockClient.query).toHaveBeenCalledTimes(2);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sync_outbox'),
        expect.arrayContaining(['branch-1', ['ev-1', 'ev-2']]),
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sync_checkpoints'),
        expect.arrayContaining(['branch-1', 102]),
      );
    });
  });
});
