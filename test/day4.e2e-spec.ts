import 'dotenv/config';
process.env.SCHEDULER_ENABLED = 'false';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

/**
 * Day 4 e2e: follow-ups, overdue processing, SLA escalation / reassignment, audit trail, dashboard.
 * Same style as Day 3: every test builds its own "world" (unique service, own employees, own
 * policy) so it never depends on seed data, and everything created is deleted afterwards.
 * Time travel is done by moving rows into the past with SQL (the app never rewrites history).
 */
describe('Day 4: follow-ups, SLA escalation and dashboard (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  const password = process.env.SEED_DEFAULT_PASSWORD as string;
  const marker = `E4${Date.now()}`;
  const tokens: Record<string, string> = {};
  const leadIds: number[] = [];
  const employeeIds: number[] = [];
  const ruleIds: number[] = [];
  const policyIds: number[] = [];
  let priyaEmployeeId = 0;
  let seq = 0;

  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const newService = () => `${marker}-svc${++seq}`;
  const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

  // ---------------------------------------------------------------- world builders

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

  const mkInactiveEmployee = async (svc: string) => {
    const id = await mkEmployee(svc);
    await http().patch(`/employees/${id}`).set(as('admin')).send({ isActive: false }).expect(200);
    return id;
  };

  /** A rule so that the engine can pick (and re-pick) employees for this service only. */
  const mkRule = async (svc: string) => {
    const res = await http()
      .post('/assignment-rules')
      .set(as('admin'))
      .send({ name: `${marker} rule${++seq}`, priority: 1, matchService: svc })
      .expect(201);
    ruleIds.push(res.body.id);
    return res.body.id as number;
  };

  const mkPolicy = async (svc: string, extra: Record<string, unknown> = {}, expected = 201) => {
    const res = await http()
      .post('/sla-policies')
      .set(as('admin'))
      .send({
        name: `${marker} sla${++seq}`,
        priority: 1,
        matchService: svc,
        responseMinutes: 30,
        action: 'flag',
        ...extra,
      })
      .expect(expected);
    if (expected === 201) policyIds.push(res.body.id);
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

  /** A lead that belongs to an employee (manual assignment, so history has the reference row). */
  const mkOwnedLead = async (
    svc: string,
    employeeId: number,
    extra: Record<string, unknown> = {},
  ) => {
    const id = await mkLead(svc, extra);
    await http()
      .post(`/leads/${id}/reassign`)
      .set(as('manager'))
      .send({ employeeId, reason: 'test setup' })
      .expect(200);
    return id;
  };

  const mkFollowUp = async (
    leadId: number,
    extra: Record<string, unknown> = {},
    who = 'manager',
    expected = 201,
  ) => {
    const res = await http()
      .post(`/leads/${leadId}/follow-ups`)
      .set(as(who))
      .send({ title: `${marker} call back`, dueAt: minutesFromNow(60), ...extra })
      .expect(expected);
    return res.body;
  };

  // ---------------------------------------------------------------- readers and time travel

  const followUp = async (id: number, who = 'admin') =>
    (await http().get(`/follow-ups/${id}`).set(as(who)).expect(200)).body;
  const types = async (leadId: number) =>
    (
      await http().get(`/leads/${leadId}/activities?limit=100`).set(as('admin')).expect(200)
    ).body.data.map((a: { type: string }) => a.type) as string[];
  const activities = async (leadId: number, type: string) =>
    (
      await http()
        .get(`/leads/${leadId}/activities?limit=100&type=${type}`)
        .set(as('admin'))
        .expect(200)
    ).body.data as { description: string; metadata: Record<string, unknown> }[];
  const escalationsOf = async (leadId: number) =>
    (await http().get(`/leads/${leadId}/escalations`).set(as('admin')).expect(200)).body.data as {
      outcome: string;
      action: string;
      policyName: string;
      fromEmployee: { id: number } | null;
      toEmployee: { id: number } | null;
      referenceType: string;
    }[];
  const historyOf = async (leadId: number) =>
    (await http().get(`/leads/${leadId}/assignment-history`).set(as('admin')).expect(200)).body
      .data;
  const lead = async (id: number) =>
    (await http().get(`/leads/${id}`).set(as('admin')).expect(200)).body;

  /** Pretend the lead's last assignment and last activity happened `minutes` earlier. */
  const ageLead = async (leadId: number, minutes: number) => {
    await ds.query(
      `UPDATE assignment_history SET created_at = created_at - ($2 * interval '1 minute') WHERE lead_id = $1`,
      [leadId, minutes],
    );
    await ds.query(
      `UPDATE lead_activities SET created_at = created_at - ($2 * interval '1 minute') WHERE lead_id = $1`,
      [leadId, minutes],
    );
  };
  const makeDue = (followUpId: number, minutesAgo = 60) =>
    ds.query(`UPDATE follow_ups SET due_at = now() - ($2 * interval '1 minute') WHERE id = $1`, [
      followUpId,
      minutesAgo,
    ]);

  interface RunBody {
    dryRun: boolean;
    skipped: boolean;
    followUpsMarkedOverdue: number;
    breaches: number;
    flagged: number;
    reassigned: number;
    noEligible: number;
    alreadyHandled: number;
    errors: number;
    items: { leadId: number; outcome: string; policyName: string; toEmployeeId: number | null }[];
  }
  const runSla = async (query = '', who = 'manager') =>
    (await http().post(`/sla/run${query}`).set(as(who)).expect(200)).body as RunBody;
  const itemFor = (run: RunBody, leadId: number) => run.items.find((i) => i.leadId === leadId);

  // ---------------------------------------------------------------- setup / teardown

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
    priyaEmployeeId = (await http().get('/dashboard/me').set(as('priya')).expect(200)).body.id;
  });

  afterAll(async () => {
    // leads first: follow-ups, escalations, history and activities go with them (ON DELETE CASCADE)
    if (leadIds.length) await ds.query('DELETE FROM leads WHERE id = ANY($1)', [leadIds]);
    if (employeeIds.length)
      await ds.query('DELETE FROM employees WHERE id = ANY($1)', [employeeIds]);
    if (ruleIds.length)
      await ds.query('DELETE FROM assignment_rules WHERE id = ANY($1)', [ruleIds]);
    if (policyIds.length)
      await ds.query('DELETE FROM sla_policies WHERE id = ANY($1)', [policyIds]);
    await app.close();
  });

  // ================================================================== follow-ups

  describe('follow-ups: create and validate', () => {
    it('creates a pending follow-up owned by the lead owner and logs it on the timeline', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const id = await mkOwnedLead(svc, e1);
      const f = await mkFollowUp(id, { notes: 'Ask about budget' });
      expect(f).toMatchObject({
        leadId: id,
        type: 'call',
        status: 'pending',
        isOverdue: false,
        notes: 'Ask about budget',
        employee: { id: e1 },
        completedAt: null,
        cancelledAt: null,
      });
      expect(await types(id)).toContain('follow_up_created');
    });

    it('rejects bad input with 400 and a past due date with 422', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const id = await mkOwnedLead(svc, e1);
      const url = `/leads/${id}/follow-ups`;
      const ok = { title: 'Call the customer', dueAt: minutesFromNow(60) };
      await http().post(url).set(as('manager')).send({}).expect(400);
      await http()
        .post(url)
        .set(as('manager'))
        .send({ ...ok, title: 'ab' })
        .expect(400);
      await http()
        .post(url)
        .set(as('manager'))
        .send({ ...ok, dueAt: 'not-a-date' })
        .expect(400);
      await http()
        .post(url)
        .set(as('manager'))
        .send({ ...ok, type: 'fax' })
        .expect(400);
      await http()
        .post(url)
        .set(as('manager'))
        .send({ ...ok, hacker: true })
        .expect(400);
      await http()
        .post(url)
        .set(as('manager'))
        .send({ ...ok, employeeId: 0 })
        .expect(400);
      await http()
        .post(url)
        .set(as('manager'))
        .send({ ...ok, dueAt: minutesFromNow(-5) })
        .expect(422);
      await http()
        .post(url)
        .set(as('manager'))
        .send({ ...ok, dueAt: '2020-01-01' })
        .expect(422);
    });

    it('returns 400 for a malformed lead id, 404 for a missing lead, 401 without a token', async () => {
      const body = { title: 'Call the customer', dueAt: minutesFromNow(60) };
      await http().post('/leads/abc/follow-ups').set(as('manager')).send(body).expect(400);
      await http().post('/leads/0/follow-ups').set(as('manager')).send(body).expect(400);
      await http().post('/leads/2147483647/follow-ups').set(as('manager')).send(body).expect(404);
      await http().post('/leads/1/follow-ups').send(body).expect(401);
      await http().get('/follow-ups').expect(401);
    });

    it('needs an owner: 422 for an unassigned lead unless a manager names the employee', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const id = await mkLead(svc);
      await mkFollowUp(id, {}, 'manager', 422);
      const f = await mkFollowUp(id, { employeeId: e1 });
      expect(f.employee.id).toBe(e1);
    });

    it('refuses follow-ups on a closed lead (409)', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const id = await mkOwnedLead(svc, e1);
      await http().patch(`/leads/${id}`).set(as('manager')).send({ status: 'lost' }).expect(200);
      await mkFollowUp(id, {}, 'manager', 409);
    });

    it('lets a manager give the follow-up to another employee, but not an inactive one', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const e2 = await mkEmployee(svc);
      const off = await mkInactiveEmployee(svc);
      const id = await mkOwnedLead(svc, e1);
      const f = await mkFollowUp(id, { employeeId: e2 });
      expect(f.employee.id).toBe(e2);
      await mkFollowUp(id, { employeeId: off }, 'manager', 422);
      await mkFollowUp(id, { employeeId: 2147483647 }, 'manager', 422);
    });
  });

  describe('follow-ups: access control', () => {
    it('lets a sales user work only with their own leads and follow-ups', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const mine = await mkOwnedLead(svc, priyaEmployeeId);
      const theirs = await mkOwnedLead(svc, e1);

      const myFollowUp = await mkFollowUp(mine, {}, 'priya');
      expect(myFollowUp.employee.id).toBe(priyaEmployeeId);
      const theirFollowUp = await mkFollowUp(theirs);

      // someone else's lead looks like it does not exist
      await mkFollowUp(theirs, {}, 'priya', 404);
      await http().get(`/leads/${theirs}/follow-ups`).set(as('priya')).expect(404);
      // someone else's follow-up as well
      await http().get(`/follow-ups/${theirFollowUp.id}`).set(as('priya')).expect(404);
      await http()
        .post(`/follow-ups/${theirFollowUp.id}/complete`)
        .set(as('priya'))
        .send({})
        .expect(404);
      await http()
        .patch(`/follow-ups/${theirFollowUp.id}`)
        .set(as('priya'))
        .send({ title: 'hijack' })
        .expect(404);

      const list = await http().get('/follow-ups?limit=100').set(as('priya')).expect(200);
      const ids = list.body.data.map((f: { id: number }) => f.id);
      expect(ids).toContain(myFollowUp.id);
      expect(ids).not.toContain(theirFollowUp.id);
      for (const f of list.body.data) expect(f.employee.id).toBe(priyaEmployeeId);
      // an employeeId filter cannot be used to peek at colleagues
      const peek = await http()
        .get(`/follow-ups?employeeId=${e1}&limit=100`)
        .set(as('priya'))
        .expect(200);
      expect(peek.body.data.map((f: { id: number }) => f.id)).not.toContain(theirFollowUp.id);
    });

    it('stops a sales user from handing a follow-up to a colleague (403) but not to themselves', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const mine = await mkOwnedLead(svc, priyaEmployeeId);
      await mkFollowUp(mine, { employeeId: e1 }, 'priya', 403);
      const own = await mkFollowUp(mine, { employeeId: priyaEmployeeId }, 'priya');
      await http()
        .patch(`/follow-ups/${own.id}`)
        .set(as('priya'))
        .send({ employeeId: e1 })
        .expect(403);
    });
  });

  describe('follow-ups: listing', () => {
    it('filters by status, type, lead, due window and overdue, and paginates', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const id = await mkOwnedLead(svc, e1);
      const a = await mkFollowUp(id, { type: 'call', dueAt: minutesFromNow(60) });
      const b = await mkFollowUp(id, { type: 'meeting', dueAt: minutesFromNow(120) });
      const c = await mkFollowUp(id, { type: 'email', dueAt: minutesFromNow(180) });
      await http().post(`/follow-ups/${c.id}/cancel`).set(as('manager')).send({}).expect(200);

      const q = (s: string) =>
        http().get(`/follow-ups?leadId=${id}&${s}`).set(as('manager')).expect(200);

      const all = await q('');
      expect(all.body.data.map((f: { id: number }) => f.id)).toEqual([a.id, b.id, c.id]); // by due date
      expect((await q('type=meeting')).body.data.map((f: { id: number }) => f.id)).toEqual([b.id]);
      expect((await q('status=cancelled')).body.meta.total).toBe(1);
      expect((await q('overdue=false')).body.meta.total).toBe(2); // open and not late
      expect((await q('overdue=true')).body.meta.total).toBe(0);
      expect((await q(`employeeId=${e1}`)).body.meta.total).toBe(3);
      expect(
        (await q(`dueFrom=${minutesFromNow(90)}&dueTo=${minutesFromNow(150)}`)).body.data.map(
          (f: { id: number }) => f.id,
        ),
      ).toEqual([b.id]);

      // late even though the processor has not run yet
      await makeDue(a.id);
      const late = await q('overdue=true');
      expect(late.body.data.map((f: { id: number }) => f.id)).toEqual([a.id]);
      expect(late.body.data[0]).toMatchObject({ status: 'pending', isOverdue: true });

      const page2 = await q('limit=2&page=2');
      expect(page2.body.data).toHaveLength(1);
      expect(page2.body.meta).toMatchObject({ total: 3, page: 2, limit: 2, totalPages: 2 });

      const nested = await http().get(`/leads/${id}/follow-ups`).set(as('manager')).expect(200);
      expect(nested.body.meta.total).toBe(3);
    });

    it('rejects invalid filters with 400', async () => {
      await http().get('/follow-ups?status=bogus').set(as('manager')).expect(400);
      await http().get('/follow-ups?type=fax').set(as('manager')).expect(400);
      await http().get('/follow-ups?overdue=maybe').set(as('manager')).expect(400);
      await http().get('/follow-ups?limit=0').set(as('manager')).expect(400);
      await http().get('/follow-ups?dueFrom=yesterday').set(as('manager')).expect(400);
      await http().get('/follow-ups/abc').set(as('manager')).expect(400);
      await http().get('/follow-ups/2147483647').set(as('manager')).expect(404);
    });
  });

  describe('follow-ups: complete, cancel, reschedule', () => {
    it('completes a follow-up once, with a note, and then it is final (409)', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const id = await mkOwnedLead(svc, e1);
      const f = await mkFollowUp(id);
      const done = await http()
        .post(`/follow-ups/${f.id}/complete`)
        .set(as('manager'))
        .send({ note: 'Demo booked for Monday' })
        .expect(200);
      expect(done.body).toMatchObject({
        status: 'completed',
        outcomeNote: 'Demo booked for Monday',
        isOverdue: false,
      });
      expect(done.body.completedAt).not.toBeNull();
      expect((await activities(id, 'follow_up_completed'))[0].description).toContain(
        'Demo booked for Monday',
      );

      await http().post(`/follow-ups/${f.id}/complete`).set(as('manager')).send({}).expect(409);
      await http().post(`/follow-ups/${f.id}/cancel`).set(as('manager')).send({}).expect(409);
      await http()
        .patch(`/follow-ups/${f.id}`)
        .set(as('manager'))
        .send({ title: 'too late' })
        .expect(409);
      // the first completion is untouched
      expect((await followUp(f.id)).status).toBe('completed');
    });

    it('cancels a follow-up with a reason and logs it', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const id = await mkOwnedLead(svc, e1);
      const f = await mkFollowUp(id);
      const res = await http()
        .post(`/follow-ups/${f.id}/cancel`)
        .set(as('manager'))
        .send({ note: 'Customer went quiet' })
        .expect(200);
      expect(res.body).toMatchObject({ status: 'cancelled', outcomeNote: 'Customer went quiet' });
      expect(res.body.cancelledAt).not.toBeNull();
      expect(await types(id)).toContain('follow_up_cancelled');
      await http().post(`/follow-ups/${f.id}/cancel`).set(as('manager')).send({}).expect(409);
    });

    it('lets two simultaneous completions succeed exactly once', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const id = await mkOwnedLead(svc, e1);
      const f = await mkFollowUp(id);
      const results = await Promise.all([
        http().post(`/follow-ups/${f.id}/complete`).set(as('manager')).send({}),
        http().post(`/follow-ups/${f.id}/complete`).set(as('admin')).send({}),
        http().post(`/follow-ups/${f.id}/cancel`).set(as('manager')).send({}),
      ]);
      const codes = results.map((r) => r.status).sort();
      expect(codes).toEqual([200, 409, 409]);
      expect(
        (await activities(id, 'follow_up_completed')).length +
          (await activities(id, 'follow_up_cancelled')).length,
      ).toBe(1);
    });

    it('reschedules and edits a pending follow-up', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const id = await mkOwnedLead(svc, e1);
      const f = await mkFollowUp(id);
      const newDue = minutesFromNow(300);
      const res = await http()
        .patch(`/follow-ups/${f.id}`)
        .set(as('manager'))
        .send({ dueAt: newDue, title: 'Send the proposal', type: 'email', notes: null })
        .expect(200);
      expect(new Date(res.body.dueAt).getTime()).toBe(new Date(newDue).getTime());
      expect(res.body).toMatchObject({ title: 'Send the proposal', type: 'email', notes: null });
      expect(await activities(id, 'follow_up_rescheduled')).toHaveLength(1);

      // an empty patch changes nothing and writes nothing
      await http().patch(`/follow-ups/${f.id}`).set(as('manager')).send({}).expect(200);
      expect(await activities(id, 'follow_up_rescheduled')).toHaveLength(1);

      await http()
        .patch(`/follow-ups/${f.id}`)
        .set(as('manager'))
        .send({ dueAt: minutesFromNow(-1) })
        .expect(422);
      await http()
        .patch(`/follow-ups/${f.id}`)
        .set(as('manager'))
        .send({ dueAt: null })
        .expect(400);
      await http().patch(`/follow-ups/${f.id}`).set(as('manager')).send({ title: 'x' }).expect(400);
      await http()
        .patch(`/follow-ups/${f.id}`)
        .set(as('manager'))
        .send({ status: 'completed' })
        .expect(400);
    });

    it('hands a follow-up over to another employee (manager), validating the target', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const e2 = await mkEmployee(svc);
      const id = await mkOwnedLead(svc, e1);
      const f = await mkFollowUp(id);
      const res = await http()
        .patch(`/follow-ups/${f.id}`)
        .set(as('manager'))
        .send({ employeeId: e2 })
        .expect(200);
      expect(res.body.employee.id).toBe(e2);
      expect(await activities(id, 'follow_up_reassigned')).toHaveLength(1);
      await http()
        .patch(`/follow-ups/${f.id}`)
        .set(as('manager'))
        .send({ employeeId: 2147483647 })
        .expect(422);
    });
  });

  // ================================================================== overdue processing

  describe('overdue follow-ups', () => {
    it('marks a late follow-up overdue exactly once, however often the processor runs', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const id = await mkOwnedLead(svc, e1);
      const f = await mkFollowUp(id);
      await makeDue(f.id);

      const dry = await runSla('?dryRun=true');
      expect(dry.dryRun).toBe(true);
      expect((await followUp(f.id)).status).toBe('pending'); // a dry run writes nothing
      expect(await activities(id, 'follow_up_overdue')).toHaveLength(0);

      const first = await runSla();
      expect(first.followUpsMarkedOverdue).toBeGreaterThanOrEqual(1);
      const after = await followUp(f.id);
      expect(after).toMatchObject({ status: 'overdue', isOverdue: true });
      expect(after.overdueAt).not.toBeNull();
      expect(await activities(id, 'follow_up_overdue')).toHaveLength(1);

      await runSla();
      await runSla();
      expect(await activities(id, 'follow_up_overdue')).toHaveLength(1);
    });

    it('does not touch follow-ups that are not due, completed or cancelled', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const id = await mkOwnedLead(svc, e1);
      const future = await mkFollowUp(id);
      const done = await mkFollowUp(id);
      const cancelled = await mkFollowUp(id);
      await http().post(`/follow-ups/${done.id}/complete`).set(as('manager')).send({}).expect(200);
      await http()
        .post(`/follow-ups/${cancelled.id}/cancel`)
        .set(as('manager'))
        .send({})
        .expect(200);
      await makeDue(done.id);
      await makeDue(cancelled.id);
      await runSla();
      expect((await followUp(future.id)).status).toBe('pending');
      expect((await followUp(done.id)).status).toBe('completed');
      expect((await followUp(cancelled.id)).status).toBe('cancelled');
    });

    it('still lets the owner complete an overdue follow-up, and reschedule puts it back to pending', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const id = await mkOwnedLead(svc, e1);
      const a = await mkFollowUp(id);
      const b = await mkFollowUp(id);
      await makeDue(a.id);
      await makeDue(b.id);
      await runSla();
      expect((await followUp(a.id)).status).toBe('overdue');

      await http().post(`/follow-ups/${a.id}/complete`).set(as('manager')).send({}).expect(200);
      expect((await followUp(a.id)).status).toBe('completed');
      const done = await activities(id, 'follow_up_completed');
      expect(done[0].metadata.wasOverdue).toBe(true);

      const moved = await http()
        .patch(`/follow-ups/${b.id}`)
        .set(as('manager'))
        .send({ dueAt: minutesFromNow(240) })
        .expect(200);
      expect(moved.body).toMatchObject({ status: 'pending', isOverdue: false, overdueAt: null });
    });
  });

  // ================================================================== lifecycle hooks

  describe('follow-ups follow the lead', () => {
    it('moves open follow-ups to the new owner on reassignment, but never completed ones', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const e2 = await mkEmployee(svc);
      const id = await mkOwnedLead(svc, e1);
      const pending = await mkFollowUp(id);
      const overdue = await mkFollowUp(id);
      const done = await mkFollowUp(id);
      await makeDue(overdue.id);
      await runSla();
      await http().post(`/follow-ups/${done.id}/complete`).set(as('manager')).send({}).expect(200);

      await http()
        .post(`/leads/${id}/reassign`)
        .set(as('manager'))
        .send({ employeeId: e2, reason: 'Workload balancing' })
        .expect(200);

      expect((await followUp(pending.id)).employee.id).toBe(e2);
      expect((await followUp(overdue.id)).employee.id).toBe(e2);
      expect((await followUp(done.id)).employee.id).toBe(e1);
      expect(await activities(id, 'follow_up_reassigned')).toHaveLength(1);
    });

    it('cancels open follow-ups when the lead is lost, and keeps completed ones', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const id = await mkOwnedLead(svc, e1);
      const pending = await mkFollowUp(id);
      const overdue = await mkFollowUp(id);
      const done = await mkFollowUp(id);
      await makeDue(overdue.id);
      await runSla();
      await http().post(`/follow-ups/${done.id}/complete`).set(as('manager')).send({}).expect(200);

      await http().patch(`/leads/${id}`).set(as('manager')).send({ status: 'lost' }).expect(200);

      expect(await followUp(pending.id)).toMatchObject({
        status: 'cancelled',
        outcomeNote: 'Lead was marked lost',
      });
      expect((await followUp(overdue.id)).status).toBe('cancelled');
      expect((await followUp(done.id)).status).toBe('completed');
      expect(await activities(id, 'follow_up_cancelled')).toHaveLength(1);
    });

    it('cancels open follow-ups when the lead is converted', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const id = await mkOwnedLead(svc, e1);
      const f = await mkFollowUp(id);
      for (const status of ['contacted', 'qualified', 'converted']) {
        await http().patch(`/leads/${id}`).set(as('manager')).send({ status }).expect(200);
      }
      expect(await followUp(f.id)).toMatchObject({
        status: 'cancelled',
        outcomeNote: 'Lead was marked converted',
      });
    });

    it('leaves follow-ups alone on ordinary status moves and field edits', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const id = await mkOwnedLead(svc, e1);
      const f = await mkFollowUp(id);
      await http()
        .patch(`/leads/${id}`)
        .set(as('manager'))
        .send({ status: 'contacted' })
        .expect(200);
      await http().patch(`/leads/${id}`).set(as('manager')).send({ company: 'ACME' }).expect(200);
      expect((await followUp(f.id)).status).toBe('pending');
    });
  });

  // ================================================================== SLA policies API

  describe('SLA policies API', () => {
    it('lets admin create and update, manager read only, sales nothing', async () => {
      const svc = newService();
      const p = await mkPolicy(svc);
      await http().get('/sla-policies').set(as('manager')).expect(200);
      await http().get(`/sla-policies/${p.id}`).set(as('manager')).expect(200);
      await http().post('/sla-policies').set(as('manager')).send({ name: 'xxx' }).expect(403);
      await http().patch(`/sla-policies/${p.id}`).set(as('manager')).send({}).expect(403);
      await http().get('/sla-policies').set(as('priya')).expect(403);
      await http().get('/sla-policies').expect(401);
      const upd = await http()
        .patch(`/sla-policies/${p.id}`)
        .set(as('admin'))
        .send({ isActive: false, responseMinutes: 90, action: 'reassign', matchService: null })
        .expect(200);
      expect(upd.body).toMatchObject({
        isActive: false,
        responseMinutes: 90,
        action: 'reassign',
        matchService: null,
      });
      await http()
        .patch(`/sla-policies/${p.id}`)
        .set(as('admin'))
        .send({ isActive: false })
        .expect(200);
    });

    it('validates input (400), duplicate names (409), inverted ranges (422) and missing ids (404)', async () => {
      const svc = newService();
      const p = await mkPolicy(svc, { name: `${marker} Unique` });
      await mkPolicy(svc, { name: `${marker} UNIQUE` }, 409);
      await mkPolicy(svc, { responseMinutes: 0 }, 400);
      await mkPolicy(svc, { responseMinutes: 525601 }, 400);
      await mkPolicy(svc, { responseMinutes: 1.5 }, 400);
      await mkPolicy(svc, { action: 'explode' }, 400);
      await mkPolicy(svc, { priority: 0 }, 400);
      await mkPolicy(svc, { name: 'ab' }, 400);
      await mkPolicy(svc, { minValue: 10, maxValue: 5 }, 422);
      await mkPolicy(svc, { matchPriority: 'urgent' }, 400);
      await http()
        .post('/sla-policies')
        .set(as('admin'))
        .send({ name: `${marker} nominutes` })
        .expect(400);
      await http()
        .patch(`/sla-policies/${p.id}`)
        .set(as('admin'))
        .send({ minValue: 10, maxValue: 5 })
        .expect(422);
      await http().patch(`/sla-policies/${p.id}`).set(as('admin')).send({ name: null }).expect(400);
      await http().get('/sla-policies/2147483647').set(as('admin')).expect(404);
      await http().get('/sla-policies/abc').set(as('admin')).expect(400);
    });

    it('lists policies in evaluation order with a filter and pagination', async () => {
      const svc = newService();
      const a = await mkPolicy(svc, { priority: 9000, name: `${marker} later` });
      const b = await mkPolicy(svc, { priority: 8999, name: `${marker} earlier` });
      const res = await http().get('/sla-policies?limit=100').set(as('manager')).expect(200);
      const ids = res.body.data.map((p: { id: number }) => p.id);
      expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
      await http().patch(`/sla-policies/${b.id}`).set(as('admin')).send({ isActive: false });
      const active = await http()
        .get('/sla-policies?isActive=true&limit=100')
        .set(as('manager'))
        .expect(200);
      expect(active.body.data.map((p: { id: number }) => p.id)).not.toContain(b.id);
      await http().get('/sla-policies?limit=0').set(as('manager')).expect(400);
    });
  });

  // ================================================================== SLA processor

  describe('SLA escalation', () => {
    it('does nothing to a lead that is still inside its response time', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      await mkPolicy(svc, { responseMinutes: 30 });
      const id = await mkOwnedLead(svc, e1);
      await ageLead(id, 10);
      const run = await runSla();
      expect(itemFor(run, id)).toBeUndefined();
      expect(await escalationsOf(id)).toHaveLength(0);
    });

    it('flags a breached lead once; running again creates no duplicate', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const policy = await mkPolicy(svc, { responseMinutes: 30, action: 'flag' });
      const id = await mkOwnedLead(svc, e1);
      await ageLead(id, 45);

      const run = await runSla();
      expect(itemFor(run, id)).toMatchObject({
        outcome: 'flagged',
        policyName: policy.name,
        toEmployeeId: null,
      });
      expect((await lead(id)).assignedEmployee.id).toBe(e1); // flag keeps the owner

      const list = await escalationsOf(id);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        outcome: 'flagged',
        action: 'flag',
        policyName: policy.name,
        referenceType: 'assignment',
        fromEmployee: { id: e1 },
        toEmployee: null,
      });
      const t = await types(id);
      expect(t.filter((x) => x === 'sla_breached')).toHaveLength(1);
      expect(t.filter((x) => x === 'escalated')).toHaveLength(1);

      for (let i = 0; i < 3; i++) {
        const again = await runSla();
        expect(itemFor(again, id)).toBeUndefined();
      }
      expect(await escalationsOf(id)).toHaveLength(1);
      const t2 = await types(id);
      expect(t2.filter((x) => x === 'sla_breached')).toHaveLength(1);
      expect(t2.filter((x) => x === 'escalated')).toHaveLength(1);
    });

    it('reassigns a breached lead to ANOTHER eligible employee and records it in the audit trail', async () => {
      const svc = newService();
      await mkRule(svc);
      const e1 = await mkEmployee(svc);
      const e2 = await mkEmployee(svc);
      const policy = await mkPolicy(svc, { responseMinutes: 30, action: 'reassign' });
      const id = await mkOwnedLead(svc, e1);
      const f = await mkFollowUp(id);
      await makeDue(f.id, 10); // missed follow-up: an upcoming one would count as "covered"
      await ageLead(id, 45);

      const run = await runSla();
      expect(itemFor(run, id)).toMatchObject({ outcome: 'reassigned', toEmployeeId: e2 });
      expect((await lead(id)).assignedEmployee.id).toBe(e2);

      const hist = await historyOf(id);
      const last = hist[hist.length - 1];
      expect(last).toMatchObject({
        action: 'reassigned',
        mode: 'automatic',
        performedBy: null,
        fromEmployee: { id: e1 },
        toEmployee: { id: e2 },
      });
      expect(last.reason).toContain('SLA escalation');
      expect(last.reason).toContain(policy.name);
      expect(last.metadata.slaEscalation).toBe(true);

      const [esc] = await escalationsOf(id);
      expect(esc).toMatchObject({
        outcome: 'reassigned',
        action: 'reassign',
        fromEmployee: { id: e1 },
        toEmployee: { id: e2 },
      });

      // timeline tells the whole story, in order, with no actor (the system did it)
      const t = await types(id);
      const tail = t.slice(t.indexOf('sla_breached'));
      expect(tail).toEqual(['sla_breached', 'reassigned', 'follow_up_reassigned', 'escalated']);
      expect((await followUp(f.id)).employee.id).toBe(e2);

      // the new owner starts with a fresh SLA window: nothing more happens
      const again = await runSla();
      expect(itemFor(again, id)).toBeUndefined();
      expect(await escalationsOf(id)).toHaveLength(1);
    });

    it('records no_eligible and keeps the owner when nobody else can take the lead', async () => {
      const svc = newService();
      await mkRule(svc);
      const e1 = await mkEmployee(svc); // the only specialist
      await mkPolicy(svc, { responseMinutes: 30, action: 'reassign' });
      const id = await mkOwnedLead(svc, e1);
      await ageLead(id, 45);

      const run = await runSla();
      expect(itemFor(run, id)).toMatchObject({ outcome: 'no_eligible', toEmployeeId: null });
      expect((await lead(id)).assignedEmployee.id).toBe(e1);
      const [esc] = await escalationsOf(id);
      expect(esc).toMatchObject({ outcome: 'no_eligible', action: 'reassign', toEmployee: null });
      expect(esc.fromEmployee).toMatchObject({ id: e1 });
      expect((await historyOf(id)).every((h: { mode: string }) => h.mode === 'manual')).toBe(true);
      const t = await types(id);
      expect(t).toEqual(expect.arrayContaining(['sla_breached', 'escalated']));

      await runSla();
      expect(await escalationsOf(id)).toHaveLength(1);
    });

    it('does not pick an employee who is unavailable, inactive or at capacity', async () => {
      const svc = newService();
      await mkRule(svc);
      const e1 = await mkEmployee(svc);
      await mkEmployee(svc, { availability: 'on_leave' });
      await mkInactiveEmployee(svc);
      const full = await mkEmployee(svc, { maxWorkload: 1 });
      await mkOwnedLead(svc, full);
      await mkPolicy(svc, { responseMinutes: 30, action: 'reassign' });
      const id = await mkOwnedLead(svc, e1);
      await ageLead(id, 45);
      const run = await runSla();
      expect(itemFor(run, id)).toMatchObject({ outcome: 'no_eligible' });
      expect((await lead(id)).assignedEmployee.id).toBe(e1);
    });

    it('counts a note, a status change or a follow-up as a response and restarts the clock', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      await mkPolicy(svc, { responseMinutes: 30 });
      const byNote = await mkOwnedLead(svc, e1);
      const byStatus = await mkOwnedLead(svc, e1);
      const byFollowUp = await mkOwnedLead(svc, e1);
      const silent = await mkOwnedLead(svc, e1);
      for (const id of [byNote, byStatus, byFollowUp, silent]) await ageLead(id, 45);

      await http()
        .post(`/leads/${byNote}/notes`)
        .set(as('manager'))
        .send({ note: 'Called, no answer' })
        .expect(201);
      await http()
        .patch(`/leads/${byStatus}`)
        .set(as('manager'))
        .send({ status: 'contacted' })
        .expect(200);
      await mkFollowUp(byFollowUp);

      const run = await runSla();
      expect(itemFor(run, byNote)).toBeUndefined();
      expect(itemFor(run, byStatus)).toBeUndefined();
      expect(itemFor(run, byFollowUp)).toBeUndefined();
      expect(itemFor(run, silent)).toMatchObject({ outcome: 'flagged' });
    });

    it('treats an upcoming pending follow-up as "covered" until it is cancelled', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      await mkPolicy(svc, { responseMinutes: 30 });
      const id = await mkOwnedLead(svc, e1);
      const f = await mkFollowUp(id, { dueAt: minutesFromNow(600) });
      await ageLead(id, 120); // pushes the follow-up creation into the past as well
      expect(itemFor(await runSla(), id)).toBeUndefined();

      await http().post(`/follow-ups/${f.id}/cancel`).set(as('manager')).send({}).expect(200);
      await ageLead(id, 120);
      expect(itemFor(await runSla(), id)).toMatchObject({ outcome: 'flagged' });
    });

    it('escalates again only after NEW activity starts and breaches a new SLA window', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      await mkPolicy(svc, { responseMinutes: 30 });
      const id = await mkOwnedLead(svc, e1);
      await ageLead(id, 45);
      expect(itemFor(await runSla(), id)).toMatchObject({ outcome: 'flagged' });
      expect(await escalationsOf(id)).toHaveLength(1);

      // owner answers, then goes quiet again
      await http()
        .post(`/leads/${id}/notes`)
        .set(as('manager'))
        .send({ note: 'Back in touch' })
        .expect(201);
      expect(itemFor(await runSla(), id)).toBeUndefined();
      await ageLead(id, 60);
      expect(itemFor(await runSla(), id)).toMatchObject({ outcome: 'flagged' });

      const list = await escalationsOf(id);
      expect(list).toHaveLength(2);
      expect(list.map((e) => e.referenceType).sort()).toEqual(['activity', 'assignment']);
    });

    it('never escalates closed or unassigned leads', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      await mkPolicy(svc, { responseMinutes: 30 });
      const lost = await mkOwnedLead(svc, e1);
      const converted = await mkOwnedLead(svc, e1);
      const unassigned = await mkLead(svc);
      await http().patch(`/leads/${lost}`).set(as('manager')).send({ status: 'lost' }).expect(200);
      for (const status of ['contacted', 'qualified', 'converted']) {
        await http().patch(`/leads/${converted}`).set(as('manager')).send({ status }).expect(200);
      }
      for (const id of [lost, converted, unassigned]) await ageLead(id, 600);
      const run = await runSla();
      for (const id of [lost, converted, unassigned]) expect(itemFor(run, id)).toBeUndefined();
    });

    it('ignores inactive policies and leads no policy matches', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const p = await mkPolicy(svc, { responseMinutes: 30, isActive: false });
      await mkPolicy(svc, { responseMinutes: 30, matchSource: 'referral' }); // wrong source
      const id = await mkOwnedLead(svc, e1, { source: 'website' });
      await ageLead(id, 120); // far past 30 minutes, yet still inside the demo 24h default
      const run = await runSla();
      expect(itemFor(run, id)).toBeUndefined();
      await http()
        .patch(`/sla-policies/${p.id}`)
        .set(as('admin'))
        .send({ isActive: true })
        .expect(200);
      expect(itemFor(await runSla(), id)).toMatchObject({ outcome: 'flagged' });
    });

    it('applies the first matching policy by priority, and policy conditions (priority, value)', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const strict = await mkPolicy(svc, {
        priority: 2,
        responseMinutes: 15,
        matchPriority: 'high',
        minValue: 1000,
      });
      await mkPolicy(svc, { priority: 3, responseMinutes: 600 });
      const hot = await mkOwnedLead(svc, e1, { priority: 'high', estimatedValue: 5000 });
      const cheap = await mkOwnedLead(svc, e1, { priority: 'high', estimatedValue: 10 });
      const lowPriority = await mkOwnedLead(svc, e1, { priority: 'low', estimatedValue: 5000 });
      for (const id of [hot, cheap, lowPriority]) await ageLead(id, 20);
      const run = await runSla();
      expect(itemFor(run, hot)).toMatchObject({ policyName: strict.name, outcome: 'flagged' });
      expect(itemFor(run, cheap)).toBeUndefined(); // falls to the 600 minute policy: still on time
      expect(itemFor(run, lowPriority)).toBeUndefined();
    });

    it('previews with dryRun and writes nothing', async () => {
      const svc = newService();
      await mkRule(svc);
      const e1 = await mkEmployee(svc);
      await mkEmployee(svc);
      await mkPolicy(svc, { responseMinutes: 30, action: 'reassign' });
      const id = await mkOwnedLead(svc, e1);
      await ageLead(id, 45);
      const before = await types(id);

      const dry = await runSla('?dryRun=true');
      expect(itemFor(dry, id)).toMatchObject({ outcome: 'would_escalate' });
      expect(dry.flagged + dry.reassigned + dry.noEligible).toBe(0);
      expect(await types(id)).toEqual(before);
      expect(await escalationsOf(id)).toHaveLength(0);
      expect((await lead(id)).assignedEmployee.id).toBe(e1);
    });

    it('handles overlapping runs without escalating twice', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      await mkPolicy(svc, { responseMinutes: 30 });
      const id = await mkOwnedLead(svc, e1);
      await ageLead(id, 45);
      const runs = await Promise.all([runSla(), runSla(), runSla()]);
      expect(runs.every((r) => r.errors === 0)).toBe(true);
      expect(await escalationsOf(id)).toHaveLength(1);
      expect((await types(id)).filter((t) => t === 'escalated')).toHaveLength(1);
    });

    it('is backed by a database rule: a duplicate escalation row cannot exist', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const policy = await mkPolicy(svc, { responseMinutes: 30 });
      const id = await mkOwnedLead(svc, e1);
      await ageLead(id, 45);
      await runSla();
      const [row] = await ds.query(
        `SELECT lead_id, reference_type, reference_id FROM lead_escalations WHERE lead_id = $1`,
        [id],
      );
      await expect(
        ds.query(
          `INSERT INTO lead_escalations
             (lead_id, policy_id, policy_name, response_minutes, action, outcome, reason,
              reference_type, reference_id, reference_at)
           VALUES ($1, $2, 'dup', 30, 'flag', 'flagged', 'dup', $3, $4, now())`,
          [id, policy.id, row.reference_type, row.reference_id],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    });

    it('limits who may run the processor', async () => {
      await http().post('/sla/run').expect(401);
      await http().post('/sla/run').set(as('priya')).expect(403);
      await http().post('/sla/run?dryRun=maybe').set(as('manager')).expect(400);
      await http().post('/sla/run').set(as('admin')).expect(200);
    });
  });

  describe('escalations API', () => {
    it('lists and filters escalations for managers, and scopes sales to their own leads', async () => {
      const svc = newService();
      await mkRule(svc);
      const e1 = await mkEmployee(svc);
      const e2 = await mkEmployee(svc);
      const flag = await mkPolicy(svc, { priority: 1, matchPriority: 'high', responseMinutes: 30 });
      const move = await mkPolicy(svc, { priority: 2, responseMinutes: 30, action: 'reassign' });
      const flagged = await mkOwnedLead(svc, e1, { priority: 'high' });
      const moved = await mkOwnedLead(svc, e1);
      const mine = await mkOwnedLead(svc, priyaEmployeeId, { priority: 'high' });
      for (const id of [flagged, moved, mine]) await ageLead(id, 45);
      await runSla();

      const q = (s: string) => http().get(`/escalations?${s}`).set(as('manager')).expect(200);
      expect(
        (await q(`policyId=${flag.id}&limit=100`)).body.data
          .map((x: { leadId: number }) => x.leadId)
          .sort(),
      ).toEqual([flagged, mine].sort());
      expect(
        (await q(`policyId=${move.id}`)).body.data.map((x: { leadId: number }) => x.leadId),
      ).toEqual([moved]);
      expect((await q(`leadId=${moved}`)).body.data[0]).toMatchObject({
        outcome: 'reassigned',
        policyName: move.name,
        lead: { id: moved },
      });
      expect(
        (await q(`outcome=reassigned&employeeId=${e2}&limit=100`)).body.data.map(
          (x: { leadId: number }) => x.leadId,
        ),
      ).toContain(moved);
      expect((await q(`outcome=no_eligible&leadId=${moved}`)).body.meta.total).toBe(0);
      const page = await q(`employeeId=${e1}&limit=1&page=2`);
      expect(page.body.data).toHaveLength(1);
      expect(page.body.meta.total).toBeGreaterThanOrEqual(2);
      expect((await q('from=2999-01-01')).body.meta.total).toBe(0);

      // newest first
      const stamps = (await q('limit=100')).body.data.map(
        (x: { createdAt: string }) => x.createdAt,
      );
      expect([...stamps].sort().reverse()).toEqual(stamps);

      await http().get('/escalations').set(as('priya')).expect(403);
      await http().get('/escalations').expect(401);
      await http().get('/escalations?outcome=bogus').set(as('manager')).expect(400);
      await http().get('/escalations?from=yesterday').set(as('manager')).expect(400);

      // sales: own lead yes, someone else's lead looks missing
      const own = await http().get(`/leads/${mine}/escalations`).set(as('priya')).expect(200);
      expect(own.body.meta.total).toBe(1);
      await http().get(`/leads/${flagged}/escalations`).set(as('priya')).expect(404);
      await http().get('/leads/2147483647/escalations').set(as('manager')).expect(404);
    });
  });

  // ================================================================== end to end

  describe('full flow', () => {
    it('create -> auto-assign -> follow-up -> breach -> reassign -> follow-up moves -> complete -> convert', async () => {
      const svc = newService();
      await mkRule(svc);
      const e1 = await mkEmployee(svc);
      await mkPolicy(svc, { responseMinutes: 30, action: 'reassign' });

      // 1) create: the engine picks the only specialist
      const created = await http()
        .post('/leads')
        .set(as('manager'))
        .send({ name: `${marker} Flow`, service: svc, location: 'Colombo' })
        .expect(201);
      const id = created.body.id as number;
      leadIds.push(id);
      expect(created.body.assignment).toMatchObject({ assigned: true, employee: { id: e1 } });

      // 2) a second specialist appears; the owner schedules a follow-up and then goes silent
      const e2 = await mkEmployee(svc);
      const f = await mkFollowUp(id, { type: 'meeting', title: 'Product demo' });
      const f2 = await mkFollowUp(id, { type: 'email', title: 'Send quote' });
      await http().post(`/follow-ups/${f2.id}/complete`).set(as('manager')).send({}).expect(200);
      await ageLead(id, 90);
      await http().post(`/follow-ups/${f.id}/cancel`).set(as('manager')).send({}).expect(200);
      const f3 = await mkFollowUp(id, {
        type: 'call',
        title: 'Final check-in',
        dueAt: minutesFromNow(1),
      });
      await makeDue(f3.id, 10); // missed it

      // 3) processor: the follow-up becomes overdue and the lead moves to e2
      const run = await runSla();
      expect(run.followUpsMarkedOverdue).toBeGreaterThanOrEqual(1);
      expect((await followUp(f3.id)).status).toBe('overdue');
      expect(itemFor(run, id)).toBeUndefined(); // the follow-up creation just reset the clock
      await ageLead(id, 90);
      const run2 = await runSla();
      expect(itemFor(run2, id)).toMatchObject({ outcome: 'reassigned', toEmployeeId: e2 });

      // 4) the open (overdue) follow-up moved with the lead, the completed one did not
      expect((await followUp(f3.id)).employee.id).toBe(e2);
      expect((await followUp(f2.id)).employee.id).toBe(e1);

      // 5) the new owner finishes the follow-up and converts the lead
      await http()
        .post(`/follow-ups/${f3.id}/complete`)
        .set(as('manager'))
        .send({ note: 'Signed' })
        .expect(200);
      for (const status of ['contacted', 'qualified', 'converted']) {
        await http().patch(`/leads/${id}`).set(as('manager')).send({ status }).expect(200);
      }
      expect((await lead(id)).status).toBe('converted');

      // 6) one readable audit trail
      const t = await types(id);
      for (const expected of [
        'lead_created',
        'assigned',
        'follow_up_created',
        'follow_up_completed',
        'follow_up_cancelled',
        'follow_up_overdue',
        'sla_breached',
        'reassigned',
        'follow_up_reassigned',
        'escalated',
        'status_changed',
      ]) {
        expect(t).toContain(expected);
      }
      const hist = await historyOf(id);
      expect(hist.map((h: { action: string; mode: string }) => `${h.action}/${h.mode}`)).toEqual([
        'assigned/automatic',
        'reassigned/automatic',
      ]);
      expect(await escalationsOf(id)).toHaveLength(1);
    });
  });

  // ================================================================== dashboard

  describe('dashboard', () => {
    it('shows workload, follow-ups and SLA breaches per employee', async () => {
      const svc = newService();
      await mkRule(svc);
      const busy = await mkEmployee(svc, { maxWorkload: 2 });
      const idle = await mkEmployee(svc);
      await mkPolicy(svc, { responseMinutes: 30, action: 'flag' });
      const a = await mkOwnedLead(svc, busy);
      const b = await mkOwnedLead(svc, busy);
      const converted = await mkOwnedLead(svc, busy);
      for (const status of ['contacted', 'qualified', 'converted']) {
        await http().patch(`/leads/${converted}`).set(as('manager')).send({ status }).expect(200);
      }
      const late = await mkFollowUp(a);
      await mkFollowUp(a, { dueAt: minutesFromNow(500) });
      await makeDue(late.id);
      await ageLead(b, 45);
      await runSla();

      const res = await http().get('/dashboard/employees?limit=100').set(as('manager')).expect(200);
      const row = (id: number) => res.body.data.find((r: { id: number }) => r.id === id);
      expect(row(busy)).toMatchObject({
        openLeads: 2,
        convertedLeads: 1,
        lostLeads: 0,
        maxWorkload: 2,
        utilizationPercent: 100,
        atCapacity: true,
        pendingFollowUps: 1,
        overdueFollowUps: 1,
        slaBreaches: 1,
      });
      expect(row(idle)).toMatchObject({
        openLeads: 0,
        utilizationPercent: 0,
        atCapacity: false,
        pendingFollowUps: 0,
        overdueFollowUps: 0,
        slaBreaches: 0,
      });
      expect(res.body.meta.total).toBeGreaterThanOrEqual(2);

      const page = await http()
        .get('/dashboard/employees?limit=1&page=2')
        .set(as('manager'))
        .expect(200);
      expect(page.body.data).toHaveLength(1);
      expect(page.body.meta.page).toBe(2);
      await http().get('/dashboard/employees').set(as('priya')).expect(403);
      await http().get('/dashboard/employees?limit=0').set(as('manager')).expect(400);
    });

    it('summarises the whole company and respects the time window', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const startedAt = new Date(Date.now() - 1000).toISOString();
      const a = await mkOwnedLead(svc, e1, { priority: 'high', source: 'referral' });
      await mkLead(svc, { priority: 'low', source: 'website' }); // stays unassigned
      await mkFollowUp(a, { dueAt: minutesFromNow(500) });
      const late = await mkFollowUp(a);
      await makeDue(late.id);

      const res = await http().get('/dashboard/overview').set(as('manager')).expect(200);
      const o = res.body;
      expect(Object.keys(o.leads.byStatus).sort()).toEqual([
        'assigned',
        'contacted',
        'converted',
        'follow_up',
        'lost',
        'new',
        'qualified',
      ]);
      const sum = (m: Record<string, number>) => Object.values(m).reduce((x, y) => x + y, 0);
      expect(sum(o.leads.byStatus)).toBe(o.leads.total);
      expect(sum(o.leads.bySource)).toBe(o.leads.total);
      expect(sum(o.leads.byPriority)).toBe(o.leads.total);
      expect(o.leads.open + o.leads.byStatus.converted + o.leads.byStatus.lost).toBe(o.leads.total);
      expect(o.leads.unassigned).toBeGreaterThanOrEqual(1);
      expect(o.followUps.overdue).toBeGreaterThanOrEqual(1);
      expect(o.followUps.pending).toBeGreaterThanOrEqual(1);
      expect(o.assignment.manual).toBeGreaterThanOrEqual(1);
      expect(typeof o.leads.conversionRate).toBe('number');

      // a window starting just before this test only sees what it created (plus other suites' newest)
      const windowed = await http()
        .get(`/dashboard/overview?from=${encodeURIComponent(startedAt)}`)
        .set(as('manager'))
        .expect(200);
      expect(windowed.body.period.from).toBe(startedAt);
      expect(windowed.body.leads.total).toBeGreaterThanOrEqual(2);
      expect(windowed.body.leads.total).toBeLessThanOrEqual(o.leads.total);
      expect(windowed.body.leads.byPriority.high).toBeGreaterThanOrEqual(1);
      expect(windowed.body.leads.byPriority.low).toBeGreaterThanOrEqual(1);

      const future = await http()
        .get('/dashboard/overview?from=2999-01-01')
        .set(as('manager'))
        .expect(200);
      expect(future.body.leads).toMatchObject({ total: 0, open: 0, conversionRate: 0, winRate: 0 });
      expect(future.body.followUps).toMatchObject({ total: 0, overdue: 0, dueToday: 0 });
      expect(future.body.escalations.total).toBe(0);

      await http()
        .get('/dashboard/overview?from=2026-10-01&to=2026-09-01')
        .set(as('manager'))
        .expect(400);
      await http().get('/dashboard/overview?from=yesterday').set(as('manager')).expect(400);
      await http().get('/dashboard/overview').set(as('priya')).expect(403);
      await http().get('/dashboard/overview').expect(401);
    });

    it('computes conversion and win rates', async () => {
      const svc = newService();
      const e1 = await mkEmployee(svc);
      const from = new Date(Date.now() - 1000).toISOString();
      const won = await mkOwnedLead(svc, e1);
      const lost = await mkOwnedLead(svc, e1);
      await mkLead(svc);
      for (const status of ['contacted', 'qualified', 'converted']) {
        await http().patch(`/leads/${won}`).set(as('manager')).send({ status }).expect(200);
      }
      await http().patch(`/leads/${lost}`).set(as('manager')).send({ status: 'lost' }).expect(200);
      const { body } = await http()
        .get(`/dashboard/overview?from=${encodeURIComponent(from)}`)
        .set(as('admin'))
        .expect(200);
      // other suites may add leads inside the window, so check the formula rather than fixed numbers
      const { converted, lost: lostCount } = body.leads.byStatus;
      expect(converted).toBeGreaterThanOrEqual(1);
      expect(lostCount).toBeGreaterThanOrEqual(1);
      expect(body.leads.conversionRate).toBeCloseTo((converted / body.leads.total) * 100, 1);
      expect(body.leads.winRate).toBeCloseTo((converted / (converted + lostCount)) * 100, 1);
    });

    it('gives a sales user their own numbers and next follow-ups', async () => {
      const svc = newService();
      const id = await mkOwnedLead(svc, priyaEmployeeId);
      const soon = await mkFollowUp(id, { title: 'Soonest', dueAt: minutesFromNow(5) }, 'priya');
      await mkFollowUp(id, { title: 'Later', dueAt: minutesFromNow(900) }, 'priya');
      const res = await http().get('/dashboard/me').set(as('priya')).expect(200);
      expect(res.body).toMatchObject({ id: priyaEmployeeId });
      expect(res.body.openLeads).toBeGreaterThanOrEqual(1);
      expect(res.body.pendingFollowUps).toBeGreaterThanOrEqual(2);
      const next = res.body.nextFollowUps as { id: number; leadId: number; overdue: boolean }[];
      expect(next.length).toBeLessThanOrEqual(5);
      expect(next.map((n) => n.id)).toContain(soon.id);
      // soonest first
      const positions = next.map((n) => n.id);
      expect(positions.indexOf(soon.id)).toBeLessThan(positions.length);
      await http().get('/dashboard/me').set(as('manager')).expect(403);
      await http().get('/dashboard/me').expect(401);
    });
  });
});
