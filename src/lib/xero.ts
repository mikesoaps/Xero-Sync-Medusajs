import { createHmac, timingSafeEqual } from "crypto"
import { XeroClient } from "xero-node"

type SignedStatePayload = {
  actorId: string | null
  returnTo: string
  ts: number
}

type XeroTokenSet = {
  access_token?: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
  id_token?: string
  scope?: string
  [key: string]: unknown
}

export function getBaseUrl(req: {
  protocol?: string
  get?: (name: string) => string | undefined
  headers?: Record<string, string | string[] | undefined>
}) {
  const host =
    req.get?.("host") ||
    (typeof req.headers?.host === "string" ? req.headers.host : undefined)

  return `${req.protocol || "http"}://${host}`
}

export function getXeroConfig(baseUrl?: string) {
  const clientId = process.env.XERO_CLIENT_ID?.trim() || ""
  const clientSecret = process.env.XERO_CLIENT_SECRET?.trim() || ""
  const redirectUri =
    process.env.XERO_REDIRECT_URI?.trim() ||
    (baseUrl ? `${baseUrl}/admin/xero/callback` : "")

  const missingKeys = ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET"].filter(
    (key) => !process.env[key]?.trim()
  )

  return {
    clientId,
    clientSecret,
    redirectUri,
    configured: missingKeys.length === 0 && !!redirectUri,
    missingKeys,
  }
}

export function createXeroClient(config?: ReturnType<typeof getXeroConfig>) {
  const cfg = config || getXeroConfig()
  return new XeroClient({
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    redirectUris: [cfg.redirectUri],
    scopes: [
      "openid",
      "profile",
      "email",
      "accounting.transactions",
      "accounting.contacts",
      "accounting.settings",
      "offline_access",
    ],
  })
}

export async function createAuthorizationUrl(
  xero: XeroClient,
  state: string
): Promise<string> {
  const consentUrl = await xero.buildConsentUrl()
  return `${consentUrl}&state=${encodeURIComponent(state)}`
}

export function getStateSecret() {
  const secret =
    process.env.XERO_STATE_SECRET ||
    process.env.COOKIE_SECRET ||
    process.env.JWT_SECRET ||
    process.env.XERO_CLIENT_SECRET

  if (!secret) {
    throw new Error(
      "Missing XERO_STATE_SECRET, COOKIE_SECRET, JWT_SECRET, or XERO_CLIENT_SECRET."
    )
  }

  return secret
}

export function getWebhookVerifierToken() {
  const token = process.env.XERO_WEBHOOK_KEY?.trim()

  if (!token) {
    throw new Error("Missing XERO_WEBHOOK_KEY.")
  }

  return token
}

export function signState(payload: SignedStatePayload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const signature = createHmac("sha256", getStateSecret())
    .update(encodedPayload)
    .digest("base64url")

  return `${encodedPayload}.${signature}`
}

export function verifyState(state: string): SignedStatePayload {
  const [encodedPayload, providedSignature] = state.split(".")

  if (!encodedPayload || !providedSignature) {
    throw new Error("Invalid Xero state.")
  }

  const expectedSignature = createHmac("sha256", getStateSecret())
    .update(encodedPayload)
    .digest("base64url")

  const expectedBuffer = Buffer.from(expectedSignature)
  const providedBuffer = Buffer.from(providedSignature)

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    throw new Error("Invalid Xero state signature.")
  }

  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8")
  ) as SignedStatePayload

  if (Date.now() - payload.ts > 10 * 60 * 1000) {
    throw new Error("Xero state has expired.")
  }

  return payload
}

export function tokenDates(token: XeroTokenSet) {
  const now = Date.now()

  return {
    expiresAt:
      typeof token.expires_in === "number"
        ? new Date(now + token.expires_in * 1000)
        : null,
    refreshTokenExpiresAt: null,
  }
}

export function toStoredConnection(
  tokenSet: XeroTokenSet,
  tenantId: string | null,
  actorId?: string | null
) {
  const dates = tokenDates(tokenSet)

  return {
    tenant_id: tenantId || null,
    access_token: tokenSet.access_token || null,
    refresh_token: tokenSet.refresh_token || null,
    token_type: tokenSet.token_type || null,
    expires_at: dates.expiresAt,
    refresh_token_expires_at: dates.refreshTokenExpiresAt,
    raw_token: tokenSet as Record<string, unknown>,
    connected_at: new Date(),
    disconnected_at: null,
    updated_by: actorId ?? null,
  }
}

