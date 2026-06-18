import { model } from "@medusajs/framework/utils"

const XeroInvoiceLink = model.define("xero_invoice_link", {
  id: model.id().primaryKey(),
  medusa_order_id: model.text(),
  xero_invoice_id: model.text().nullable(),
  xero_update_token: model.text().nullable(),
  tenant_id: model.text().nullable(),
  sync_type: model.text().nullable(),
  sync_status: model.text().default("pending"),
  xero_status: model.text().nullable(),
  last_synced_hash: model.text().nullable(),
  last_synced_at: model.dateTime().nullable(),
  last_error: model.text().nullable(),
  metadata: model.json().nullable(),
})

export default XeroInvoiceLink
