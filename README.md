<div align="center">

# xero-sync-medusajs

**Sync Medusa.js orders, customers, and products with Xero — in real time.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)
[![Medusa 2.13.6](https://img.shields.io/badge/Medusa-2.13.6-blueviolet?style=flat-square)](https://medusajs.com)
[![Xero](https://img.shields.io/badge/Xero-API-1AB4D7?style=flat-square)](https://developer.xero.com)

</div>

---

## Features

| Feature | Description |
|---|---|
| 🛒 **Order Sync** | Sync Medusa orders to Xero as Invoices (Accounts Receivable) |
| 👥 **Customer Sync** | Bidirectional customer sync between Medusa and Xero Contacts |
| 📦 **Product Sync** | Push Medusa products to Xero as Items, and pull Xero Items back |
| 🔗 **OAuth 2.0** | Full Xero OAuth 2.0 connect / disconnect flow |
| 🔔 **Webhooks** | Real-time webhook handler — Xero → Medusa for contacts and items |
| ⚡ **Event Subscribers** | Auto-sync on `customer.created`, `customer.updated`, `customer.deleted` |
| 🖥️ **Admin UI** | Built-in Admin dashboard widget and settings page |
| ♻️ **Reset / Re-sync** | Clear sync history and re-run a full sync at any time |

---

## Requirements

- Medusa 2.13.6 or later
- Node.js ≥ 20
- pnpm ≥ 9
- A [Xero Developer](https://developer.xero.com/) account with an OAuth 2.0 app

---

## Local Installation (without publishing to npm)

Medusa supports loading plugins directly from a local path — no package registry needed. See the [Medusa plugin docs](https://docs.medusajs.com/learn/fundamentals/plugins/create) for background.

### Step 1 — Clone the plugin

```bash
git clone https://github.com/mikesoaps/Xero-Sync-Medusajs.git
cd Xero-Sync-Medusajs
```

### Step 2 — Install dependencies and build

```bash
pnpm install
pnpm build
```

> The build output is placed in `.medusa/server`.

### Step 3 — Add the plugin to your Medusa project

From inside your **Medusa project** directory, add the plugin as a local dependency:

```bash
pnpm add ../Xero-Sync-Medusajs
```

This records `"xero-sync-medusajs": "file:../Xero-Sync-Medusajs"` (relative path) in your project's `package.json` — no npm publishing required.

> **Adjust the path** `../Xero-Sync-Medusajs` to wherever you cloned the plugin relative to your Medusa project.

### Step 4 — Re-building after changes

When you make changes to the plugin source, rebuild it:

```bash
# In the plugin directory
pnpm build
```

Then reinstall in your Medusa project so the updated build is picked up:

```bash
# In your Medusa project directory
pnpm install
```

---

## Configuration

### 1. Environment Variables

Add the following to your Medusa project's `.env` file:

```env
# Xero OAuth 2.0 credentials (from your Xero Developer app)
XERO_CLIENT_ID=your_client_id
XERO_CLIENT_SECRET=your_client_secret

# Optional: override the callback URL (auto-built from MEDUSA_BACKEND_URL if not set)
# XERO_REDIRECT_URI=https://your-medusa-backend.com/admin/xero/callback

# Xero webhook signing key (from your Xero Developer app → Webhooks)
XERO_WEBHOOK_KEY=your_webhook_key

# Your Medusa backend public URL
MEDUSA_BACKEND_URL=https://your-medusa-backend.com
```

> **Local development:** Set `MEDUSA_BACKEND_URL=http://localhost:9000`. The plugin will build the redirect URI automatically as `http://localhost:9000/admin/xero/callback`.

### 2. Register the Plugin in `medusa-config.ts`

```ts
// medusa-config.ts
import { defineConfig } from "@medusajs/framework/utils"

export default defineConfig({
  plugins: [
    {
      resolve: "xero-sync-medusajs",
      options: {},
    },
  ],
})
```

### 3. Run Migrations

The plugin creates its own database tables to track sync state. Run migrations after adding the plugin:

```bash
pnpm medusa db:migrate
```

This creates the following tables:
- `xero_connection` — stores the OAuth token and tenant ID
- `xero_contact_link` — maps Medusa customers ↔ Xero Contacts
- `xero_invoice_link` — maps Medusa orders ↔ Xero Invoices
- `xero_item_link` — maps Medusa products ↔ Xero Items

---

## OAuth Setup (Connect to Xero)

### Step 1 — Create a Xero OAuth 2.0 App

1. Go to [Xero Developer Portal](https://developer.xero.com/app/manage)
2. Click **New App**
3. Fill in:
   - **App name**: anything you like
   - **Integration type**: Web App
   - **Company or application URL**: your Medusa backend URL
   - **Redirect URI**: `https://your-medusa-backend.com/admin/xero/callback`

   > For local development: `http://localhost:9000/admin/xero/callback`

4. Once created, copy the **Client ID** and **Client Secret** into your `.env`

### Step 2 — Connect via the Admin Dashboard

Once the plugin is installed and your env vars are set:

1. Open your Medusa Admin → **Settings → Xero**
2. Click **Connect to Xero**
3. Complete the Xero OAuth flow (you'll be redirected to Xero to authorise)
4. After authorising, you'll be redirected back and the connection will be saved
5. Select your **Income Account** (Xero account code) for product mapping
6. Done — the plugin will begin syncing automatically on events

---

## Webhook Setup

Xero webhooks allow Xero to push Contact and Item changes to Medusa in real time.

### Webhook Endpoint

```
POST https://your-medusa-backend.com/xero/webhooks
```

### Registering the Webhook in Xero

1. In the [Xero Developer Portal](https://developer.xero.com/app/manage), open your app
2. Navigate to **Webhooks**
3. Enter the webhook URL above and click **Save**
4. Xero will display a **Webhook key** — copy it into your `.env`:

```env
XERO_WEBHOOK_KEY=your_webhook_key
```

5. Click **Send "intent to receive"** — Xero sends a validation request to your endpoint. The plugin will respond correctly if `XERO_WEBHOOK_KEY` is set.

> The plugin verifies the `x-xero-signature` header on every incoming request using HMAC-SHA256. Requests with invalid signatures are rejected with `401`.

### What Webhooks Handle

| Xero Entity | Operation | Medusa Action |
|---|---|---|
| `Contact` | Create / Update | Upsert customer in Medusa |
| `Item` | Create / Update | Upsert product in Medusa |

---

## Sync Behaviour

### Orders

Medusa orders are synced to Xero as **Invoices** (`ACCREC` — Accounts Receivable). The plugin maps:

- Line items → Xero invoice line items with quantity, unit price, and account code
- Shipping → separate line item
- Discounts → negative line item
- Taxes → per-line tax amounts
- Customer → linked Xero Contact (created if not yet linked)
- Currency → passed through from the Medusa order

> Orders are created in `AUTHORISED` status in Xero so they appear in accounts receivable immediately.

### Customers

Bidirectional sync between Medusa customers and Xero Contacts. You can:

- Push all Medusa customers to Xero (`direction: "medusa_to_xero"`)
- Pull all Xero Contacts into Medusa (`direction: "xero_to_medusa"`, the default)
- Let the event subscribers handle it automatically on customer create / update / delete

When a Medusa customer is deleted, the corresponding Xero Contact is **archived** (Xero does not support hard-deletes of Contacts).

### Products

Medusa products / variants are synced to Xero as **Items**. The plugin uses the variant SKU as the Xero item `Code`. You must select an **Income Account** (by Xero account code, e.g. `200`) in the Xero settings page after connecting — this account is used as the sales account on all synced items.

---

## Admin UI

The plugin ships with two built-in admin extensions (no extra setup needed):

- **Settings page** at `/app/settings/xero` — connect/disconnect Xero, view tenant and token info, select income account
- **Xero dashboard pages** at `/app/xero/` — quick overview and manual sync triggers for customers, orders, and products

---

## API Reference

All `/admin/xero/*` endpoints require an authenticated Medusa admin session (Bearer token or session cookie).

### Connection

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/admin/xero/connect` | Returns the Xero OAuth authorisation URL |
| `GET` | `/admin/xero/callback` | OAuth callback — called by Xero after authorisation |
| `POST` | `/admin/xero/disconnect` | Revoke token and clear the stored connection |
| `GET` | `/admin/xero/status` | Connection status, token expiry, organisation info, and income accounts |

### Organisation

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/admin/xero/organisation` | Fetch the connected Xero organisation details |

### Sync

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/admin/xero/orders/sync` | Sync all or specific orders to Xero |
| `GET` | `/admin/xero/orders/status` | Order sync status and link counts |
| `POST` | `/admin/xero/customers/sync` | Sync customers (bidirectional) |
| `GET` | `/admin/xero/customers/status` | Customer sync status and link counts |
| `POST` | `/admin/xero/products/sync` | Sync all or specific products to Xero |
| `GET` | `/admin/xero/products/status` | Product sync status and link counts |
| `POST` | `/admin/xero/products/:productId/sync` | Sync a single product by Medusa product ID |

### Settings & Utilities

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/admin/xero/settings` | Set the Xero income account code for product mapping |
| `POST` | `/admin/xero/reset` | Clear sync history (`orders`, `customers`, or `all`) |

### Webhooks (Public — no auth required)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/xero/webhooks` | Receive real-time push events from Xero |

---

## Request Bodies

### Customer Sync

```json
// Xero → Medusa (default)
{ "direction": "xero_to_medusa" }

// Medusa → Xero
{ "direction": "medusa_to_xero" }
```

### Order Sync

```json
// Sync all orders
{}

// Sync specific orders
{ "order_ids": ["ord_01...", "ord_02..."] }
```

### Product Sync

```json
// Sync all products
{}

// Sync specific products
{ "product_ids": ["prod_01...", "prod_02..."] }
```

### Settings — Set Income Account

```json
{ "xero_product_income_account_code": "200" }
```

> `200` is the default Xero Sales account. Use `GET /admin/xero/status` to list all available income accounts and their codes.

### Reset Sync History

```json
// Clear order sync links
{ "type": "orders" }

// Clear customer sync links
{ "type": "customers" }

// Clear everything
{ "type": "all" }
```

---

## Event Subscribers

The plugin automatically listens to Medusa customer events and syncs to Xero with no additional setup:

| Event | Action |
|---|---|
| `customer.created` | Create Contact in Xero |
| `customer.updated` | Update Contact in Xero |
| `customer.deleted` | Archive Contact in Xero |

---

## Troubleshooting

### "Xero is not configured" error
Ensure `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET` are set in your `.env` and the Medusa server has been restarted.

### OAuth redirect URI mismatch
The redirect URI registered in your Xero app must exactly match the one the plugin builds. Check `GET /admin/xero/status` — the response includes `redirectUri` showing the value the plugin is using.

### Token expired / refresh fails
Xero access tokens expire after 30 minutes; refresh tokens expire after 60 days of inactivity. If the refresh token has expired, disconnect and reconnect via the admin settings page.

### Webhook intent-to-receive fails
The webhook endpoint must be publicly reachable. For local development, use a tunnelling tool like [ngrok](https://ngrok.com/) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) to expose `localhost:9000`.

### Products have no income account
After connecting to Xero, go to **Settings → Xero** in the Medusa Admin and select an income account. Without this, product sync will use the default account code `200` (Sales). If your Xero organisation does not have account `200`, the sync may fail until an account is selected.

---

## License

MIT
