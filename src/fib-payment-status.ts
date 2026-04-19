/** Common payment status labels used with the Fib Payment API. */
export const FibPaymentStatus = {
  UNPAID: "UNPAID",
  DECLINE: "DECLINE",
  PAID: "PAID",
} as const;

export type FibPaymentStatus =
  (typeof FibPaymentStatus)[keyof typeof FibPaymentStatus];
