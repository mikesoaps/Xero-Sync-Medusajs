import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { XERO_MODULE } from "../../../../../modules/xero"
import type XeroModuleService from "../../../../../modules/xero/service"
import { findXeroItems, getBaseUrl, getXeroConfig, isConnectionExpired, refreshOauthToken, toStoredConnection } from "../../../../../lib/xero"

type QueryGraph = { graph: (input: { entity: string; fields: string[]; filters?: Record<string, unknown> }) => Promise<{ data?: Record<string, unknown>[] }> }
const asRecord = (v: unknown) => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const config = getXeroConfig(getBaseUrl(req))
  const xeroService: XeroModuleService = req.scope.resolve(XERO_MODULE)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as QueryGraph

  const medusaProductsResponse = await query.graph({ entity: "product", fields: ["id", "title", "description", "status", "variants.id", "variants.sku", "variants.prices.amount", "variants.prices.currency_code"] })
  const medusaProducts = medusaProductsResponse.data ?? []

  if (!config.configured) {
    return res.status(200).json({ configured: false, connected: false, missingKeys: config.missingKeys, summary: { medusa_products: medusaProducts.length, xero_items: 0, matched_variants: 0, missing_variants: 0 }, rows: [] })
  }

  let connection = await xeroService.getConnection()

  if (connection && connection.refresh_token && isConnectionExpired(connection)) {
    try {
      const refreshedToken = await refreshOauthToken(connection, config)
      connection = await xeroService.upsertConnection(toStoredConnection(refreshedToken, connection.tenant_id || null, req.auth_context?.actor_id))
    } catch { /* ignore */ }
  }

  if (!connection?.access_token || !connection?.tenant_id) {
    return res.status(200).json({ configured: true, connected: false, summary: { medusa_products: medusaProducts.length, xero_items: 0, matched_variants: 0, missing_variants: 0 }, rows: [] })
  }

  let xeroItems: Record<string, unknown>[] = []
  let xeroError: string | undefined

  try {
    xeroItems = await findXeroItems(connection, config)
  } catch (e) {
    xeroError = e instanceof Error ? e.message : "Unable to fetch Xero items."
  }

  const xeroItemByCode = new Map<string, Record<string, unknown>>()
  for (const item of xeroItems) {
    if (typeof item.code === "string") xeroItemByCode.set(item.code.toUpperCase(), item)
  }

  let matchedVariants = 0
  let missingVariants = 0

  const rows = medusaProducts.map((product) => {
    const variants = Array.isArray(product.variants) ? product.variants : []
    const variantCount = variants.length
    let matchedVariantCount = 0

    for (const variant of variants) {
      const varRecord = asRecord(variant)
      const sku = typeof varRecord?.sku === "string" ? varRecord.sku.trim().toUpperCase() : ""
      if (sku && xeroItemByCode.has(sku)) matchedVariantCount++
    }

    const unmatchedVariantCount = variantCount - matchedVariantCount
    matchedVariants += matchedVariantCount
    missingVariants += unmatchedVariantCount

    return {
      id: String(product.id),
      medusa_product_id: String(product.id),
      title: typeof product.title === "string" ? product.title : null,
      status: typeof product.status === "string" ? product.status : null,
      variant_count: variantCount,
      matched_variant_count: matchedVariantCount,
      unmatched_variant_count: unmatchedVariantCount,
    }
  })

  return res.status(200).json({
    configured: true, connected: true, tenantId: connection.tenant_id,
    xero: xeroError ? { error: xeroError } : undefined,
    summary: { medusa_products: medusaProducts.length, xero_items: xeroItems.length, matched_variants: matchedVariants, missing_variants: missingVariants },
    rows,
  })
}
