import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

const DESCRIPTION = `
REST API for leads, employees, configurable assignment rules, follow-ups, SLA escalation and dashboards.

**How to try it**
1. \`POST /auth/login\` with a demo account (see README), copy the \`accessToken\`.
2. Click **Authorize** (top right) and paste the token.
3. Every other route needs that token. Roles: \`admin\`, \`manager\`, \`sales\`.

**Errors** always have the same shape (see \`ErrorResponse\`):
\`400\` invalid input, \`401\` not logged in, \`403\` role not allowed, \`404\` not found (also used when a sales user asks for someone else's record),
\`409\` conflict with current state, \`422\` valid format but not allowed by a business rule.
`.trim();

/** Tags in the order they should appear in the UI. */
const TAGS: [string, string][] = [
  ['Auth', 'Login and "who am I"'],
  ['Users', 'User accounts (admin / manager)'],
  ['Employees', 'Sales employee profiles: specialization, territory, availability, workload'],
  ['Leads', 'Lead lifecycle, search / filter / pagination, notes and activity timeline'],
  ['Lead assignment', 'Automatic assignment, preview, manual reassignment, ownership history'],
  ['Assignment rules', 'Configurable rules that decide who gets a lead (database-driven)'],
  ['Follow-ups', 'Calls, meetings, emails: pending, overdue, completed, cancelled'],
  ['SLA policies', 'Configurable response-time policies and their actions'],
  ['SLA & escalations', 'Run the SLA processor, list escalations'],
  ['Dashboard', 'Statistics for managers and for each sales user'],
  ['Health', 'Liveness / database check'],
];

export function buildSwaggerDocument(app: INestApplication): OpenAPIObject {
  const builder = new DocumentBuilder()
    .setTitle('Neirah CRM - Smart Lead Assignment & Follow-Up Engine')
    .setDescription(DESCRIPTION)
    .setVersion('1.0')
    .addBearerAuth();
  for (const [name, description] of TAGS) builder.addTag(name, description);
  return enrichDocument(SwaggerModule.createDocument(app, builder.build()));
}

export function setupSwagger(app: INestApplication): OpenAPIObject {
  const document = buildSwaggerDocument(app);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: undefined,
      operationsSorter: undefined,
    },
  });
  return document;
}

/**
 * Adds what is true for (almost) every route so it does not have to be repeated on 40 handlers:
 * the shared error body, 401 for protected routes, 400 where input is validated, 404 for `/{id}` routes.
 * 403 comes from the @Roles decorator itself.
 */
interface LooseOperation {
  requestBody?: unknown;
  parameters?: { in: string }[];
  security?: unknown[];
  responses: Record<string, unknown>;
}

export function enrichDocument(doc: OpenAPIObject): OpenAPIObject {
  doc.components ??= {};
  doc.components.schemas ??= {};
  doc.components.schemas['ErrorResponse'] = {
    type: 'object',
    required: ['statusCode', 'error', 'message', 'path', 'timestamp'],
    properties: {
      statusCode: { type: 'integer', example: 404 },
      error: { type: 'string', example: 'Not Found' },
      message: {
        oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
        example: 'Lead not found',
        description: 'A sentence, or a list of validation messages for 400',
      },
      path: { type: 'string', example: '/leads/999' },
      timestamp: { type: 'string', format: 'date-time' },
    },
  };

  const error = (description: string) => ({
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
  });

  for (const [path, operations] of Object.entries(doc.paths)) {
    for (const rawOp of Object.values(operations as Record<string, unknown>)) {
      if (!rawOp || typeof rawOp !== 'object') continue;
      const op = rawOp as LooseOperation;
      if (!op.responses) continue;
      const hasInput =
        op.requestBody || (op.parameters ?? []).some((p) => p.in === 'query' || p.in === 'path');
      if (hasInput) op.responses['400'] ??= error('Invalid input (details in `message`)');
      if (op.security?.length) {
        op.responses['401'] ??= error('Missing, invalid or expired token');
      }
      if (path.includes('{')) {
        op.responses['404'] ??= error('Not found (or not visible to this user)');
      }
      // keep status codes in numeric order
      op.responses = Object.fromEntries(
        Object.entries(op.responses).sort(([a], [b]) => Number(a) - Number(b)),
      );
    }
  }
  return doc;
}
