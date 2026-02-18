import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangeSimpleArrayToJsonb1773000000000 implements MigrationInterface {
    name = 'ChangeSimpleArrayToJsonb1773000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Convert contact_ids from comma-separated text to jsonb
        const hasContactIds = await queryRunner.hasColumn('broadcast_campaigns', 'contact_ids');
        if (hasContactIds) {
            await queryRunner.query(`
                ALTER TABLE "broadcast_campaigns"
                ALTER COLUMN "contact_ids" TYPE jsonb
                USING CASE
                    WHEN "contact_ids" IS NULL THEN '[]'::jsonb
                    WHEN "contact_ids" = '' THEN '[]'::jsonb
                    ELSE to_jsonb(string_to_array("contact_ids", ','))
                END
            `);
            await queryRunner.query(`
                ALTER TABLE "broadcast_campaigns"
                ALTER COLUMN "contact_ids" SET DEFAULT '[]'::jsonb
            `);
        }

        // Convert media_urls from comma-separated text to jsonb
        const hasMediaUrls = await queryRunner.hasColumn('broadcast_campaigns', 'media_urls');
        if (hasMediaUrls) {
            await queryRunner.query(`
                ALTER TABLE "broadcast_campaigns"
                ALTER COLUMN "media_urls" TYPE jsonb
                USING CASE
                    WHEN "media_urls" IS NULL THEN '[]'::jsonb
                    WHEN "media_urls" = '' THEN '[]'::jsonb
                    ELSE to_jsonb(string_to_array("media_urls", ','))
                END
            `);
            await queryRunner.query(`
                ALTER TABLE "broadcast_campaigns"
                ALTER COLUMN "media_urls" SET DEFAULT '[]'::jsonb
            `);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert to text (simple-array)
        await queryRunner.query(`
            ALTER TABLE "broadcast_campaigns"
            ALTER COLUMN "contact_ids" TYPE text
            USING CASE
                WHEN "contact_ids" IS NULL THEN NULL
                ELSE array_to_string(ARRAY(SELECT jsonb_array_elements_text("contact_ids")), ',')
            END
        `);
        await queryRunner.query(`
            ALTER TABLE "broadcast_campaigns"
            ALTER COLUMN "media_urls" TYPE text
            USING CASE
                WHEN "media_urls" IS NULL THEN NULL
                ELSE array_to_string(ARRAY(SELECT jsonb_array_elements_text("media_urls")), ',')
            END
        `);
    }
}
