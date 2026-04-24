import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { XERO_MODULE } from "../../../../../modules/xero"
import type XeroModuleService from "../../../../../modules/xero/service"
import { findXeroContacts, getBaseUrl, getXeroConfig, isConnectionExpired, refreshOauthToken, toStoredConnection } from "../../../../../lib/xero"

type QueryGraph = { graph: (input: { entity: string; fields: string[]; filters?: Record<string, unknown> }) => Promise<{ data?: Record<string, unknown>[] }> }

const normalizeMedusaCustomer = (c: Record<string, unknown>) => ({ id: c.id || null, email: c.email || null, first_name: c.first_name || null, last_name: c.last_name || null })
const normalizeXeroContact = (c: Record<string, unknown>) => ({ id: c.contactID || null, name: c.name || null, email: c.emailAddress || null, status: c.contactStatus || null })

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const config = getXeroConfig(getBaseUrl(req))
  const xeroService: XeroModuleService = req.scope.resolve(XERO_MODULE)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as QueryGraph

  const medusaCustomersResponse = await query.graph({ entity: "customer", fields: ["id", "email", "first_name", "last_name", "company_name", "phone", "has_account", "created_at", "updated_at"] })
  const medusaCustomers = medusaCustomersResponse.data ?? []
  const medusaByEmail = new Map<string, Record<string, unknown>>()
  for (const c of medusaCustomers) {
    const email = typeof c.email === "string" ? c.email.trim().toLowerCase() : ""
    if (email) medusaByEmail.set(email, c)
  }

  if (!config.configured) {
    return res.status(200).json({ configured: false, connected: false, missingKeys: config.missingKeys, medusa: { count: medusaCustomers.length, normalized: medusaCustomers.map(normalizeMedusaCustomer) }, xero: { count: 0, normalized: [] } })
  }

  let connection = await xeroService.getConnection()

  if (connection && connection.refresh_token && isConnectionExpired(connection)) {
    try {
      const refreshedToken = await refreshOauthToken(connection, config)
      connection = await xeroService.upsertConnection(toStoredConnection(refreshedToken, connection.tenant_id || null, req.auth_context?.actor_id))
    } catch (e) {
      return res.status(200).json({ configured: true, connected: false, medusa: { count: medusaCustomers.length, normalized: medusaCustomers.map(normalizeMedusaCustomer) }, xero: { count: 0, normalized: [], error: e instanceof Error ? e.message : "Unable to refresh Xero token." } })
    }
  }

  if (!connection?.access_token || !connection?.tenant_id) {
    return res.status(200).json({ configured: true, connected: false, medusa: { count: medusaCustomers.length, normalized: medusaCustomers.map(normalizeMedusaCustomer) }, xero: { count: 0, normalized: [] } })
  }

  try {
    const xeroContacts = await findXeroContacts(connection, config)
    const normalizedXeroContacts = xeroContacts.map(normalizeXeroContact)
    const matches = normalizedXeroContacts.filter((c) => c.email && medusaByEmail.has((c.email as string).toLowerCase())).map((c) => {
      const medusaCustomer = medusaByEmail.get(((c.email as string) || "").toLowerCase())!
      return { email: c.email, medusa_customer_id: medusaCustomer.id || null, xero_contact_id: c.id || null, medusa_name: [medusaCustomer.first_name, medusaCustomer.last_name].filter(Boolean).join(" "), xero_name: c.name }
    })
    return res.status(200).json({ configured: true, connected: true, tenantId: connection.tenant_id, medusa: { count: medusaCustomers.length, normalized: medusaCustomers.map(normalizeMedusaCustomer) }, xero: { count: xeroContacts.length, normalized: normalizedXeroContacts }, matches })
  } catch (e) {
    return res.status(200).json({ configured: true, connected: true, tenantId: connection.tenant_id, medusa: { count: medusaCustomers.length, normalized: medusaCustomers.map(normalizeMedusaCustomer) }, xero: { count: 0, normalized: [], error: e instanceof Error ? e.message : "Unable to fetch Xero contacts." } })
  }
}
