import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { XERO_MODULE } from "../../../../modules/xero"
import type XeroModuleService from "../../../../modules/xero/service"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { type } = (req.body as { type?: string }) || {}
  const xeroService: XeroModuleService = req.scope.resolve(XERO_MODULE)

  if (type === "orders" || type === "all") {
    await xeroService.clearInvoiceLinks()
  }
  if (type === "customers" || type === "all") {
    await xeroService.clearContactLinks()
  }

  return res.status(200).json({ success: true, message: `Sync history for ${type || "all"} cleared successfully.` })
}
