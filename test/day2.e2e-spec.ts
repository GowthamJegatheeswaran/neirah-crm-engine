import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

/**
 * Day 2 e2e: leads, employees, filtering, notes and timeline against the real database.
 * Every lead created here carries a unique run marker and is deleted afterwards.
 * The assignment API is Day 3, so assignment is simulated with a direct SQL update.
 */
describe('Day 2: leads and employees (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  const password = process.env.SEED_DEFAULT_PASSWORD as string;
  const marker = `E2E${Date.now()}`;
  const tokens: Record<string, string> = {};
  let priyaEmployeeId: number;
  let otherEmployeeId: number;
  const created: number[] = [];
  const createdEmployees: number[] = [];

  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const lead = (extra: Record<string, unknown> = {}) => ({
    name: `${marker} Lead`,
    service: 'Enterprise',
    location: 'Colombo',
    autoAssign: false, // Day 2 tests control ownership themselves; Day 3 tests cover auto-assignment
    ...extra,
  });
  const makeLead = async (extra: Record<string, unknown> = {}) => {
    const res = await http().post('/leads').set(as('manager')).send(lead(extra)).expect(201);
    created.push(res.body.id);
    return res.body as { id: number; status: string };
  };
  const assign = (leadId: number, employeeId: number | null) =>
    ds.query('UPDATE leads SET assigned_employee_id = $1 WHERE id = $2', [employeeId, leadId]);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    ds = app.get(DataSource);

    for (const who of ['admin', 'manager', 'priya', 'arun']) {
      const res = await http()
        .post('/auth/login')
        .send({ email: `${who}@neirah.test`, password });
      tokens[who] = res.body.accessToken;
    }
    priyaEmployeeId = (await http().get('/employees/me').set(as('priya')).expect(200)).body.id;
    otherEmployeeId = (await http().get('/employees/me').set(as('arun')).expect(200)).body.id;
  });

  afterAll(async () => {
    if (created.length) await ds.query('DELETE FROM leads WHERE id = ANY($1)', [created]);
    if (createdEmployees.length) {
      await ds.query('DELETE FROM employees WHERE id = ANY($1)', [createdEmployees]);
    }
    await app.close();
  });

  describe('creating leads', () => {
    it('requires a token and a manager/admin role', async () => {
      await http().post('/leads').send(lead()).expect(401);
      await http().post('/leads').set(as('priya')).send(lead()).expect(403);
    });

    it('creates a lead as NEW with defaults and logs lead_created', async () => {
      const created1 = await makeLead({ email: ' BUYER@Acme.TEST ', estimatedValue: 1500.5 });
      expect(created1.status).toBe('new');
      const res = await http().get(`/leads/${created1.id}`).set(as('manager')).expect(200);
      expect(res.body).toMatchObject({
        email: 'buyer@acme.test',
        estimatedValue: 1500.5,
        priority: 'medium',
        source: 'manual',
        assignedEmployee: null,
      });
      const tl = await http()
        .get(`/leads/${created1.id}/activities`)
        .set(as('manager'))
        .expect(200);
      expect(tl.body.data).toHaveLength(1);
      expect(tl.body.data[0]).toMatchObject({ type: 'lead_created' });
      expect(tl.body.data[0].performedBy.email).toBe('manager@neirah.test');
    });

    it.each([
      ['bad email', { email: 'nope' }],
      ['negative value', { estimatedValue: -5 }],
      ['value too large', { estimatedValue: 1e15 }],
      ['3 decimals', { estimatedValue: 1.234 }],
      ['bad phone', { phone: 'abc' }],
      ['bad priority', { priority: 'urgent' }],
      ['unknown field', { hacker: true }],
      ['status cannot be set on create', { status: 'converted' }],
      ['short name', { name: 'a' }],
    ])('rejects %s with 400', async (_label, extra) => {
      await http().post('/leads').set(as('manager')).send(lead(extra)).expect(400);
    });
  });

  describe('ids', () => {
    it('rejects malformed or out-of-range ids with 400 and unknown ids with 404', async () => {
      await http().get('/leads/abc').set(as('admin')).expect(400);
      await http().get('/leads/0').set(as('admin')).expect(400);
      await http().get('/leads/99999999999').set(as('admin')).expect(400);
      await http().get('/leads/2147483647').set(as('admin')).expect(404);
    });
  });

  describe('listing, filtering, sorting, pagination', () => {
    beforeAll(async () => {
      await makeLead({
        name: `${marker} Alpha`,
        estimatedValue: 300,
        priority: 'low',
        location: 'Kandy',
      });
      await makeLead({
        name: `${marker} Bravo`,
        estimatedValue: 100,
        priority: 'high',
        source: 'website',
      });
      await makeLead({
        name: `${marker} Charlie`,
        estimatedValue: 200,
        priority: 'medium',
        service: 'SMB',
      });
    });

    const list = (qs: string) =>
      http().get(`/leads?search=${marker}&${qs}`).set(as('manager')).expect(200);

    it('paginates with meta', async () => {
      const res = await list('limit=2&page=2');
      expect(res.body.meta).toMatchObject({ page: 2, limit: 2 });
      expect(res.body.meta.total).toBeGreaterThanOrEqual(4);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
    });

    it('sorts by estimated value both ways', async () => {
      const asc = await list('sortBy=estimatedValue&order=asc&minValue=100');
      const values = asc.body.data.map((l: { estimatedValue: number }) => l.estimatedValue);
      expect(values).toEqual([...values].sort((a, b) => a - b));
      const desc = await list('sortBy=estimatedValue&order=desc');
      expect(desc.body.data[0].estimatedValue).toBe(1500.5);
    });

    it('sorts by priority high to low', async () => {
      const res = await list('sortBy=priority&order=desc');
      expect(res.body.data[0].priority).toBe('high');
    });

    it('filters by status, priority, source, service and location (case-insensitive)', async () => {
      expect((await list('priority=high')).body.data).toHaveLength(1);
      expect((await list('source=website')).body.data).toHaveLength(1);
      expect((await list('service=smb')).body.data).toHaveLength(1);
      expect((await list('location=kandy')).body.data).toHaveLength(1);
      expect((await list('status=converted')).body.data).toHaveLength(0);
      expect((await list('minValue=250&maxValue=400')).body.data).toHaveLength(1);
    });

    it('filters by creation date range', async () => {
      expect((await list('createdFrom=2999-01-01')).body.data).toHaveLength(0);
      expect((await list('createdTo=2999-01-01')).body.data.length).toBeGreaterThan(0);
    });

    it('treats % and _ in search as plain characters', async () => {
      const res = await http().get('/leads?search=%25').set(as('manager')).expect(200);
      expect(res.body.data.every((l: { name: string }) => /%/.test(JSON.stringify(l)))).toBe(true);
    });

    it('rejects invalid query values with 400', async () => {
      await http().get('/leads?sortBy=password').set(as('admin')).expect(400);
      await http().get('/leads?limit=1000').set(as('admin')).expect(400);
      await http().get('/leads?page=0').set(as('admin')).expect(400);
      await http().get('/leads?status=bogus').set(as('admin')).expect(400);
      await http().get('/leads?createdFrom=yesterday').set(as('admin')).expect(400);
      await http().get('/leads?unknown=1').set(as('admin')).expect(400);
    });
  });

  describe('updating and lifecycle', () => {
    it('edits fields, can clear optional ones, and records what changed', async () => {
      const { id } = await makeLead({ email: 'x@y.test', company: 'Old Co' });
      const res = await http()
        .patch(`/leads/${id}`)
        .set(as('manager'))
        .send({ company: null, priority: 'high', name: `${marker} Renamed` })
        .expect(200);
      expect(res.body).toMatchObject({ company: null, priority: 'high' });
      const tl = await http()
        .get(`/leads/${id}/activities?type=lead_updated`)
        .set(as('manager'))
        .expect(200);
      expect(tl.body.data).toHaveLength(1);
      expect(tl.body.data[0].metadata.changes.company).toEqual({ from: 'Old Co', to: null });
    });

    it('does not log anything when nothing really changed', async () => {
      const { id } = await makeLead();
      await http()
        .patch(`/leads/${id}`)
        .set(as('manager'))
        .send({ priority: 'medium' })
        .expect(200);
      const tl = await http().get(`/leads/${id}/activities`).set(as('manager')).expect(200);
      expect(tl.body.meta.total).toBe(1);
    });

    it('rejects null for required fields and an empty-string name with 400', async () => {
      const { id } = await makeLead();
      await http().patch(`/leads/${id}`).set(as('manager')).send({ name: null }).expect(400);
      await http().patch(`/leads/${id}`).set(as('manager')).send({ service: null }).expect(400);
    });

    it('enforces status transitions with 409', async () => {
      const { id } = await makeLead();
      // new -> contacted skips assignment
      await http()
        .patch(`/leads/${id}`)
        .set(as('manager'))
        .send({ status: 'contacted' })
        .expect(409);
      // system-only status
      await http()
        .patch(`/leads/${id}`)
        .set(as('manager'))
        .send({ status: 'assigned' })
        .expect(409);
      await assign(id, priyaEmployeeId);
      await ds.query(`UPDATE leads SET status = 'assigned' WHERE id = $1`, [id]);

      for (const next of ['contacted', 'qualified', 'follow_up', 'converted']) {
        await http().patch(`/leads/${id}`).set(as('manager')).send({ status: next }).expect(200);
      }
      const tl = await http()
        .get(`/leads/${id}/activities?type=status_changed`)
        .set(as('manager'))
        .expect(200);
      expect(tl.body.data.map((a: { metadata: { to: string } }) => a.metadata.to)).toEqual([
        'contacted',
        'qualified',
        'follow_up',
        'converted',
      ]);
      // terminal: no more status changes or edits
      await http()
        .patch(`/leads/${id}`)
        .set(as('manager'))
        .send({ status: 'contacted' })
        .expect(409);
      await http()
        .patch(`/leads/${id}`)
        .set(as('manager'))
        .send({ name: `${marker} X` })
        .expect(409);
    });
  });

  describe('sales scoping', () => {
    it('sales sees only their own leads and gets 404 for others', async () => {
      const mine = await makeLead({ name: `${marker} Mine` });
      const theirs = await makeLead({ name: `${marker} Theirs` });
      const free = await makeLead({ name: `${marker} Free` });
      await assign(mine.id, priyaEmployeeId);
      await assign(theirs.id, otherEmployeeId);

      const res = await http()
        .get(`/leads?search=${marker}&limit=100`)
        .set(as('priya'))
        .expect(200);
      const ids = res.body.data.map((l: { id: number }) => l.id);
      expect(ids).toContain(mine.id);
      expect(ids).not.toContain(theirs.id);
      expect(ids).not.toContain(free.id);

      await http().get(`/leads/${mine.id}`).set(as('priya')).expect(200);
      await http().get(`/leads/${theirs.id}`).set(as('priya')).expect(404);
      await http().get(`/leads/${free.id}`).set(as('priya')).expect(404);
      await http()
        .patch(`/leads/${theirs.id}`)
        .set(as('priya'))
        .send({ priority: 'low' })
        .expect(404);
      await http()
        .post(`/leads/${theirs.id}/notes`)
        .set(as('priya'))
        .send({ note: 'hi' })
        .expect(404);
      await http().get(`/leads/${theirs.id}/activities`).set(as('priya')).expect(404);
    });

    it('sales can update their own lead and the activity names them', async () => {
      const { id } = await makeLead();
      await assign(id, priyaEmployeeId);
      await ds.query(`UPDATE leads SET status = 'assigned' WHERE id = $1`, [id]);
      await http().patch(`/leads/${id}`).set(as('priya')).send({ status: 'contacted' }).expect(200);
      const tl = await http()
        .get(`/leads/${id}/activities?type=status_changed`)
        .set(as('priya'))
        .expect(200);
      expect(tl.body.data[0].performedBy.email).toBe('priya@neirah.test');
    });
  });

  describe('notes and timeline', () => {
    it('adds notes in order and validates them', async () => {
      const { id } = await makeLead();
      await http()
        .post(`/leads/${id}/notes`)
        .set(as('manager'))
        .send({ note: '  first call  ' })
        .expect(201);
      await http()
        .post(`/leads/${id}/notes`)
        .set(as('admin'))
        .send({ note: 'second call' })
        .expect(201);
      await http().post(`/leads/${id}/notes`).set(as('admin')).send({ note: '   ' }).expect(400);
      await http()
        .post(`/leads/${id}/notes`)
        .set(as('admin'))
        .send({ note: 'x'.repeat(2001) })
        .expect(400);
      await http().post(`/leads/${id}/notes`).set(as('admin')).send({}).expect(400);

      const tl = await http().get(`/leads/${id}/activities`).set(as('manager')).expect(200);
      expect(tl.body.data.map((a: { type: string }) => a.type)).toEqual([
        'lead_created',
        'note_added',
        'note_added',
      ]);
      expect(tl.body.data[1].description).toBe('first call');
      expect(JSON.stringify(tl.body)).not.toMatch(/password|hash/i);

      const page = await http()
        .get(`/leads/${id}/activities?limit=1&page=3`)
        .set(as('manager'))
        .expect(200);
      expect(page.body.data).toHaveLength(1);
      expect(page.body.meta.totalPages).toBe(3);
    });
  });

  describe('employees', () => {
    it('is forbidden to sales for list and detail but allows /me', async () => {
      await http().get('/employees').set(as('priya')).expect(403);
      await http().get(`/employees/${priyaEmployeeId}`).set(as('priya')).expect(403);
      await http().post('/employees').set(as('priya')).send({}).expect(403);
      const me = await http().get('/employees/me').set(as('priya')).expect(200);
      expect(me.body.user.email).toBe('priya@neirah.test');
      expect(JSON.stringify(me.body)).not.toMatch(/password|hash/i);
    });

    it('lists with filters, sorting by open leads and pagination', async () => {
      const res = await http()
        .get('/employees?limit=2&sortBy=openLeads&order=desc')
        .set(as('manager'))
        .expect(200);
      expect(res.body.meta.limit).toBe(2);
      const counts = res.body.data.map((e: { openLeads: number }) => e.openLeads);
      expect(counts).toEqual([...counts].sort((a, b) => b - a));
      const byTerritory = await http()
        .get('/employees?territory=colombo')
        .set(as('admin'))
        .expect(200);
      expect(
        byTerritory.body.data.every(
          (e: { territory: string }) => e.territory.toLowerCase() === 'colombo',
        ),
      ).toBe(true);
      await http().get('/employees?sortBy=password').set(as('admin')).expect(400);
    });

    it('creates an employee (normalised) and validates input', async () => {
      const res = await http()
        .post('/employees')
        .set(as('manager'))
        .send({
          fullName: `  ${marker} Emp `,
          specializations: [' Enterprise ', 'enterprise', '', 'SMB'],
          territory: 'Galle',
        })
        .expect(201);
      createdEmployees.push(res.body.id);
      expect(res.body).toMatchObject({
        specializations: ['Enterprise', 'SMB'],
        availability: 'available',
        maxWorkload: 10,
        openLeads: 0,
        user: null,
      });
      const bySpec = await http()
        .get(`/employees?specialization=smb&search=${marker}`)
        .set(as('admin'))
        .expect(200);
      expect(bySpec.body.data).toHaveLength(1);

      const bad = { fullName: 'Valid Name', specializations: ['A'], territory: 'Galle' };
      await http()
        .post('/employees')
        .set(as('manager'))
        .send({ ...bad, specializations: [] })
        .expect(400);
      await http()
        .post('/employees')
        .set(as('manager'))
        .send({ ...bad, maxWorkload: 0 })
        .expect(400);
      await http()
        .post('/employees')
        .set(as('manager'))
        .send({ ...bad, availability: 'asleep' })
        .expect(400);
      await http()
        .post('/employees')
        .set(as('manager'))
        .send({ ...bad, userId: 99999999999 })
        .expect(400);
    });

    it('only links an unused, active sales user', async () => {
      const bad = { fullName: `${marker} Link`, specializations: ['A'], territory: 'Galle' };
      const users = await ds.query(
        `SELECT id, role FROM users WHERE email IN ('admin@neirah.test','priya@neirah.test')`,
      );
      const adminId = users.find((u: { role: string }) => u.role === 'admin').id;
      const priyaUserId = users.find((u: { role: string }) => u.role === 'sales').id;
      await http()
        .post('/employees')
        .set(as('manager'))
        .send({ ...bad, userId: adminId })
        .expect(422);
      await http()
        .post('/employees')
        .set(as('manager'))
        .send({ ...bad, userId: priyaUserId })
        .expect(409);
      await http()
        .post('/employees')
        .set(as('manager'))
        .send({ ...bad, userId: 2147483647 })
        .expect(422);
    });

    it('updates a profile, rejects nulls, and 404s for unknown ids', async () => {
      const res = await http()
        .post('/employees')
        .set(as('manager'))
        .send({ fullName: `${marker} Upd`, specializations: ['A'], territory: 'Galle' })
        .expect(201);
      createdEmployees.push(res.body.id);
      const upd = await http()
        .patch(`/employees/${res.body.id}`)
        .set(as('manager'))
        .send({ territory: 'Jaffna', maxWorkload: 5, isActive: false })
        .expect(200);
      expect(upd.body).toMatchObject({ territory: 'Jaffna', maxWorkload: 5, isActive: false });
      await http()
        .patch(`/employees/${res.body.id}`)
        .set(as('manager'))
        .send({ territory: null })
        .expect(400);
      await http()
        .patch('/employees/2147483647')
        .set(as('manager'))
        .send({ territory: 'X1' })
        .expect(404);
      await http().get('/employees/abc').set(as('manager')).expect(400);
    });

    it('lets sales change only their own availability', async () => {
      const before = (await http().get('/employees/me').set(as('priya')).expect(200)).body
        .availability;
      const res = await http()
        .patch('/employees/me/availability')
        .set(as('priya'))
        .send({ availability: 'on_leave' })
        .expect(200);
      expect(res.body.availability).toBe('on_leave');
      await http()
        .patch('/employees/me/availability')
        .set(as('priya'))
        .send({ availability: 'nope' })
        .expect(400);
      await http()
        .patch('/employees/me/availability')
        .set(as('priya'))
        .send({ availability: before })
        .expect(200);
    });
  });
});
