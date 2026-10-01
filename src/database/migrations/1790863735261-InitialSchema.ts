import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1790863735261 implements MigrationInterface {
    name = 'InitialSchema1790863735261'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'manager', 'sales')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" SERIAL NOT NULL, "email" character varying NOT NULL, "password_hash" character varying NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'sales', "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."employees_availability_enum" AS ENUM('available', 'busy', 'on_leave', 'unavailable')`);
        await queryRunner.query(`CREATE TABLE "employees" ("id" SERIAL NOT NULL, "user_id" integer, "full_name" character varying NOT NULL, "specializations" text array NOT NULL DEFAULT '{}', "territory" character varying NOT NULL, "availability" "public"."employees_availability_enum" NOT NULL DEFAULT 'available', "is_active" boolean NOT NULL DEFAULT true, "max_workload" integer NOT NULL DEFAULT '10', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_2d83c53c3e553a48dadb9722e38" UNIQUE ("user_id"), CONSTRAINT "REL_2d83c53c3e553a48dadb9722e3" UNIQUE ("user_id"), CONSTRAINT "CHK_892aa5b7c38f2855323c3ede55" CHECK ("max_workload" > 0), CONSTRAINT "PK_b9535a98350d5b26e7eb0c26af4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_employees_availability" ON "employees" ("availability", "is_active") `);
        await queryRunner.query(`CREATE INDEX "idx_employees_territory" ON "employees" ("territory") `);
        await queryRunner.query(`CREATE TYPE "public"."leads_source_enum" AS ENUM('website', 'referral', 'campaign', 'social_media', 'manual')`);
        await queryRunner.query(`CREATE TYPE "public"."leads_priority_enum" AS ENUM('low', 'medium', 'high')`);
        await queryRunner.query(`CREATE TYPE "public"."leads_status_enum" AS ENUM('new', 'assigned', 'contacted', 'qualified', 'follow_up', 'converted', 'lost')`);
        await queryRunner.query(`CREATE TABLE "leads" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "email" character varying, "phone" character varying, "company" character varying, "source" "public"."leads_source_enum" NOT NULL DEFAULT 'manual', "service" character varying NOT NULL, "location" character varying NOT NULL, "estimated_value" numeric(14,2) NOT NULL DEFAULT '0', "priority" "public"."leads_priority_enum" NOT NULL DEFAULT 'medium', "status" "public"."leads_status_enum" NOT NULL DEFAULT 'new', "assigned_employee_id" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_717450b3dd9f3db0559f56d209" CHECK ("estimated_value" >= 0), CONSTRAINT "PK_cd102ed7a9a4ca7d4d8bfeba406" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_leads_created_at" ON "leads" ("created_at") `);
        await queryRunner.query(`CREATE INDEX "idx_leads_priority" ON "leads" ("priority") `);
        await queryRunner.query(`CREATE INDEX "idx_leads_service_location" ON "leads" ("service", "location") `);
        await queryRunner.query(`CREATE INDEX "idx_leads_assigned_employee" ON "leads" ("assigned_employee_id") `);
        await queryRunner.query(`CREATE INDEX "idx_leads_status" ON "leads" ("status") `);
        await queryRunner.query(`CREATE TYPE "public"."lead_activities_type_enum" AS ENUM('lead_created', 'lead_updated', 'status_changed', 'note_added', 'assigned', 'reassigned', 'unassigned', 'follow_up_created', 'follow_up_completed', 'follow_up_overdue', 'sla_breached', 'escalated')`);
        await queryRunner.query(`CREATE TABLE "lead_activities" ("id" SERIAL NOT NULL, "lead_id" integer NOT NULL, "type" "public"."lead_activities_type_enum" NOT NULL, "description" text NOT NULL, "metadata" jsonb, "performed_by_user_id" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1aa1cc6988a817368568ca26bf1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_lead_activities_lead_created" ON "lead_activities" ("lead_id", "created_at") `);
        await queryRunner.query(`ALTER TABLE "employees" ADD CONSTRAINT "FK_2d83c53c3e553a48dadb9722e38" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "leads" ADD CONSTRAINT "FK_a00006650dbd8fce154b935690e" FOREIGN KEY ("assigned_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lead_activities" ADD CONSTRAINT "FK_26316cb0e146683e9e8aee237d4" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lead_activities" ADD CONSTRAINT "FK_ae2095b980a3e572b9827942db9" FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lead_activities" DROP CONSTRAINT "FK_ae2095b980a3e572b9827942db9"`);
        await queryRunner.query(`ALTER TABLE "lead_activities" DROP CONSTRAINT "FK_26316cb0e146683e9e8aee237d4"`);
        await queryRunner.query(`ALTER TABLE "leads" DROP CONSTRAINT "FK_a00006650dbd8fce154b935690e"`);
        await queryRunner.query(`ALTER TABLE "employees" DROP CONSTRAINT "FK_2d83c53c3e553a48dadb9722e38"`);
        await queryRunner.query(`DROP INDEX "public"."idx_lead_activities_lead_created"`);
        await queryRunner.query(`DROP TABLE "lead_activities"`);
        await queryRunner.query(`DROP TYPE "public"."lead_activities_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."idx_leads_status"`);
        await queryRunner.query(`DROP INDEX "public"."idx_leads_assigned_employee"`);
        await queryRunner.query(`DROP INDEX "public"."idx_leads_service_location"`);
        await queryRunner.query(`DROP INDEX "public"."idx_leads_priority"`);
        await queryRunner.query(`DROP INDEX "public"."idx_leads_created_at"`);
        await queryRunner.query(`DROP TABLE "leads"`);
        await queryRunner.query(`DROP TYPE "public"."leads_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."leads_priority_enum"`);
        await queryRunner.query(`DROP TYPE "public"."leads_source_enum"`);
        await queryRunner.query(`DROP INDEX "public"."idx_employees_territory"`);
        await queryRunner.query(`DROP INDEX "public"."idx_employees_availability"`);
        await queryRunner.query(`DROP TABLE "employees"`);
        await queryRunner.query(`DROP TYPE "public"."employees_availability_enum"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    }

}
