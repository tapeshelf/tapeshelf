import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
/** Route is reachable without a session (the user is still attached when a valid cookie is present). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
