import { MigrationInterface, QueryRunner } from 'typeorm';

export class AssignmentRulesAndHistory1791084400516 implements MigrationInterface {
  name = 'AssignmentRulesAndHistory1791084400516';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."assignment_rules_match_source_enum" AS ENUM('website', 'referral', 'campaign', 'social_media', 'manual')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."assignment_rules_match_priority_enum" AS ENUM('low', 'medium', 'high')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."assignment_rules_territory_mode_enum" AS ENUM('required', 'preferred', 'ignore')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."assignment_rules_strategy_enum" AS ENUM('least_workload', 'round_robin')`,
    );
    await queryRunner.query(
      `CREATE TABLE "assignment_rules" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "description" text, "priority" integer NOT NULL DEFAULT '100', "is_active" boolean NOT NULL DEFAULT true, "match_service" character varying, "match_location" character varying, "match_source" "public"."assignment_rules_match_source_enum", "match_priority" "public"."assignment_rules_match_priority_enum", "min_value" numeric(14,2), "max_value" numeric(14,2), "require_specialization" boolean NOT NULL DEFAULT true, "territory_mode" "public"."assignment_rules_territory_mode_enum" NOT NULL DEFAULT 'preferred', "respect_workload_limit" boolean NOT NULL DEFAULT true, "strategy" "public"."assignment_rules_strategy_enum" NOT NULL DEFAULT 'least_workload', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_d7b402648db30763ca1e80bfb2" CHECK ("min_value" IS NULL OR "max_value" IS NULL OR "min_value" <= "max_value"), CONSTRAINT "CHK_7191bb748b39f87dc78212fa2e" CHECK ("priority" BETWEEN 1 AND 10000), CONSTRAINT "PK_b2a701c65267def8d951bd91c2d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_assignment_rules_name" ON "assignment_rules" ("name") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_assignment_rules_active_priority" ON "assignment_rules" ("is_active", "priority") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."assignment_history_action_enum" AS ENUM('assigned', 'reassigned', 'no_eligible')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."assignment_history_mode_enum" AS ENUM('automatic', 'manual')`,
    );
    await queryRunner.query(
      `CREATE TABLE "assignment_history" ("id" SERIAL NOT NULL, "lead_id" integer NOT NULL, "action" "public"."assignment_history_action_enum" NOT NULL, "mode" "public"."assignment_history_mode_enum" NOT NULL, "from_employee_id" integer, "to_employee_id" integer, "rule_id" integer, "rule_name" character varying, "reason" text NOT NULL, "metadata" jsonb, "performed_by_user_id" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9e3ec8e134976ba55ea4043b7bd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_assignment_history_to_employee" ON "assignment_history" ("to_employee_id", "action") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_assignment_history_lead" ON "assignment_history" ("lead_id", "id") `,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."lead_activities_type_enum" RENAME TO "lead_activities_type_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."lead_activities_type_enum" AS ENUM('lead_created', 'lead_updated', 'status_changed', 'note_added', 'assigned', 'reassigned', 'unassigned', 'assignment_failed', 'follow_up_created', 'follow_up_completed', 'follow_up_overdue', 'sla_breached', 'escalated')`,
    );
    await queryRunner.query(
      `ALTER TABLE "lead_activities" ALTER COLUMN "type" TYPE "public"."lead_activities_type_enum" USING "type"::"text"::"public"."lead_activities_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."lead_activities_type_enum_old"`);
    await queryRunner.query(
      `ALTER TABLE "assignment_history" ADD CONSTRAINT "FK_8ab1f214dfbca0daf9d732e0ee1" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_history" ADD CONSTRAINT "FK_a2818739ba4dda008feb3bdd0b3" FOREIGN KEY ("from_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_history" ADD CONSTRAINT "FK_01d71c54e8e8d62f3f91d361be3" FOREIGN KEY ("to_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_history" ADD CONSTRAINT "FK_bd04a7da8436607f3e468418584" FOREIGN KEY ("rule_id") REFERENCES "assignment_rules"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_history" ADD CONSTRAINT "FK_e0b1623d79c3169a27e163890e3" FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "assignment_history" DROP CONSTRAINT "FK_e0b1623d79c3169a27e163890e3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_history" DROP CONSTRAINT "FK_bd04a7da8436607f3e468418584"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_history" DROP CONSTRAINT "FK_01d71c54e8e8d62f3f91d361be3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_history" DROP CONSTRAINT "FK_a2818739ba4dda008feb3bdd0b3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_history" DROP CONSTRAINT "FK_8ab1f214dfbca0daf9d732e0ee1"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."lead_activities_type_enum_old" AS ENUM('lead_created', 'lead_updated', 'status_changed', 'note_added', 'assigned', 'reassigned', 'unassigned', 'follow_up_created', 'follow_up_completed', 'follow_up_overdue', 'sla_breached', 'escalated')`,
    );
    await queryRunner.query(
      `ALTER TABLE "lead_activities" ALTER COLUMN "type" TYPE "public"."lead_activities_type_enum_old" USING "type"::"text"::"public"."lead_activities_type_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."lead_activities_type_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."lead_activities_type_enum_old" RENAME TO "lead_activities_type_enum"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_assignment_history_lead"`);
    await queryRunner.query(`DROP INDEX "public"."idx_assignment_history_to_employee"`);
    await queryRunner.query(`DROP TABLE "assignment_history"`);
    await queryRunner.query(`DROP TYPE "public"."assignment_history_mode_enum"`);
    await queryRunner.query(`DROP TYPE "public"."assignment_history_action_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_assignment_rules_active_priority"`);
    await queryRunner.query(`DROP INDEX "public"."uq_assignment_rules_name"`);
    await queryRunner.query(`DROP TABLE "assignment_rules"`);
    await queryRunner.query(`DROP TYPE "public"."assignment_rules_strategy_enum"`);
    await queryRunner.query(`DROP TYPE "public"."assignment_rules_territory_mode_enum"`);
    await queryRunner.query(`DROP TYPE "public"."assignment_rules_match_priority_enum"`);
    await queryRunner.query(`DROP TYPE "public"."assignment_rules_match_source_enum"`);
  }
}