export function isConnectionExpired(connection: {
  expires_at?: Date | string | null
}) {
  if (!connection.expires_at) {
    return false
  }

  return new Date(connection.expires_at).getTime() <= Date.now() + 60 * 1000
}

export async function refreshOauthToken(
  connection: {
    access_token?: string | null
    refresh_token?: string | null
    token_type?: string | null
    raw_token?: Record<string, unknown> | null
  },
  config: ReturnType<typeof getXeroConfig>
) {
  if (!connection.refresh_token) {
    throw new Error("No refresh token available.")
  }

  const xero = createXeroClient(config)
  const newTokenSet = await xero.refreshWithRefreshToken(
    config.clientId,
    config.clientSecret,
    connection.refresh_token
  )

  return newTokenSet as unknown as XeroTokenSet
}

function buildXeroConnection(
  connection: {
    tenant_id?: string | null
    access_token?: string | null
    refresh_token?: string | null
    token_type?: string | null
    expires_at?: Date | string | null
    raw_token?: Record<string, unknown> | null
  },
  config: ReturnType<typeof getXeroConfig>
) {
  const xero = createXeroClient(config)

  const expiresIn = connection.expires_at
    ? Math.max(0, Math.floor((new Date(connection.expires_at).getTime() - Date.now()) / 1000))
    : 1800

  xero.setTokenSet({
    access_token: connection.access_token || "",
    refresh_token: connection.refresh_token || "",
    expires_in: expiresIn,
    token_type: connection.token_type || "Bearer",
    ...(connection.raw_token || {}),
  } as any)

  return xero
}

export async function getOrganisationInfo(
  connection: {
    tenant_id?: string | null
    access_token?: string | null
    refresh_token?: string | null
    token_type?: string | null
    expires_at?: Date | string | null
    raw_token?: Record<string, unknown> | null
  },
  config: ReturnType<typeof getXeroConfig>
) {
  if (!connection.tenant_id) return null

  const xero = buildXeroConnection(connection, config)
  const response = await xero.accountingApi.getOrganisations(connection.tenant_id)
  return (response.body?.organisations?.[0] as unknown as Record<string, unknown>) || null
}

export async function findXeroContacts(
  connection: {
    tenant_id?: string | null
    access_token?: string | null
    refresh_token?: string | null
    token_type?: string | null
    expires_at?: Date | string | null
    raw_token?: Record<string, unknown> | null
  },
  config: ReturnType<typeof getXeroConfig>
): Promise<Record<string, unknown>[]> {
  if (!connection.tenant_id) return []

  const xero = buildXeroConnection(connection, config)
  const response = await xero.accountingApi.getContacts(connection.tenant_id)
  return (response.body?.contacts as unknown as Record<string, unknown>[]) || []
}

export async function getXeroContact(
  connection: {
    tenant_id?: string | null
    access_token?: string | null
    refresh_token?: string | null
    token_type?: string | null
    expires_at?: Date | string | null
    raw_token?: Record<string, unknown> | null
  },
  config: ReturnType<typeof getXeroConfig>,
  contactId: string
): Promise<Record<string, unknown> | null> {
  if (!connection.tenant_id) return null

  const xero = buildXeroConnection(connection, config)
  const response = await xero.accountingApi.getContact(connection.tenant_id, contactId)
  return (response.body?.contacts?.[0] as unknown as Record<string, unknown>) || null
}

export async function createXeroContact(
  connection: {
    tenant_id?: string | null
    access_token?: string | null
    refresh_token?: string | null
    token_type?: string | null
    expires_at?: Date | string | null
    raw_token?: Record<string, unknown> | null
  },
  config: ReturnType<typeof getXeroConfig>,
  payload: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  if (!connection.tenant_id) return null

  const xero = buildXeroConnection(connection, config)
  const response = await xero.accountingApi.createContacts(connection.tenant_id, {
    contacts: [payload as any],
  })
  return (response.body?.contacts?.[0] as unknown as Record<string, unknown>) || null
}

