import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSlugToKnowledgeDocuments1768500000000 implements MigrationInterface {
    name = 'AddSlugToKnowledgeDocuments1768500000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Check if column exists first
        const hasColumn = await queryRunner.hasColumn('knowledge_documents', 'slug');
        if (!hasColumn) {
            // Add slug column for AI image tags [IMAGE:slug]
            await queryRunner.query(`
                ALTER TABLE "knowledge_documents"
                ADD COLUMN "slug" varchar(100)
            `);

            // Add index for faster slug lookups
            await queryRunner.query(`
                CREATE INDEX "IDX_DOC_SLUG" ON "knowledge_documents" ("slug")
            `);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop index first
        const hasIndex = await queryRunner.query(`
            SELECT 1 FROM pg_indexes WHERE indexname = 'IDX_DOC_SLUG'
        `);
        if (hasIndex.length > 0) {
            await queryRunner.query(`DROP INDEX "IDX_DOC_SLUG"`);
        }

        // Drop column
        const hasColumn = await queryRunner.hasColumn('knowledge_documents', 'slug');
        if (hasColumn) {
            await queryRunner.query(`
                ALTER TABLE "knowledge_documents"
                DROP COLUMN "slug"
            `);
        }
    }
}
