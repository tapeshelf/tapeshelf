import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator.js';
import { LegalDocDto, SiteInfoDto } from './site.dto.js';
import { SiteService } from './site.service.js';
import { SUPPORTED_LOCALES } from '../../common/i18n/i18n.js';

@ApiTags('site')
@Public()
@Controller('site')
export class SiteController {
  constructor(private readonly site: SiteService) {}

  /** Instance name, contact and which pages and documents this instance serves. */
  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOkResponse({ type: SiteInfoDto })
  info(): Promise<SiteInfoDto> {
    return this.site.info();
  }

  /** The operator's own terms, privacy policy or imprint (Markdown from LEGAL_DIR). */
  @Get('legal/:doc')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiQuery({ name: 'lang', required: false, enum: SUPPORTED_LOCALES })
  @ApiOkResponse({ type: LegalDocDto })
  @ApiNotFoundResponse({
    description: 'legalNotFound: the document is not published',
  })
  legal(
    @Param('doc') doc: string,
    @Query('lang') lang?: string,
  ): Promise<LegalDocDto> {
    return this.site.legal(doc, lang);
  }
}
