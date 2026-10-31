import { Injectable, Optional } from '@nestjs/common';
import { DatabaseService } from '../../../common/database/database.service';
import { generateUuidV7 } from '../../../common/utils/uuidv7';

export interface HeldCartItem {
  productId: string;
  barcode: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
}

export interface HeldCart {
  id: string;
  terminalId: string;
  cashierId: string;
  customerIdentifier?: string;
  items: HeldCartItem[];
  heldAt: Date;
  resumedAt?: Date | null;
  subtotal?: number;
  taxTotal?: number;
  grandTotal?: number;
}

@Injectable()
export class HeldCartsService {
  private readonly memoryCarts: Map<string, HeldCart> = new Map();

  constructor(@Optional() private readonly db?: DatabaseService) {}

  async holdCart(
    terminalId: string,
    cashierId: string,
    items: HeldCartItem[],
    customerIdentifier?: string,
    branchId?: string,
    subtotal: number = 0,
    taxTotal: number = 0,
    grandTotal: number = 0,
  ): Promise<HeldCart> {
    const id = generateUuidV7();
    const heldAt = new Date();

    if (this.db && branchId) {
      try {
        const res = await this.db.query(
          `INSERT INTO held_baskets (
            id, branch_id, terminal_id, cashier_id, customer_identifier,
            cart_items, subtotal, tax_total, grand_total, held_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *`,
          [
            id,
            branchId,
            terminalId,
            cashierId,
            customerIdentifier || null,
            JSON.stringify(items),
            subtotal,
            taxTotal,
            grandTotal,
            heldAt,
          ],
        );
        const r = res.rows[0];
        return {
          id: r.id,
          terminalId: r.terminal_id,
          cashierId: r.cashier_id,
          customerIdentifier: r.customer_identifier,
          items: typeof r.cart_items === 'string' ? JSON.parse(r.cart_items) : r.cart_items,
          heldAt: r.held_at,
          subtotal: parseFloat(r.subtotal),
          taxTotal: parseFloat(r.tax_total),
          grandTotal: parseFloat(r.grand_total),
        };
      } catch (err) {
        // Fall back to in-memory if DB table not available
      }
    }

    const cart: HeldCart = {
      id,
      terminalId,
      cashierId,
      customerIdentifier,
      items,
      heldAt,
      subtotal,
      taxTotal,
      grandTotal,
    };
    this.memoryCarts.set(id, cart);
    return cart;
  }

  async getHeldCarts(terminalId: string): Promise<HeldCart[]> {
    if (this.db) {
      try {
        const res = await this.db.query(
          `SELECT * FROM held_baskets WHERE terminal_id = $1 AND resumed_at IS NULL ORDER BY held_at DESC`,
          [terminalId],
        );
        if (res.rowCount && res.rowCount > 0) {
          return res.rows.map((r: any) => ({
            id: r.id,
            terminalId: r.terminal_id,
            cashierId: r.cashier_id,
            customerIdentifier: r.customer_identifier,
            items: typeof r.cart_items === 'string' ? JSON.parse(r.cart_items) : r.cart_items,
            heldAt: r.held_at,
            subtotal: parseFloat(r.subtotal),
            taxTotal: parseFloat(r.tax_total),
            grandTotal: parseFloat(r.grand_total),
          }));
        }
      } catch (err) {
        // Fall back to in-memory
      }
    }

    return Array.from(this.memoryCarts.values()).filter(
      (c) => c.terminalId === terminalId && !c.resumedAt,
    );
  }

  async resumeCart(cartId: string): Promise<HeldCart | null> {
    if (this.db) {
      try {
        const res = await this.db.query(
          `UPDATE held_baskets SET resumed_at = clock_timestamp() WHERE id = $1 AND resumed_at IS NULL RETURNING *`,
          [cartId],
        );
        if (res.rowCount && res.rowCount > 0) {
          const r = res.rows[0];
          return {
            id: r.id,
            terminalId: r.terminal_id,
            cashierId: r.cashier_id,
            customerIdentifier: r.customer_identifier,
            items: typeof r.cart_items === 'string' ? JSON.parse(r.cart_items) : r.cart_items,
            heldAt: r.held_at,
            resumedAt: r.resumed_at,
            subtotal: parseFloat(r.subtotal),
            taxTotal: parseFloat(r.tax_total),
            grandTotal: parseFloat(r.grand_total),
          };
        }
      } catch (err) {
        // Fall back
      }
    }

    const cart = this.memoryCarts.get(cartId);
    if (cart) {
      cart.resumedAt = new Date();
      this.memoryCarts.delete(cartId);
      return cart;
    }
    return null;
  }
}
