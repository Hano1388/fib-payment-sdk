import type {
  FibAuthorizationResponse,
  FibCreatePaymentRequest,
  FibCreatePaymentResponse,
  FibPaymentStatusResponse,
} from "./dtos.js";
import { FibPaymentHttpError } from "./errors.js";

export type FibPaymentFetch = typeof fetch;

export interface FibPaymentServiceOptions {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  /** Override for tests, proxies, or custom TLS (via undici Agent). Defaults to global `fetch`. */
  fetch?: FibPaymentFetch;
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function parseAuthJson(raw: string): FibAuthorizationResponse {
  const o = JSON.parse(raw) as Record<string, unknown>;
  return {
    accessToken:
      typeof o.access_token === "string" ? o.access_token : undefined,
    expiresIn:
      typeof o.expires_in === "number"
        ? o.expires_in
        : Number(o.expires_in) || 0,
    refreshExpiresIn:
      typeof o.refresh_expires_in === "number"
        ? o.refresh_expires_in
        : Number(o.refresh_expires_in) || 0,
    refreshToken:
      typeof o.refresh_token === "string" ? o.refresh_token : undefined,
    tokenType: typeof o.token_type === "string" ? o.token_type : undefined,
    notBeforePolicy:
      typeof o["not-before-policy"] === "number"
        ? o["not-before-policy"]
        : Number(o["not-before-policy"]) || 0,
    sessionState:
      typeof o.session_state === "string" ? o.session_state : undefined,
    scope: typeof o.scope === "string" ? o.scope : undefined,
  };
}

function assertOk(response: Response, bodyText: string): void {
  if (response.ok) return;
  throw new FibPaymentHttpError(
    `Fib Payment API error: ${response.status} ${response.statusText}`,
    response.status,
    bodyText
  );
}

/**
 * Fib Payment API client: OAuth2 client credentials, token caching,
 * single 401 retry, and payment lifecycle helpers.
 */
export class FibPaymentService {
  private readonly fetchImpl: FibPaymentFetch;
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  private cachedToken?: string;
  private tokenExpiresAtMs = 0;

  constructor(options: FibPaymentServiceOptions) {
    this.baseUrl = trimTrailingSlash(options.baseUrl);
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async getAccessToken(): Promise<FibAuthorizationResponse | null> {
    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiresAtMs) {
      return { accessToken: this.cachedToken };
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const tokenUrl = `${this.baseUrl}/auth/realms/fib-online-shop/protocol/openid-connect/token`;
    const response = await this.fetchImpl(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const text = await response.text();
    assertOk(response, text);

    const tokenResponse = parseAuthJson(text);
    this.cachedToken = tokenResponse.accessToken;
    if (tokenResponse.expiresIn && tokenResponse.expiresIn > 0) {
      this.tokenExpiresAtMs =
        Date.now() + (tokenResponse.expiresIn - 5) * 1000;
    }

    return tokenResponse;
  }

  private async makeAuthorizedRequest(
    method: string,
    pathOrUrl: string,
    data?: unknown
  ): Promise<string> {
    const url = pathOrUrl.startsWith("http")
      ? pathOrUrl
      : `${this.baseUrl}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;

    for (let attempt = 1; attempt <= 2; attempt++) {
      const access = await this.getAccessToken();
      if (!access?.accessToken) {
        throw new Error("Unable to acquire access token");
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${access.accessToken}`,
      };

      let body: string | undefined;
      if (data !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(data);
      }

      const response = await this.fetchImpl(url, {
        method,
        headers,
        body,
      });

      if (response.status === 401 && attempt === 1) {
        this.cachedToken = undefined;
        continue;
      }

      const text = await response.text();
      assertOk(response, text);
      return text;
    }

    throw new Error("Unable to acquire a valid access token after retrying.");
  }

  async createPayment(
    request: FibCreatePaymentRequest
  ): Promise<FibCreatePaymentResponse | null> {
    const raw = await this.makeAuthorizedRequest(
      "POST",
      "/protected/v1/payments",
      request
    );
    return JSON.parse(raw) as FibCreatePaymentResponse;
  }

  async checkPaymentStatus(
    paymentId: string
  ): Promise<FibPaymentStatusResponse | null> {
    const raw = await this.makeAuthorizedRequest(
      "GET",
      `/protected/v1/payments/${encodeURIComponent(paymentId)}/status`
    );
    return JSON.parse(raw) as FibPaymentStatusResponse;
  }

  async cancelPayment(paymentId: string | undefined | null): Promise<void> {
    if (!paymentId) return;
    await this.makeAuthorizedRequest(
      "POST",
      `/protected/v1/payments/${encodeURIComponent(paymentId)}/cancel`
    );
  }

  async refundPayment(paymentId: string | undefined | null): Promise<void> {
    if (!paymentId) return;
    await this.makeAuthorizedRequest(
      "POST",
      `/protected/v1/payments/${encodeURIComponent(paymentId)}/refund`
    );
  }

  /**
   * Polls until status is PAID or DECLINED, or until timeout.
   * `intervalInSeconds` and `timeoutInSeconds` are wall-clock seconds.
   */
  async pollPaymentStatus(
    paymentId: string,
    intervalInSeconds: number,
    timeoutInSeconds: number,
    onStatusUpdate: (status: FibPaymentStatusResponse) => void | Promise<void>
  ): Promise<void> {
    const deadline = Date.now() + timeoutInSeconds * 1000;

    while (Date.now() < deadline) {
      const status = await this.checkPaymentStatus(paymentId);

      if (status?.status === "PAID" || status?.status === "DECLINED") {
        await onStatusUpdate(status);
        return;
      }

      await new Promise((r) =>
        setTimeout(r, Math.max(0, intervalInSeconds) * 1000)
      );
    }
  }
}
