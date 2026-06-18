import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { deleteMedusaCustomerFromXero } from "../lib/customer-sync-service"

export default async function customerDeletedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const result = await deleteMedusaCustomerFromXero(container, data.id)

  console.log("[xero-customer-sync] medusa->xero deleted", result)
}

export const config: SubscriberConfig = {
  event: "customer.deleted",
  context: {
    subscriberId: "xero-sync-customer-deleted-handler",
  },
}
