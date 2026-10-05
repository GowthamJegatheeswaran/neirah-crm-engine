import * as bcrypt from 'bcrypt';
import dataSource from '../data-source';
import { AssignmentRule } from '../../assignment/assignment-rule.entity';
import { Employee } from '../../employees/employee.entity';
import { Lead } from '../../leads/lead.entity';
import { LeadActivity } from '../../leads/lead-activity.entity';
import { ActivityType } from '../../leads/lead.enums';
import { SlaPolicy } from '../../sla/sla-policy.entity';
import { Role } from '../../users/role.enum';
import { User } from '../../users/user.entity';
import { BCRYPT_SALT_ROUNDS } from '../../users/users.service';
import {
  DEMO_EMPLOYEES,
  DEMO_LEADS,
  DEMO_RULES,
  DEMO_SLA_POLICIES,
  DEMO_STAFF_USERS,
} from './demo-data';

/**
 * Loads DEMO data. Safe to run many times (it skips what already exists).
 * Usage: npm run seed
 */
async function seed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to load demo seed data in production');
  }
  const password = process.env.SEED_DEFAULT_PASSWORD;
  if (!password) {
    throw new Error('SEED_DEFAULT_PASSWORD is not set (see .env.example)');
  }

  await dataSource.initialize();
  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  await dataSource.transaction(async (em) => {
    const users = em.getRepository(User);
    const employees = em.getRepository(Employee);
    const leads = em.getRepository(Lead);
    const activities = em.getRepository(LeadActivity);

    const ensureUser = async (email: string, role: Role, isActive = true) => {
      const existing = await users.findOne({ where: { email } });
      return existing ?? users.save(users.create({ email, passwordHash, role, isActive }));
    };

    for (const staff of DEMO_STAFF_USERS) {
      await ensureUser(staff.email, staff.role);
    }

    for (const demo of DEMO_EMPLOYEES) {
      const user = await ensureUser(demo.email, Role.SALES, demo.isActive);
      const exists = await employees.exists({ where: { userId: user.id } });
      if (!exists) {
        await employees.save(
          employees.create({
            userId: user.id,
            fullName: demo.fullName,
            specializations: demo.specializations,
            territory: demo.territory,
            availability: demo.availability,
            isActive: demo.isActive,
            maxWorkload: demo.maxWorkload,
          }),
        );
      }
    }

    const rules = em.getRepository(AssignmentRule);
    for (const demo of DEMO_RULES) {
      if (!(await rules.exists({ where: { name: demo.name } }))) {
        await rules.save(rules.create(demo));
      }
    }

    const slaPolicies = em.getRepository(SlaPolicy);
    for (const demo of DEMO_SLA_POLICIES) {
      if (!(await slaPolicies.exists({ where: { name: demo.name } }))) {
        await slaPolicies.save(slaPolicies.create(demo));
      }
    }

    // Demo leads are created UNASSIGNED on purpose: the assignment engine (Day 3) will assign them.
    if ((await leads.count()) === 0) {
      for (const demo of DEMO_LEADS) {
        const lead = await leads.save(leads.create(demo));
        await activities.save(
          activities.create({
            leadId: lead.id,
            type: ActivityType.LEAD_CREATED,
            description: `Lead created from seed data (source: ${lead.source})`,
            metadata: { source: lead.source, seed: true },
            performedByUserId: null,
          }),
        );
      }
    }
  });

  const [u, e, l] = await Promise.all([
    dataSource.getRepository(User).count(),
    dataSource.getRepository(Employee).count(),
    dataSource.getRepository(Lead).count(),
  ]);
  console.log(`Seed complete: ${u} users, ${e} employees, ${l} leads`);
  await dataSource.destroy();
}

seed().catch(async (err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  if (dataSource.isInitialized) await dataSource.destroy();
  process.exit(1);
});
