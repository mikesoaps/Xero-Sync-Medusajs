import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { XERO_MODULE } from "../modules/xero"
import type XeroModuleService from "../modules/xero/service"
import {
  buildXeroContactNotes,
  hashCustomerPayload,
  normalizeEmail,
  normalizeMedusaCustomerForSync,
  normalizeXeroContactForSync,
  toMedusaCustomerInputFromXero,
  toXeroContactPayload,
} from "./customer-sync"
import {
  archiveXeroContact,
  createXeroContact,
  findXeroContacts,
  getXeroConfig,
  getXeroContact,
  isConnectionExpired,
  refreshOauthToken,
  toStoredConnection,
  updateXeroContact,
} from "./xero"

type ScopeLike = {
  resolve: (name: string) => any
}

type QueryGraph = {
  graph: (input: {
    entity: string
    fields: string[]
    filters?: Record<string, unknown>
  }) => Promise<{ data?: Record<string, unknown>[] }>
}

const asRecord = (value: unknown) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return null
}

export async function getReadyXeroConnection(
  scope: ScopeLike,
  actorId?: string | null
) {
  const xeroService: XeroModuleService = scope.resolve(XERO_MODULE)
  const config = getXeroConfig()

  if (!config.configured) {
    return { xeroService, config, connection: null }
  }

  let connection = await xeroService.getConnection()

  if (connection && connection.refresh_token && isConnectionExpired(connection)) {
    const refreshedToken = await refreshOauthToken(connection, config)

    connection = await xeroService.upsertConnection(
      toStoredConnection(refreshedToken, connection.tenant_id || null, actorId)
    )
  }

  if (!connection?.access_token || !connection?.tenant_id) {
    return { xeroService, config, connection: null }
  }

  return { xeroService, config, connection }
}

export async function getMedusaCustomerById(scope: ScopeLike, customerId: string) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as QueryGraph
  const response = await query.graph({
    entity: "customer",
    fields: [
      "id",
      "email",
      "first_name",
      "last_name",
      "company_name",
      "phone",
      "has_account",
      "metadata",
      "created_at",
      "updated_at",
    ],
    filters: {
      id: customerId,
    },
  })

  return response.data?.[0] ?? null
}

export async function listMedusaCustomers(scope: ScopeLike) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as QueryGraph
  const response = await query.graph({
    entity: "customer",
    fields: [
      "id",
      "email",
      "first_name",
      "last_name",
      "company_name",
      "phone",
      "has_account",
      "metadata",
      "created_at",
      "updated_at",
    ],
  })

  return response.data ?? []
}

export async function syncMedusaCustomerToXero(
  scope: ScopeLike,
  medusaCustomerId: string
) {
  const medusaCustomer = await getMedusaCustomerById(scope, medusaCustomerId)

  if (!medusaCustomer) {
    return { skipped: true, reason: "Customer not found in Medusa." }
  }

  const email = normalizeEmail(medusaCustomer.email)

  if (!email) {
    return { skipped: true, reason: "Customer email is required for Xero sync." }
  }

  const { xeroService, config, connection } = await getReadyXeroConnection(scope)

  if (!connection) {
    return { skipped: true, reason: "Xero is not connected." }
  }

  const medusaHash = hashCustomerPayload(normalizeMedusaCustomerForSync(medusaCustomer))
  const existingLink = await xeroService.getContactLinkByMedusaCustomerId(
    medusaCustomer.id as string
  )

  if (
    existingLink?.last_synced_hash === medusaHash &&
    existingLink?.last_direction === "xero_to_medusa"
  ) {
    return { skipped: true, reason: "Inbound Xero sync already applied." }
  }

  let xeroContact: Record<string, unknown> | null = null

  if (existingLink?.xero_contact_id) {
    xeroContact = await getXeroContact(connection, config, existingLink.xero_contact_id)
  }

  if (!xeroContact) {
    const xeroContacts = await findXeroContacts(connection, config)
    const displayName =
      [medusaCustomer.first_name, medusaCustomer.last_name]
        .filter(Boolean)
        .join(" ") || medusaCustomer.email

    xeroContact =
      xeroContacts.find(
        (contact) =>
          normalizeEmail(contact.emailAddress) === email
      ) ||
      xeroContacts.find(
        (contact) => typeof contact.name === "string" && contact.name.trim() === displayName
      ) ||
      null
  }

  const payload = toXeroContactPayload(medusaCustomer, xeroContact)
  const syncedContact = xeroContact?.contactID
    ? await updateXeroContact(connection, config, xeroContact.contactID as string, payload)
    : await createXeroContact(connection, config, payload)

  if (!syncedContact?.contactID) {
    return { skipped: true, reason: "Xero did not return a persisted contact." }
  }

  await xeroService.upsertContactLink({
    medusa_customer_id: medusaCustomer.id as string,
    xero_contact_id: String(syncedContact.contactID),
    xero_update_token: null,
    tenant_id: connection.tenant_id || null,
    last_synced_hash: medusaHash,
    last_direction: "medusa_to_xero",
    last_synced_at: new Date(),
    metadata: {
      xero_contact_name: syncedContact.name || null,
      notes: buildXeroContactNotes(medusaCustomer),
    },
  })

  return {
    skipped: false,
    medusa_customer_id: medusaCustomer.id,
    xero_contact_id: syncedContact.contactID,
    direction: "medusa_to_xero",
  }
}

