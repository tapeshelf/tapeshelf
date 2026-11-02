import { Global, Module } from '@nestjs/common';

import { BlocklistService } from './blocklist.service.js';

/** Hashes of originals and the blocklist of files removed for breaking the rules. */
@Global()
@Module({ providers: [BlocklistService], exports: [BlocklistService] })
export class BlocklistModule {}
