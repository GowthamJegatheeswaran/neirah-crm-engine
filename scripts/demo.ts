/**
 * One-command demo of the whole system, narrated in the terminal. Good for the demo video.
 *
 *   1. start the API   (npm run start:dev  or  docker compose up -d --build)
 *   2. npm run demo
 *
 * It talks to the REAL running API over HTTP (BASE_URL, default http://localhost:3000).
 * Only "time travel" (making a lead look 3 hours old) is done with SQL, because the API
 * never rewrites history. Everything it creates uses its own unique service names, and is
 * removed at the end (set KEEP_DEMO_DATA=1 to keep it for browsing in Swagger).
 */
import 'dotenv/config';
import dataSource from '../src/database/data-source';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? '';
const RUN = `Demo${Date.now().toString().slice(-6)}`;

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const tokens: Record<string, string> = {};
const leadIds: number[] = [];
const employeeIds: number[] = [];
const policyIds: number[] = [];
let failures = 0;

const line = (s = '') => console.log(s);
const title = (s: string) => line(`\n\x1b[1;36m━━ ${s} ━━\x1b[0m`);
const say = (s: string) => line(`   ${s}`);
const check = (ok: boolean, s: string) => {
  if (!ok) failures++;
  line(`   ${ok ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✘\x1b[0m'} ${s}`);
};

async function api(method: string, path: string, who?: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(who ? { authorization: `Bearer ${tokens[who]}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Json;
  return { status: res.status, body: data };
}

async function ok(method: string, path: string, who: string, body?: unknown) {
  const r = await api(method, path, who, body);
  if (r.status >= 300) {
    throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(r.body)}`);
  }
  return r.body;
}

const mkEmployee = async (name: string, service: string, extra: Json = {}) => {
  const e = await ok('POST', '/employees', 'admin', {
    fullName: `${RUN} ${name}`,
    specializations: [service],
    territory: 'Colombo',
    maxWorkload: 10,
    ...extra,
  });
  employeeIds.push(e.id as number);
  return e as Json;
};

const mkLead = async (service: string, extra: Json = {}) => {
  const l = await ok('POST', '/leads', 'manager', {
    name: `${RUN} lead`,
    service,
    location: 'Colombo',
    ...extra,
  });
  leadIds.push(l.id as number);
  return l as Json;
};

const ageLead = async (leadId: number, minutes: number) => {
  for (const t of ['assignment_history', 'lead_activities']) {
    await dataSource.query(
      `UPDATE ${t} SET created_at = created_at - ($2 * interval '1 minute') WHERE lead_id = $1`,
      [leadId, minutes],
    );
  }
};

