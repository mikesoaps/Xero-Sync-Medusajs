import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { syncMedusaProductToXero } from "../../../../../../lib/product-sync-service"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { productId } = req.params
  if (!productId) {
    return res.status(400).json({ message: "productId is required." })
  }
  const result = await syncMedusaProductToXero(req.scope, productId)
  return res.status(200).json(result)
}
