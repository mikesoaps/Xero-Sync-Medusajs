import { model } from "@medusajs/framework/utils"

const XeroItemLink = model.define("xero_item_link", {
  id: model.id().primaryKey(),
  medusa_product_id: model.text(),
  xero_item_id: model.text().nullable(),
  xero_update_token: model.text().nullable(),
  tenant_id: model.text().nullable(),
  last_synced_hash: model.text().nullable(),
  last_direction: model.text().nullable(),
  last_synced_at: model.dateTime().nullable(),
  metadata: model.json().nullable(),
})

export default XeroItemLink
