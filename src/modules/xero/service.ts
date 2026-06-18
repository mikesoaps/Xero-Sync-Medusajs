import { MedusaService } from "@medusajs/framework/utils"

import XeroConnection from "./models/xero-connection"
import XeroContactLink from "./models/xero-contact-link"
import XeroInvoiceLink from "./models/xero-invoice-link"
import XeroItemLink from "./models/xero-item-link"
import XeroPaymentLink from "./models/xero-payment-link"

type UpsertConnectionInput = {
  tenant_id: string | null
  access_token: string | null
  refresh_token: string | null
  token_type: string | null
  expires_at?: Date | null
  refresh_token_expires_at?: Date | null
  raw_token?: Record<string, unknown> | null
  connected_at?: Date | null
  disconnected_at?: Date | null
  xero_product_income_account_id?: string | null
  xero_product_income_account_name?: string | null
  updated_by?: string | null
  environment?: string | null
  scope?: Record<string, unknown> | null
}

type UpsertContactLinkInput = {
  medusa_customer_id: string
  xero_contact_id: string
  xero_update_token?: string | null
  tenant_id?: string | null
  sync_status?: string
  last_synced_hash?: string | null
  last_direction?: string | null
  last_synced_at?: Date | null
  last_error?: string | null
  metadata?: Record<string, unknown> | null
}

type UpsertInvoiceLinkInput = {
  medusa_order_id: string
  xero_invoice_id?: string | null
  xero_update_token?: string | null
  tenant_id?: string | null
  sync_type?: string | null
  sync_status?: string
  xero_status?: string | null
  last_synced_hash?: string | null
  last_synced_at?: Date | null
  last_error?: string | null
  metadata?: Record<string, unknown> | null
}

type UpsertPaymentLinkInput = {
  medusa_order_id: string
  medusa_payment_id?: string | null
  xero_invoice_id?: string | null
  xero_payment_id?: string | null
  payment_amount?: number | null
  payment_date?: Date | null
  payment_reference?: string | null
  payment_provider?: string | null
  currency_code?: string | null
  direction?: string
  sync_status?: string
  last_synced_at?: Date | null
  last_error?: string | null
  provider_metadata?: Record<string, unknown> | null
}

export const XERO_MODULE = "xero"

