import { Global, Module } from '@nestjs/common';

import { SignupCaptchaService } from './signup-captcha.service.js';

/** The captcha on repeated sign-ups; /api/site publishes the widget's key. */
@Global()
@Module({
  providers: [SignupCaptchaService],
  exports: [SignupCaptchaService],
})
export class CaptchaModule {}
