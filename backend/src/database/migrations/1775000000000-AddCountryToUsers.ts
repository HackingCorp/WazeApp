import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCountryToUsers1775000000000 implements MigrationInterface {
    name = 'AddCountryToUsers1775000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const hasColumn = await queryRunner.hasColumn('users', 'country');
        if (!hasColumn) {
            await queryRunner.query(`
                ALTER TABLE "users"
                ADD COLUMN "country" character varying(2) DEFAULT NULL
            `);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const hasColumn = await queryRunner.hasColumn('users', 'country');
        if (hasColumn) {
            await queryRunner.query(`
                ALTER TABLE "users"
                DROP COLUMN "country"
            `);
        }
    }
}
