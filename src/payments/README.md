# Payments Module

Stripe-backed billing: customer management, subscriptions, and webhook-driven
transaction/invoice tracking.

## Architecture

```
src/payments/
├── entities/
│   ├── payment-customer.entity.ts   # user <-> Stripe customer mapping
│   ├── subscription.entity.ts       # persisted subscription state
│   ├── transaction.entity.ts        # charges & invoices
│   └── webhook-event.entity.ts      # processed webhook ids (idempotency)
├── dto/
├── events/
│   └── payment-events.ts            # EventEmitter2 event names/payloads
├── stripe.service.ts                # thin wrapper around the Stripe SDK
├── payments.service.ts              # customer/subscription/billing logic
├── payments-webhook.service.ts      # idempotent webhook event processing
├── payments.controller.ts           # authenticated billing endpoints
├── payments-webhook.controller.ts   # POST /payments/webhook
└── payments.module.ts
```

## API Endpoints

All endpoints below (except the webhook) require a valid JWT and act on the
authenticated user.

- `POST /payments/customer` - create/update the caller's Stripe customer
- `POST /payments/payment-intents` - create a payment intent for a one-off
  charge; returns the `clientSecret` for the frontend to confirm. Accepts an
  optional `idempotencyKey` so retried submissions never double-charge.
- `POST /payments/checkout` - create a Stripe Checkout session (`subscription`
  or `payment` mode) and return its hosted-checkout `url`
- `POST /payments/subscriptions` - start a subscription for a given price
- `GET /payments/subscriptions` - list the caller's subscriptions
- `PATCH /payments/subscriptions/:id` - change a subscription's plan
- `DELETE /payments/subscriptions/:id` - cancel a subscription
- `GET /payments/invoices` - list Stripe invoices for the caller
- `GET /payments/transactions` - billing history persisted from webhooks
- `POST /payments/webhook` - Stripe webhook receiver (signature-verified, no auth)

## Configuration

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Both variables are read in `src/config/env.validation.ts`. `STRIPE_SECRET_KEY`
should be a **test-mode** key in development and a **live-mode** key in
production; `STRIPE_WEBHOOK_SECRET` is the signing secret for the webhook
endpoint you configure below.

## Testing with the Stripe CLI

1. Install the [Stripe CLI](https://stripe.com/docs/stripe-cli) and run
   `stripe login`.
2. Forward events to your local server and copy the printed webhook signing
   secret into `STRIPE_WEBHOOK_SECRET`:

   ```bash
   stripe listen --forward-to localhost:3000/api/v1/payments/webhook
   ```

3. Trigger events to exercise the handlers in `payments-webhook.service.ts`:

   ```bash
   stripe trigger customer.subscription.updated
   stripe trigger invoice.payment_succeeded
   stripe trigger invoice.payment_failed
   stripe trigger charge.succeeded
   stripe trigger charge.failed
   ```

Each event is recorded in `payment_webhook_events` by its Stripe event id
before being acted on, so re-delivered events (Stripe retries on a non-2xx
response) are detected and skipped rather than double-processed.
