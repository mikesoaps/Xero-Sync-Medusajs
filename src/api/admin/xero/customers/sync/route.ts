import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { syncMedusaCustomersToXero, syncXeroContactsToMedusa } from "../../../../../lib/customer-sync-service"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { direction } = (req.body as { direction?: string }) || {}
  if (direction === "medusa_to_xero") {
    const result = await syncMedusaCustomersToXero(req.scope)
    return res.status(200).json(result)
  }
  const result = await syncXeroContactsToMedusa(req.scope)
  return res.status(200).json(result)
}
