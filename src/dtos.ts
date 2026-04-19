/** OAuth2 token response (normalized to camelCase). */
export interface FibAuthorizationResponse {
  accessToken?: string;
  expiresIn?: number;
  refreshExpiresIn?: number;
  refreshToken?: string;
  tokenType?: string;
  notBeforePolicy?: number;
  sessionState?: string;
  scope?: string;
}

export interface FibMonetaryValue {
  amount?: string;
  currency?: string;
}

export interface FibCreatePaymentRequest {
  monetaryValue?: FibMonetaryValue;
  statusCallbackUrl?: string;
  description?: string;
  expiresIn?: string;
  category?: string;
  refundableFor?: string;
}

export interface FibCreatePaymentResponse {
  paymentId?: string;
  readableCode?: string;
  qrCode?: string;
  validUntil?: string;
  personalAppLink?: string;
  businessAppLink?: string;
  corporateAppLink?: string;
}

export interface FibPayer {
  name?: string;
  iban?: string;
}

export interface FibPaymentStatusResponse {
  paymentId?: string;
  status?: string;
  amount?: FibMonetaryValue;
  paidBy?: FibPayer;
  decliningReason?: string;
  declinedAt?: string;
  paidAt?: string;
}
