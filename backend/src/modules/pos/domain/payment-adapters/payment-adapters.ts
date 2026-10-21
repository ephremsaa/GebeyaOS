import {
  IPaymentAdapter,
  PaymentMethodType,
  PaymentProcessInput,
  PaymentProcessResult,
} from './payment-adapter.interface';

export class CashPaymentAdapter implements IPaymentAdapter {
  readonly supportedMethod: PaymentMethodType = 'CASH';

  async process(input: PaymentProcessInput): Promise<PaymentProcessResult> {
    if (input.amount <= 0) {
      return {
        success: false,
        paymentMethod: 'CASH',
        amount: input.amount,
        providerReference: 'N/A',
        isOfflineVerified: true,
        status: 'FAILED',
        metadata: {},
        errorMessage: 'Cash payment amount must be greater than zero',
      };
    }

    return {
      success: true,
      paymentMethod: 'CASH',
      amount: input.amount,
      providerReference: `CASH-${Date.now()}`,
      isOfflineVerified: true,
      status: 'SETTLED',
      metadata: input.metadata || {},
    };
  }
}

export class TelebirrPaymentAdapter implements IPaymentAdapter {
  readonly supportedMethod: PaymentMethodType = 'TELEBIRR';

  async process(input: PaymentProcessInput): Promise<PaymentProcessResult> {
    // In Ethiopian supermarkets, if internet is down, cashier inputs customer's SMS transaction ID
    const ref = input.providerReference || `TLB-${Date.now().toString().slice(-8)}`;
    const isOffline = input.isOfflineVerified ?? true;

    return {
      success: true,
      paymentMethod: 'TELEBIRR',
      amount: input.amount,
      providerReference: ref,
      isOfflineVerified: isOffline,
      status: 'SETTLED',
      metadata: {
        provider: 'ETHIO_TELECOM_TELEBIRR',
        verifiedMode: isOffline ? 'OFFLINE_SMS_VERIFICATION' : 'ONLINE_GATEWAY_API',
        ...input.metadata,
      },
    };
  }
}

export class CbeBirrPaymentAdapter implements IPaymentAdapter {
  readonly supportedMethod: PaymentMethodType = 'CBE_BIRR';

  async process(input: PaymentProcessInput): Promise<PaymentProcessResult> {
    const ref = input.providerReference || `CBE-${Date.now().toString().slice(-8)}`;
    const isOffline = input.isOfflineVerified ?? true;

    return {
      success: true,
      paymentMethod: 'CBE_BIRR',
      amount: input.amount,
      providerReference: ref,
      isOfflineVerified: isOffline,
      status: 'SETTLED',
      metadata: {
        provider: 'COMMERCIAL_BANK_OF_ETHIOPIA_CBE_BIRR',
        verifiedMode: isOffline ? 'OFFLINE_SMS_VERIFICATION' : 'ONLINE_GATEWAY_API',
        ...input.metadata,
      },
    };
  }
}

export class CardPosPaymentAdapter implements IPaymentAdapter {
  readonly supportedMethod: PaymentMethodType = 'CARD_POS';

  async process(input: PaymentProcessInput): Promise<PaymentProcessResult> {
    const ref = input.providerReference || `SLIP-${Date.now().toString().slice(-6)}`;

    return {
      success: true,
      paymentMethod: 'CARD_POS',
      amount: input.amount,
      providerReference: ref,
      isOfflineVerified: true,
      status: 'SETTLED',
      metadata: {
        device: 'STANDALONE_BANK_POS_TERMINAL',
        authApprovalCode: ref,
        ...input.metadata,
      },
    };
  }
}

export class BankTransferPaymentAdapter implements IPaymentAdapter {
  readonly supportedMethod: PaymentMethodType = 'BANK_TRANSFER';

  async process(input: PaymentProcessInput): Promise<PaymentProcessResult> {
    const ref = input.providerReference || `TRF-${Date.now().toString().slice(-8)}`;

    return {
      success: true,
      paymentMethod: 'BANK_TRANSFER',
      amount: input.amount,
      providerReference: ref,
      isOfflineVerified: input.isOfflineVerified ?? true,
      status: 'SETTLED',
      metadata: input.metadata || {},
    };
  }
}

export class PaymentAdapterFactory {
  private static adapters: Map<PaymentMethodType, IPaymentAdapter> = new Map([
    ['CASH', new CashPaymentAdapter()],
    ['TELEBIRR', new TelebirrPaymentAdapter()],
    ['CBE_BIRR', new CbeBirrPaymentAdapter()],
    ['CARD_POS', new CardPosPaymentAdapter()],
    ['BANK_TRANSFER', new BankTransferPaymentAdapter()],
  ]);

  public static getAdapter(method: PaymentMethodType): IPaymentAdapter {
    const adapter = this.adapters.get(method);
    if (!adapter) {
      throw new Error(`Unsupported payment method: ${method}`);
    }
    return adapter;
  }
}
