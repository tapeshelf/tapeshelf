import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';

import { AdminDictionary } from '../admin/admin-dictionary.service';
import { Api } from '../../api/api';
import { twoFactorStatus } from '../../api/fn/auth/two-factor-status';
import { AuthStore } from './auth.store';
import { PANEL_OUTLET } from '../navigation/panels';
import { profileLink } from '../navigation/user-links';

// inject() works only before the first await: every guard takes what it needs up front.

/** Signed-in users only; others go to /login and come back afterwards. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const store = inject(AuthStore);
  const router = inject(Router);
  await store.ready();
  if (store.isAuthenticated()) return true;
  return router.createUrlTree(['/login'], { queryParams: { returnTo: state.url } });
};

/**
 * The landing is for guests; a signed-in user goes straight to their own page. As a guard, so the
 * landing never renders first and then jumps away.
 */
export const homeGuard: CanActivateFn = async (route, state) => {
  const store = inject(AuthStore);
  const router = inject(Router);
  await store.ready();
  const user = store.user();
  if (!user) return true;
  // The own page in place of "/", with what the address asked for besides: its query ("/?folder=
  // others" from a notification, U11) and its panel, never the panel of the page being left.
  const panel = router.parseUrl(state.url).root.children[PANEL_OUTLET];
  return router.createUrlTree(
    [
      '/',
      {
        outlets: {
          primary: profileLink(user.username)[0]!.slice(1),
          [PANEL_OUTLET]: panel ? panel.segments.map((s) => s.path) : null,
        },
      },
    ],
    { queryParams: route.queryParams },
  );
};

/** Pages that make no sense when signed in (login, register...). */
export const guestGuard: CanActivateFn = async () => {
  const store = inject(AuthStore);
  const router = inject(Router);
  await store.ready();
  const user = store.user();
  return user ? router.createUrlTree(profileLink(user.username)) : true;
};

/**
 * The admin panel; others land on the home page. Its texts come from the API
 * and are in before the first admin screen.
 */
export const adminGuard: CanActivateFn = async () => {
  const store = inject(AuthStore);
  const router = inject(Router);
  const dictionary = inject(AdminDictionary);
  const api = inject(Api);
  await store.ready();
  if (!store.isAdmin()) return router.createUrlTree(['/']);
  // The panel needs two-step sign-in passed in this session: else where it is turned on
  // or confirmed. Unreachable, the panel opens and its requests say what is wrong.
  const step = await api.invoke(twoFactorStatus).catch(() => null);
  if (step && !(step.enabled && step.sessionConfirmed))
    return router.createUrlTree(['/settings/security']);
  await dictionary.ensure();
  return true;
};
