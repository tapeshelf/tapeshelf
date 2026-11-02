import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { RequestUser } from '../../common/auth/request-user.js';
import { ADMIN_UI_DICTIONARIES } from '../../i18n/admin-ui/index.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { OkDto } from '../auth/auth.dto.js';
import {
  AdminRequestDto,
  AdminRequestListDto,
} from '../exchange/exchange.dto.js';
import { ExchangeService } from '../exchange/exchange.service.js';
import {
  AdminReportDto,
  AdminReportListDto,
  AdminReportsQueryDto,
  DismissReportDto,
  ResolveReportDto,
} from '../reports/reports.dto.js';
import { AdminOverviewService } from './admin-overview.service.js';
import { AdminReportsService } from './admin-reports.service.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminVideosService } from './admin-videos.service.js';
import {
  AdminAuditQueryDto,
  AdminDeleteUserDto,
  AdminBulkResultDto,
  AdminDeleteVideoDto,
  AdminDeleteVideosDto,
  AdminRequestsQueryDto,
  AdminTrashListDto,
  AdminTrashQueryDto,
  AdminUserDetailDto,
  AdminUserListDto,
  AdminUsersQueryDto,
  AdminVideoDetailDto,
  AdminVideoListDto,
  AdminVideosQueryDto,
  AuditListDto,
  BanUserDto,
  DashboardDto,
  NoticeDto,
  SiteSettingsDto,
  TrashResultDto,
  UpdateAdminUserDto,
  UpdateAdminVideoDto,
  VideoIdsDto,
  ViewAsDto,
} from './admin.dto.js';
import { SUPPORTED_LOCALES } from '../../common/i18n/i18n.js';

/** Admin panel API: ADMIN role only, every change goes to the audit log. */
@ApiTags('admin')
@ApiCookieAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly overview: AdminOverviewService,
    private readonly exchange: ExchangeService,
  ) {}

  @Get('dashboard')
  @ApiOkResponse({ type: DashboardDto })
  dashboard(): Promise<DashboardDto> {
    return this.overview.dashboard();
  }

  /** The admin panel's texts: never in the public dictionaries of the web app. */
  @Get('i18n/:lang')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Texts of the admin panel in one language' })
  @ApiOkResponse({
    schema: { type: 'object', additionalProperties: true },
  })
  dictionary(@Param('lang') lang: string): object {
    // The admin panel speaks English and Russian; any other language of the app gets English.
    const dictionary = Object.hasOwn(ADMIN_UI_DICTIONARIES, lang)
      ? ADMIN_UI_DICTIONARIES[lang]
      : (SUPPORTED_LOCALES as readonly string[]).includes(lang)
        ? ADMIN_UI_DICTIONARIES['en']
        : undefined;
    if (!dictionary) throw new NotFoundException();
    return dictionary;
  }

  @Get('settings')
  @ApiOkResponse({ type: SiteSettingsDto })
  settings(): Promise<SiteSettingsDto> {
    return this.overview.getSettings();
  }

  @Put('settings')
  @ApiOperation({
    summary: 'Replace the site settings; applied without a restart',
  })
  @ApiOkResponse({ type: SiteSettingsDto })
  updateSettings(
    @CurrentUser() admin: RequestUser,
    @Body() dto: SiteSettingsDto,
  ): Promise<SiteSettingsDto> {
    return this.overview.updateSettings(admin.id, dto);
  }

  @Get('audit')
  @ApiOkResponse({ type: AuditListDto })
  audit(@Query() query: AdminAuditQueryDto): Promise<AuditListDto> {
    return this.overview.auditLog(query);
  }

  @Get('requests')
  @ApiOkResponse({ type: AdminRequestListDto })
  requests(
    @Query() query: AdminRequestsQueryDto,
  ): Promise<AdminRequestListDto> {
    return this.exchange.adminList({
      status: query.status,
      q: query.q,
      offset: query.offset ?? 0,
      limit: query.limit ?? 30,
    });
  }

  @Get('requests/:id')
  @ApiOkResponse({ type: AdminRequestDto })
  request(@Param('id', ParseUUIDPipe) id: string): Promise<AdminRequestDto> {
    return this.exchange.adminDetail(id);
  }
}

