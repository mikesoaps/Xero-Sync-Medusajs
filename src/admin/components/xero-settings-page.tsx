import type { FormEvent } from "react"
import { useEffect, useMemo, useState } from "react"
import {
  Alert,
  Badge,
  Button,
  Container,
  Heading,
  InlineTip,
  Label,
  Text,
} from "@medusajs/ui"
import { useSearchParams } from "react-router-dom"

type XeroStatus = {
  configured: boolean
  connected: boolean
  missingKeys?: string[]
  redirectUri?: string
  tenantId?: string
  expiresAt?: string
  connectedAt?: string
  organisation?: {
    name?: string | null
    taxNumber?: string | null
    countryCode?: string | null
    [key: string]: unknown
  } | null
  incomeAccounts?: Array<{
    code?: string | null
    name?: string | null
  }>
  selectedIncomeAccountCode?: string | null
  selectedIncomeAccountName?: string | null
  error?: string
}

const formatValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return "-"
  }

  if (typeof value === "string") {
    return value
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }

  return JSON.stringify(value)
}

const SummaryRow = ({
  label,
  value,
}: {
  label: string
  value: unknown
}) => (
  <div className="grid grid-cols-1 gap-1 border-b border-ui-border-base py-4 md:grid-cols-[220px_1fr] md:gap-4">
    <Text size="small" weight="plus" className="text-ui-fg-subtle">
      {label}
    </Text>
    <Text>{formatValue(value)}</Text>
  </div>
)