export async function updateXeroContact(
  connection: {
    tenant_id?: string | null
    access_token?: string | null
    refresh_token?: string | null
    token_type?: string | null
    expires_at?: Date | string | null
    raw_token?: Record<string, unknown> | null
  },
  config: ReturnType<typeof getXeroConfig>,
  contactId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  if (!connection.tenant_id) return null

  const xero = buildXeroConnection(connection, config)
  const response = await xero.accountingApi.updateContact(
    connection.tenant_id,
    contactId,
    { contacts: [{ ...payload, contactID: contactId } as any] }
  )
  return (response.body?.contacts?.[0] as unknown as Record<string, unknown>) || null
}

export async function archiveXeroContact(
  connection: {
    tenant_id?: string | null
    access_token?: string | null
    refresh_token?: string | null
    token_type?: string | null
    expires_at?: Date | string | null
    raw_token?: Record<string, unknown> | null
  },
  config: ReturnType<typeof getXeroConfig>,
  contactId: string
): Promise<Record<string, unknown> | null> {
  if (!connection.tenant_id) return null

  const xero = buildXeroConnection(connection, config)
  const response = await xero.accountingApi.updateContact(
    connection.tenant_id,
    contactId,
    { contacts: [{ contactID: contactId, contactStatus: "ARCHIVED" as any }] }
  )
  return (response.body?.contacts?.[0] as unknown as Record<string, unknown>) || null
}

export async function findXeroItems(
  connection: {
    tenant_id?: string | null
    access_token?: string | null
    refresh_token?: string | null
    token_type?: string | null
    expires_at?: Date | string | null
    raw_token?: Record<string, unknown> | null
  },
  config: ReturnType<typeof getXeroConfig>
): Promise<Record<string, unknown>[]> {
  if (!connection.tenant_id) return []

  const xero = buildXeroConnection(connection, config)
  const response = await xero.accountingApi.getItems(connection.tenant_id)
  return (response.body?.items as unknown as Record<string, unknown>[]) || []
}

export async function getXeroItem(
  connection: {
    tenant_id?: string | null
    access_token?: string | null
    refresh_token?: string | null
    token_type?: string | null
    expires_at?: Date | string | null
    raw_token?: Record<string, unknown> | null
  },
  config: ReturnType<typeof getXeroConfig>,
  itemId: string
): Promise<Record<string, unknown> | null> {
  if (!connection.tenant_id) return null

  const xero = buildXeroConnection(connection, config)
  const response = await xero.accountingApi.getItem(connection.tenant_id, itemId)
  return (response.body?.items?.[0] as unknown as Record<string, unknown>) || null
}

export async function createXeroItem(
  connection: {
    tenant_id?: string | null
    access_token?: string | null
    refresh_token?: string | null
    token_type?: string | null
    expires_at?: Date | string | null
    raw_token?: Record<string, unknown> | null
  },
  config: ReturnType<typeof getXeroConfig>,
  payload: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  if (!connection.tenant_id) return null

  const xero = buildXeroConnection(connection, config)
  const response = await xero.accountingApi.createItems(connection.tenant_id, {
    items: [payload as any],
  })
  return (response.body?.items?.[0] as unknown as Record<string, unknown>) || null
}

export async function updateXeroItem(
  connection: {
    tenant_id?: string | null
    access_token?: string | null
    refresh_token?: string | null
    token_type?: string | null
    expires_at?: Date | string | null
    raw_token?: Record<string, unknown> | null
  },
  config: ReturnType<typeof getXeroConfig>,
  itemId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  if (!connection.tenant_id) return null

  const xero = buildXeroConnection(connection, config)
  const response = await xero.accountingApi.updateItem(
    connection.tenant_id,
    itemId,
    { items: [{ ...payload, itemID: itemId } as any] }
  )
  return (response.body?.items?.[0] as unknown as Record<string, unknown>) || null
}

export async function safeUpdateXeroItem(
  connection: {
    tenant_id?: string | null
    access_token?: string | null
    refresh_token?: string | null
    token_type?: string | null
    expires_at?: Date | string | null
    raw_token?: Record<string, unknown> | null
  },
  config: ReturnType<typeof getXeroConfig>,
  itemId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  try {
    return await updateXeroItem(connection, config, itemId, payload)
  } catch {
    const cleanPayload = { ...payload }
    delete cleanPayload.itemID
    return await updateXeroItem(connection, config, itemId, cleanPayload)
  }
}

