import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCurrencyToSubscriptions1757325870641 implements MigrationInterface {
    name = 'AddCurrencyToSubscriptions1757325870641'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "subscriptions" ADD "currency" character varying NOT NULL DEFAULT 'USD'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "currency"`);
    }
}