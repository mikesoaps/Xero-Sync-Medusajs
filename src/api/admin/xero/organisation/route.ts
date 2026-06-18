import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { XERO_MODULE } from "../../../../modules/xero"
import type XeroModuleService from "../../../../modules/xero/service"
import { getBaseUrl, getOrganisationInfo, getXeroConfig, isConnectionExpired, refreshOauthToken, toStoredConnection } from "../../../../lib/xero"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
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

  const organisation = await getOrganisationInfo(connection, config)
  return res.status(200).json({ organisation })
}
