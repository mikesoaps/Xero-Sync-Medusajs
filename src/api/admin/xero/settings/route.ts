import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { XERO_MODULE } from "../../../../modules/xero"
import type XeroModuleService from "../../../../modules/xero/service"
import { findXeroAccounts, getBaseUrl, getXeroConfig, isConnectionExpired, refreshOauthToken, toStoredConnection } from "../../../../lib/xero"

const asRecord = (v: unknown) => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null
const asString = (v: unknown) => typeof v === "string" ? v.trim() : ""

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const config = getXeroConfig(getBaseUrl(req))
  const xeroService: XeroModuleService = req.scope.resolve(XERO_MODULE)

  if (!config.configured) {
    return res.status(400).json({ message: "Xero backend is not configured.", missingKeys: config.missingKeys })
  }

  let connection = await xeroService.getConnection()

  if (connection && connection.refresh_token && isConnectionExpired(connection)) {
    const refreshedToken = await refreshOauthToken(connection, config)
    connection = await xeroService.upsertConnection(toStoredConnection(refreshedToken, connection.tenant_id || null, req.auth_context?.actor_id))
  }

  if (!connection?.access_token || !connection?.tenant_id) {
    return res.status(400).json({ message: "Xero is not connected." })
  }

  const body = asRecord(req.body) || {}
  const accountCode = asString(body.xero_product_income_account_code)

  if (!accountCode) {
    return res.status(400).json({ message: "xero_product_income_account_code is required." })
  }

  const accounts = await findXeroAccounts(connection, config)
  const account = accounts.find((a) => typeof a.code === "string" && a.code.trim() === accountCode)

  if (!account?.code) {
    return res.status(400).json({ message: "Selected Xero income account was not found." })
  }

  const updatedConnection = await xeroService.upsertConnection({
    tenant_id: connection.tenant_id,
    access_token: connection.access_token,
    refresh_token: connection.refresh_token,
    token_type: connection.token_type,
    expires_at: connection.expires_at ? new Date(connection.expires_at) : null,
    refresh_token_expires_at: connection.refresh_token_expires_at ? new Date(connection.refresh_token_expires_at) : null,
    raw_token: (connection.raw_token as Record<string, unknown> | null) || null,
    connected_at: connection.connected_at ? new Date(connection.connected_at) : null,
    disconnected_at: connection.disconnected_at ? new Date(connection.disconnected_at) : null,
    xero_product_income_account_id: String(account.code),
    xero_product_income_account_name: typeof account.name === "string" ? account.name : null,
    updated_by: req.auth_context?.actor_id ?? null,
  })

  return res.status(200).json({
    xero_product_income_account_id: updatedConnection.xero_product_income_account_id,
    xero_product_income_account_name: updatedConnection.xero_product_income_account_name,
  })
}
