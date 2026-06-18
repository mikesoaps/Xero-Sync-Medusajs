import { createHash } from "crypto"

const asRecord = (value: unknown) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return null
}

export const normalizeEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : ""

export const normalizePhone = (value: unknown) =>
  typeof value === "string" ? value.replace(/\D/g, "") : ""

export const parseXeroContactNotes = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) {
    return null
  }

  try {
    const parsed = JSON.parse(value)
    return asRecord(parsed)
  } catch {
    return null
  }
}

export const buildXeroContactNotes = (medusaCustomer: Record<string, unknown>) =>
  JSON.stringify({
    medusa_id: medusaCustomer.id || null,
    has_account: medusaCustomer.has_account ?? false,
    created_at: medusaCustomer.created_at || null,
    updated_at: medusaCustomer.updated_at || null,
    metadata: medusaCustomer.metadata || {},
  })

export const normalizeMedusaCustomerForSync = (
  customer: Record<string, unknown>
) => ({
  email: normalizeEmail(customer.email),
  first_name: typeof customer.first_name === "string" ? customer.first_name.trim() : "",
  last_name: typeof customer.last_name === "string" ? customer.last_name.trim() : "",
  company_name:
    typeof customer.company_name === "string" ? customer.company_name.trim() : "",
  phone: normalizePhone(customer.phone),
})

export const normalizeXeroContactForSync = (
  contact: Record<string, unknown>
) => {
  const phones = Array.isArray(contact.phones) ? contact.phones : []
  const defaultPhone = phones.find(
    (p) => asRecord(p)?.phoneType === "DEFAULT"
  ) || phones[0]

  return {
    email: normalizeEmail(contact.emailAddress),
    first_name: typeof contact.firstName === "string" ? contact.firstName.trim() : "",
    last_name: typeof contact.lastName === "string" ? contact.lastName.trim() : "",
    company_name: typeof contact.name === "string" ? contact.name.trim() : "",
    phone: normalizePhone(asRecord(defaultPhone)?.phoneNumber),
  }
}

export const hashCustomerPayload = (value: Record<string, unknown>) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex")

export const toXeroContactPayload = (
  medusaCustomer: Record<string, unknown>,
  existingXeroContact?: Record<string, unknown> | null
) => {
  const firstName = typeof medusaCustomer.first_name === "string" ? medusaCustomer.first_name.trim() : ""
  const lastName = typeof medusaCustomer.last_name === "string" ? medusaCustomer.last_name.trim() : ""
  const fullName =
    [firstName, lastName].filter(Boolean).join(" ") ||
    (typeof medusaCustomer.email === "string" ? medusaCustomer.email : "Unknown")

  const payload: Record<string, unknown> = {
    name: fullName,
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    emailAddress: medusaCustomer.email || undefined,
  }

  const phone = normalizePhone(medusaCustomer.phone)
  if (phone) {
    payload.phones = [{ phoneType: "DEFAULT", phoneNumber: phone }]
  }

  if (existingXeroContact?.contactID) {
    payload.contactID = existingXeroContact.contactID
  }

  return payload
}

export const toMedusaCustomerInputFromXero = (xeroContact: Record<string, unknown>) => {
  const phones = Array.isArray(xeroContact.phones) ? xeroContact.phones : []
  const defaultPhone =
    phones.find((p) => asRecord(p)?.phoneType === "DEFAULT") || phones[0]

  return {
    email: normalizeEmail(xeroContact.emailAddress) || null,
    first_name:
      typeof xeroContact.firstName === "string"
        ? xeroContact.firstName.trim()
        : null,
    last_name:
      typeof xeroContact.lastName === "string"
        ? xeroContact.lastName.trim()
        : null,
    company_name: null,
    phone: normalizePhone(asRecord(defaultPhone)?.phoneNumber) || null,
  }
}
