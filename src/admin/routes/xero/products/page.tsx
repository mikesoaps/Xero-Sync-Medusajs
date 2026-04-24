import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Alert,
  Badge,
  Button,
  Container,
  DataTable,
  DataTablePaginationState,
  Heading,
  StatusBadge,
  Text,
  createDataTableColumnHelper,
  useDataTable,
  toast,
} from "@medusajs/ui"
import { ArrowPathMini } from "@medusajs/icons"
import { sdk } from "../../../lib/client"

type ProductVariantSummary = {
  id: string | null
  title: string | null
  sku: string | null
  manage_inventory: boolean
  xero_item_id: string | null
  xero_active: boolean | null
  xero_type: string | null
  xero_unit_price: number | null
  availability: string[]
}

type UnifiedProductRow = {
  id: string
  medusa_product_id: string | null
  xero_item_ids: string[]
  title: string | null
  subtitle: string | null
  handle: string | null
  status: string | null
  thumbnail: string | null
  product_type: string | null
  collection: string | null
  source: "medusa" | "xero"
  availability: string[]
  product_tags: string[]
  sales_channels: string[]
  variant_count: number
  matched_variant_count: number
  unmatched_variant_count: number
  variants: ProductVariantSummary[]
  xero_name: string | null
  xero_type: string | null
  xero_active: boolean | null
  xero_updated_at: string | null
}

type ProductsStatusResponse = {
  configured: boolean
  connected: boolean
  tenantId?: string
  limit?: number
  missingKeys?: string[]
  xero?: {
    error?: string
  }
  summary: {
    medusa_products: number
    xero_items: number
    matched_variants: number
    missing_variants: number
    xero_only_items: number
  }
  rows: UnifiedProductRow[]
}

type ProductSyncResponse = {
  count?: number
  created?: number
  updated?: number
  skipped?: number
  skipped_variants?: number
  medusa_product_id?: string
  reason?: string
  results?: Array<{
    medusa_product_id?: string
    created?: number
    updated?: number
    skipped?: boolean
    skipped_variants?: number
    reason?: string
    results?: Array<{
      variant_id?: string | null
      sku?: string | null
      skipped?: boolean
      reason?: string
      action?: string
      xero_item_id?: string
    }>
  }>
}

const StatCard = ({
  label,
  value,
}: {
  label: string
  value: string | number
}) => (
  <div className="flex flex-col gap-y-1 rounded-md border border-ui-border-base bg-ui-bg-base px-4 py-3">
    <Text size="xsmall" className="text-ui-fg-subtle">
      {label}
    </Text>
    <Text size="large" weight="plus">
      {value}
    </Text>
  </div>
)

const columnHelper = createDataTableColumnHelper<UnifiedProductRow>()

