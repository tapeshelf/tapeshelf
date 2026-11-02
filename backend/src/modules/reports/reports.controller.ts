import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { RequestUser } from '../../common/auth/request-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { CreateReportDto, ReportCreatedDto } from './reports.dto.js';
import { ReportsService } from './reports.service.js';
import { RateLimit } from '../../common/rate-limits.js';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @ApiCookieAuth()
  @HttpCode(HttpStatus.OK)
  @RateLimit('report')
  @ApiOperation({ summary: 'Report a video or a profile to the admins' })
  @ApiOkResponse({ type: ReportCreatedDto })
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateReportDto,
  ): Promise<ReportCreatedDto> {
    return this.reports.create(user, dto);
  }
}
