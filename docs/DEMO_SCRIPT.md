# Demo video script

Target length: 8 to 10 minutes. Every request below was tested against the seeded database.
Use Swagger UI (`http://localhost:3000/api/docs`): click **Authorize**, paste a token, then **Try it out**.

## Before recording

```bash
docker compose up -d --build     # database + API (stop `npm run start:dev` first, both use port 3000)
npm install && npm run seed      # demo users, employees, rules, SLA policies
```

- Open three windows: Swagger UI, a terminal in the project folder, this script.
- Increase terminal font size. Do not show `.env`.
- Passwords: the value of `SEED_DEFAULT_PASSWORD` in `.env`. Users: `admin@neirah.test`, `manager@neirah.test`, `priya@neirah.test` (sales).

## Part 1: Introduction (0:00 - 1:00)

Show the GitHub repository, then the README: stack, architecture diagram, ER diagram.
Say: "A NestJS and PostgreSQL backend that assigns leads with configurable rules, tracks follow-ups, and escalates breached SLAs automatically. Everything is recorded in history."

Terminal: `docker compose ps` (api and db healthy). Browser: `/health`, then Swagger UI (groups: Auth, Leads, Employees, Assignment, Follow-ups, SLA, Dashboard).

## Part 2: Login and role-based access (1:00 - 2:15)

1. `POST /auth/login` as manager:
   `{ "email": "manager@neirah.test", "password": "<SEED_DEFAULT_PASSWORD>" }`. Copy `accessToken`, click Authorize.
2. `GET /auth/me`: shows role `manager`.
3. Show restrictions. Log in as `priya@neirah.test` (sales), Authorize with that token:
   - `POST /leads` returns **403 Forbidden**
   - `GET /employees` returns **403 Forbidden**
   - `GET /leads` works but shows only her own leads.
   Click Authorize, Logout: `GET /leads` returns **401 Unauthorized**.
4. Log back in as manager.

## Part 3: Employees and assignment rules (2:15 - 3:00)

- `GET /employees`: specialization, territory, availability, open leads (workload). Point out Sara Fernando (inactive) and one employee on leave.
- `GET /assignment-rules`: rules are data in the database, ordered by priority. Nothing is hard-coded.

## Part 4: Main flow, one lead from start to finish (3:00 - 7:00)

**4.1 Create lead (automatic assignment by specialization and territory)**

`POST /leads`
```json
{
  "name": "Ramesh Perera",
  "email": "ramesh@example.com",
  "phone": "0771234567",
  "company": "Perera Holdings",
  "source": "website",
  "service": "Enterprise",
  "location": "Colombo",
  "estimatedValue": 50000,
  "priority": "high"
}
```
Show `assignedEmployee` and `assignment.reason`. Say: "Specialization is Enterprise, territory Colombo. The engine explains why this employee was chosen." Note the lead `id` (call it `LEAD`).

**4.2 Activity timeline:** `GET /leads/{LEAD}/activities` shows `lead_created` and `assigned`.
`GET /leads/{LEAD}/assignment-history` shows the assignment decision with candidates and reason.

**4.3 Work the lead**
- `PATCH /leads/{LEAD}` `{ "status": "contacted" }`
- `POST /leads/{LEAD}/notes` `{ "note": "Customer wants a demo next week" }`

**4.4 Follow-up:** `POST /leads/{LEAD}/follow-ups`
```json
{ "title": "Call customer about quotation", "type": "call", "dueAt": "2030-01-01T10:00:00Z" }
```
(use any future date). Note the follow-up `id` (call it `FU`). Status is `pending`.

**4.5 Overdue processing.** Terminal (this moves time for the demo only):
```bash
npm run time-travel -- followup FU 120
```
Swagger: `POST /sla/run` with `dryRun` = true first (shows what would happen, changes nothing), then with dryRun = false.
`GET /follow-ups/{FU}` is now **overdue**.

**4.6 No-action SLA, escalation and reassignment.** Terminal:
```bash
npm run time-travel -- lead LEAD 180
```
Swagger: `POST /sla/run`. The result shows `breaches: 1, reassigned: 1`. Then:
- `GET /leads/{LEAD}`: new owner.
- `GET /leads/{LEAD}/escalations`: the SLA policy, the breach, the action.
- `POST /sla/run` again, and once more: `reassigned: 0`. "Repeated scheduler runs never create duplicates."
  (The same check runs every 60 seconds by itself in the background.)

**4.7 Final status**
- `POST /follow-ups/{FU}/complete` `{ "note": "Customer agreed" }`
  (works even after the SLA reassignment moved the follow-up to the new owner)
- `PATCH /leads/{LEAD}` `{ "status": "qualified" }`, then `{ "status": "converted" }`
- `GET /leads/{LEAD}/activities?limit=50`: the full timeline from creation to `converted`.

## Part 5: Other assignment cases (7:00 - 8:30)

**Workload decides.** Run `POST /leads` three times with `{ "name": "Lead A", "service": "Enterprise", "location": "Colombo" }` (then B, C). Read each `assignment.reason`: the employee with the lowest open leads wins, ties are broken by least recently assigned.
For a dry run: create a lead with `"autoAssign": false`, then `GET /leads/{id}/assignment-preview`: lists eligible candidates with workload, excluded employees with the reason, and the tie-break. Nothing is saved.

**Territory.** `POST /leads` with `"service": "Enterprise", "location": "Jaffna"` goes to Nimal Perera (the Jaffna specialist).

**No eligible employee.** `POST /leads` with `{ "name": "Ruwan Silva", "service": "Government", "location": "Galle" }`: `assignment.action` is `no_eligible`, the lead stays unassigned, nothing crashes.

**Manual reassignment with history.** Use that unassigned lead: `POST /leads/{id}/reassign`
```json
{ "employeeId": 1, "reason": "Manager picked Arun" }
```
Then `GET /leads/{id}/assignment-history`: both the automatic `no_eligible` row and the manual `assigned` row are kept. "History is never overwritten."

**Inactive employees** are never chosen: Sara Fernando is inactive and absent from every candidate list.

## Part 6: Dashboard (8:30 - 9:00)

- `GET /dashboard/overview`: leads by status, source, priority, follow-up counts, escalations, assignments.
- `GET /dashboard/employees`: workload per employee.
- As Priya: `GET /dashboard/me` shows only her own numbers.

## Part 7: Tests and close (9:00 - 10:00)

```bash
npm test               # 62 unit tests
npm run test:e2e       # 137 end-to-end tests
```
Optionally run `npm run demo` for a one-command narrated version of everything above.
Close: "API docs are in Swagger, docs/openapi.json and docs/postman_collection.json. Setup is in the README, and it runs from a clean clone with Docker."

## If something goes wrong while recording

- 401 on every call: the token expired (1 hour). Log in again and re-Authorize.
- Port 3000 in use: stop `npm run start:dev` (Ctrl+C) before `docker compose up`.
- Empty employee list: run `npm run seed`.
- You can always cut and re-record one part. The data is not harmed by repeating steps.
