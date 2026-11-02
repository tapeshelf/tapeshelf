import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator.js';
import { PlansDto } from './plans.dto.js';
import { PlansService } from './plans.service.js';

@ApiTags('plans')
@Public()
@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  /** Tiers and their limits: the only source of these numbers for texts. */
  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOkResponse({ type: PlansDto })
  list(): Promise<PlansDto> {
    return this.plans.list();
  }
}
