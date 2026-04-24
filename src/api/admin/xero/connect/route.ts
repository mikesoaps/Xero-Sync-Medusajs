import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createAuthorizationUrl, createXeroClient, getBaseUrl, getXeroConfig, signState } from "../../../../lib/xero"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const config = getXeroConfig(getBaseUrl(req))
  if (!config.configured) {
    return res.status(400).json({ configured: false, missingKeys: config.missingKeys })
  }
  const xeroClient = createXeroClient(config)
  const state = signState({ actorId: req.auth_context?.actor_id || null, returnTo: "/app/settings/xero", ts: Date.now() })
  const url = await createAuthorizationUrl(xeroClient, state)
  return res.status(200).json({ configured: true, url })
}