async function main() {
  await dataSource.initialize();
  line(`\x1b[1mNeirah CRM engine demo\x1b[0m  (API: ${BASE}, run id: ${RUN})`);

  title('1. Login and role-based access');
  for (const who of ['admin', 'manager', 'priya']) {
    const r = await api('POST', '/auth/login', undefined, {
      email: `${who}@neirah.test`,
      password: PASSWORD,
    });
    if (r.status !== 200) throw new Error(`Login failed for ${who}. Did you run npm run seed?`);
    tokens[who] = r.body.accessToken as string;
  }
  check(true, 'admin, manager and a sales rep (priya) logged in with JWT');
  check((await api('GET', '/leads')).status === 401, 'no token -> 401 Unauthorized');
  check(
    (await api('POST', '/leads', 'priya', { name: 'x', service: 'y' })).status === 403,
    'sales rep tries to create a lead -> 403 Forbidden',
  );
  check(
    (await api('GET', '/employees', 'priya')).status === 403,
    'sales rep tries to list employees -> 403 Forbidden',
  );

  title('2. Smart assignment: employees with different workloads');
  const svc = `${RUN}-Solar`;
  const A = await mkEmployee('Asha (busy)', svc);
  const B = await mkEmployee('Bala (medium)', svc);
  const C = await mkEmployee('Chitra (free)', svc);
  for (const [emp, n] of [
    [A, 3],
    [B, 1],
  ] as const) {
    for (let i = 0; i < n; i++) {
      const lead = await mkLead(svc, { autoAssign: false });
      await ok('POST', `/leads/${lead.id}/reassign`, 'manager', {
        employeeId: emp.id,
        reason: 'demo: build up workload',
      });
    }
  }
  say('Workloads now: Asha = 3 open leads, Bala = 1, Chitra = 0');
  const first = await mkLead(svc);
  say(`New lead auto-assigned to: ${first.assignedEmployee?.fullName}`);
  say(`Why: ${first.assignment.reason}`);
  check(first.assignedEmployee?.id === C.id, 'least-loaded eligible employee (Chitra) was chosen');

  title('3. Tie-break when workloads are equal');
  const second = await mkLead(svc); // Chitra 1, Bala 1, Asha 3 -> tie between Chitra and Bala
  say(`Tie between Bala and Chitra -> ${second.assignedEmployee?.fullName}`);
  say(`Tie-break rule used: ${second.assignment.tieBreak}`);
  check(second.assignment.tieBreak !== 'none', 'a deterministic tie-break decided it');

  title('4. No match for specialization / territory');
  const nobody = await mkLead(`${RUN}-Unknown-Service`);
  say(`Result: ${nobody.assignment.action}, reason: ${nobody.assignment.reason}`);
  check(nobody.assignedEmployee === null, 'lead stays unassigned, nothing crashes');

  title('5. Inactive / unavailable employees are excluded');
  await ok('PATCH', `/employees/${C.id}`, 'admin', { isActive: false });
  const third = await mkLead(svc);
  const cands = (third.assignment.candidates ?? []) as Json[];
  say(`Chitra deactivated. Lead went to: ${third.assignedEmployee?.fullName}`);
  say(`Eligible candidates considered: ${cands.length} (Chitra is not among them)`);
  check(third.assignedEmployee?.id !== C.id, 'inactive employee never receives a lead');
  await ok('PATCH', `/employees/${C.id}`, 'admin', { isActive: true });

  title('6. Manual reassignment keeps full history');
  await ok('POST', `/leads/${first.id}/reassign`, 'manager', {
    employeeId: A.id,
    reason: 'Customer asked for Asha',
  });
  const hist = await ok('GET', `/leads/${first.id}/assignment-history`, 'manager');
  const rows = hist.data as Json[];
  say(`History of lead #${first.id}: ${rows.map((h) => `${h.action}(${h.mode})`).join(' <- ')}`);
  check(rows.length >= 2, 'both the automatic and the manual assignment are kept (newest first)');

  title('7. Follow-ups: create, overdue detection');
  const fu = await ok('POST', `/leads/${second.id}/follow-ups`, 'manager', {
    title: 'Call back about quotation',
    dueAt: new Date(Date.now() + 3600_000).toISOString(),
  });
  await dataSource.query(
    `UPDATE follow_ups SET due_at = now() - interval '2 hours' WHERE id = $1`,
    [fu.id],
  );
  const dry = await ok('POST', '/sla/run?dryRun=true', 'manager');
  say(`Dry run (changes nothing): would mark ${dry.followUpsMarkedOverdue} follow-up(s) overdue`);
  const real = await ok('POST', '/sla/run', 'manager');
  const fuNow = await ok('GET', `/follow-ups/${fu.id}`, 'manager');
  say(`Real run marked ${real.followUpsMarkedOverdue} overdue. Follow-up status: ${fuNow.status}`);
  check(fuNow.status === 'overdue', 'overdue follow-up detected');

  title('8. SLA: no action in time -> automatic escalation (reassign)');
  const slaSvc = `${RUN}-SLA`;
  const S1 = await mkEmployee('Sam (owner)', slaSvc);
  const S2 = await mkEmployee('Tara (backup)', slaSvc);
  const pol = await ok('POST', '/sla-policies', 'admin', {
    name: `${RUN} 30 min then reassign`,
    priority: 1,
    matchService: slaSvc,
    responseMinutes: 30,
    action: 'reassign',
  });
  policyIds.push(pol.id as number);
  const slaLead = await mkLead(slaSvc, { autoAssign: false });
  await ok('POST', `/leads/${slaLead.id}/reassign`, 'manager', {
    employeeId: S1.id,
    reason: 'demo',
  });
  say('Lead given to Sam, then nobody touches it for 3 hours (simulated)...');
  await ageLead(slaLead.id as number, 180);
  const r1 = await ok('POST', '/sla/run', 'manager');
  const after = await ok('GET', `/leads/${slaLead.id}`, 'manager');
  say(
    `SLA run: breaches=${r1.breaches}, reassigned=${r1.reassigned}. Owner is now: ${after.assignedEmployee?.fullName}`,
  );
  check(after.assignedEmployee?.id === S2.id, 'lead moved from Sam to Tara automatically');

  title('9. Scheduler can run repeatedly without duplicates');
  const r2 = await ok('POST', '/sla/run', 'manager');
  const r3 = await ok('POST', '/sla/run', 'manager');
  const esc = await ok('GET', `/leads/${slaLead.id}/escalations`, 'manager');
  const escCount = (esc.data as Json[]).length;
  say(
    `Two more runs: reassigned=${r2.reassigned}+${r3.reassigned}. Escalations stored for the lead: ${escCount}`,
  );
  check(
    r2.reassigned === 0 && r3.reassigned === 0 && escCount === 1,
    'exactly one escalation, no duplicates',
  );

  title('10. Search, filter, pagination');
  const search = await ok('GET', `/leads?search=${RUN}&limit=3&page=1`, 'manager');
  say(
    `search="${RUN}" page 1 of ${search.meta.totalPages}: ${search.data.length} of ${search.meta.total} leads`,
  );
  const filt = await ok(
    'GET',
    `/leads?service=${encodeURIComponent(svc)}&unassigned=false&sortBy=createdAt&order=asc`,
    'manager',
  );
  say(`service=${svc}, assigned only: ${filt.meta.total} leads`);
  check(search.meta.total >= 8, 'filters and pagination metadata work');
  const bad = await api('GET', '/leads?limit=1000', 'manager');
  check(bad.status === 400, 'invalid query (limit=1000) -> 400 with clear message');
  check((await api('GET', '/leads/999999999', 'manager')).status === 404, 'missing lead -> 404');

  title('11. Dashboard statistics');
  const ov = await ok('GET', '/dashboard/overview', 'manager');
  say(`Leads total=${ov.leads.total}, open=${ov.leads.open}, unassigned=${ov.leads.unassigned}`);
  say(`Follow-ups: ${JSON.stringify(ov.followUps)}`);
  say(`Escalations: ${JSON.stringify(ov.escalations)}`);
  const emps = await ok('GET', '/dashboard/employees', 'manager');
  say(`Per-employee workload rows: ${(emps.data ?? emps).length}`);
  const mine = await ok('GET', '/dashboard/me', 'priya');
  say(`Sales view (priya) sees only own numbers: ${mine.fullName}`);
  check(ov.leads.total > 0, 'dashboard returns live statistics');

  title(failures ? `DONE with ${failures} failed check(s)` : 'ALL DEMO CHECKS PASSED');
}

async function cleanup() {
  if (process.env.KEEP_DEMO_DATA === '1') {
    line('\nKEEP_DEMO_DATA=1 -> demo data kept (search for the run id in Swagger).');
  } else {
    if (leadIds.length) await dataSource.query('DELETE FROM leads WHERE id = ANY($1)', [leadIds]);
    if (employeeIds.length)
      await dataSource.query('DELETE FROM employees WHERE id = ANY($1)', [employeeIds]);
    if (policyIds.length)
      await dataSource.query('DELETE FROM sla_policies WHERE id = ANY($1)', [policyIds]);
    line('\nDemo data removed (set KEEP_DEMO_DATA=1 to keep it).');
  }
  if (dataSource.isInitialized) await dataSource.destroy();
}

main()
  .catch((e) => {
    console.error('\n\x1b[31mDemo failed:\x1b[0m', e instanceof Error ? e.message : e);
    failures++;
  })
  .finally(() => cleanup().finally(() => process.exit(failures ? 1 : 0)));
