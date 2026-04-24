import { defineMiddlewares } from "@medusajs/framework/http"

export default defineMiddlewares({
  routes: [
    {
      method: ["POST"],
      matcher: "/quickbooks/webhooks",
      bodyParser: {
        preserveRawBody: true,
      },
    },
    {
      method: ["POST"],
      matcher: "/xero/webhooks",
      bodyParser: {
        preserveRawBody: true,
      },
    },
  ],
})
