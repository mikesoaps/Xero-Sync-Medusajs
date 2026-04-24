import { defineRouteConfig } from "@medusajs/admin-sdk"

import XeroSettingsPage from "../../../components/xero-settings-page"

export const config = defineRouteConfig({
  label: "Settings",
  rank: 4,
})

export const handle = {
  breadcrumb: () => "Settings",
}

export default XeroSettingsPage
