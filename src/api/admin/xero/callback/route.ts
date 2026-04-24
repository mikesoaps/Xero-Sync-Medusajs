import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { XERO_MODULE } from "../../../../modules/xero"
import type XeroModuleService from "../../../../modules/xero/service"
import { createXeroClient, getBaseUrl, getXeroConfig, toStoredConnection, verifyState } from "../../../../lib/xero"

export const AUTHENTICATE = false

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const config = getXeroConfig(getBaseUrl(req))
  const redirectTarget = "/app/settings/xero"

  if (!config.configured) {
    return res.redirect(`${redirectTarget}?xero=error&message=${encodeURIComponent("Xero is not configured on the backend.")}`)
  }

  const error = typeof req.query.error === "string" ? req.query.error : null
  const errorDescription = typeof req.query.error_description === "string" ? req.query.error_description : null

  if (error) {
    return res.redirect(`${redirectTarget}?xero=error&message=${encodeURIComponent(errorDescription || error)}`)
  }

  try {
    const state = typeof req.query.state === "string" ? req.query.state : ""
    const payload = verifyState(state)
    const xeroClient = createXeroClient(config)
    const callbackUrl = `${getBaseUrl(req)}${req.originalUrl || req.url}`
    const tokenSet = await xeroClient.apiCallback(callbackUrl)
    await xeroClient.updateTenants()
    const tenantId = xeroClient.tenants[0]?.tenantId || null
    const xeroService: XeroModuleService = req.scope.resolve(XERO_MODULE)
    await xeroService.upsertConnection(toStoredConnection(tokenSet, tenantId, payload.actorId))
    return res.redirect(`${payload.returnTo}?xero=connected`)
  } catch (e) {
    const message = e instanceof Error ? e.message : "Xero connection failed."
    return res.redirect(`${redirectTarget}?xero=error&message=${encodeURIComponent(message)}`)
  }
}
