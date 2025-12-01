import { MigrationInterface, QueryRunner } from "typeorm";

export class MakeKnowledgeBaseOrgIdNullable1755029292845
  implements MigrationInterface
{
  name = "MakeKnowledgeBaseOrgIdNullable1755029292845";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "knowledge_bases" DROP CONSTRAINT "FK_efe776d766683b6ff0ceb9751ce"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_KB_NAME"`);
    await queryRunner.query(
      `ALTER TABLE "knowledge_bases" ALTER COLUMN "organizationId" DROP NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_KB_NAME" ON "knowledge_bases" ("name", "organizationId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "knowledge_bases" ADD CONSTRAINT "FK_efe776d766683b6ff0ceb9751ce" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "knowledge_bases" DROP CONSTRAINT "FK_efe776d766683b6ff0ceb9751ce"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_KB_NAME"`);
    await queryRunner.query(
      `ALTER TABLE "knowledge_bases" ALTER COLUMN "organizationId" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_KB_NAME" ON "knowledge_bases" ("name", "organizationId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "knowledge_bases" ADD CONSTRAINT "FK_efe776d766683b6ff0ceb9751ce" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
