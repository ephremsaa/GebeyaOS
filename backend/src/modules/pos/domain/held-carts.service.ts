import { Injectable } from '@nestjs/common';
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
}

@Injectable()
export class HeldCartsService {
  private readonly carts: Map<string, HeldCart> = new Map();

  holdCart(
    terminalId: string,
    cashierId: string,
    items: HeldCartItem[],
    customerIdentifier?: string,
  ): HeldCart {
    const id = generateUuidV7();
    const cart: HeldCart = {
      id,
      terminalId,
      cashierId,
      customerIdentifier,
      items,
      heldAt: new Date(),
    };
    this.carts.set(id, cart);
    return cart;
  }

  getHeldCarts(terminalId: string): HeldCart[] {
    return Array.from(this.carts.values()).filter(
      (c) => c.terminalId === terminalId,
    );
  }

  resumeCart(cartId: string): HeldCart | null {
    const cart = this.carts.get(cartId);
    if (cart) {
      this.carts.delete(cartId);
      return cart;
    }
    return null;
  }
}
