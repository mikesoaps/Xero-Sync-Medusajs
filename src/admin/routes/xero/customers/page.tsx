import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useEffect, useState } from "react"
import {
  Alert,
  Badge,
  Button,
  Container,
  Heading,
  Text,
  toast,
} from "@medusajs/ui"

type CustomerSummary = {
  id: string | null
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  phone?: string | null
  has_account?: boolean | null
  display_name?: string | null
  primary_email?: string | null
  primary_phone?: string | null
  active?: boolean | null
  create_time?: string | null
  update_time?: string | null
}

type MatchSummary = {
  email?: string | null
  medusa_customer_id?: string | null
  xero_contact_id?: string | null
  medusa_name?: string | null
  xero_name?: string | null
}

type CustomersStatusResponse = {
  configured: boolean
  connected: boolean
  tenantId?: string
  missingKeys?: string[]
  medusa: {
    count: number
    normalized: CustomerSummary[]
  }
  xero: {
    count: number
    normalized: CustomerSummary[]
    error?: string
  }
  matches?: MatchSummary[]
}

type SyncItem = {
  status?: string
  reason?: string
}

type SyncResponse = {
  connected: boolean
  created: number
  updated: number
  skipped: number
  items: SyncItem[]
}

const formatName = (customer: CustomerSummary, source: "medusa" | "xero") => {
  if (source === "xero") {
    return (
      customer.display_name ||
      [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
      customer.company_name ||
      "-"
    )
  }

  return (
    [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
    customer.company_name ||
    "-"
  )
}

const formatDate = (value?: string | null) => {
  if (!value) {
    return "-"
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

const StatCard = ({
  label,
  value,
}: {
  label: string
  value: string | number
}) => (
  <Container>
    <Text size="small" className="text-ui-fg-subtle">
      {label}
    </Text>
    <Heading level="h2" className="mt-2">
      {value}
    </Heading>
  </Container>
)

const CustomerList = ({
  title,
  description,
  customers,
  source,
}: {
  title: string
  description: string
  customers: CustomerSummary[]
  source: "medusa" | "xero"
}) => {
  return (
    <Container className="p-0">
      <div className="border-b border-ui-border-base px-6 py-4">
        <Heading level="h2">{title}</Heading>
        <Text size="small" className="mt-1 text-ui-fg-subtle">
          {description}
        </Text>
      </div>

      {customers.length ? (
        <div className="divide-y divide-ui-border-base">
          {customers.map((customer) => (
            <div key={`${source}-${customer.id ?? customer.email}`} className="px-6 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <Text weight="plus">{formatName(customer, source)}</Text>
                  <Text size="small" className="mt-1 text-ui-fg-subtle">
                    {source === "xero" ? customer.primary_email || "-" : customer.email || "-"}
                  </Text>
                </div>
                <div className="flex items-center gap-2">
                  {source === "xero" && (
                    <Badge color={customer.active === false ? "red" : "green"}>
                      {customer.active === false ? "Inactive" : "Active"}
                    </Badge>
                  )}
                  {source === "medusa" && customer.has_account && (
                    <Badge color="green">Account</Badge>
                  )}
                  <Badge color="grey">{customer.id || "-"}</Badge>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-ui-fg-subtle md:grid-cols-2">
                <Text>
                  Phone: {source === "xero" ? customer.primary_phone || "-" : customer.phone || "-"}
                </Text>
                <Text>Company: {customer.company_name || "-"}</Text>
                {source === "xero" && (
                  <>
                    <Text>Updated: {formatDate(customer.update_time)}</Text>
                    <Text>Created: {formatDate(customer.create_time)}</Text>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-6 py-8">
          <Text size="small" className="text-ui-fg-subtle">
            No customers to show yet.
          </Text>
        </div>
      )}
    </Container>
  )
}

const MatchList = ({ matches }: { matches: MatchSummary[] }) => (
  <Container className="p-0">
    <div className="border-b border-ui-border-base px-6 py-4">
      <Heading level="h2">Matched Customers</Heading>
      <Text size="small" className="mt-1 text-ui-fg-subtle">
        Email-based links between Medusa and Xero contacts.
      </Text>
    </div>

    {matches.length ? (
      <div className="divide-y divide-ui-border-base">
        {matches.map((match) => (
          <div
            key={`${match.medusa_customer_id}-${match.xero_contact_id}-${match.email}`}
            className="px-6 py-4"
          >
            <Text weight="plus">{match.email || "-"}</Text>
            <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-ui-fg-subtle md:grid-cols-2">
              <Text>Medusa: {match.medusa_name || "-"} ({match.medusa_customer_id || "-"})</Text>
              <Text>
                Xero: {match.xero_name || "-"} ({match.xero_contact_id || "-"})
              </Text>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="px-6 py-8">
        <Text size="small" className="text-ui-fg-subtle">
          No matched customers found yet.
        </Text>
      </div>
    )}
  </Container>
)

const XeroCustomersPage = () => {
  const [data, setData] = useState<CustomersStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<SyncResponse | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/admin/xero/customers/status")
      const payload = (await response.json()) as CustomersStatusResponse

      if (!response.ok) {
        throw new Error("Unable to load customer status.")
      }

      setData(payload)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load customer status.")
    } finally {
      setLoading(false)
    }
  }

  const runOutboundSync = async () => {
    setSyncing(true)
    setError(null)
    setSyncResult(null)

    try {
      const response = await fetch("/admin/xero/customers/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction: "medusa_to_xero" }),
      })
      const payload = (await response.json()) as SyncResponse

      if (!response.ok) {
        throw new Error("Unable to sync Medusa customers into Xero.")
      }

      setSyncResult(payload)
      await load()
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to sync Medusa customers into Xero."
      )
    } finally {
      setSyncing(false)
    }
  }

  const runReset = async () => {
    if (!confirm("Are you sure you want to clear all customer sync history? This will NOT delete records in Xero, only the mappings in Medusa.")) {
      return
    }

    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/admin/xero/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "customers" }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.message || "Unable to reset sync history.")
      }
      toast.success(payload.message || "Customer sync history reset")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to reset sync history.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const inactiveCount =
    data?.xero.normalized.filter((customer) => customer.active === false).length ?? 0

  return (
    <div className="flex flex-col gap-4">
      <Container className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <Heading level="h1">Xero Customers</Heading>
            <Text className="mt-1 text-ui-fg-subtle">
              Review synced customer records in Medusa and Xero contacts.
            </Text>
          </div>

          <div className="flex items-center gap-2">
            <Badge color={data?.connected ? "green" : "grey"}>
              {data?.connected ? "Connected" : "Not connected"}
            </Badge>
            <Button
              size="small"
              variant="primary"
              onClick={() => void runOutboundSync()}
              isLoading={syncing}
            >
              Sync Medusa to Xero
            </Button>
            <Button
              size="small"
              variant="danger"
              onClick={() => void runReset()}
              isLoading={loading}
            >
              Reset Sync History
            </Button>
            <Button
              size="small"
              variant="secondary"
              onClick={() => void load()}
              isLoading={loading}
            >
              Refresh
            </Button>
          </div>
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        {data && !data.configured && (
          <Alert variant="warning">
            Xero is not configured on the backend. Missing keys:{" "}
            {(data.missingKeys || []).join(", ")}
          </Alert>
        )}

        {data?.xero.error && (
          <Alert variant="warning">{data.xero.error}</Alert>
        )}

        {syncResult && (
          <Alert variant="success">
            Sync finished. Created {syncResult.created}, updated {syncResult.updated},
            skipped {syncResult.skipped}.
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <StatCard label="Tenant ID" value={data?.tenantId || "-"} />
          <StatCard label="Medusa Customers" value={data?.medusa.count ?? 0} />
          <StatCard label="Xero Contacts" value={data?.xero.count ?? 0} />
          <StatCard label="Inactive in Xero" value={inactiveCount} />
        </div>
      </Container>

      <MatchList matches={data?.matches || []} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CustomerList
          title="Medusa Customers"
          description="Customers currently stored in Medusa."
          customers={data?.medusa.normalized || []}
          source="medusa"
        />
        <CustomerList
          title="Xero Contacts"
          description="Contact records returned from Xero."
          customers={data?.xero.normalized || []}
          source="xero"
        />
      </div>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Customers",
})

export const handle = {
  breadcrumb: () => "Customers",
}

export default XeroCustomersPage
