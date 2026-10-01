import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

/**
 * End-to-end tests against the real database.
 * Requires: PostgreSQL running, migrations applied and `npm run seed` executed.
 */
describe('Auth + RBAC (e2e)', () => {
  let app: INestApplication<App>;
  const password = process.env.SEED_DEFAULT_PASSWORD as string;

  const login = async (email: string) => {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
    return res.body.accessToken as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health is public', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('protected routes return 401 without a token', async () => {
    await request(app.getHttpServer()).get('/users').expect(401);
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('rejects a tampered/invalid token with 401', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer not.a.real.token')
      .expect(401);
  });

  it('login fails with 401 for a wrong password', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@neirah.test', password: 'WrongPass1' })
      .expect(401);
  });

  it('login rejects an invalid payload with 400', async () => {
    await request(app.getHttpServer()).post('/auth/login').send({ email: 'nope' }).expect(400);
  });

  it('login never exposes a password hash', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@neirah.test', password })
      .expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2b\$/);
  });

  it('admin can list users and the response has no password hashes', async () => {
    const token = await login('admin@neirah.test');
    const res = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2b\$/);
  });

  it('manager can list users', async () => {
    const token = await login('manager@neirah.test');
    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('sales employee gets 403 on admin/manager routes', async () => {
    const token = await login('priya@neirah.test');
    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'x@neirah.test', password: 'Secret123', role: 'admin' })
      .expect(403);
  });

  it('only admin can create users (manager gets 403)', async () => {
    const token = await login('manager@neirah.test');
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'x@neirah.test', password: 'Secret123', role: 'sales' })
      .expect(403);
  });

  it('admin gets 400 for an invalid user payload and 409 for a duplicate email', async () => {
    const token = await login('admin@neirah.test');
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'bad', password: '1', role: 'boss' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'priya@neirah.test', password: 'Secret123', role: 'sales' })
      .expect(409);
  });
});
