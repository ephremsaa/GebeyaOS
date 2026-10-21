export type PaymentMethodType =
  | 'CASH'
  | 'TELEBIRR'
  | 'CBE_BIRR'
  | 'CARD_POS'
  | 'BANK_TRANSFER';

export interface PaymentProcessInput {
  paymentMethod: PaymentMethodType;
  amount: number;
  providerReference?: string;
  isOfflineVerified?: boolean;
  metadata?: Record<string, any>;
}

export interface PaymentProcessResult {
  success: boolean;
  paymentMethod: PaymentMethodType;
  amount: number;
  providerReference: string;
  isOfflineVerified: boolean;
  status: 'SETTLED' | 'PENDING' | 'FAILED';
  metadata: Record<string, any>;
  errorMessage?: string;
}

export interface IPaymentAdapter {
  readonly supportedMethod: PaymentMethodType;
  process(input: PaymentProcessInput): Promise<PaymentProcessResult>;
}
