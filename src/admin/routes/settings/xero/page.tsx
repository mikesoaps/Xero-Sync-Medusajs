import { defineRouteConfig } from "@medusajs/admin-sdk"

import XeroSettingsPage from "../../../components/xero-settings-page"

export const config = defineRouteConfig({
  label: "Xero",
})

export default XeroSettingsPage
