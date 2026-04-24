import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { XERO_MODULE } from "../../../../modules/xero"
import type XeroModuleService from "../../../../modules/xero/service"
import { findXeroAccounts, getBaseUrl, getOrganisationInfo, getXeroConfig, isConnectionExpired, refreshOauthToken, toStoredConnection } from "../../../../lib/xero"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const config = getXeroConfig(getBaseUrl(req))
  const xeroService: XeroModuleService = req.scope.resolve(XERO_MODULE)

  if (!config.configured) {
    return res.status(200).json({ configured: false, connected: false, missingKeys: config.missingKeys, redirectUri: config.redirectUri })
  }

  let connection = await xeroService.getConnection()

  if (connection && connection.refresh_token && isConnectionExpired(connection)) {
    try {
      const refreshedToken = await refreshOauthToken(connection, config)
      connection = await xeroService.upsertConnection(toStoredConnection(refreshedToken, connection.tenant_id || null, req.auth_context?.actor_id))
    } catch (e) {
      return res.status(200).json({ configured: true, connected: false, redirectUri: config.redirectUri, error: e instanceof Error ? e.message : "Unable to refresh Xero token." })
    }
  }

  if (!connection?.access_token || !connection?.tenant_id) {
    return res.status(200).json({ configured: true, connected: false, redirectUri: config.redirectUri })
  }

  let organisation: Record<string, unknown> | null = null
  let incomeAccounts: Record<string, unknown>[] = []

  try {
    organisation = await getOrganisationInfo(connection, config)
    const allAccounts = await findXeroAccounts(connection, config)
    incomeAccounts = allAccounts.filter((a) => (a.type === "REVENUE" || a.type === "SALES") && a.status !== "ARCHIVED")
  } catch (e) {
    return res.status(200).json({
      configured: true, connected: true, tenantId: connection.tenant_id, expiresAt: connection.expires_at, connectedAt: connection.connected_at,
      organisation: null, incomeAccounts: [], selectedIncomeAccountCode: connection.xero_product_income_account_id,
      selectedIncomeAccountName: connection.xero_product_income_account_name,
      organisationError: e instanceof Error ? e.message : "Unable to fetch Xero organisation information.",
    })
  }

  return res.status(200).json({
    configured: true, connected: true, tenantId: connection.tenant_id, expiresAt: connection.expires_at, connectedAt: connection.connected_at,
    organisation,
    incomeAccounts: incomeAccounts.map((a) => ({
      code: typeof a.code === "string" ? a.code : null,
      name: typeof a.name === "string" ? a.name : null,
      type: typeof a.type === "string" ? a.type : null,
      status: typeof a.status === "string" ? a.status : null,
    })),
    selectedIncomeAccountCode: connection.xero_product_income_account_id,
    selectedIncomeAccountName: connection.xero_product_income_account_name,
  })
}
