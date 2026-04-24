import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { XERO_MODULE } from "../../../../../modules/xero"
import type XeroModuleService from "../../../../../modules/xero/service"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const xeroService: XeroModuleService = req.scope.resolve(XERO_MODULE)
  const links = await xeroService.listInvoiceLinks()
  return res.status(200).json({ order_links: links, count: links.length })
}
