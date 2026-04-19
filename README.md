# fib-payment-sdk

Node.js **18+** client for the Fib Payment API: OAuth2 client credentials, in-memory token caching (with a short safety margin), automatic token refresh on **401**, and helpers for create / status / cancel / refund / poll.

## Install

```bash
npm install fib-payment-sdk
```

## Usage

```ts
import {
  FibPaymentService,
  type FibCreatePaymentRequest,
} from "fib-payment-sdk";

const payment = new FibPaymentService({
  baseUrl: "https://api.fibpayment.com",
  clientId: process.env.FIB_CLIENT_ID!,
  clientSecret: process.env.FIB_CLIENT_SECRET!,
});

const token = await payment.getAccessToken();
console.log(token?.accessToken);

const request: FibCreatePaymentRequest = {
  monetaryValue: { amount: "1000", currency: "IQD" },
  statusCallbackUrl: "https://example.com/webhooks/fib",
  description: "Order #123",
  expiresIn: "PT5M",
  category: "POS",
  refundableFor: "PT48H",
};

const created = await payment.createPayment(request);
console.log(created?.paymentId, created?.qrCode);

const status = await payment.checkPaymentStatus(created?.paymentId ?? "");
console.log(status?.status);

const canceled = await payment.cancelPayment(created?.paymentId);
// `true` only when the API returns 204 No Content
const refundAccepted = await payment.refundPayment(created?.paymentId);
// `true` only when the API returns 202 Accepted

await payment.pollPaymentStatus(
  created?.paymentId ?? "",
  5,
  60,
  async (s) => {
    console.log("Final:", s.status);
  }
);
```

### Custom `fetch` (proxy, mTLS, tests)

```ts
import { FibPaymentService } from "fib-payment-sdk";
import { Agent } from "undici";

const payment = new FibPaymentService({
  baseUrl: "https://api.fibpayment.com",
  clientId: "...",
  clientSecret: "...",
  fetch: (url, init) =>
    fetch(url, { ...init, dispatcher: new Agent({ connect: { ... } }) }),
});
```

## Cancel and refund

`cancelPayment` and `refundPayment` return **`true`** only when the HTTP status matches FIB’s contract (**204** for cancel, **202** for refund). Other successful status codes return **`false`** (so you can detect unexpected responses). Missing `paymentId` returns **`false`**. Non-success HTTP statuses still throw **`FibPaymentHttpError`**.

## Errors

Failed HTTP responses throw `FibPaymentHttpError` (`status`, optional `body` text).

## License

MIT
