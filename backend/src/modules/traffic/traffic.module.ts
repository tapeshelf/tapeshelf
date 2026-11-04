import { Global, Module } from '@nestjs/common';

import { TrafficService } from './traffic.service.js';

/** The monthly traffic of an account. */
@Global()
@Module({
  providers: [TrafficService],
  exports: [TrafficService],
})
export class TrafficModule {}
