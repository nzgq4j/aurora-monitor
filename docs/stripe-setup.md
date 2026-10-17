# Stripe setup

Card payments for the Chaser plan go through Stripe Checkout and the Stripe billing portal.
The code is deployed but **stays off until the keys below are set**. Until then the site keeps the
current no-card trial.

Work through this in **test mode** first (toggle at the top of the Stripe dashboard), then repeat
steps 1–4 in live mode with live keys.

## 1. Product and prices

In Product catalogue, create a product named **Polar Lights Chaser** with two recurring prices in USD.
Set each price's **lookup key** (under "Advanced" when creating the price) exactly as shown. The app
finds prices by lookup key, so no price IDs go into the code.

| Price | Amount | Interval | Lookup key |
| --- | --- | --- | --- |
| Monthly | $5.00 | Monthly | `chaser_monthly` |
| Annual | $50.00 | Yearly | `chaser_annual` |

Leave the trial empty on the prices; the app adds the 14-day trial for first-time members only.

## 2. Stripe Tax

In Settings → Tax:
1. Add the business's head office address.
2. Choose a preset tax code for the product: "Software as a service (SaaS) – personal use", or the closest match.
3. Set prices to **exclusive of tax**, so tax is added on top of $5 / $50.
4. Add a registration for each country or US state where you're registered to collect tax. Stripe Tax's monitoring shows when you reach a threshold elsewhere.

Checkout fails if Stripe Tax isn't set up, because the app requests automatic tax.

## 3. Billing portal

In Settings → Billing → Customer portal, turn on:
- Customers can update payment methods.
- Customers can view invoice history.
- Customers can switch plans: add both Chaser prices so members can move between monthly and annual.
- Customers can cancel subscriptions: choose "At end of billing period".

Save.

## 4. Webhook

In Developers → Webhooks, add an endpoint:
- **URL:** `https://www.polarlights.io/api/stripe/webhook`
- **Events:**
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `customer.subscription.paused`
  - `customer.subscription.resumed`
  - `customer.subscription.trial_will_end`

Copy the endpoint's **signing secret** (`whsec_…`).

## 5. Vercel environment variables

Add these in Vercel → aurora-monitor → Settings → Environment Variables, for Production (and Preview
if you want to test there). Paste them yourself; don't send keys in chat or commit them.

| Name | Value | Sensitive |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | `sk_test_…` (later `sk_live_…`), or a restricted key with write access to Customers, Checkout Sessions, Billing portal and Subscriptions, and read access to Prices | Yes |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from step 4 | Yes |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_…` (later `pk_live_…`) | No |

The publishable key is the switch that turns card payments on in the interface. Redeploy after adding them.

## 6. Test (test mode)

1. Sign in with an account that has never had a trial, then choose Chaser.
2. Pay with card `4242 4242 4242 4242`, any future expiry date, any CVC and a real postcode.
3. You should return to the Dashboard, with Chaser showing "trial ends …" within a few seconds.
4. Under Dashboard → Account → Manage billing, switch to annual, then cancel. The Dashboard should show "ends …".
5. In Stripe's webhook page, every delivery should show 200.

## 7. After going live

- Ask Claude to remove the old no-card trial (`start_trial`), so a trial can only start through Stripe.
- Complimentary accounts (`trial_ends_at` in 2099, no Stripe customer) keep Chaser and are never billed.
