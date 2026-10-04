import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

/**
 * Day 3 e2e: assignment rules, eligibility, workload, deterministic selection, history.
 * Each test builds its own "world": a unique service name, its own employees and rule, so it
 * never depends on (or disturbs) seed data. Everything created is deleted afterwards.
 */
describe('Day 3: smart assignment (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  const password = process.env.SEED_DEFAULT_PASSWORD as string;
  const marker = `E3${Date.now()}`;
  const tokens: Record<string, string> = {};
  const leadIds: number[] = [];
  const employeeIds: number[] = [];
  const ruleIds: number[] = [];
  let seq = 0;

  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  /** A fresh, unique service name so rules/employees of different tests never overlap. */
  const newService = () => `${marker}-svc${++seq}`;

  const mkEmployee = async (svc: string, extra: Record<string, unknown> = {}) => {
    const res = await http()
      .post('/employees')
      .set(as('admin'))
      .send({
        fullName: `${marker} Emp${++seq}`,
        specializations: [svc],
        territory: 'Colombo',
        maxWorkload: 10,
        ...extra,
      })
      .expect(201);
    employeeIds.push(res.body.id);
    return res.body.id as number;
  };

  const mkRule = async (svc: string, extra: Record<string, unknown> = {}, expected = 201) => {
    const res = await http()
      .post('/assignment-rules')
      .set(as('admin'))
      .send({ name: `${marker} rule${++seq}`, priority: 1, matchService: svc, ...extra })
      .expect(expected);
    if (expected === 201) ruleIds.push(res.body.id);
    return res.body as { id: number; name: string };
  };

  const mkLead = async (svc: string, extra: Record<string, unknown> = {}) => {
    const res = await http()
      .post('/leads')
      .set(as('manager'))
      .send({
        name: `${marker} Lead`,
        service: svc,
        location: 'Colombo',
        autoAssign: false,
        ...extra,
      })
      .expect(201);
    leadIds.push(res.body.id);
    return res.body.id as number;
  };

  /** Give an employee N open leads without going through the engine (so history stays clean). */
  const preload = async (employeeId: number, svc: string, n: number) => {
    for (let i = 0; i < n; i++) {
      const id = await mkLead(svc);
      await ds.query(
        `UPDATE leads SET assigned_employee_id = $1, status = 'assigned' WHERE id = $2`,
        [employeeId, id],
      );
    }
  };

  const autoAssign = (id: number, who = 'manager') =>
    http().post(`/leads/${id}/assign`).set(as(who));
  const lead = async (id: number) =>
    (await http().get(`/leads/${id}`).set(as('admin')).expect(200)).body;
  const historyOf = async (id: number) =>
    (await http().get(`/leads/${id}/assignment-history`).set(as('admin')).expect(200)).body.data;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    ds = app.get(DataSource);
    for (const who of ['admin', 'manager', 'priya']) {
      const res = await http()
        .post('/auth/login')
        .send({ email: `${who}@neirah.test`, password });
      tokens[who] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    if (leadIds.length) await ds.query('DELETE FROM leads WHERE id = ANY($1)', [leadIds]);
    if (employeeIds.length)
      await ds.query('DELETE FROM employees WHERE id = ANY($1)', [employeeIds]);
    if (ruleIds.length)
      await ds.query('DELETE FROM assignment_rules WHERE id = ANY($1)', [ruleIds]);
    await app.close();
  });

  describe('assignment rules API', () => {
    it('lets admin create/update, manager read only, sales nothing', async () => {
      const svc = newService();
      const rule = await mkRule(svc);
      await http().get('/assignment-rules').set(as('manager')).expect(200);
      await http().get(`/assignment-rules/${rule.id}`).set(as('manager')).expect(200);
      await http().post('/assignment-rules').set(as('manager')).send({ name: 'x' }).expect(403);
      await http().patch(`/assignment-rules/${rule.id}`).set(as('manager')).send({}).expect(403);
      await http().get('/assignment-rules').set(as('priya')).expect(403);
      await http().get('/assignment-rules').expect(401);
      const upd = await http()
        .patch(`/assignment-rules/${rule.id}`)
        .set(as('admin'))
        .send({ isActive: false, priority: 7 })
        .expect(200);
      expect(upd.body).toMatchObject({ isActive: false, priority: 7 });
    });

    it('validates input (400), duplicate names (409) and inverted value ranges (422)', async () => {
      const svc = newService();
      const rule = await mkRule(svc, { name: `${marker} Unique` });
      await mkRule(svc, { name: `${marker} UNIQUE` }, 409);
      await mkRule(svc, { priority: 0 }, 400);
      await mkRule(svc, { priority: 10001 }, 400);
      await mkRule(svc, { strategy: 'random' }, 400);
      await mkRule(svc, { territoryMode: 'sometimes' }, 400);
      await mkRule(svc, { hacker: true }, 400);
      await mkRule(svc, { minValue: 500, maxValue: 100 }, 422);
      await http()
        .patch(`/assignment-rules/${rule.id}`)
        .set(as('admin'))
        .send({ minValue: 500, maxValue: 100 })
        .expect(422);
      await http()
        .patch(`/assignment-rules/${rule.id}`)
        .set(as('admin'))
        .send({ isActive: null })
        .expect(400);
      await http().get('/assignment-rules/abc').set(as('admin')).expect(400);
      await http().get('/assignment-rules/2147483647').set(as('admin')).expect(404);
    });
  });

  describe('automatic assignment', () => {
    it('assigns by specialization and territory, moves NEW to ASSIGNED, writes history and activity', async () => {
      const svc = newService();
      const rule = await mkRule(svc, { territoryMode: 'required' });
      const colombo = await mkEmployee(svc);
      await mkEmployee(svc, { territory: 'Jaffna' }); // right skill, wrong territory
      await mkEmployee(newService()); // wrong skill
      const id = await mkLead(svc);

      const res = await autoAssign(id).expect(200);
      expect(res.body).toMatchObject({
        assigned: true,
        action: 'assigned',
        mode: 'automatic',
        dryRun: false,
        employee: { id: colombo },
        rule: { id: rule.id, name: rule.name },
      });
      expect(res.body.reason).toContain(rule.name);
      expect((await lead(id)).status).toBe('assigned');
      expect((await lead(id)).assignedEmployee.id).toBe(colombo);

      const hist = await historyOf(id);
      expect(hist).toHaveLength(1);
      expect(hist[0]).toMatchObject({
        action: 'assigned',
        mode: 'automatic',
        toEmployee: { id: colombo },
      });
      expect(hist[0].performedBy.email).toBe('manager@neirah.test');
      const acts = (await http().get(`/leads/${id}/activities`).set(as('admin')).expect(200)).body
        .data;
      expect(acts.map((a: { type: string }) => a.type)).toContain('assigned');
    });

    it('prefers the least-loaded eligible employee', async () => {
      const svc = newService();
      await mkRule(svc);
      const busy = await mkEmployee(svc);
      const light = await mkEmployee(svc);
      const medium = await mkEmployee(svc);
      await preload(busy, svc, 4);
      await preload(medium, svc, 2);
      const id = await mkLead(svc);
      const res = await autoAssign(id).expect(200);
      expect(res.body.employee.id).toBe(light);
      expect(res.body.tieBreak).toBe('none');
      expect(res.body.candidates.map((c: { id: number }) => c.id)).toEqual([light, medium, busy]);
    });

    it('breaks workload ties by least recently assigned, then lowest id (deterministic)', async () => {
      const svc = newService();
      await mkRule(svc);
      const a = await mkEmployee(svc);
      const b = await mkEmployee(svc);
      // Fresh employees, nothing assigned ever: lowest id wins.
      const l1 = await mkLead(svc);
      const r1 = await autoAssign(l1).expect(200);
      expect(r1.body.employee.id).toBe(a);
      expect(r1.body.tieBreak).toBe('lowest_id');
      // a now has 1 open lead, b has 0: workload decides.
      const l2 = await mkLead(svc);
      expect((await autoAssign(l2).expect(200)).body.employee.id).toBe(b);
      // Both have 1: a was assigned least recently -> a.
      const l3 = await mkLead(svc);
      const r3 = await autoAssign(l3).expect(200);
      expect(r3.body.employee.id).toBe(a);
      expect(r3.body.tieBreak).toBe('least_recently_assigned');
    });

    it('supports round robin independent of workload', async () => {
      const svc = newService();
      await mkRule(svc, { strategy: 'round_robin' });
      const a = await mkEmployee(svc);
      const b = await mkEmployee(svc);
      await preload(a, svc, 0);
      await preload(b, svc, 3); // heavier, but round robin ignores load
      const picks: number[] = [];
      for (let i = 0; i < 4; i++) {
        picks.push((await autoAssign(await mkLead(svc)).expect(200)).body.employee.id);
      }
      expect(picks).toEqual([a, b, a, b]);
    });

    it('excludes inactive, unavailable, on-leave and full employees', async () => {
      const svc = newService();
      await mkRule(svc);
      const inactive = await mkEmployee(svc);
      await http()
        .patch(`/employees/${inactive}`)
        .set(as('admin'))
        .send({ isActive: false })
        .expect(200);
      const onLeave = await mkEmployee(svc, { availability: 'on_leave' });
      const unavailable = await mkEmployee(svc, { availability: 'unavailable' });
      const full = await mkEmployee(svc, { maxWorkload: 1 });
      await preload(full, svc, 1);
      const okEmp = await mkEmployee(svc);

      const id = await mkLead(svc);
      const prev = await http()
        .get(`/leads/${id}/assignment-preview`)
        .set(as('manager'))
        .expect(200);
      expect(prev.body.employee.id).toBe(okEmp);
      const excluded = prev.body.excluded.map((e: { employeeId: number }) => e.employeeId);
      // Hard filters (inactive, leave, unavailable) never become candidates; policy exclusions are explained.
      expect(excluded).toContain(full);
      const candidateIds = prev.body.candidates.map((c: { id: number }) => c.id);
      expect(candidateIds).toEqual([okEmp]);
      for (const e of [inactive, onLeave, unavailable, full]) expect(candidateIds).not.toContain(e);
      const res = await autoAssign(id).expect(200);
      expect(res.body.employee.id).toBe(okEmp);
    });

    it('ignores workload limit when the rule says so', async () => {
      const svc = newService();
      await mkRule(svc, { respectWorkloadLimit: false });
      const full = await mkEmployee(svc, { maxWorkload: 1 });
      await preload(full, svc, 1);
      const res = await autoAssign(await mkLead(svc)).expect(200);
      expect(res.body.employee.id).toBe(full);
    });

    it('records NO_ELIGIBLE when nobody qualifies and leaves the lead NEW', async () => {
      const svc = newService();
      await mkRule(svc);
      const id = await mkLead(svc); // nobody has this specialization
      const res = await autoAssign(id).expect(200);
      expect(res.body).toMatchObject({ assigned: false, action: 'no_eligible', employee: null });
      expect((await lead(id)).status).toBe('new');
      const hist = await historyOf(id);
      expect(hist).toHaveLength(1);
      expect(hist[0]).toMatchObject({ action: 'no_eligible', toEmployee: null });
      const acts = (await http().get(`/leads/${id}/activities`).set(as('admin')).expect(200)).body
        .data;
      expect(acts.map((a: { type: string }) => a.type)).toContain('assignment_failed');
    });

    it('uses rule priority order, skips inactive rules, and reports when no rule matches', async () => {
      const svc = newService();
      const early = await mkRule(svc, { priority: 1, strategy: 'round_robin' });
      const late = await mkRule(svc, { priority: 2 });
      await mkEmployee(svc);
      const first = await mkLead(svc);
      expect((await autoAssign(first).expect(200)).body.rule.id).toBe(early.id);
      await http()
        .patch(`/assignment-rules/${early.id}`)
        .set(as('admin'))
        .send({ isActive: false })
        .expect(200);
      const second = await mkLead(svc);
      expect((await autoAssign(second).expect(200)).body.rule.id).toBe(late.id);
      await http()
        .patch(`/assignment-rules/${late.id}`)
        .set(as('admin'))
        .send({ isActive: false })
        .expect(200);
      // Both inactive: only seed catch-all rules (if any) could match a marker service.
      const third = await mkLead(svc);
      const res = await autoAssign(third).expect(200);
      expect(res.body.rule === null || res.body.rule.id !== late.id).toBe(true);
    });

    it('matches value ranges and territory preference', async () => {
      const svc = newService();
      const rich = await mkRule(svc, { priority: 1, minValue: 1000, territoryMode: 'required' });
      const normal = await mkRule(svc, { priority: 2, territoryMode: 'preferred' });
      const jaffna = await mkEmployee(svc, { territory: 'Jaffna' });
      const lowLead = await mkLead(svc, { estimatedValue: 10, location: 'Jaffna' });
      const highLead = await mkLead(svc, { estimatedValue: 5000, location: 'Jaffna' });
      const low = await autoAssign(lowLead).expect(200);
      const high = await autoAssign(highLead).expect(200);
      expect(low.body.rule.id).toBe(normal.id);
      expect(high.body.rule.id).toBe(rich.id);
      expect(low.body.employee.id).toBe(jaffna);
      expect(high.body.employee.id).toBe(jaffna);
    });

    it('is safe under concurrency: parallel requests never exceed capacity or double-assign', async () => {
      const svc = newService();
      await mkRule(svc);
      const e1 = await mkEmployee(svc, { maxWorkload: 2 });
      const e2 = await mkEmployee(svc, { maxWorkload: 2 });
      const ids: number[] = [];
      for (let i = 0; i < 6; i++) ids.push(await mkLead(svc));
      const results = await Promise.all(ids.map((id) => autoAssign(id)));
      results.forEach((r) => expect(r.status).toBe(200));
      const assigned = results.filter((r) => (r.body as { assigned: boolean }).assigned);
      expect(assigned).toHaveLength(4); // 2 + 2 capacity, the other 2 find nobody
      const rows: { assigned_employee_id: number; n: string }[] = await ds.query(
        `SELECT assigned_employee_id, COUNT(*) n FROM leads WHERE id = ANY($1) AND assigned_employee_id IS NOT NULL GROUP BY 1`,
        [ids],
      );
      expect(rows.map((r) => Number(r.n)).sort()).toEqual([2, 2]);
      expect(rows.map((r) => r.assigned_employee_id).sort()).toEqual([e1, e2].sort());
    });
  });

  describe('guards and permissions', () => {
    it('rejects sales and anonymous callers', async () => {
      const svc = newService();
      const id = await mkLead(svc);
      await autoAssign(id, 'priya').expect(403);
      await http().get(`/leads/${id}/assignment-preview`).set(as('priya')).expect(403);
      await http().post(`/leads/${id}/reassign`).set(as('priya')).send({}).expect(403);
      await http().post(`/leads/${id}/assign`).expect(401);
    });

    it('refuses to auto-assign an already assigned lead (409) and 404s unknown leads', async () => {
      const svc = newService();
      await mkRule(svc);
      await mkEmployee(svc);
      const id = await mkLead(svc);
      await autoAssign(id).expect(200);
      await autoAssign(id).expect(409);
      await autoAssign(2147483647).expect(404);
      await autoAssign(0).expect(400);
    });

    it('preview has no side effects', async () => {
      const svc = newService();
      await mkRule(svc);
      await mkEmployee(svc);
      const id = await mkLead(svc);
      const prev = await http()
        .get(`/leads/${id}/assignment-preview`)
        .set(as('manager'))
        .expect(200);
      expect(prev.body).toMatchObject({ dryRun: true, assigned: true });
      expect((await lead(id)).status).toBe('new');
      expect(await historyOf(id)).toHaveLength(0);
    });

    it('auto-assigns on create unless autoAssign is false', async () => {
      const svc = newService();
      await mkRule(svc);
      const emp = await mkEmployee(svc);
      const res = await http()
        .post('/leads')
        .set(as('manager'))
        .send({ name: `${marker} Auto`, service: svc, location: 'Colombo' })
        .expect(201);
      leadIds.push(res.body.id);
      expect(res.body.assignment).toMatchObject({ assigned: true, employee: { id: emp } });
      expect((await lead(res.body.id)).status).toBe('assigned');
    });
  });

  describe('manual reassignment', () => {
    it('keeps the full history, changes owner and removes sales access for the old owner', async () => {
      const svc = newService();
      await mkRule(svc);
      const first = await mkEmployee(svc);
      const second = await mkEmployee(svc);
      const id = await mkLead(svc);
      await autoAssign(id).expect(200);
      const owner = (await lead(id)).assignedEmployee.id as number;
      const target = owner === first ? second : first;

      const res = await http()
        .post(`/leads/${id}/reassign`)
        .set(as('manager'))
        .send({ employeeId: target, reason: 'Customer asked for a specific person' })
        .expect(200);
      expect(res.body).toMatchObject({
        action: 'reassigned',
        mode: 'manual',
        employee: { id: target },
      });
      expect((await lead(id)).assignedEmployee.id).toBe(target);

      const hist = await historyOf(id);
      expect(hist.length).toBeGreaterThanOrEqual(2);
      expect(hist[0].action).toBe('assigned');
      expect(hist[1]).toMatchObject({
        action: 'reassigned',
        mode: 'manual',
        fromEmployee: { id: owner },
        toEmployee: { id: target },
        reason: expect.stringContaining('specific person') as string,
      });
    });

    it('warns (but allows) overrides of availability and workload for a manual choice', async () => {
      const svc = newService();
      const a = await mkEmployee(svc);
      const away = await mkEmployee(svc, { availability: 'on_leave' });
      const id = await mkLead(svc);
      await http()
        .post(`/leads/${id}/reassign`)
        .set(as('admin'))
        .send({ employeeId: a, reason: 'initial manual owner' })
        .expect(200);
      const res = await http()
        .post(`/leads/${id}/reassign`)
        .set(as('admin'))
        .send({ employeeId: away, reason: 'urgent, only person who knows client' })
        .expect(200);
      expect(res.body.employee.id).toBe(away);
      const hist = await historyOf(id);
      expect(JSON.stringify(hist[hist.length - 1].metadata)).toContain('overrideWarnings');
    });

    it('validates input and state', async () => {
      const svc = newService();
      const a = await mkEmployee(svc);
      const b = await mkEmployee(svc);
      const inactive = await mkEmployee(svc);
      await http()
        .patch(`/employees/${inactive}`)
        .set(as('admin'))
        .send({ isActive: false })
        .expect(200);
      const id = await mkLead(svc);
      const call = (body: Record<string, unknown>) =>
        http().post(`/leads/${id}/reassign`).set(as('manager')).send(body);

      await call({}).expect(400);
      await call({ employeeId: a }).expect(400); // reason required
      await call({ employeeId: a, reason: 'ab' }).expect(400); // reason too short
      await call({ employeeId: 'x', reason: 'valid reason' }).expect(400);
      await call({ employeeId: a, reason: 'valid reason', extra: 1 }).expect(400);
      await call({ employeeId: 2147483647, reason: 'valid reason' }).expect(422);
      await call({ employeeId: inactive, reason: 'valid reason' }).expect(422);
      await http()
        .post('/leads/2147483647/reassign')
        .set(as('manager'))
        .send({ employeeId: a, reason: 'valid reason' })
        .expect(404);

      await call({ employeeId: a, reason: 'first assignment' }).expect(200);
      await call({ employeeId: a, reason: 'same owner again' }).expect(409);
      await call({ employeeId: b, reason: 'valid reason' }).expect(200);

      await ds.query(`UPDATE leads SET status = 'lost' WHERE id = $1`, [id]);
      await call({ employeeId: a, reason: 'too late now' }).expect(409);
    });
  });

  describe('assignment history access', () => {
    it('lets sales read history only for their own leads', async () => {
      const svc = newService();
      const id = await mkLead(svc);
      await http().get(`/leads/${id}/assignment-history`).set(as('priya')).expect(404);
      await http().get(`/leads/${id}/assignment-history`).set(as('manager')).expect(200);
      await http().get(`/leads/${id}/assignment-history?limit=0`).set(as('manager')).expect(400);
    });
  });
});
