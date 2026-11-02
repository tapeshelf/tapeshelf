import 'dotenv/config';

import { seedAdmin } from '../src/scripts/seed-admin.js';

// `npm run seed` in development; the production image runs dist/scripts/seed-admin.js directly.
console.log(await seedAdmin());