@ApiTags('admin')
@ApiCookieAuth()
@Roles('ADMIN')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @ApiOkResponse({ type: AdminUserListDto })
  list(@Query() query: AdminUsersQueryDto): Promise<AdminUserListDto> {
    return this.users.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: AdminUserDetailDto })
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserDetailDto> {
    return this.users.detail(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change role and/or tier' })
  @ApiOkResponse({ type: AdminUserDetailDto })
  update(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminUserDto,
  ): Promise<AdminUserDetailDto> {
    return this.users.update(admin.id, id, dto);
  }

  @Post(':id/ban')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AdminUserDetailDto })
  ban(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BanUserDto,
  ): Promise<AdminUserDetailDto> {
    return this.users.ban(admin.id, id, dto.reason);
  }

  @Post(':id/unban')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AdminUserDetailDto })
  unban(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminUserDetailDto> {
    return this.users.unban(admin.id, id);
  }

  @Post(':id/delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete the account as if the owner did',
  })
  @ApiOkResponse({ type: AdminUserDetailDto })
  delete(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminDeleteUserDto,
  ): Promise<AdminUserDetailDto> {
    return this.users.delete(admin.id, id, dto.reason);
  }

  @Post(':id/password-reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Email the user a password reset link' })
  @ApiOkResponse({ type: OkDto })
  async passwordReset(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OkDto> {
    await this.users.passwordReset(admin.id, id);
    return { ok: true };
  }

  @Post(':id/two-factor/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Turn off two-step sign-in for a lost phone; the user is mailed',
  })
  @ApiOkResponse({ type: OkDto })
  async resetTwoFactor(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OkDto> {
    await this.users.resetTwoFactor(admin.id, id);
    return { ok: true };
  }

  @Post(':id/notice')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send the user a message from the admins (ADMIN_NOTICE)',
  })
  @ApiOkResponse({ type: OkDto })
  async notice(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NoticeDto,
  ): Promise<OkDto> {
    await this.users.notice(admin.id, id, dto.message);
    return { ok: true };
  }

  @Post(':id/view-as')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Record a read-only "view as" session; the browser then sends X-View-As with GET requests',
  })
  @ApiOkResponse({ type: ViewAsDto })
  viewAs(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ViewAsDto> {
    return this.users.viewAs(admin.id, id);
  }
}

@ApiTags('admin')
@ApiCookieAuth()
@Roles('ADMIN')
@Controller('admin/videos')
export class AdminVideosController {
  constructor(
    private readonly videos: AdminVideosService,
  ) {}

  @Get()
  @ApiOkResponse({ type: AdminVideoListDto })
  list(@Query() query: AdminVideosQueryDto): Promise<AdminVideoListDto> {
    return this.videos.list(query);
  }

  @Post('delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Remove several videos (reason ADMIN), the same rule and message for each',
  })
  @ApiOkResponse({ type: AdminBulkResultDto })
  deleteMany(
    @CurrentUser() admin: RequestUser,
    @Body() dto: AdminDeleteVideosDto,
  ): Promise<AdminBulkResultDto> {
    return this.videos.deleteMany(admin.id, dto);
  }


  @Get(':id')
  @ApiOkResponse({ type: AdminVideoDetailDto })
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<AdminVideoDetailDto> {
    return this.videos.detail(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: AdminVideoDetailDto })
  update(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminVideoDto,
  ): Promise<AdminVideoDetailDto> {
    return this.videos.update(admin.id, id, dto);
  }

  @Post(':id/delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Remove the video (reason ADMIN): the author gets the rule and the message; optionally block the file',
  })
  @ApiOkResponse({ type: AdminVideoDetailDto })
  async delete(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminDeleteVideoDto,
  ): Promise<AdminVideoDetailDto> {
    await this.videos.delete(admin.id, id, dto);
    return this.videos.detail(id);
  }

  @Post(':id/reprocess')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process a failed or stuck video again' })
  @ApiOkResponse({ type: AdminVideoDetailDto })
  reprocess(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminVideoDetailDto> {
    return this.videos.reprocess(admin.id, id);
  }

}

@ApiTags('admin')
@ApiCookieAuth()
@Roles('ADMIN')
@Controller('admin/trash')
export class AdminTrashController {
  constructor(private readonly videos: AdminVideosService) {}

  @Get()
  @ApiOkResponse({ type: AdminTrashListDto })
  list(@Query() query: AdminTrashQueryDto): Promise<AdminTrashListDto> {
    return this.videos.trash(query);
  }

  @Post('purge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Erase videos from S3 for good' })
  @ApiOkResponse({ type: TrashResultDto })
  purge(
    @CurrentUser() admin: RequestUser,
    @Body() dto: VideoIdsDto,
  ): Promise<TrashResultDto> {
    return this.videos.purge(admin.id, dto.videoIds);
  }

  @Post('restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bring videos back from the trash' })
  @ApiOkResponse({ type: TrashResultDto })
  restore(
    @CurrentUser() admin: RequestUser,
    @Body() dto: VideoIdsDto,
  ): Promise<TrashResultDto> {
    return this.videos.restore(admin.id, dto.videoIds);
  }
}

@ApiTags('admin')
@ApiCookieAuth()
@Roles('ADMIN')
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly reports: AdminReportsService) {}

  @Get()
  @ApiOkResponse({ type: AdminReportListDto })
  list(@Query() query: AdminReportsQueryDto): Promise<AdminReportListDto> {
    return this.reports.list(query);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Act on the target and close every open report on it as RESOLVED',
  })
  @ApiOkResponse({ type: AdminReportDto })
  resolve(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveReportDto,
  ): Promise<AdminReportDto> {
    return this.reports.resolve(admin.id, id, dto.action, dto.note, {
      message: dto.message,
      blockFile: dto.blockFile,
    });
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Close every open report on the target as DISMISSED',
  })
  @ApiOkResponse({ type: AdminReportDto })
  dismiss(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DismissReportDto,
  ): Promise<AdminReportDto> {
    return this.reports.dismiss(admin.id, id, dto.note);
  }
}
