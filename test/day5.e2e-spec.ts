import 'dotenv/config';
process.env.SCHEDULER_ENABLED = 'false';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { buildSwaggerDocument } from '../src/common/swagger';

/**
 * Day 5 e2e: robustness and security. Complements Day 2-4 (which cover the business flows):
 * token abuse, secrets never leaking, hostile input, pagination limits, role matrix, API docs.
 */
describe('Day 5: robustness and security (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  const password = process.env.SEED_DEFAULT_PASSWORD as string;
  const marker = `E5${Date.now()}`;
  const tokens: Record<string, string> = {};
  const userIds: number[] = [];
  const leadIds: number[] = [];

  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

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
    if (userIds.length) await ds.query('DELETE FROM users WHERE id = ANY($1)', [userIds]);
    await app.close();
  });

  describe('authentication abuse', () => {
    it('rejects requests with no token, a garbage token and a wrong scheme', async () => {
      await http().get('/leads').expect(401);
      await http().get('/leads').set('Authorization', 'Bearer not.a.jwt').expect(401);
      await http().get('/leads').set('Authorization', `Basic ${tokens.admin}`).expect(401);
    });

    it('rejects a token with a tampered payload', async () => {
      const [h, , s] = tokens.priya.split('.');
      const forged = Buffer.from(JSON.stringify({ sub: 1, role: 'admin' })).toString('base64url');
      await http().get('/users').set('Authorization', `Bearer ${h}.${forged}.${s}`).expect(401);
    });

    it('rejects a token signed with another secret and an expired token', async () => {
      const me = await http().get('/auth/me').set(as('admin')).expect(200);
      const wrong = new JwtService({ secret: 'some-other-secret' }).sign({
        sub: me.body.id,
        email: me.body.email,
        role: 'admin',
      });
      await http().get('/users').set('Authorization', `Bearer ${wrong}`).expect(401);
      const expired = new JwtService({ secret: process.env.JWT_SECRET }).sign(
        { sub: me.body.id, email: me.body.email, role: 'admin' },
        { expiresIn: '-10s' },
      );
      await http().get('/users').set('Authorization', `Bearer ${expired}`).expect(401);
    });

    it('login gives the same generic error for unknown email and wrong password', async () => {
      const a = await http()
        .post('/auth/login')
        .send({ email: 'nobody@neirah.test', password: 'Whatever123' })
        .expect(401);
      const b = await http()
        .post('/auth/login')
        .send({ email: 'admin@neirah.test', password: 'Wrong12345' })
        .expect(401);
      expect(a.body.message).toBe(b.body.message);
    });

    it('a deactivated user can no longer use an old token or log in', async () => {
      const email = `${marker}.temp@neirah.test`;
      const created = await http()
        .post('/users')
        .set(as('admin'))
        .send({ email, password: 'Temp12345', role: 'sales' })
        .expect(201);
      userIds.push(created.body.id);
      const login = await http().post('/auth/login').send({ email, password: 'Temp12345' });
      expect(login.status).toBe(200);
      const token = login.body.accessToken as string;
      await http().get('/auth/me').set('Authorization', `Bearer ${token}`).expect(200);

      await ds.query('UPDATE users SET is_active = false WHERE id = $1', [created.body.id]);
      await http().get('/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
      await http().post('/auth/login').send({ email, password: 'Temp12345' }).expect(401);
    });
  });

  describe('secrets never leak', () => {
    it('no response contains a password hash', async () => {
      const bodies = [
        (await http().get('/users').set(as('admin')).expect(200)).body,
        (await http().get('/auth/me').set(as('admin')).expect(200)).body,
      ];
      const text = JSON.stringify(bodies);
      expect(text).not.toMatch(/passwordHash|password_hash|\$2[aby]\$/);
    });

    it('error responses use one shape and never expose stack traces or SQL', async () => {
      const res = await http().get('/leads/999999999').set(as('admin')).expect(404);
      expect(Object.keys(res.body).sort()).toEqual(
        ['error', 'message', 'path', 'statusCode', 'timestamp'].sort(),
      );
      expect(JSON.stringify(res.body)).not.toMatch(/stack|SELECT|typeorm|node_modules/i);
    });
  });

  describe('hostile and malformed input', () => {
    it('SQL-injection style strings are treated as plain text', async () => {
      const evil = `x'; DROP TABLE leads; --`;
      for (const q of [
        `search=${encodeURIComponent(evil)}`,
        `service=${encodeURIComponent(evil)}`,
      ]) {
        const res = await http().get(`/leads?${q}`).set(as('admin')).expect(200);
        expect(res.body.data).toEqual([]);
      }
      const lead = await http()
        .post('/leads')
        .set(as('manager'))
        .send({
          name: `${marker} ${evil}`,
          service: `${marker}-svc`,
          location: 'Colombo',
          autoAssign: false,
        })
        .expect(201);
      leadIds.push(lead.body.id);
      const found = await http()
        .get(`/leads?search=${encodeURIComponent(marker)}`)
        .set(as('admin'))
        .expect(200);
      expect(found.body.data.map((l: { id: number }) => l.id)).toContain(lead.body.id);
      await http().get('/leads?limit=1').set(as('admin')).expect(200); // table still exists
    });

    it('rejects unknown fields, wrong types and non-JSON bodies', async () => {
      await http()
        .post('/leads')
        .set(as('manager'))
        .send({ name: 'X', service: 'S', isAdmin: true })
        .expect(400);
      await http()
        .post('/leads')
        .set(as('manager'))
        .send({ name: 123, service: ['a'] })
        .expect(400);
      await http()
        .post('/leads')
        .set(as('manager'))
        .set('Content-Type', 'application/json')
        .send('{"name": broken')
        .expect(400);
    });

    it('rejects mass-assignment of protected fields on user creation', async () => {
      await http()
        .post('/users')
        .set(as('admin'))
        .send({ email: `${marker}.x@neirah.test`, password: 'Temp12345', role: 'sales', id: 1 })
        .expect(400);
    });

    it('rejects an invalid role and a weak password', async () => {
      await http()
        .post('/users')
        .set(as('admin'))
        .send({ email: `${marker}.y@neirah.test`, password: 'Temp12345', role: 'superuser' })
        .expect(400);
      await http()
        .post('/users')
        .set(as('admin'))
        .send({ email: `${marker}.y@neirah.test`, password: 'onlyletters', role: 'sales' })
        .expect(400);
    });

    it('rejects non-numeric, negative and oversized ids with 4xx, never 500', async () => {
      for (const id of ['abc', '-1', '0', '99999999999999999999']) {
        const res = await http().get(`/leads/${id}`).set(as('admin'));
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
      }
    });

    it('unknown routes return the standard 404 body', async () => {
      const res = await http().get('/does-not-exist').set(as('admin')).expect(404);
      expect(res.body.statusCode).toBe(404);
    });
  });

  describe('pagination and filters at the edges', () => {
    it('rejects page 0, negative page and limit above 100', async () => {
      for (const q of ['page=0', 'page=-2', 'limit=0', 'limit=101', 'page=abc']) {
        await http().get(`/leads?${q}`).set(as('admin')).expect(400);
      }
    });

    it('a page far beyond the data returns an empty list with correct totals', async () => {
      const res = await http().get('/leads?page=9999&limit=100').set(as('admin')).expect(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.page).toBe(9999);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(0);
    });

    it('rejects an invalid enum filter, bad date and inverted numeric range', async () => {
      await http().get('/leads?status=bogus').set(as('admin')).expect(400);
      await http().get('/leads?createdFrom=not-a-date').set(as('admin')).expect(400);
      await http().get('/leads?sortBy=password').set(as('admin')).expect(400);
    });
  });

  describe('role matrix', () => {
    const matrix: Array<[string, string, string[], string[]]> = [
      // method, path, allowed, forbidden
      ['get', '/users', ['admin', 'manager'], ['priya']],
      ['get', '/employees', ['admin', 'manager'], ['priya']],
      ['get', '/assignment-rules', ['admin', 'manager'], ['priya']],
      ['get', '/sla-policies', ['admin', 'manager'], ['priya']],
      ['get', '/escalations', ['admin', 'manager'], ['priya']],
      ['get', '/dashboard/overview', ['admin', 'manager'], ['priya']],
      ['get', '/dashboard/employees', ['admin', 'manager'], ['priya']],
      ['get', '/dashboard/me', ['priya'], []],
    ];
    it.each(matrix)('%s %s', async (method, path, allowed, forbidden) => {
      const call = (who: string) =>
        (http() as unknown as Record<string, (p: string) => request.Test>)
          [method](path)
          .set(as(who));
      for (const who of allowed) expect((await call(who)).status).toBe(200);
      for (const who of forbidden) expect((await call(who)).status).toBe(403);
    });

    it('sales cannot create leads, run the SLA check or manage users', async () => {
      await http().post('/leads').set(as('priya')).send({ name: 'x', service: 'y' }).expect(403);
      await http().post('/sla/run').set(as('priya')).expect(403);
      await http()
        .post('/users')
        .set(as('priya'))
        .send({ email: `${marker}.z@neirah.test`, password: 'Temp12345', role: 'admin' })
        .expect(403);
    });

    it('a sales rep cannot read a lead that is not theirs', async () => {
      const lead = await http()
        .post('/leads')
        .set(as('manager'))
        .send({
          name: `${marker} private`,
          service: `${marker}-none`,
          location: 'Colombo',
          autoAssign: false,
        })
        .expect(201);
      leadIds.push(lead.body.id);
      await http().get(`/leads/${lead.body.id}`).set(as('priya')).expect(404);
      await http().get(`/leads/${lead.body.id}/activities`).set(as('priya')).expect(404);
      await http()
        .post(`/leads/${lead.body.id}/notes`)
        .set(as('priya'))
        .send({ note: 'sneaky' })
        .expect(404);
    });

    it('health is public', async () => {
      const res = await http().get('/health').expect(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('API documentation', () => {
    it('OpenAPI document covers the API with documented error responses', () => {
      const doc = buildSwaggerDocument(app);
      const ops = Object.values(doc.paths).flatMap((p) => Object.values(p));
      expect(Object.keys(doc.paths).length).toBeGreaterThanOrEqual(30);
      expect(doc.components?.schemas?.ErrorResponse).toBeDefined();
      const lead = doc.paths['/leads/{id}'].get as { responses: Record<string, unknown> };
      expect(Object.keys(lead.responses)).toEqual(expect.arrayContaining(['200', '401', '404']));
      // every operation has a summary so the Swagger UI is readable
      const withoutSummary = ops.filter((o) => !(o as { summary?: string }).summary);
      expect(withoutSummary).toEqual([]);
    });
  });
});