const SectionTitle = ({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) => (
  <div>
    <Heading level="h2">{title}</Heading>
    <Text className="text-ui-fg-subtle" size="small">
      {subtitle}
    </Text>
  </div>
)

const XeroSettingsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [status, setStatus] = useState<XeroStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [isSavingSyncSettings, setIsSavingSyncSettings] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [selectedIncomeAccountCode, setSelectedIncomeAccountCode] = useState("")

  const callbackMessage = useMemo(() => {
    const state = searchParams.get("xero")
    const errorMessage = searchParams.get("message")

    if (state === "connected") {
      return "Xero connected successfully."
    }

    if (state === "error") {
      return errorMessage || "Xero connection failed."
    }

    return null
  }, [searchParams])

  const loadStatus = async () => {
    setIsLoading(true)

    try {
      const response = await fetch("/admin/xero/status")
      const json = (await response.json()) as XeroStatus
      setStatus(json)
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Unable to load Xero status."
      )
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadStatus()
  }, [])

  useEffect(() => {
    if (callbackMessage) {
      setMessage(callbackMessage)

      const next = new URLSearchParams(searchParams)
      next.delete("xero")
      next.delete("message")
      setSearchParams(next, { replace: true })
    }
  }, [callbackMessage, searchParams, setSearchParams])

  useEffect(() => {
    setSelectedIncomeAccountCode(status?.selectedIncomeAccountCode || "")
  }, [status?.selectedIncomeAccountCode])

  const handleConnect = async () => {
    setIsConnecting(true)
    setMessage(null)

    try {
      const response = await fetch("/admin/xero/connect")
      const json = (await response.json()) as {
        url?: string
        missingKeys?: string[]
      }

      if (!response.ok || !json.url) {
        throw new Error(
          json.missingKeys?.length
            ? `Missing backend configuration: ${json.missingKeys.join(", ")}`
            : "Unable to start the Xero connection flow."
        )
      }

      window.location.href = json.url
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Unable to start Xero OAuth."
      )
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    setIsDisconnecting(true)
    setMessage(null)

    try {
      const response = await fetch("/admin/xero/disconnect", {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error("Unable to disconnect Xero.")
      }

      setMessage("Xero disconnected.")
      await loadStatus()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to disconnect.")
    } finally {
      setIsDisconnecting(false)
    }
  }

  const handleSaveSyncSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSavingSyncSettings(true)
    setMessage(null)

    try {
      const response = await fetch("/admin/xero/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          xero_product_income_account_code: selectedIncomeAccountCode,
        }),
      })

      const json = (await response.json()) as { message?: string }

      if (!response.ok) {
        throw new Error(json.message || "Unable to update Xero sync settings.")
      }

      setMessage("Xero product sync settings updated.")
      await loadStatus()
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Unable to update Xero sync settings."
      )
    } finally {
      setIsSavingSyncSettings(false)
    }
  }

  const orgName = status?.organisation?.name || "Xero organisation"
  const needsReconnect = !!status?.error

  const topTipVariant = !status?.configured
    ? "warning"
    : status?.error
      ? "error"
      : status?.connected
        ? "success"
        : "info"

  const topTipLabel = !status?.configured
    ? "Xero setup incomplete"
    : status?.error
      ? "Xero needs attention"
      : status?.connected
        ? "Xero connected"
        : "Xero not connected"

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex flex-col gap-4 px-1 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Heading level="h1">Xero Settings</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            Manage your Xero connection and organisation details.
          </Text>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <Badge color={status?.connected ? "green" : "grey"} size="2xsmall">
            {status?.connected ? "Connected" : "Disconnected"}
          </Badge>
          {needsReconnect && (
            <Badge color="orange" size="2xsmall">
              Needs reconnect
            </Badge>
          )}
          <Button
            size="small"
            variant={
              needsReconnect || !status?.connected ? "primary" : "secondary"
            }
            onClick={handleConnect}
            isLoading={isConnecting}
            disabled={isLoading}
          >
            {needsReconnect
              ? "Reconnect"
              : status?.connected
                ? "Connect again"
                : "Connect"}
          </Button>
          <Button
            size="small"
            variant="secondary"
            onClick={handleDisconnect}
            isLoading={isDisconnecting}
            disabled={!status?.connected || isLoading}
          >
            Disconnect
          </Button>
        </div>
      </div>

      <InlineTip label={topTipLabel} variant={topTipVariant}>
        {!status?.configured
          ? `Missing backend configuration${status?.missingKeys?.length ? `: ${status.missingKeys.join(", ")}` : "."}`
          : status?.error
            ? `${status.error}. `
            : status?.connected
              ? `${orgName} is connected. `
              : "Start the connection flow to link Xero. "}
        {status?.redirectUri ? `Callback URL: ${status.redirectUri}` : ""}
      </InlineTip>

      {message && (
        <Alert
          variant={
            message.toLowerCase().includes("error") ||
            message.toLowerCase().includes("unable") ||
            message.toLowerCase().includes("failed")
              ? "error"
              : "success"
          }
        >
          {message}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
        <Container className="p-0">
          <div className="p-6 flex flex-col gap-6">
            <SectionTitle
              title="Product Sync"
              subtitle="Choose which Xero income account to use when creating product items."
            />

            {!status?.connected ? (
              <Alert variant="warning">
                <Text size="small">
                  Connect Xero first to choose the product income account.
                </Text>
              </Alert>
            ) : (
              <form className="flex flex-col gap-4" onSubmit={handleSaveSyncSettings}>
                <label className="flex flex-col gap-2">
                  <Label size="small" weight="plus">
                    Income account
                  </Label>
                  <select
                    value={selectedIncomeAccountCode}
                    onChange={(event) => setSelectedIncomeAccountCode(event.target.value)}
                    className="h-10 rounded-md border border-ui-border-base bg-ui-bg-field px-3 text-sm"
                  >
                    <option value="">Select an income account</option>
                    {(status?.incomeAccounts || []).map((account) => (
                      <option key={account.code || account.name} value={account.code || ""}>
                        {account.name || account.code}
                        {account.code ? ` (${account.code})` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <Text size="small" className="text-ui-fg-subtle">
                  Selected: {status?.selectedIncomeAccountName || "Not set"}
                  {status?.selectedIncomeAccountCode
                    ? ` (${status.selectedIncomeAccountCode})`
                    : ""}
                </Text>

                <div className="flex justify-start">
                  <Button
                    type="submit"
                    size="small"
                    isLoading={isSavingSyncSettings}
                    disabled={!selectedIncomeAccountCode}
                  >
                    Save Product Sync Settings
                  </Button>
                </div>
              </form>
            )}
          </div>
        </Container>

        <Container className="p-0">
          <div className="p-6 flex flex-col gap-6">
            <SectionTitle
              title="Organisation Info"
              subtitle="Read-only details about the connected Xero organisation."
            />

            {!status?.connected ? (
              <Alert variant="warning">
                <Text size="small">
                  Connect Xero first to load organisation details.
                </Text>
              </Alert>
            ) : (
              <div className="divide-y divide-ui-border-base">
                <SummaryRow label="Organisation name" value={status?.organisation?.name} />
                <SummaryRow label="Tax number" value={status?.organisation?.taxNumber} />
                <SummaryRow label="Country" value={status?.organisation?.countryCode} />
                <SummaryRow label="Tenant ID" value={status?.tenantId} />
                <SummaryRow label="Connected at" value={status?.connectedAt} />
                <SummaryRow label="Token expires" value={status?.expiresAt} />
              </div>
            )}
          </div>
        </Container>
      </div>
    </div>
  )
}

export default XeroSettingsPage
