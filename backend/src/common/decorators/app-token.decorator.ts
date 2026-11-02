import { SetMetadata } from '@nestjs/common';

export const APP_TOKEN_ACCESS = 'appTokenAccess';
/**
 * The route also takes a connected app's token (`Authorization: Bearer …`): the browser
 * extension's uploads and what its form needs. Every other route refuses a token.
 */
export const AppTokenAccess = () => SetMetadata(APP_TOKEN_ACCESS, true);
