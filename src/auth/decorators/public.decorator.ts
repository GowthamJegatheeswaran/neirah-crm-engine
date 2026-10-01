import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route as open (no JWT needed). Everything else is protected by default. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
