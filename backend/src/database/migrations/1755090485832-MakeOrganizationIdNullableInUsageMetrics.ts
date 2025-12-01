import { MigrationInterface, QueryRunner } from "typeorm";

export class MakeOrganizationIdNullableInUsageMetrics1755090485832 implements MigrationInterface {
    name = 'MakeOrganizationIdNullableInUsageMetrics1755090485832'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "usage_metrics" DROP CONSTRAINT "FK_62774c349083fb7a20ea328dfa0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_USAGE_ORG_TYPE_DATE"`);
        await queryRunner.query(`ALTER TABLE "usage_metrics" ALTER COLUMN "organizationId" DROP NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_USAGE_ORG_TYPE_DATE" ON "usage_metrics" ("organizationId", "type", "date") `);
        await queryRunner.query(`ALTER TABLE "usage_metrics" ADD CONSTRAINT "FK_62774c349083fb7a20ea328dfa0" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "usage_metrics" DROP CONSTRAINT "FK_62774c349083fb7a20ea328dfa0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_USAGE_ORG_TYPE_DATE"`);
        await queryRunner.query(`ALTER TABLE "usage_metrics" ALTER COLUMN "organizationId" SET NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_USAGE_ORG_TYPE_DATE" ON "usage_metrics" ("type", "date", "organizationId") `);
        await queryRunner.query(`ALTER TABLE "usage_metrics" ADD CONSTRAINT "FK_62774c349083fb7a20ea328dfa0" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
