/**
 * Writes the OpenAPI document to docs/openapi.json (import it into Postman / Insomnia / Swagger Editor).
 * Usage: npm run docs:export   (needs the database to be reachable, like the app itself)
 */
process.env.SCHEDULER_ENABLED = 'false';

import { NestFactory } from '@nestjs/core';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { buildSwaggerDocument } from '../src/common/swagger';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.init();
  const document = buildSwaggerDocument(app);
  const dir = join(__dirname, '..', 'docs');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'openapi.json'), JSON.stringify(document, null, 2) + '\n');
  await app.close();
  const operations = Object.values(document.paths).reduce((n, p) => n + Object.keys(p).length, 0);
  console.log(`docs/openapi.json written: ${operations} operations`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
