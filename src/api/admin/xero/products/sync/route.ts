import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { syncMedusaProductsToXero } from "../../../../../lib/product-sync-service"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const result = await syncMedusaProductsToXero(req.scope)
  return res.status(200).json(result)
}
