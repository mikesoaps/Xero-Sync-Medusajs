import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { XERO_MODULE } from "../modules/xero"
import type XeroModuleService from "../modules/xero/service"
import {
  createXeroInvoice,
  getXeroConfig,
  getXeroInvoice,
  isConnectionExpired,
  refreshOauthToken,
  toStoredConnection,
  updateXeroInvoice,
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

export async function getMedusaOrderById(scope: ScopeLike, orderId: string) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as QueryGraph
  const response = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "status",
      "email",
      "currency_code",
      "total",
      "subtotal",
      "tax_total",
      "shipping_total",
      "discount_total",
      "metadata",
      "created_at",
      "customer_id",
      "customer.id",
      "customer.email",
      "customer.first_name",
      "customer.last_name",
      "items.id",
      "items.title",
      "items.quantity",
      "items.unit_price",
      "items.variant_id",
      "items.variant.sku",
      "items.total",
      "items.tax_total",
      "shipping_address.first_name",
      "shipping_address.last_name",
      "shipping_address.address_1",
      "shipping_address.city",
      "shipping_address.province",
      "shipping_address.postal_code",
      "shipping_address.country_code",
    ],
    filters: { id: orderId },
  })

  return response.data?.[0] ?? null
}

export async function listMedusaOrders(scope: ScopeLike) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as QueryGraph
  const response = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "status",
      "email",
      "currency_code",
      "total",
      "subtotal",
      "tax_total",
      "shipping_total",
      "discount_total",
      "metadata",
      "created_at",
      "customer_id",
      "customer.id",
      "customer.email",
      "items.id",
      "items.title",
      "items.quantity",
      "items.unit_price",
      "items.variant_id",
      "items.variant.sku",
      "items.total",
      "items.tax_total",
    ],
  })

  return response.data ?? []
}

export async function buildXeroInvoicePayload(
  order: Record<string, unknown>,
  xeroContactId: string | null,
  accountCode: string = "200"
) {
  const items = Array.isArray(order.items) ? order.items : []

  const lineItems = items.map((item) => {
    const record = asRecord(item)
    const unitPrice =
      typeof record?.unit_price === "number" ? record.unit_price / 100 : 0
    const quantity = typeof record?.quantity === "number" ? record.quantity : 1
    const sku = asRecord(record?.variant)?.sku

    return {
      description: typeof record?.title === "string" ? record.title : "Item",
      quantity,
      unitAmount: unitPrice,
      accountCode,
      itemCode: typeof sku === "string" ? sku : undefined,
    }
  })

  const shippingTotal =
    typeof order.shipping_total === "number" ? order.shipping_total / 100 : 0

  if (shippingTotal > 0) {
    lineItems.push({
      description: "Shipping",
      quantity: 1,
      unitAmount: shippingTotal,
      accountCode,
      itemCode: undefined,
    })
  }

  const payload: Record<string, unknown> = {
    type: "ACCREC",
    status: "AUTHORISED",
    reference: `Order #${order.display_id || order.id}`,
    currencyCode: typeof order.currency_code === "string"
      ? order.currency_code.toUpperCase()
      : "USD",
    lineItems,
    lineAmountTypes: "INCLUSIVE",
    date: new Date().toISOString().split("T")[0],
  }

  if (xeroContactId) {
    payload.contact = { contactID: xeroContactId }
  } else {
    const email = typeof order.email === "string" ? order.email : null
    const customer = asRecord(order.customer)
    const firstName = asRecord(customer)?.first_name ?? ""
    const lastName = asRecord(customer)?.last_name ?? ""
    const displayName =
      [firstName, lastName].filter(Boolean).join(" ") || email || "Unknown Customer"

    payload.contact = { name: displayName, emailAddress: email || undefined }
  }

  return payload
}

export async function syncMedusaOrderToXero(
  scope: ScopeLike,
  medusaOrderId: string
) {
  const order = await getMedusaOrderById(scope, medusaOrderId)

  if (!order) {
    return { skipped: true, reason: "Order not found in Medusa." }
  }

  const { xeroService, config, connection } = await getReadyXeroConnection(scope)

  if (!connection) {
    return { skipped: true, reason: "Xero is not connected." }
  }

  const existingLink = await xeroService.getInvoiceLinkByMedusaOrderId(
    order.id as string
  )

  let xeroContactId: string | null = null

  if (order.customer_id) {
    const contactLink = await xeroService.getContactLinkByMedusaCustomerId(
      String(order.customer_id)
    )
    xeroContactId = contactLink?.xero_contact_id || null
  }

  const invoicePayload = await buildXeroInvoicePayload(order, xeroContactId)

  let syncedInvoice: Record<string, unknown> | null = null

  if (existingLink?.xero_invoice_id) {
    const existingXeroInvoice = await getXeroInvoice(
      connection,
      config,
      existingLink.xero_invoice_id
    )

    if (existingXeroInvoice?.invoiceID && existingXeroInvoice.status !== "VOIDED") {
      syncedInvoice = await updateXeroInvoice(
        connection,
        config,
        existingXeroInvoice.invoiceID as string,
        invoicePayload
      )
    }
  }

  if (!syncedInvoice) {
    syncedInvoice = await createXeroInvoice(connection, config, invoicePayload)
  }

  if (!syncedInvoice?.invoiceID) {
    return { skipped: true, reason: "Xero did not return a persisted invoice." }
  }

  await xeroService.upsertInvoiceLink({
    medusa_order_id: order.id as string,
    xero_invoice_id: String(syncedInvoice.invoiceID),
    xero_update_token: null,
    tenant_id: connection.tenant_id || null,
    last_synced_at: new Date(),
    metadata: {
      xero_invoice_number: syncedInvoice.invoiceNumber || null,
      xero_status: syncedInvoice.status || null,
    },
  })

  return {
    skipped: false,
    medusa_order_id: order.id,
    xero_invoice_id: syncedInvoice.invoiceID,
    xero_invoice_number: syncedInvoice.invoiceNumber,
    direction: "medusa_to_xero",
  }
}

export async function syncMedusaOrdersToXero(scope: ScopeLike) {
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

  const medusaOrders = await listMedusaOrders(scope)

  let created = 0
  let updated = 0
  let skipped = 0
  const items: Record<string, unknown>[] = []

  for (const order of medusaOrders) {
    const result = await syncMedusaOrderToXero(scope, String(order.id))

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