export async function syncMedusaCustomersToXero(scope: ScopeLike) {
  const { xeroService, config, connection } = await getReadyXeroConnection(scope)

  if (!connection) {
    return {
      connected: false,
      created: 0,
      updated: 0,
      skipped: 0,
      items: [] as Record<string, unknown>[],
    }
  }

  const medusaCustomers = await listMedusaCustomers(scope)

  let created = 0
  let updated = 0
  let skipped = 0
  const items: Record<string, unknown>[] = []

  for (const medusaCustomer of medusaCustomers) {
    const result = await syncMedusaCustomerToXero(scope, String(medusaCustomer.id))

    if (result.skipped) {
      skipped++
    } else {
      updated++
    }

    items.push(result)
  }

  return {
    connected: true,
    created,
    updated,
    skipped,
    items,
  }
}

export async function deleteMedusaCustomerFromXero(
  scope: ScopeLike,
  medusaCustomerId: string
) {
  const { xeroService, config, connection } = await getReadyXeroConnection(scope)

  if (!connection) {
    return { skipped: true, reason: "Xero is not connected." }
  }

  const existingLink = await xeroService.getContactLinkByMedusaCustomerId(medusaCustomerId)

  if (!existingLink?.xero_contact_id) {
    return { skipped: true, reason: "No Xero contact link found." }
  }

  const xeroContact = await getXeroContact(connection, config, existingLink.xero_contact_id)

  if (!xeroContact?.contactID) {
    return {
      skipped: true,
      reason: "Linked Xero contact was not found.",
      medusa_customer_id: medusaCustomerId,
      xero_contact_id: existingLink.xero_contact_id,
    }
  }

  if (xeroContact.contactStatus === "ARCHIVED") {
    return {
      skipped: true,
      reason: "Xero contact is already archived.",
      medusa_customer_id: medusaCustomerId,
      xero_contact_id: xeroContact.contactID,
      direction: "medusa_to_xero",
    }
  }

  await archiveXeroContact(connection, config, xeroContact.contactID as string)

  await xeroService.upsertContactLink({
    medusa_customer_id: medusaCustomerId,
    xero_contact_id: String(existingLink.xero_contact_id),
    xero_update_token: null,
    tenant_id: connection.tenant_id || null,
    last_synced_hash: existingLink.last_synced_hash || null,
    last_direction: "medusa_delete_to_xero",
    last_synced_at: new Date(),
    metadata: {
      ...((existingLink.metadata as Record<string, unknown> | null) || {}),
      xero_archived: true,
      deleted_in_medusa_at: new Date().toISOString(),
    },
  })

  return {
    skipped: false,
    medusa_customer_id: medusaCustomerId,
    xero_contact_id: xeroContact.contactID,
    direction: "medusa_to_xero",
    status: "archived",
  }
}

