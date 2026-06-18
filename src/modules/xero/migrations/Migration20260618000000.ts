import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260618000000 extends Migration {
  override async up(): Promise<void> {
    // Add sync_status and last_error to xero_contact_link
    this.addSql(`ALTER TABLE "xero_contact_link" ADD COLUMN IF NOT EXISTS "sync_status" text NOT NULL DEFAULT 'pending';`)
    this.addSql(`ALTER TABLE "xero_contact_link" ADD COLUMN IF NOT EXISTS "last_error" text NULL;`)

    // Add sync_status, xero_status, and last_error to xero_invoice_link
    this.addSql(`ALTER TABLE "xero_invoice_link" ADD COLUMN IF NOT EXISTS "sync_status" text NOT NULL DEFAULT 'pending';`)
    this.addSql(`ALTER TABLE "xero_invoice_link" ADD COLUMN IF NOT EXISTS "xero_status" text NULL;`)
    this.addSql(`ALTER TABLE "xero_invoice_link" ADD COLUMN IF NOT EXISTS "last_error" text NULL;`)

    // Create xero_payment_link table
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "xero_payment_link" (
        "id" text NOT NULL,
        "medusa_order_id" text NOT NULL,
        "medusa_payment_id" text NULL,
        "xero_invoice_id" text NULL,
        "xero_payment_id" text NULL,
        "payment_amount" numeric NULL,
        "payment_date" timestamptz NULL,
        "payment_reference" text NULL,
        "payment_provider" text NULL,
        "currency_code" text NULL,
        "direction" text NOT NULL DEFAULT 'medusa_to_xero',
        "sync_status" text NOT NULL DEFAULT 'pending',
        "last_synced_at" timestamptz NULL,
        "last_error" text NULL,
        "provider_metadata" jsonb NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        CONSTRAINT "xero_payment_link_pkey" PRIMARY KEY ("id")
      );
    `)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_xero_payment_link_deleted_at" ON "xero_payment_link" ("deleted_at") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_xero_payment_link_medusa_order_id" ON "xero_payment_link" ("medusa_order_id") WHERE deleted_at IS NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "xero_contact_link" DROP COLUMN IF EXISTS "sync_status";`)
    this.addSql(`ALTER TABLE "xero_contact_link" DROP COLUMN IF EXISTS "last_error";`)
    this.addSql(`ALTER TABLE "xero_invoice_link" DROP COLUMN IF EXISTS "sync_status";`)
    this.addSql(`ALTER TABLE "xero_invoice_link" DROP COLUMN IF EXISTS "xero_status";`)
    this.addSql(`ALTER TABLE "xero_invoice_link" DROP COLUMN IF EXISTS "last_error";`)
    this.addSql(`DROP TABLE IF EXISTS "xero_payment_link" CASCADE;`)
  }
}
