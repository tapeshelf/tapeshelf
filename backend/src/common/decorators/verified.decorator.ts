import { SetMetadata } from '@nestjs/common';

export const REQUIRE_VERIFIED = 'requireVerifiedEmail';
/** Actions that need a confirmed email (uploads, requests, friends, chat...). */
export const RequireVerifiedEmail = () => SetMetadata(REQUIRE_VERIFIED, true);
