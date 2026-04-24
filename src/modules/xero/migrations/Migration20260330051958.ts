import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260330051958 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "xero_connection" ("id" text not null, "provider" text not null default 'xero', "tenant_id" text null, "access_token" text null, "refresh_token" text null, "token_type" text null, "expires_at" timestamptz null, "refresh_token_expires_at" timestamptz null, "raw_token" jsonb null, "connected_at" timestamptz null, "disconnected_at" timestamptz null, "xero_product_income_account_id" text null, "xero_product_income_account_name" text null, "updated_by" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "xero_connection_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_xero_connection_deleted_at" ON "xero_connection" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "xero_contact_link" ("id" text not null, "medusa_customer_id" text not null, "xero_contact_id" text not null, "xero_update_token" text null, "tenant_id" text null, "last_synced_hash" text null, "last_direction" text null, "last_synced_at" timestamptz null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "xero_contact_link_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_xero_contact_link_deleted_at" ON "xero_contact_link" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "xero_invoice_link" ("id" text not null, "medusa_order_id" text not null, "xero_invoice_id" text null, "xero_update_token" text null, "tenant_id" text null, "sync_type" text null, "last_synced_hash" text null, "last_synced_at" timestamptz null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "xero_invoice_link_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_xero_invoice_link_deleted_at" ON "xero_invoice_link" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "xero_connection" cascade;`);
    this.addSql(`drop table if exists "xero_contact_link" cascade;`);
    this.addSql(`drop table if exists "xero_invoice_link" cascade;`);
  }
}
