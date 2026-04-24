import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { XERO_MODULE } from "../modules/xero"
import type XeroModuleService from "../modules/xero/service"
import {
  hashProductPayload,
  normalizeMedusaProductForSync,
  toXeroItemPayload,
} from "./product-sync"
import {
  createXeroItem,
  findXeroAccounts,
  findXeroItems,
  getXeroConfig,
  getXeroItem,
  isConnectionExpired,
  refreshOauthToken,
  safeUpdateXeroItem,
  toStoredConnection,
} from "./xero"

type ScopeLike = {
  resolve: (name: string) => any
}

type QueryGraph = {
  graph: (input: {
    entity: string
    fields: string[]
    filters?: Record<string, unknown>
  }) => Promise<{ data?: Record<string, unknown>[] }>
}

const asRecord = (value: unknown) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return null
}

// Account code "200" is the standard Sales/Revenue account in Xero's default chart of accounts.
// This is used as a fallback when no income account is configured in the plugin settings.
// Override via the Xero Settings page in the admin UI.
export const DEFAULT_INCOME_ACCOUNT_CODE = "200"

export async function getReadyXeroConnection(
  scope: ScopeLike,
  actorId?: string | null
) {
  const xeroService: XeroModuleService = scope.resolve(XERO_MODULE)
  const config = getXeroConfig()

  if (!config.configured) {
    return { xeroService, config, connection: null }
  }

  let connection = await xeroService.getConnection()

  if (connection && connection.refresh_token && isConnectionExpired(connection)) {
    const refreshedToken = await refreshOauthToken(connection, config)
    connection = await xeroService.upsertConnection(
      toStoredConnection(refreshedToken, connection.tenant_id || null, actorId)
    )
  }

  if (!connection?.access_token || !connection?.tenant_id) {
    return { xeroService, config, connection: null }
  }

  return { xeroService, config, connection }
}

export async function getMedusaProductById(scope: ScopeLike, productId: string) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as QueryGraph
  const response = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "description",
      "status",
      "metadata",
      "variants.id",
      "variants.sku",
      "variants.prices.amount",
      "variants.prices.currency_code",
    ],
    filters: { id: productId },
  })

  return response.data?.[0] ?? null
}

export async function listMedusaProducts(scope: ScopeLike) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as QueryGraph
  const response = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "description",
      "status",
      "metadata",
      "variants.id",
      "variants.sku",
      "variants.prices.amount",
      "variants.prices.currency_code",
    ],
  })

  return response.data ?? []
}

export async function getOrCreateIncomeAccountCode(
  connection: { access_token?: string | null; tenant_id?: string | null },
  config: ReturnType<typeof getXeroConfig>,
  xeroService: XeroModuleService
): Promise<string> {
  const settings = await xeroService.getSettings()

  if (settings?.xero_product_income_account_id) {
    return settings.xero_product_income_account_id
  }

  const accounts = await findXeroAccounts(connection, config)
  const salesAccount = accounts.find(
    (a) =>
      typeof a.code === "string" &&
      (a.type === "REVENUE" || a.type === "SALES") &&
      a.status !== "ARCHIVED"
  )

  return salesAccount?.code
    ? String(salesAccount.code)
    : DEFAULT_INCOME_ACCOUNT_CODE
}

export async function syncMedusaProductToXero(
  scope: ScopeLike,
  medusaProductId: string
) {
  const medusaProduct = await getMedusaProductById(scope, medusaProductId)

  if (!medusaProduct) {
    return { skipped: true, reason: "Product not found in Medusa." }
  }

  const { xeroService, config, connection } = await getReadyXeroConnection(scope)

  if (!connection) {
    return { skipped: true, reason: "Xero is not connected." }
  }

  const medusaHash = hashProductPayload(normalizeMedusaProductForSync(medusaProduct))
  const existingLink = await xeroService.getItemLinkByMedusaProductId(
    medusaProduct.id as string
  )

  const incomeAccountCode = await getOrCreateIncomeAccountCode(
    connection,
    config,
    xeroService
  )

  let xeroItem: Record<string, unknown> | null = null

  if (existingLink?.xero_item_id) {
    xeroItem = await getXeroItem(connection, config, existingLink.xero_item_id)
  }

  if (!xeroItem) {
    const variants = Array.isArray(medusaProduct.variants) ? medusaProduct.variants : []
    const firstVariant = asRecord(variants[0])
    const sku = typeof firstVariant?.sku === "string" ? firstVariant.sku.trim().toUpperCase() : ""

    if (sku) {
      const allItems = await findXeroItems(connection, config)
      xeroItem =
        allItems.find(
          (item) =>
            typeof item.code === "string" &&
            item.code.toUpperCase() === sku
        ) || null
    }
  }

  const payload = toXeroItemPayload(
    medusaProduct,
    incomeAccountCode,
    xeroItem?.code as string | null
  )

  const syncedItem = xeroItem?.itemID
    ? await safeUpdateXeroItem(connection, config, xeroItem.itemID as string, payload)
    : await createXeroItem(connection, config, payload)

  if (!syncedItem?.itemID) {
    return { skipped: true, reason: "Xero did not return a persisted item." }
  }

  await xeroService.upsertItemLink({
    medusa_product_id: medusaProduct.id as string,
    xero_item_id: String(syncedItem.itemID),
    xero_update_token: null,
    tenant_id: connection.tenant_id || null,
    last_synced_hash: medusaHash,
    last_direction: "medusa_to_xero",
    last_synced_at: new Date(),
    metadata: {
      xero_item_code: syncedItem.code || null,
      xero_item_name: syncedItem.name || null,
    },
  })

  return {
    skipped: false,
    medusa_product_id: medusaProduct.id,
    xero_item_id: syncedItem.itemID,
    xero_item_code: syncedItem.code,
    direction: "medusa_to_xero",
  }
}

export async function syncMedusaProductsToXero(scope: ScopeLike) {
  const { xeroService, config, connection } = await getReadyXeroConnection(scope)

  if (!connection) {
    return {
      connected: false,
      created: 0,
      updated: 0,
      skipped: 0,
      items: [] as Record<string, unknown>[],
    }
  }

  const medusaProducts = await listMedusaProducts(scope)

  let created = 0
  let updated = 0
  let skipped = 0
  const items: Record<string, unknown>[] = []

  for (const product of medusaProducts) {
    const result = await syncMedusaProductToXero(scope, String(product.id))

    if (result.skipped) {
      skipped++
    } else {
      updated++
    }

    items.push(result)
  }

  return {
    connected: true,
    created,
    updated,
    skipped,
    items,
  }
}
