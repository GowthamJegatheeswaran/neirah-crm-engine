import { MigrationInterface, QueryRunner } from 'typeorm';

export class SlaAndEscalations1791168759382 implements MigrationInterface {
  name = 'SlaAndEscalations1791168759382';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."sla_policies_match_priority_enum" AS ENUM('low', 'medium', 'high')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."sla_policies_match_source_enum" AS ENUM('website', 'referral', 'campaign', 'social_media', 'manual')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."sla_policies_action_enum" AS ENUM('flag', 'reassign')`,
    );
    await queryRunner.query(
      `CREATE TABLE "sla_policies" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "description" text, "priority" integer NOT NULL DEFAULT '100', "is_active" boolean NOT NULL DEFAULT true, "match_priority" "public"."sla_policies_match_priority_enum", "match_service" character varying, "match_source" "public"."sla_policies_match_source_enum", "min_value" numeric(14,2), "max_value" numeric(14,2), "response_minutes" integer NOT NULL, "action" "public"."sla_policies_action_enum" NOT NULL DEFAULT 'flag', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_dfa868a4c81f18582eb5f7e453" CHECK ("min_value" IS NULL OR "max_value" IS NULL OR "min_value" <= "max_value"), CONSTRAINT "CHK_a122a1acdbf1650fa19b4c5650" CHECK ("response_minutes" BETWEEN 1 AND 525600), CONSTRAINT "CHK_41e88f693c71c5602dd2c5bc4b" CHECK ("priority" BETWEEN 1 AND 10000), CONSTRAINT "PK_41b6803cef982534243a67b6302" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sla_policies_active_priority" ON "sla_policies" ("is_active", "priority") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_sla_policies_name" ON "sla_policies" ("name") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."lead_escalations_action_enum" AS ENUM('flag', 'reassign')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."lead_escalations_outcome_enum" AS ENUM('flagged', 'reassigned', 'no_eligible')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."lead_escalations_reference_type_enum" AS ENUM('assignment', 'activity')`,
    );
    await queryRunner.query(
      `CREATE TABLE "lead_escalations" ("id" SERIAL NOT NULL, "lead_id" integer NOT NULL, "policy_id" integer, "policy_name" character varying NOT NULL, "response_minutes" integer NOT NULL, "action" "public"."lead_escalations_action_enum" NOT NULL, "outcome" "public"."lead_escalations_outcome_enum" NOT NULL, "from_employee_id" integer, "to_employee_id" integer, "reason" text NOT NULL, "reference_type" "public"."lead_escalations_reference_type_enum" NOT NULL, "reference_id" integer NOT NULL, "reference_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ee07a050daa7883afd4ffc6a83e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_lead_escalations_lead" ON "lead_escalations" ("lead_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_lead_escalations_created" ON "lead_escalations" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_lead_escalations_reference" ON "lead_escalations" ("lead_id", "reference_type", "reference_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "lead_escalations" ADD CONSTRAINT "FK_bd365e05d98c1a7b30f7c7c44a7" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "lead_escalations" ADD CONSTRAINT "FK_265c3b7bf1e378eeefa9b858c0c" FOREIGN KEY ("policy_id") REFERENCES "sla_policies"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "lead_escalations" ADD CONSTRAINT "FK_6c8a47b6a93023c2ddd5e3e83f3" FOREIGN KEY ("from_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "lead_escalations" ADD CONSTRAINT "FK_20bbd2841e304e45c2aad64ffe5" FOREIGN KEY ("to_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "lead_escalations" DROP CONSTRAINT "FK_20bbd2841e304e45c2aad64ffe5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lead_escalations" DROP CONSTRAINT "FK_6c8a47b6a93023c2ddd5e3e83f3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lead_escalations" DROP CONSTRAINT "FK_265c3b7bf1e378eeefa9b858c0c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lead_escalations" DROP CONSTRAINT "FK_bd365e05d98c1a7b30f7c7c44a7"`,
    );
    await queryRunner.query(`DROP INDEX "public"."uq_lead_escalations_reference"`);
    await queryRunner.query(`DROP INDEX "public"."idx_lead_escalations_created"`);
    await queryRunner.query(`DROP INDEX "public"."idx_lead_escalations_lead"`);
    await queryRunner.query(`DROP TABLE "lead_escalations"`);
    await queryRunner.query(`DROP TYPE "public"."lead_escalations_reference_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."lead_escalations_outcome_enum"`);
    await queryRunner.query(`DROP TYPE "public"."lead_escalations_action_enum"`);
    await queryRunner.query(`DROP INDEX "public"."uq_sla_policies_name"`);
    await queryRunner.query(`DROP INDEX "public"."idx_sla_policies_active_priority"`);
    await queryRunner.query(`DROP TABLE "sla_policies"`);
    await queryRunner.query(`DROP TYPE "public"."sla_policies_action_enum"`);
    await queryRunner.query(`DROP TYPE "public"."sla_policies_match_source_enum"`);
    await queryRunner.query(`DROP TYPE "public"."sla_policies_match_priority_enum"`);
  }
}
