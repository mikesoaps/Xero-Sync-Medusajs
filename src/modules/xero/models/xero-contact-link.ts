import { model } from "@medusajs/framework/utils"

const XeroContactLink = model.define("xero_contact_link", {
  id: model.id().primaryKey(),
  medusa_customer_id: model.text(),
  xero_contact_id: model.text(),
  xero_update_token: model.text().nullable(),
  tenant_id: model.text().nullable(),
  last_synced_hash: model.text().nullable(),
  last_direction: model.text().nullable(),
  last_synced_at: model.dateTime().nullable(),
  metadata: model.json().nullable(),
})

export default XeroContactLink