export async function syncXeroContactsToMedusa(scope: ScopeLike) {
  const { xeroService, config, connection } = await getReadyXeroConnection(scope)

  if (!connection) {
    return {
      connected: false,
      created: 0,
      updated: 0,
      skipped: 0,
      items: [] as Record<string, unknown>[],
    }
  }

  const medusaCustomers = await listMedusaCustomers(scope)
  const customerModuleService = scope.resolve(Modules.CUSTOMER)
  const xeroContacts = await findXeroContacts(connection, config)

  const medusaById = new Map<string, Record<string, unknown>>()
  const medusaByEmail = new Map<string, Record<string, unknown>>()

  for (const customer of medusaCustomers) {
    if (typeof customer.id === "string") {
      medusaById.set(customer.id, customer)
    }

    const email = normalizeEmail(customer.email)

    if (email) {
      medusaByEmail.set(email, customer)
    }
  }

  let created = 0
  let updated = 0
  let skipped = 0
  const items: Record<string, unknown>[] = []

  for (const xeroContact of xeroContacts) {
    const result = await syncOneXeroContactToMedusa(scope, {
      xeroContact,
      xeroService,
      connection,
      config,
      customerModuleService,
      medusaById,
      medusaByEmail,
    })

    if (result.status === "created") {
      created++
    } else if (result.status === "updated" || result.status === "linked") {
      updated++
    } else {
      skipped++
    }

    items.push(result)
  }

  return {
    connected: true,
    created,
    updated,
    skipped,
    items,
  }
}

async function syncOneXeroContactToMedusa(
  scope: ScopeLike,
  input: {
    xeroContact: Record<string, unknown>
    xeroService: XeroModuleService
    connection: {
      tenant_id?: string | null
      access_token?: string | null
      refresh_token?: string | null
    }
    config: ReturnType<typeof getXeroConfig>
    customerModuleService: any
    medusaById: Map<string, Record<string, unknown>>
    medusaByEmail: Map<string, Record<string, unknown>>
  }
) {
  const {
    xeroContact,
    xeroService,
    connection,
    config,
    customerModuleService,
    medusaById,
    medusaByEmail,
  } = input

  const email = normalizeEmail(xeroContact.emailAddress)

  const existingLink = xeroContact.contactID
    ? await xeroService.getContactLinkByXeroContactId(String(xeroContact.contactID))
    : null

  const existingLinkMetadata = asRecord(existingLink?.metadata)
  const xeroHash = hashCustomerPayload(normalizeXeroContactForSync(xeroContact))

  if (
    existingLink?.last_synced_hash === xeroHash &&
    existingLink?.last_direction === "xero_to_medusa"
  ) {
    return {
      xero_contact_id: xeroContact.contactID,
      status: "skipped",
      reason: "Already synced from Xero.",
    }
  }

  if (
    xeroContact.contactStatus === "ARCHIVED" &&
    typeof existingLinkMetadata?.deleted_in_medusa_at === "string"
  ) {
    return {
      xero_contact_id: xeroContact.contactID,
      status: "skipped",
      reason: "Archived Xero contact was already deleted in Medusa.",
    }
  }

  let medusaCustomer =
    (existingLink?.medusa_customer_id
      ? medusaById.get(existingLink.medusa_customer_id)
      : null) ||
    (email ? medusaByEmail.get(email) : null) ||
    null

  const medusaInput = toMedusaCustomerInputFromXero(xeroContact)

  if (!medusaInput.email) {
    return {
      xero_contact_id: xeroContact.contactID,
      status: "skipped",
      reason: "Xero contact has no email.",
    }
  }

  if (
    xeroContact.contactStatus === "ARCHIVED" &&
    !medusaCustomer &&
    existingLink?.medusa_customer_id
  ) {
    return {
      xero_contact_id: xeroContact.contactID,
      status: "skipped",
      reason: "Archived Xero contact maps to a deleted Medusa customer.",
    }
  }

  let status: "created" | "updated" | "linked" = "created"

  if (medusaCustomer) {
    await customerModuleService.updateCustomers(medusaCustomer.id, medusaInput)
    medusaCustomer = {
      ...medusaCustomer,
      ...medusaInput,
    }
    status = existingLink ? "updated" : "linked"
  } else {
    medusaCustomer = await customerModuleService.createCustomers(medusaInput)
  }

  const resolvedMedusaCustomer = medusaCustomer as Record<string, unknown>

  const normalizedMedusa = {
    ...resolvedMedusaCustomer,
    ...medusaInput,
  }

  await xeroService.upsertContactLink({
    medusa_customer_id: String(resolvedMedusaCustomer.id),
    xero_contact_id: String(xeroContact.contactID),
    xero_update_token: null,
    tenant_id: connection.tenant_id || null,
    last_synced_hash: xeroHash,
    last_direction: "xero_to_medusa",
    last_synced_at: new Date(),
    metadata: {
      xero_contact_name: xeroContact.name || null,
    },
  })

  medusaById.set(String(resolvedMedusaCustomer.id), normalizedMedusa)
  medusaByEmail.set(normalizeEmail(normalizedMedusa.email), normalizedMedusa)

  return {
    xero_contact_id: xeroContact.contactID,
    medusa_customer_id: resolvedMedusaCustomer.id,
    status,
  }
}