class XeroModuleService extends MedusaService({
  XeroConnection,
  XeroContactLink,
  XeroInvoiceLink,
  XeroItemLink,
  XeroPaymentLink,
}) {
  async getConnection() {
    const connections = await this.listXeroConnections({
      provider: "xero",
    })
    return connections[0] ?? null
  }

  async upsertConnection(input: UpsertConnectionInput) {
    const existing = await this.getConnection()
    if (existing) {
      return await this.updateXeroConnections({
        id: existing.id,
        provider: "xero",
        ...input,
      })
    }
    return await this.createXeroConnections({
      provider: "xero",
      ...input,
    })
  }

  async clearConnection(updatedBy?: string | null) {
    const existing = await this.getConnection()
    if (!existing) return null
    return await this.updateXeroConnections({
      id: existing.id,
      access_token: null,
      refresh_token: null,
      token_type: null,
      tenant_id: null,
      expires_at: null,
      refresh_token_expires_at: null,
      raw_token: null,
      disconnected_at: new Date(),
      xero_product_income_account_id: null,
      xero_product_income_account_name: null,
      updated_by: updatedBy ?? null,
    })
  }

  // ── Contact link helpers ──────────────────────────────────────────────────

  async getContactLinkByMedusaCustomerId(medusaCustomerId: string) {
    const links = await this.listXeroContactLinks({ medusa_customer_id: medusaCustomerId })
    return links[0] ?? null
  }

  async getContactLinkByXeroContactId(xeroContactId: string) {
    const links = await this.listXeroContactLinks({ xero_contact_id: xeroContactId })
    return links[0] ?? null
  }

  async upsertContactLink(input: UpsertContactLinkInput) {
    const existing =
      (await this.getContactLinkByMedusaCustomerId(input.medusa_customer_id)) ||
      (await this.getContactLinkByXeroContactId(input.xero_contact_id))

    if (existing) {
      return await this.updateXeroContactLinks({ id: existing.id, ...input })
    }
    return await this.createXeroContactLinks(input)
  }

  async markContactLinkFailed(medusaCustomerId: string, error: string) {
    const existing = await this.getContactLinkByMedusaCustomerId(medusaCustomerId)
    if (!existing) return null
    return await this.updateXeroContactLinks({
      id: existing.id,
      sync_status: "failed",
      last_error: error,
      last_synced_at: new Date(),
    })
  }

  async clearContactLinks() {
    const [links] = await this.listAndCountXeroContactLinks({}, { select: ["id"], take: 5000 })
    if (links.length > 0) {
      await this.deleteXeroContactLinks(links.map((l) => l.id))
    }
  }

  // ── Invoice link helpers ──────────────────────────────────────────────────

  async getInvoiceLinkByMedusaOrderId(medusaOrderId: string) {
    const links = await this.listXeroInvoiceLinks({ medusa_order_id: medusaOrderId })
    return links[0] ?? null
  }

  async getInvoiceLinkByXeroInvoiceId(xeroInvoiceId: string) {
    const links = await this.listXeroInvoiceLinks({ xero_invoice_id: xeroInvoiceId })
    return links[0] ?? null
  }

  async upsertInvoiceLink(input: UpsertInvoiceLinkInput) {
    const existing =
      (await this.getInvoiceLinkByMedusaOrderId(input.medusa_order_id)) ||
      (input.xero_invoice_id
        ? await this.getInvoiceLinkByXeroInvoiceId(input.xero_invoice_id)
        : null)

    if (existing) {
      return await this.updateXeroInvoiceLinks({ id: existing.id, ...input })
    }
    return await this.createXeroInvoiceLinks(input)
  }

  async markInvoiceLinkFailed(medusaOrderId: string, error: string) {
    const existing = await this.getInvoiceLinkByMedusaOrderId(medusaOrderId)
    const now = new Date()
    if (existing) {
      return await this.updateXeroInvoiceLinks({
        id: existing.id,
        sync_status: "failed",
        last_error: error,
        last_synced_at: now,
      })
    }
    return await this.createXeroInvoiceLinks({
      medusa_order_id: medusaOrderId,
      sync_status: "failed",
      last_error: error,
      last_synced_at: now,
    })
  }

  async clearInvoiceLinks() {
    const [links] = await this.listAndCountXeroInvoiceLinks({}, { select: ["id"], take: 5000 })
    if (links.length > 0) {
      await this.deleteXeroInvoiceLinks(links.map((l) => l.id))
    }
  }

  async listInvoiceLinks() {
    return await this.listXeroInvoiceLinks({})
  }

  // ── Item link helpers ─────────────────────────────────────────────────────

  async getItemLinkByMedusaProductId(medusaProductId: string) {
    const links = await this.listXeroItemLinks({ medusa_product_id: medusaProductId })
    return links[0] ?? null
  }

  async getItemLinkByXeroItemId(xeroItemId: string) {
    const links = await this.listXeroItemLinks({ xero_item_id: xeroItemId })
    return links[0] ?? null
  }

  async upsertItemLink(input: {
    medusa_product_id: string
    xero_item_id: string
    xero_update_token?: string | null
    tenant_id?: string | null
    last_synced_hash?: string | null
    last_direction?: string | null
    last_synced_at?: Date | null
    metadata?: Record<string, unknown> | null
  }) {
    const existing =
      (await this.getItemLinkByMedusaProductId(input.medusa_product_id)) ||
      (await this.getItemLinkByXeroItemId(input.xero_item_id))

    if (existing) {
      return await this.updateXeroItemLinks({ id: existing.id, ...input })
    }
    return await this.createXeroItemLinks(input)
  }

  async clearItemLinks() {
    const [links] = await this.listAndCountXeroItemLinks({}, { select: ["id"], take: 5000 })
    if (links.length > 0) {
      await this.deleteXeroItemLinks(links.map((l) => l.id))
    }
  }

  // ── Payment link helpers ──────────────────────────────────────────────────

  async getPaymentLinkByMedusaOrderId(medusaOrderId: string) {
    const links = await this.listXeroPaymentLinks({ medusa_order_id: medusaOrderId })
    return links[0] ?? null
  }

  async getPaymentLinkByXeroPaymentId(xeroPaymentId: string) {
    const links = await this.listXeroPaymentLinks({ xero_payment_id: xeroPaymentId })
    return links[0] ?? null
  }

  async upsertPaymentLink(input: UpsertPaymentLinkInput) {
    const existing = await this.getPaymentLinkByMedusaOrderId(input.medusa_order_id)
    if (existing) {
      return await this.updateXeroPaymentLinks({ id: existing.id, ...input })
    }
    return await this.createXeroPaymentLinks(input)
  }

  async markPaymentLinkFailed(medusaOrderId: string, error: string) {
    const existing = await this.getPaymentLinkByMedusaOrderId(medusaOrderId)
    const now = new Date()
    if (existing) {
      return await this.updateXeroPaymentLinks({
        id: existing.id,
        sync_status: "failed",
        last_error: error,
        last_synced_at: now,
      })
    }
    return await this.createXeroPaymentLinks({
      medusa_order_id: medusaOrderId,
      sync_status: "failed",
      last_error: error,
      last_synced_at: now,
    })
  }

  async clearPaymentLinks() {
    const [links] = await this.listAndCountXeroPaymentLinks({}, { select: ["id"], take: 5000 })
    if (links.length > 0) {
      await this.deleteXeroPaymentLinks(links.map((l) => l.id))
    }
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  async getSettings() {
    const connection = await this.getConnection()
    if (!connection) return null
    return {
      xero_product_income_account_id: connection.xero_product_income_account_id ?? null,
      xero_product_income_account_name: connection.xero_product_income_account_name ?? null,
    }
  }

  // ── Overview helpers ──────────────────────────────────────────────────────

  async getFailedInvoiceLinks() {
    return await this.listXeroInvoiceLinks({ sync_status: "failed" })
  }

  async getDraftInvoiceLinks() {
    return await this.listXeroInvoiceLinks({ xero_status: "DRAFT" })
  }

  async getUnsyncedInvoiceLinks() {
    return await this.listXeroInvoiceLinks({ sync_status: "pending" })
  }

  async getFailedContactLinks() {
    return await this.listXeroContactLinks({ sync_status: "failed" })
  }

  async getFailedPaymentLinks() {
    return await this.listXeroPaymentLinks({ sync_status: "failed" })
  }
}

export default XeroModuleService