const XeroProductsPage = () => {
  const queryClient = useQueryClient()
  const [searchValue, setSearchValue] = useState("")
  const [pagination, setPagination] = useState<DataTablePaginationState>({
    pageIndex: 0,
    pageSize: 50,
  })

  const { data, isLoading, isError, error } = useQuery({
    queryFn: async () => {
      const response = await sdk.client.fetch<ProductsStatusResponse>(
        "/admin/xero/products/status",
        {
          query: {
            limit: pagination.pageSize,
            offset: pagination.pageIndex * pagination.pageSize,
          },
        }
      )
      return response
    },
    queryKey: ["xero-products", pagination.pageIndex, pagination.pageSize],
  })

  const syncAllMutation = useMutation({
    mutationFn: async () => {
      return await sdk.client.fetch<ProductSyncResponse>(
        "/admin/xero/products/sync",
        {
          method: "POST",
          body: { sync_all: true },
        }
      )
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["xero-products"] })
      toast.success("Full sync started")
    },
    onError: (e: any) => {
      toast.error(e.message || "Unable to sync all products")
    },
  })

  const syncOneMutation = useMutation({
    mutationFn: async (productId: string) => {
      return await sdk.client.fetch<ProductSyncResponse>(
        `/admin/xero/products/${productId}/sync`,
        {
          method: "POST",
        }
      )
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["xero-products"] })
      toast.success("Product sync completed")
    },
    onError: (e: any) => {
      toast.error(e.message || "Unable to sync product")
    },
  })

  const columns = useMemo(
    () => [
      columnHelper.accessor("thumbnail", {
        header: "",
        cell: ({ getValue }: { getValue: () => string | null }) => (
          <div className="flex items-center justify-center p-1">
            {getValue() ? (
              <img
                src={getValue()!}
                alt="Product thumbnail"
                className="h-8 w-8 rounded-md object-cover border border-ui-border-base"
              />
            ) : (
              <div className="h-8 w-8 rounded-md border border-dashed border-ui-border-base bg-ui-bg-subtle" />
            )}
          </div>
        ),
      }),
      columnHelper.accessor("title", {
        header: "Product",
        cell: ({ row }: { row: { original: UnifiedProductRow } }) => (
          <div className="flex flex-col">
            <Text size="small" weight="plus">
              {row.original.title || row.original.xero_name || "Untitled"}
            </Text>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {row.original.handle || "-"}
            </Text>
          </div>
        ),
      }),
      columnHelper.accessor("source", {
        header: "Source",
        cell: ({ getValue }: { getValue: () => string }) => (
          <Badge color={getValue() === "medusa" ? "blue" : "red"} size="2xsmall">
            {getValue() === "medusa" ? "Medusa" : "Xero Only"}
          </Badge>
        ),
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: ({ getValue }: { getValue: () => string | null }) => {
          const status = getValue()
          if (!status) return "-"
          return (
            <StatusBadge color={status === "published" ? "green" : "grey"}>
              {status}
            </StatusBadge>
          )
        },
      }),
      columnHelper.accessor("variant_count", {
        header: "Variants",
        cell: ({ row }: { row: { original: UnifiedProductRow } }) => (
          <div className="flex flex-col">
            <Text size="small">
              {row.original.matched_variant_count} / {row.original.variant_count} matched
            </Text>
            {row.original.unmatched_variant_count > 0 && (
              <Text size="xsmall" className="text-ui-fg-muted italic">
                {row.original.unmatched_variant_count} missing variants
              </Text>
            )}
          </div>
        ),
      }),
      columnHelper.accessor("xero_active", {
        header: "Xero Active",
        cell: ({ getValue }: { getValue: () => boolean | null }) => {
          const active = getValue()
          if (active === null) return "-"
          return (
            <Badge color={active ? "green" : "red"} size="2xsmall">
              {active ? "Active" : "Inactive"}
            </Badge>
          )
        },
      }),
      columnHelper.action({
        actions: (row: { row: { original: UnifiedProductRow } }) => [
          {
            label: "Sync to Xero",
            onClick: () => syncOneMutation.mutate(row.row.original.medusa_product_id!),
            disabled: !row.row.original.medusa_product_id || syncOneMutation.isPending,
            icon: <ArrowPathMini className="size-4" />,
          },
        ],
      }),
    ],
    [syncOneMutation]
  )

  const table = useDataTable({
    data: data?.rows || [],
    columns,
    rowCount: data?.summary.medusa_products || 0,
    getRowId: (row) => row.id,
    isLoading,
    pagination: {
      state: pagination,
      onPaginationChange: setPagination,
    },
    search: {
      state: searchValue,
      onSearchChange: setSearchValue,
    },
  })

  return (
    <div className="flex flex-col gap-y-4">
      <Container className="p-0 overflow-hidden">
        <div className="flex flex-col gap-y-4 px-6 py-4">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-y-1">
              <Heading level="h1">Xero Products</Heading>
              <Text className="text-ui-fg-subtle" size="small">
                Synchronize Medusa products with Xero. Medusa is the source of truth.
              </Text>
            </div>
            <div className="flex items-center gap-x-2">
              <Badge color={data?.connected ? "green" : "grey"} size="2xsmall">
                {data?.connected ? "Connected" : "Disconnected"}
              </Badge>
              <Button
                size="small"
                variant="primary"
                onClick={() => syncAllMutation.mutate()}
                isLoading={syncAllMutation.isPending}
              >
                Sync All
              </Button>
              <Button
                size="small"
                variant="secondary"
                onClick={() => void queryClient.invalidateQueries({ queryKey: ["xero-products"] })}
                disabled={isLoading}
              >
                <ArrowPathMini className="size-4" />
              </Button>
            </div>
          </div>

          {isError && (
            <Alert variant="error">
              {error?.message || "Unable to load product sync status."}
            </Alert>
          )}

          {data && !data.configured && (
            <Alert variant="warning">
              Xero is not configured. Missing: {(data.missingKeys || []).join(", ")}
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            <StatCard label="Medusa Products" value={data?.summary.medusa_products ?? 0} />
            <StatCard label="Xero Items" value={data?.summary.xero_items ?? 0} />
            <StatCard label="Matched" value={data?.summary.matched_variants ?? 0} />
            <StatCard label="Missing" value={data?.summary.missing_variants ?? 0} />
            <StatCard label="Xero Only" value={data?.summary.xero_only_items ?? 0} />
            <StatCard label="Tenant ID" value={data?.tenantId || "-"} />
            <StatCard label="Limit" value={data?.limit ?? "-"} />
          </div>
        </div>
      </Container>

      <Container className="p-0 overflow-hidden">
        <DataTable instance={table}>
          <DataTable.Toolbar className="flex items-center justify-between px-6 py-4">
            <Heading level="h2">Product List</Heading>
            <div className="flex items-center gap-x-2">
              <DataTable.Search placeholder="Search products..." />
            </div>
          </DataTable.Toolbar>
          <DataTable.Table />
          <DataTable.Pagination />
        </DataTable>
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Products",
  rank: 2,
})

export const handle = {
  breadcrumb: () => "Products",
}

export default XeroProductsPage
