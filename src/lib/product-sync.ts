import { createHash } from "crypto"

const asRecord = (value: unknown) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return null
}

export const normalizeSku = (value: unknown) =>
  typeof value === "string" ? value.trim().toUpperCase() : ""

export const normalizeAmount = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

export const normalizeXeroItemForSync = (item: Record<string, unknown>) => {
  const salesDetails = asRecord(item.salesDetails)

  return {
    sku: normalizeSku(item.code),
    name: typeof item.name === "string" ? item.name.trim() : "",
    description:
      typeof item.description === "string" ? item.description.trim() : "",
    price: normalizeAmount(asRecord(salesDetails)?.unitPrice),
  }
}

export const normalizeMedusaProductForSync = (
  product: Record<string, unknown>
) => {
  const variants = Array.isArray(product.variants) ? product.variants : []
  const firstVariant = asRecord(variants[0])
  const prices = Array.isArray(firstVariant?.prices) ? firstVariant.prices : []
  const usdPrice = prices.find(
    (p) => asRecord(p)?.currency_code === "usd"
  )
  const priceAmount = asRecord(usdPrice)?.amount

  return {
    sku: normalizeSku(firstVariant?.sku),
    name: typeof product.title === "string" ? product.title.trim() : "",
    description:
      typeof product.description === "string" ? product.description.trim() : "",
    price: normalizeAmount(
      typeof priceAmount === "number" ? priceAmount / 100 : priceAmount
    ),
  }
}

export const hashProductPayload = (value: Record<string, unknown>) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex")

export const toXeroItemPayload = (
  medusaProduct: Record<string, unknown>,
  incomeAccountCode: string,
  existingXeroItemCode?: string | null
) => {
  const variants = Array.isArray(medusaProduct.variants)
    ? medusaProduct.variants
    : []
  const firstVariant = asRecord(variants[0])
  const prices = Array.isArray(firstVariant?.prices) ? firstVariant.prices : []
  const usdPrice = prices.find(
    (p) => asRecord(p)?.currency_code === "usd"
  )
  const priceAmount = asRecord(usdPrice)?.amount

  const sku = normalizeSku(firstVariant?.sku) || normalizeSku(medusaProduct.id)
  const unitPrice = normalizeAmount(
    typeof priceAmount === "number" ? priceAmount / 100 : priceAmount
  )

  const code = existingXeroItemCode || sku

  return {
    code,
    name:
      typeof medusaProduct.title === "string"
        ? medusaProduct.title.trim()
        : "Unnamed Product",
    description:
      typeof medusaProduct.description === "string"
        ? medusaProduct.description.trim()
        : undefined,
    salesDetails: {
      unitPrice,
      accountCode: incomeAccountCode,
      taxType: "OUTPUT",
    },
    isSold: true,
    isPurchased: false,
  }
}
