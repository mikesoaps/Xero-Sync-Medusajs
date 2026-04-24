import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { syncMedusaCustomerToXero } from "../lib/customer-sync-service"

export default async function customerCreatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const result = await syncMedusaCustomerToXero(container, data.id)

  console.log("[xero-customer-sync] medusa->xero created", result)
}

export const config: SubscriberConfig = {
  event: "customer.created",
  context: {
    subscriberId: "xero-sync-customer-created-handler",
  },
}