export async function syncXeroContactToMedusaById(
  scope: ScopeLike,
  xeroContactId: string
) {
  const { xeroService, config, connection } = await getReadyXeroConnection(scope)

  if (!connection) {
    return {
      connected: false,
      status: "skipped",
      reason: "Xero is not connected.",
    }
  }

  const xeroContact = await getXeroContact(connection, config, xeroContactId)

  if (!xeroContact) {
    return {
      connected: true,
      status: "skipped",
      reason: "Xero contact not found.",
      xero_contact_id: xeroContactId,
    }
  }

  const medusaCustomers = await listMedusaCustomers(scope)
  const customerModuleService = scope.resolve(Modules.CUSTOMER)
  const medusaById = new Map<string, Record<string, unknown>>()
  const medusaByEmail = new Map<string, Record<string, unknown>>()

  for (const customer of medusaCustomers) {
    if (typeof customer.id === "string") {
      medusaById.set(customer.id, customer)
    }

    const email = normalizeEmail(customer.email)

    if (email) {
      medusaByEmail.set(email, customer)
    }
  }

  return {
    connected: true,
    ...(await syncOneXeroContactToMedusa(scope, {
      xeroContact,
      xeroService,
      connection,
      config,
      customerModuleService,
      medusaById,
      medusaByEmail,
    })),
  }
}

export async function deleteXeroContactInMedusa(
  scope: ScopeLike,
  xeroContactId: string
) {
  const { xeroService, connection } = await getReadyXeroConnection(scope)

  if (!connection) {
    return {
      connected: false,
      status: "skipped",
      reason: "Xero is not connected.",
      xero_contact_id: xeroContactId,
    }
  }

  const existingLink = await xeroService.getContactLinkByXeroContactId(xeroContactId)

  if (!existingLink?.medusa_customer_id) {
    return {
      connected: true,
      status: "skipped",
      reason: "No linked Medusa customer found for deleted Xero contact.",
      xero_contact_id: xeroContactId,
    }
  }

  const customerModuleService = scope.resolve(Modules.CUSTOMER)
  await customerModuleService.deleteCustomers(existingLink.medusa_customer_id)

  await xeroService.upsertContactLink({
    medusa_customer_id: existingLink.medusa_customer_id,
    xero_contact_id: xeroContactId,
    xero_update_token: null,
    tenant_id: existingLink.tenant_id || null,
    last_synced_hash: existingLink.last_synced_hash || null,
    last_direction: "xero_delete_to_medusa",
    last_synced_at: new Date(),
    metadata: {
      ...((existingLink.metadata as Record<string, unknown> | null) || {}),
      deleted_in_xero_at: new Date().toISOString(),
    },
  })

  return {
    connected: true,
    status: "deleted",
    medusa_customer_id: existingLink.medusa_customer_id,
    xero_contact_id: xeroContactId,
  }
}
