import { describe, it, expect } from 'vitest';
import { PaymentAdapterFactory } from '../../src/modules/pos/domain/payment-adapters/payment-adapters';

describe('PaymentAdapters', () => {
  it('processes Cash payment with zero connectivity', async () => {
    const cashAdapter = PaymentAdapterFactory.getAdapter('CASH');
    const result = await cashAdapter.process({
      paymentMethod: 'CASH',
      amount: 500.0,
    });

    expect(result.success).toBe(true);
    expect(result.paymentMethod).toBe('CASH');
    expect(result.amount).toBe(500.0);
    expect(result.isOfflineVerified).toBe(true);
    expect(result.status).toBe('SETTLED');
  });

  it('processes Telebirr payment with offline SMS verification', async () => {
    const telebirrAdapter = PaymentAdapterFactory.getAdapter('TELEBIRR');
    const result = await telebirrAdapter.process({
      paymentMethod: 'TELEBIRR',
      amount: 350.0,
      providerReference: 'TLB-89765432',
      isOfflineVerified: true,
    });

    expect(result.success).toBe(true);
    expect(result.paymentMethod).toBe('TELEBIRR');
    expect(result.providerReference).toBe('TLB-89765432');
    expect(result.isOfflineVerified).toBe(true);
    expect(result.metadata.verifiedMode).toBe('OFFLINE_SMS_VERIFICATION');
  });

  it('processes Card POS slip authorization', async () => {
    const cardAdapter = PaymentAdapterFactory.getAdapter('CARD_POS');
    const result = await cardAdapter.process({
      paymentMethod: 'CARD_POS',
      amount: 1200.0,
      providerReference: 'SLIP-998877',
    });

    expect(result.success).toBe(true);
    expect(result.paymentMethod).toBe('CARD_POS');
    expect(result.providerReference).toBe('SLIP-998877');
    expect(result.metadata.device).toBe('STANDALONE_BANK_POS_TERMINAL');
  });
});
