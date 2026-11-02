import { Global, Module } from '@nestjs/common';

import { DemoService } from './demo.service.js';

/** The public demo's daily reset and seed; idle unless DEMO_MODE. */
@Global()
@Module({
  providers: [DemoService],
  exports: [DemoService],
})
export class DemoModule {}
