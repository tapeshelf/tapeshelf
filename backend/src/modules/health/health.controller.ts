import { timingSafeEqual } from 'node:crypto';

import { Controller, Get, Headers, HttpStatus, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { Public } from '../../common/decorators/public.decorator.js';
import type { Env } from '../../config/env.js';
import type { Response } from 'express';

import { HealthReportDto, OpsReportDto } from './health.dto.js';
import { HealthService } from './health.service.js';

const PUBLIC_OPS_CACHE_MS = 15_000;

function safeEqual(a: string, b: string): boolean {
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && timingSafeEqual(x, y);
}

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  private readonly opsToken: string | undefined;
  /** The answer for a monitor; asked as often as anyone likes, it counts rows at most this often. */
  private publicOps: { status: OpsReportDto['status']; at: number } | null =
    null;

  constructor(
    private readonly health: HealthService,
    config: ConfigService<Env, true>,
  ) {
    this.opsToken = config.get('OPS_TOKEN', { infer: true });
  }

  @Get()
  @ApiOkResponse({ type: HealthReportDto })
  @ApiServiceUnavailableResponse({
    type: HealthReportDto,
    description: 'A dependency is down',
  })
  async check(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthReportDto> {
    const report = await this.health.check();
    res.status(
      report.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
    );
    return report;
  }

  /** For an uptime monitor: 503 when no worker is alive or the outbox is stuck; details only with the token. */
  @Get('ops')
  @ApiOkResponse({ type: OpsReportDto })
  @ApiServiceUnavailableResponse({ type: OpsReportDto })
  async ops(
    @Res({ passthrough: true }) res: Response,
    @Headers('x-ops-token') token: string | undefined,
  ): Promise<OpsReportDto | Pick<OpsReportDto, 'status'>> {
    const code = (status: OpsReportDto['status']) =>
      res.status(
        status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
      );
    if (this.opsToken && token && safeEqual(token, this.opsToken)) {
      const report = await this.health.ops();
      code(report.status);
      return report;
    }
    if (!this.publicOps || Date.now() - this.publicOps.at > PUBLIC_OPS_CACHE_MS)
      this.publicOps = {
        status: (await this.health.ops()).status,
        at: Date.now(),
      };
    code(this.publicOps.status);
    return { status: this.publicOps.status };
  }
}
