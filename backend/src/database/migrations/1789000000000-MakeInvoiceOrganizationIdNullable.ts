import { MigrationInterface, QueryRunner } from "typeorm";

export class MakeInvoiceOrganizationIdNullable1789000000000
  implements MigrationInterface
{
  name = "MakeInvoiceOrganizationIdNullable1789000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // A user (and thus their subscription/invoice) may not belong to an
    // organization, so invoices must allow a NULL organizationId. The strict
    // NOT NULL constraint was breaking trial invoice creation for org-less
    // sign-ups (and silently skipping their welcome email).
    await queryRunner.query(
      `ALTER TABLE "invoices" ALTER COLUMN "organizationId" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoices" ALTER COLUMN "organizationId" SET NOT NULL`,
    );
  }
}
