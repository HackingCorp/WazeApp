import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrdersAndAppointments1779000000000
  implements MigrationInterface
{
  name = "AddOrdersAndAppointments1779000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enums
    await queryRunner.query(
      `CREATE TYPE "public"."orders_status_enum" AS ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."orders_source_enum" AS ENUM('whatsapp_ai', 'dashboard', 'api')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."appointments_status_enum" AS ENUM('pending', 'confirmed', 'cancelled', 'completed', 'no_show')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."business_hours_dayofweek_enum" AS ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')`,
    );

    // Create orders table
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "orderNumber" character varying NOT NULL,
        "status" "public"."orders_status_enum" NOT NULL DEFAULT 'pending',
        "source" "public"."orders_source_enum" NOT NULL DEFAULT 'whatsapp_ai',
        "clientPhoneNumber" character varying NOT NULL,
        "clientName" character varying,
        "deliveryAddress" jsonb,
        "totalAmount" numeric(12,2) NOT NULL DEFAULT '0',
        "currency" character varying NOT NULL DEFAULT 'XAF',
        "notes" text,
        "cancellationReason" text,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "confirmedAt" TIMESTAMP WITH TIME ZONE,
        "shippedAt" TIMESTAMP WITH TIME ZONE,
        "deliveredAt" TIMESTAMP WITH TIME ZONE,
        "cancelledAt" TIMESTAMP WITH TIME ZONE,
        "organizationId" uuid NOT NULL,
        "agentId" uuid,
        "conversationId" uuid,
        CONSTRAINT "PK_orders" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_orders_orderNumber" UNIQUE ("orderNumber")
      )
    `);

    // Create order_items table
    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "productName" character varying NOT NULL,
        "variantName" character varying,
        "quantity" integer NOT NULL DEFAULT '1',
        "unitPrice" numeric(12,2) NOT NULL,
        "totalPrice" numeric(12,2) NOT NULL,
        "currency" character varying NOT NULL DEFAULT 'XAF',
        "sku" character varying,
        "externalUrl" character varying,
        "orderId" uuid NOT NULL,
        "productId" uuid,
        "variantId" uuid,
        CONSTRAINT "PK_order_items" PRIMARY KEY ("id")
      )
    `);

    // Create appointments table
    await queryRunner.query(`
      CREATE TABLE "appointments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "status" "public"."appointments_status_enum" NOT NULL DEFAULT 'pending',
        "clientPhoneNumber" character varying NOT NULL,
        "clientName" character varying,
        "scheduledDate" date NOT NULL,
        "startTime" time NOT NULL,
        "endTime" time NOT NULL,
        "durationMinutes" integer NOT NULL DEFAULT '30',
        "title" character varying,
        "description" text,
        "cancellationReason" text,
        "organizationId" uuid NOT NULL,
        "agentId" uuid,
        "conversationId" uuid,
        CONSTRAINT "PK_appointments" PRIMARY KEY ("id")
      )
    `);

    // Create business_hours table
    await queryRunner.query(`
      CREATE TABLE "business_hours" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "dayOfWeek" "public"."business_hours_dayofweek_enum" NOT NULL,
        "isOpen" boolean NOT NULL DEFAULT true,
        "openTime" time,
        "closeTime" time,
        "breakStartTime" time,
        "breakEndTime" time,
        "slotDurationMinutes" integer NOT NULL DEFAULT '30',
        "organizationId" uuid NOT NULL,
        "agentId" uuid,
        CONSTRAINT "PK_business_hours" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_BUSINESS_HOURS_ORG_AGENT_DAY" UNIQUE ("organizationId", "agentId", "dayOfWeek")
      )
    `);

    // Create days_off table
    await queryRunner.query(`
      CREATE TABLE "days_off" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "date" date NOT NULL,
        "reason" character varying,
        "allDay" boolean NOT NULL DEFAULT true,
        "startTime" time,
        "endTime" time,
        "organizationId" uuid NOT NULL,
        "agentId" uuid,
        CONSTRAINT "PK_days_off" PRIMARY KEY ("id")
      )
    `);

    // Add appointmentsEnabled to ai_agents
    await queryRunner.query(
      `ALTER TABLE "ai_agents" ADD "appointmentsEnabled" boolean NOT NULL DEFAULT false`,
    );

    // Create indexes
    await queryRunner.query(`CREATE INDEX "IDX_ORDER_ORG" ON "orders" ("organizationId")`);
    await queryRunner.query(`CREATE INDEX "IDX_ORDER_STATUS" ON "orders" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_ORDER_NUMBER" ON "orders" ("orderNumber")`);
    await queryRunner.query(`CREATE INDEX "IDX_ORDER_CLIENT_PHONE" ON "orders" ("clientPhoneNumber")`);
    await queryRunner.query(`CREATE INDEX "IDX_APPOINTMENT_ORG" ON "appointments" ("organizationId")`);
    await queryRunner.query(`CREATE INDEX "IDX_APPOINTMENT_STATUS" ON "appointments" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_APPOINTMENT_DATE" ON "appointments" ("scheduledDate")`);
    await queryRunner.query(`CREATE INDEX "IDX_APPOINTMENT_CLIENT" ON "appointments" ("clientPhoneNumber")`);
    await queryRunner.query(`CREATE INDEX "IDX_BUSINESS_HOURS_ORG" ON "business_hours" ("organizationId")`);
    await queryRunner.query(`CREATE INDEX "IDX_DAY_OFF_ORG" ON "days_off" ("organizationId")`);
    await queryRunner.query(`CREATE INDEX "IDX_DAY_OFF_DATE" ON "days_off" ("date")`);

    // Add foreign keys
    await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_agent" FOREIGN KEY ("agentId") REFERENCES "ai_agents"("id") ON DELETE SET NULL`);
    await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_conversation" FOREIGN KEY ("conversationId") REFERENCES "agent_conversations"("id") ON DELETE SET NULL`);
    await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_order_items_order" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_order_items_product" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL`);
    await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_order_items_variant" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL`);
    await queryRunner.query(`ALTER TABLE "appointments" ADD CONSTRAINT "FK_appointments_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "appointments" ADD CONSTRAINT "FK_appointments_agent" FOREIGN KEY ("agentId") REFERENCES "ai_agents"("id") ON DELETE SET NULL`);
    await queryRunner.query(`ALTER TABLE "appointments" ADD CONSTRAINT "FK_appointments_conversation" FOREIGN KEY ("conversationId") REFERENCES "agent_conversations"("id") ON DELETE SET NULL`);
    await queryRunner.query(`ALTER TABLE "business_hours" ADD CONSTRAINT "FK_business_hours_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "business_hours" ADD CONSTRAINT "FK_business_hours_agent" FOREIGN KEY ("agentId") REFERENCES "ai_agents"("id") ON DELETE SET NULL`);
    await queryRunner.query(`ALTER TABLE "days_off" ADD CONSTRAINT "FK_days_off_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "days_off" ADD CONSTRAINT "FK_days_off_agent" FOREIGN KEY ("agentId") REFERENCES "ai_agents"("id") ON DELETE SET NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    await queryRunner.query(`ALTER TABLE "days_off" DROP CONSTRAINT "FK_days_off_agent"`);
    await queryRunner.query(`ALTER TABLE "days_off" DROP CONSTRAINT "FK_days_off_organization"`);
    await queryRunner.query(`ALTER TABLE "business_hours" DROP CONSTRAINT "FK_business_hours_agent"`);
    await queryRunner.query(`ALTER TABLE "business_hours" DROP CONSTRAINT "FK_business_hours_organization"`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "FK_appointments_conversation"`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "FK_appointments_agent"`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "FK_appointments_organization"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_order_items_variant"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_order_items_product"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_order_items_order"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_conversation"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_agent"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_organization"`);

    // Drop column from ai_agents
    await queryRunner.query(`ALTER TABLE "ai_agents" DROP COLUMN "appointmentsEnabled"`);

    // Drop tables
    await queryRunner.query(`DROP TABLE "days_off"`);
    await queryRunner.query(`DROP TABLE "business_hours"`);
    await queryRunner.query(`DROP TABLE "appointments"`);
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(`DROP TABLE "orders"`);

    // Drop enums
    await queryRunner.query(`DROP TYPE "public"."business_hours_dayofweek_enum"`);
    await queryRunner.query(`DROP TYPE "public"."appointments_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."orders_source_enum"`);
    await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
  }
}
