import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';

import type { RequestUser } from '../../../common/auth/request-user.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { RateLimit } from '../../../common/rate-limits.js';
import { OkDto } from '../auth.dto.js';
import {
  AppSetupDto,
  PasskeyAddDto,
  PasskeyProofDto,
  RecoveryCodesDto,
  TwoFactorCodeDto,
  TwoFactorDto,
  TwoFactorPasswordDto,
  WebAuthnOptionsDto,
} from './two-factor.dto.js';
import { TwoFactorService } from './two-factor.service.js';

/**
 * Settings → Security: the two-step sign-in. Turning it on asks for the password;
 * changing it once on asks for the second step from the last ten minutes (403 twoFactorConfirm,
 * then POST confirm and again).
 */
@ApiTags('auth')
@ApiCookieAuth()
@Controller('auth/2fa')
export class TwoFactorController {
  constructor(private readonly twoFactor: TwoFactorService) {}

  @Get()
  @ApiOkResponse({ type: TwoFactorDto })
  status(@CurrentUser() user: RequestUser): Promise<TwoFactorDto> {
    return this.twoFactor.status(user);
  }

  @RateLimit('twoFactor')
  @Post('app/setup')
  @ApiOperation({
    summary: 'A new secret for an authenticator app, to confirm with its code',
  })
  @ApiOkResponse({ type: AppSetupDto })
  @HttpCode(HttpStatus.OK)
  startApp(
    @CurrentUser() user: RequestUser,
    @Body() dto: TwoFactorPasswordDto,
  ): Promise<AppSetupDto> {
    return this.twoFactor.startApp(user, dto.password);
  }

  @RateLimit('twoFactor')
  @Post('app')
  @ApiOperation({
    summary: 'Confirms the app with its code; the first way turns the step on',
  })
  @ApiOkResponse({ type: RecoveryCodesDto })
  @HttpCode(HttpStatus.OK)
  async confirmApp(
    @CurrentUser() user: RequestUser,
    @Body() dto: TwoFactorCodeDto,
  ): Promise<RecoveryCodesDto> {
    return { recoveryCodes: await this.twoFactor.confirmApp(user, dto.code) };
  }

  @Delete('app')
  @ApiOkResponse({ type: OkDto })
  async removeApp(@CurrentUser() user: RequestUser): Promise<OkDto> {
    await this.twoFactor.removeApp(user);
    return { ok: true };
  }

  @RateLimit('twoFactor')
  @Post('passkeys/options')
  @ApiOperation({ summary: 'Options to create a passkey in the browser' })
  @ApiOkResponse({ type: WebAuthnOptionsDto })
  @HttpCode(HttpStatus.OK)
  async passkeyOptions(
    @CurrentUser() user: RequestUser,
    @Body() dto: TwoFactorPasswordDto,
  ): Promise<WebAuthnOptionsDto> {
    return { options: await this.twoFactor.passkeyOptions(user, dto.password) };
  }

  @RateLimit('twoFactor')
  @Post('passkeys')
  @ApiOperation({
    summary: 'Keeps the new passkey; the first way turns the step on',
  })
  @ApiOkResponse({ type: RecoveryCodesDto })
  @HttpCode(HttpStatus.OK)
  async addPasskey(
    @CurrentUser() user: RequestUser,
    @Body() dto: PasskeyAddDto,
  ): Promise<RecoveryCodesDto> {
    return {
      recoveryCodes: await this.twoFactor.addPasskey(
        user,
        dto.name,
        dto.response as unknown as RegistrationResponseJSON,
      ),
    };
  }

  @Delete('passkeys/:id')
  @ApiOkResponse({ type: OkDto })
  async removePasskey(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OkDto> {
    await this.twoFactor.removePasskey(user, id);
    return { ok: true };
  }

  @Post('recovery-codes')
  @ApiOperation({ summary: 'New recovery codes; the old ones stop working' })
  @ApiOkResponse({ type: RecoveryCodesDto })
  @HttpCode(HttpStatus.OK)
  async newRecoveryCodes(
    @CurrentUser() user: RequestUser,
  ): Promise<RecoveryCodesDto> {
    return { recoveryCodes: await this.twoFactor.newRecoveryCodes(user) };
  }

  @Post('off')
  @ApiOperation({
    summary: 'Turns the step off: the app, passkeys and codes go',
  })
  @ApiOkResponse({ type: OkDto })
  @HttpCode(HttpStatus.OK)
  async turnOff(@CurrentUser() user: RequestUser): Promise<OkDto> {
    await this.twoFactor.turnOff(user);
    return { ok: true };
  }

  @RateLimit('twoFactor')
  @Post('confirm')
  @ApiOperation({ summary: 'The second step inside this session, with a code' })
  @ApiOkResponse({ type: OkDto })
  @HttpCode(HttpStatus.OK)
  async confirm(
    @CurrentUser() user: RequestUser,
    @Body() dto: TwoFactorCodeDto,
  ): Promise<OkDto> {
    await this.twoFactor.confirm(user, { code: dto.code });
    return { ok: true };
  }

  @RateLimit('twoFactor')
  @Post('confirm/passkey-options')
  @ApiOkResponse({ type: WebAuthnOptionsDto })
  @HttpCode(HttpStatus.OK)
  async confirmPasskeyOptions(
    @CurrentUser() user: RequestUser,
  ): Promise<WebAuthnOptionsDto> {
    return { options: await this.twoFactor.confirmPasskeyOptions(user) };
  }

  @RateLimit('twoFactor')
  @Post('confirm/passkey')
  @ApiOperation({
    summary: 'The second step inside this session, with a passkey',
  })
  @ApiOkResponse({ type: OkDto })
  @HttpCode(HttpStatus.OK)
  async confirmPasskey(
    @CurrentUser() user: RequestUser,
    @Body() dto: PasskeyProofDto,
  ): Promise<OkDto> {
    await this.twoFactor.confirm(user, {
      passkey: dto.response as unknown as AuthenticationResponseJSON,
    });
    return { ok: true };
  }
}
