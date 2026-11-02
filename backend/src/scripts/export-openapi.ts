import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildOpenApiDocument, createApp } from '../app.factory.js';

// Writes openapi.json at the backend root; the frontend's `npm run api:gen` consumes it.
const app = await createApp();
try {
  const document = buildOpenApiDocument(app);
  const target = resolve(process.cwd(), 'openapi.json');
  writeFileSync(target, JSON.stringify(document, null, 2) + '\n');
  console.log(`OpenAPI document written to ${target}`);
} finally {
  await app.close();
}
