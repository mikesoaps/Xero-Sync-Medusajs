import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { XERO_MODULE } from "../../../../modules/xero"
import type XeroModuleService from "../../../../modules/xero/service"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const xeroService: XeroModuleService = req.scope.resolve(XERO_MODULE)
  const connection = await xeroService.getConnection()
  if (!connection) {
    return res.status(200).json({ connected: false })
  }
  await xeroService.clearConnection(req.auth_context?.actor_id)
  return res.status(200).json({ connected: false })
}
