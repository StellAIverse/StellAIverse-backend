export const PAYMENT_SUBSCRIPTION_UPDATED = "payment.subscription.updated";
export const PAYMENT_CHARGE_SUCCEEDED = "payment.charge.succeeded";
export const PAYMENT_CHARGE_FAILED = "payment.charge.failed";

export interface PaymentSubscriptionEventPayload {
  userId: string;
  subscriptionId: string;
  status: string;
}

export interface PaymentChargeEventPayload {
  userId: string;
  transactionId: string;
  amount: number;
  currency: string;
}
