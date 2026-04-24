import { createHmac } from "crypto"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { deleteXeroContactInMedusa, syncXeroContactToMedusaById } from "../../../lib/customer-sync-service"
import { getWebhookVerifierToken } from "../../../lib/xero"

export const AUTHENTICATE = false

type XeroWebhookEvent = {
  eventType?: string
  resourceId?: string
  resourceUrl?: string
  tenantId?: string
  eventDateUtc?: string
}

type XeroWebhookPayload = {
  events?: XeroWebhookEvent[]
  firstEventSequence?: number
  lastEventSequence?: number
  entropy?: string
}

const verifyXeroWebhookSignature = ({ rawBody, signature, key }: { rawBody: string | Buffer; signature: string | null | undefined; key: string }): boolean => {
  if (!signature) return false
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody
  const hmac = createHmac("sha256", key)
  hmac.update(body)
  const digest = hmac.digest("base64")
  return digest === signature
}

const parsePayload = (req: MedusaRequest): XeroWebhookPayload => {
  if (req.body && typeof req.body === "object") return req.body as XeroWebhookPayload
  if (typeof req.rawBody === "string" && req.rawBody.trim()) return JSON.parse(req.rawBody) as XeroWebhookPayload
  if (Buffer.isBuffer(req.rawBody) && req.rawBody.length) return JSON.parse(req.rawBody.toString("utf8")) as XeroWebhookPayload
  return {}
}

const processWebhookPayload = async (scope: MedusaRequest["scope"], payload: XeroWebhookPayload) => {
  const events = payload.events || []
  for (const event of events) {
    if (!event.resourceId || !event.eventType) continue
    const eventType = event.eventType.toLowerCase()
    if (eventType.includes("contact")) {
      if (eventType.includes("delete") || eventType.includes("archive")) {
        try {
          await deleteXeroContactInMedusa(scope, event.resourceId)
        } catch (error) {
          console.error("[xero-webhook] failed to delete contact", { event, error: error instanceof Error ? error.message : error })
        }
      } else {
        try {
          await syncXeroContactToMedusaById(scope, event.resourceId)
        } catch (error) {
          console.error("[xero-webhook] failed to sync contact", { event, error: error instanceof Error ? error.message : error })
        }
      }
    }
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const webhookKey = getWebhookVerifierToken()
  const rawBody = req.rawBody || ""

  const sigHeader = req.headers?.["x-xero-signature"]
  const signature = typeof sigHeader === "string" ? sigHeader : Array.isArray(sigHeader) ? sigHeader[0] : null

  if (!webhookKey) {
    return res.status(401).json({ message: "Xero webhook key is not configured." })
  }

  try {
    const isValid = verifyXeroWebhookSignature({ rawBody: Buffer.isBuffer(rawBody) ? rawBody : String(rawBody), signature, key: webhookKey })
    if (!isValid) {
      return res.status(401).json({ message: "Invalid Xero webhook signature." })
    }
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : "Unable to validate Xero webhook signature." })
  }

  const payload = parsePayload(req)
  res.status(200).json({ received: true })
  void processWebhookPayload(req.scope, payload)
}
