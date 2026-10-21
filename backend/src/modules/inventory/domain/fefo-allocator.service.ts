import { Batch, BatchAllocation } from './inventory.types';

export class InsufficientStockException extends Error {
  constructor(
    public readonly productId: string,
    public readonly requestedQty: number,
    public readonly availableQty: number,
  ) {
    super(
      `Insufficient stock for product ${productId}. Requested: ${requestedQty}, Available: ${availableQty}`,
    );
    this.name = 'InsufficientStockException';
  }
}

export class FefoAllocatorService {
  /**
   * Allocates stock across batches following First-Expired, First-Out (FEFO).
   *
   * @param batches List of active batches, MUST be sorted by expiry_date ASC (nulls last), created_at ASC
   * @param requiredQuantity Amount of stock to deduct
   * @param allowNegativeStock Whether the branch allows negative stock selling
   * @param productId The product ID being allocated (for error reporting)
   */
  public allocate(
    batches: Batch[],
    requiredQuantity: number,
    allowNegativeStock: boolean,
    productId: string,
  ): { allocations: BatchAllocation[]; remainingDeficit: number } {
    if (requiredQuantity <= 0) {
      throw new Error('Required quantity must be greater than zero');
    }

    const allocations: BatchAllocation[] = [];
    let remaining = requiredQuantity;
    let totalAvailable = 0;

    for (const batch of batches) {
      const availableInBatch = Math.max(0, Number(batch.current_quantity));
      totalAvailable += availableInBatch;

      if (availableInBatch > 0 && remaining > 0) {
        const take = Math.min(remaining, availableInBatch);
        const allocatedQty = Number(take.toFixed(3));

        allocations.push({
          batchId: batch.id,
          batchNumber: batch.batch_number,
          expiryDate: batch.expiry_date,
          unitCost: Number(batch.unit_cost),
          allocatedQuantity: allocatedQty,
        });

        remaining = Number((remaining - allocatedQty).toFixed(3));
      }
    }

    if (remaining > 0) {
      if (!allowNegativeStock) {
        throw new InsufficientStockException(
          productId,
          requiredQuantity,
          Number(totalAvailable.toFixed(3)),
        );
      }

      // Branch policy permits negative stock: allocate deficit to the most recent batch
      if (batches.length > 0) {
        const lastBatch = batches[batches.length - 1];
        const existingAlloc = allocations.find((a) => a.batchId === lastBatch.id);

        if (existingAlloc) {
          existingAlloc.allocatedQuantity = Number(
            (existingAlloc.allocatedQuantity + remaining).toFixed(3),
          );
        } else {
          allocations.push({
            batchId: lastBatch.id,
            batchNumber: lastBatch.batch_number,
            expiryDate: lastBatch.expiry_date,
            unitCost: Number(lastBatch.unit_cost),
            allocatedQuantity: Number(remaining.toFixed(3)),
          });
        }
      }
    }

    return {
      allocations,
      remainingDeficit: remaining,
    };
  }
}
