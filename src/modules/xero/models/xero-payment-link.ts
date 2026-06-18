import { model } from "@medusajs/framework/utils"

const XeroPaymentLink = model.define("xero_payment_link", {
  id: model.id().primaryKey(),
  medusa_order_id: model.text(),
  medusa_payment_id: model.text().nullable(),
  xero_invoice_id: model.text().nullable(),
  xero_payment_id: model.text().nullable(),
  payment_amount: model.number().nullable(),
  payment_date: model.dateTime().nullable(),
  payment_reference: model.text().nullable(),
  payment_provider: model.text().nullable(),
  currency_code: model.text().nullable(),
  direction: model.text().default("medusa_to_xero"),
  sync_status: model.text().default("pending"),
  last_synced_at: model.dateTime().nullable(),
  last_error: model.text().nullable(),
  provider_metadata: model.json().nullable(),
})

export default XeroPaymentLink
