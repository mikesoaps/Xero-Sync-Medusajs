import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { syncMedusaCustomerToXero } from "../lib/customer-sync-service"

export default async function customerUpdatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const result = await syncMedusaCustomerToXero(container, data.id)

  console.log("[xero-customer-sync] medusa->xero updated", result)
}

export const config: SubscriberConfig = {
  event: "customer.updated",
  context: {
    subscriberId: "xero-sync-customer-updated-handler",
  },
}