export async function findXeroAccounts(
  connection: {
    tenant_id?: string | null
    access_token?: string | null
    refresh_token?: string | null
    token_type?: string | null
    expires_at?: Date | string | null
    raw_token?: Record<string, unknown> | null
  },
  config: ReturnType<typeof getXeroConfig>,
  filters?: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  if (!connection.tenant_id) return []

  const xero = buildXeroConnection(connection, config)
  const response = await xero.accountingApi.getAccounts(connection.tenant_id)
  let accounts = (response.body?.accounts as unknown as Record<string, unknown>[]) || []

  if (filters) {
    if (filters.type) {
      accounts = accounts.filter((a) => a.type === filters.type)
    }
    if (filters.status) {
      accounts = accounts.filter((a) => a.status === filters.status)
    }
  }

  return accounts
}

export async function getXeroAccount(
  connection: {
    tenant_id?: string | null
    access_token?: string | null
    refresh_token?: string | null
    token_type?: string | null
    expires_at?: Date | string | null
    raw_token?: Record<string, unknown> | null
  },
  config: ReturnType<typeof getXeroConfig>,
  accountId: string
): Promise<Record<string, unknown> | null> {
  if (!connection.tenant_id) return null

  const xero = buildXeroConnection(connection, config)
  const response = await xero.accountingApi.getAccount(connection.tenant_id, accountId)
  return (response.body?.accounts?.[0] as unknown as Record<string, unknown>) || null
}

export async function createXeroInvoice(
  connection: {
    tenant_id?: string | null
    access_token?: string | null
    refresh_token?: string | null
    token_type?: string | null
    expires_at?: Date | string | null
    raw_token?: Record<string, unknown> | null
  },
  config: ReturnType<typeof getXeroConfig>,
  payload: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  if (!connection.tenant_id) return null

  const xero = buildXeroConnection(connection, config)
  const response = await xero.accountingApi.createInvoices(connection.tenant_id, {
    invoices: [payload as any],
  })
  return (response.body?.invoices?.[0] as unknown as Record<string, unknown>) || null
}

export async function updateXeroInvoice(
  connection: {
    tenant_id?: string | null
    access_token?: string | null
    refresh_token?: string | null
    token_type?: string | null
    expires_at?: Date | string | null
    raw_token?: Record<string, unknown> | null
  },
  config: ReturnType<typeof getXeroConfig>,
  invoiceId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  if (!connection.tenant_id) return null

  const xero = buildXeroConnection(connection, config)
  const response = await xero.accountingApi.updateInvoice(
    connection.tenant_id,
    invoiceId,
    { invoices: [{ ...payload, invoiceID: invoiceId } as any] }
  )
  return (response.body?.invoices?.[0] as unknown as Record<string, unknown>) || null
}

export async function getXeroInvoice(
  connection: {
    tenant_id?: string | null
    access_token?: string | null
    refresh_token?: string | null
    token_type?: string | null
    expires_at?: Date | string | null
    raw_token?: Record<string, unknown> | null
  },
  config: ReturnType<typeof getXeroConfig>,
  invoiceId: string
): Promise<Record<string, unknown> | null> {
  if (!connection.tenant_id) return null

  const xero = buildXeroConnection(connection, config)
  const response = await xero.accountingApi.getInvoice(connection.tenant_id, invoiceId)
  return (response.body?.invoices?.[0] as unknown as Record<string, unknown>) || null
}

export async function findXeroTaxRates(
  connection: {
    tenant_id?: string | null
    access_token?: string | null
    refresh_token?: string | null
    token_type?: string | null
    expires_at?: Date | string | null
    raw_token?: Record<string, unknown> | null
  },
  config: ReturnType<typeof getXeroConfig>
): Promise<Record<string, unknown>[]> {
  if (!connection.tenant_id) return []

  const xero = buildXeroConnection(connection, config)
  const response = await xero.accountingApi.getTaxRates(connection.tenant_id)
  return (response.body?.taxRates as unknown as Record<string, unknown>[]) || []
}
