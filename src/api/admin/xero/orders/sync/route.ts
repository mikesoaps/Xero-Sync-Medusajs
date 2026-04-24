import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { syncMedusaOrdersToXero } from "../../../../../lib/order-sync-service"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const result = await syncMedusaOrdersToXero(req.scope)
  return res.status(200).json(result)
}
