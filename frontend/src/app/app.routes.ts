import { type Routes } from '@angular/router';

import { adminGuard, authGuard, guestGuard, homeGuard } from './core/auth/auth.guard';
import { PANEL_OUTLET, intoPanel } from './core/navigation/panels';
import {
  atUser,
  friendsIntoPanel,
  fromLegacyUserPath,
  videoCodeMatcher,
} from './core/navigation/user-links';
import { supportOpen, tiersOnly, toOperatorSite } from './core/site/site-config';

export const routes: Routes = [
  // The front page: a minimal guest page (signed-in visitors go to their shelf). tapeshelf.com puts
  // its own site in front of the app; Caddy serves its landing at / before this.
  {
    path: '',
    pathMatch: 'full',
    canActivate: [homeGuard],
    title: 'guest.meta.title',
    loadComponent: () => import('./features/guest/guest-home').then((m) => m.GuestHomePage),
  },
  // The operator's rules: its website when it has one (SITE_URL), else the texts of LEGAL_DIR.
  ...(['terms', 'privacy'] as const).map((doc) => ({
    path: doc,
    canActivate: [toOperatorSite],
    data: { doc, frame: 'narrow' },
    title: `legal.${doc}.title`,
    loadComponent: () => import('./features/legal/instance-legal').then((m) => m.InstanceLegalPage),
  })),
  {
    path: 'imprint',
    data: { doc: 'imprint', frame: 'narrow' },
    title: 'legal.imprint.title',
    loadComponent: () => import('./features/legal/instance-legal').then((m) => m.InstanceLegalPage),
  },
  {
    // The video editor: a page of its own, it needs the width.
    path: 'edit/:id',
    title: 'editor.title',
    canActivate: [authGuard],
    // Changes not saved: leaving by any way asks first.
    canDeactivate: [(page: { canLeave(): Promise<boolean> }) => page.canLeave()],
    loadComponent: () => import('./features/editor/editor-page').then((m) => m.EditorPage),
  },
  {
    // A link that makes friends: open to guests, who sign up or in and come back.
    path: 'invite/:code',
    title: 'invites.page.docTitle',
    loadComponent: () => import('./features/invite/invite-page').then((m) => m.InvitePage),
  },
  {
    // The browser extension's sign-in window: signed in, one button connects it.
    path: 'connect/extension',
    title: 'connect.title',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/connect/connect-extension').then((m) => m.ConnectExtensionPage),
  },
  {
    // A temporary link: open to guests; the page says whether it still works.
    path: 't/:code',
    title: 'links.page.docTitle',
    loadComponent: () => import('./features/links/link-page').then((m) => m.LinkPage),
  },
  {
    // One private video offered for an exchange: /x/v/<code>?h=<holder>.
    path: 'x/v/:code',
    title: 'deals.fair.title',
    loadComponent: () => import('./features/deals/trade-page').then((m) => m.TradePage),
  },
  {
    // An exchange link: open to guests, who add their videos at once; people pick theirs.
    path: 'x/:code',
    title: 'deals.fair.title',
    loadComponent: () => import('./features/deals/trade-page').then((m) => m.TradePage),
  },
  {
    // A guest's deal: the browser that started it, or a mail's link with the guest's key.
    path: 'deal/:id',
    title: 'deals.fair.title',
    loadComponent: () => import('./features/deals/trade-page').then((m) => m.TradePage),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register/register').then((m) => m.RegisterPage),
  },
  {
    path: 'forgot-password',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password').then((m) => m.ForgotPasswordPage),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password').then((m) => m.ResetPasswordPage),
  },
  {
    path: 'unsubscribe',
    loadComponent: () =>
      import('./features/unsubscribe/unsubscribe-page').then((m) => m.UnsubscribePage),
  },
  {
    path: 'verify-email',
    loadComponent: () =>
      import('./features/auth/verify-email/verify-email').then((m) => m.VerifyEmailPage),
  },
  {
    // No guestGuard: a Google sign-up always makes the new account, even in a browser that still
    // holds another session (the server ends that one); the page says so.
    path: 'auth/google/complete',
    loadComponent: () =>
      import('./features/auth/google-complete/google-complete').then((m) => m.GoogleCompletePage),
  },
  {
    path: 'download/:code',
    canActivate: [authGuard],
    data: { frame: 'narrow' },
    title: 'download.title',
    loadComponent: () => import('./features/download/download-page').then((m) => m.DownloadPage),
  },
  // Screens that slide in over the page from the edge of the window: the named
  // outlet "panel" keeps the page under them as it is; back closes them.
  {
    outlet: PANEL_OUTLET,
    data: { panel: 'wide' },
    path: 'settings',
    title: 'settings.title',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/settings/settings-layout').then((m) => m.SettingsLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'profile' },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/settings/profile-settings').then((m) => m.ProfileSettingsPage),
      },
      {
        path: 'account',
        loadComponent: () =>
          import('./features/settings/account-settings').then((m) => m.AccountSettingsPage),
      },
      {
        path: 'plan',
        canMatch: [tiersOnly],
        loadComponent: () =>
          import('./features/settings/plan-settings').then((m) => m.PlanSettingsPage),
      },
      {
        path: 'security',
        loadComponent: () =>
          import('./features/settings/security-settings').then((m) => m.SecuritySettingsPage),
      },
      {
        path: 'page',
        loadComponent: () =>
          import('./features/settings/page-settings').then((m) => m.PageSettingsPage),
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./features/settings/notification-settings').then(
            (m) => m.NotificationSettingsPage,
          ),
      },
      {
        path: 'blocked',
        loadComponent: () =>
          import('./features/settings/blocked-settings').then((m) => m.BlockedSettingsPage),
      },
    ],
  },
  {
    outlet: PANEL_OUTLET,
    data: { panel: 'wide' },
    path: 'exchange',
    title: 'exchange.title',
    canActivate: [authGuard],
    loadComponent: () => import('./features/exchange/exchange-page').then((m) => m.ExchangePage),
  },
  // Support: my tickets, a new one, one with its messages.
  {
    outlet: PANEL_OUTLET,
    data: { panel: 'medium' },
    path: 'support',
    title: 'support.title',
    canActivate: [authGuard, supportOpen],
    loadComponent: () => import('./features/support/support-page').then((m) => m.SupportPage),
  },
  {
    outlet: PANEL_OUTLET,
    data: { panel: 'medium' },
    path: 'support/new',
    title: 'support.new.title',
    canActivate: [authGuard, supportOpen],
    loadComponent: () => import('./features/support/support-new').then((m) => m.SupportNewPage),
  },
  {
    outlet: PANEL_OUTLET,
    data: { panel: 'medium' },
    path: 'support/:id',
    title: 'support.title',
    canActivate: [authGuard, supportOpen],
    loadComponent: () =>
      import('./features/support/support-ticket').then((m) => m.SupportTicketPage),
  },
  {
    outlet: PANEL_OUTLET,
    data: { panel: 'medium' },
    path: 'links',
    title: 'links.mine.title',
    canActivate: [authGuard],
    loadComponent: () => import('./features/links/my-links').then((m) => m.MyLinksPage),
  },
  {
    outlet: PANEL_OUTLET,
    data: { panel: 'medium' },
    path: 'whats-new',
    title: 'whatsNew.title',
    canActivate: [authGuard],
    loadComponent: () => import('./features/whats-new/whats-new-page').then((m) => m.WhatsNewPage),
  },
  {
    outlet: PANEL_OUTLET,
    data: { panel: 'wide' },
    path: 'exchange/:id',
    title: 'exchange.title',
    canActivate: [authGuard],
    loadComponent: () => import('./features/exchange/request-page').then((m) => m.RequestPage),
  },
  {
    outlet: PANEL_OUTLET,
    data: { panel: 'wide' },
    path: 'messages',
    title: 'chat.title',
    canActivate: [authGuard],
    loadComponent: () => import('./features/chat/messages-page').then((m) => m.MessagesPage),
  },
  {
    outlet: PANEL_OUTLET,
    data: { panel: 'wide' },
    path: 'messages/:username',
    title: 'chat.title',
    canActivate: [authGuard],
    loadComponent: () => import('./features/chat/messages-page').then((m) => m.MessagesPage),
  },
  {
    outlet: PANEL_OUTLET,
    data: { panel: 'medium' },
    // Pro and its checkout: the cloud only.
    path: 'pro',
    canMatch: [tiersOnly],
    canActivate: [authGuard],
    title: 'pro.title',
    loadComponent: () => import('./features/pro/pro-page').then((m) => m.ProPage),
  },
  {
    outlet: PANEL_OUTLET,
    data: { panel: 'narrow' },
    path: 'notifications',
    title: 'notifications.title',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/notifications/notifications-page').then((m) => m.NotificationsPage),
  },
  {
    outlet: PANEL_OUTLET,
    data: { panel: 'narrow' },
    path: 'friends/:username',
    title: 'social.listsTitle',
    loadComponent: () => import('./features/social/friends-page').then((m) => m.FriendsPage),
  },
  // Their old page addresses (emails, bookmarks) open the same screen over the own shelf.
  ...[
    'settings',
    'settings/:tab',
    'exchange',
    'exchange/:id',
    'messages',
    'messages/:username',
    'notifications',
    'links',
    'pro',
    'support',
    'support/:id',
  ].map((path) => ({ path, pathMatch: 'full' as const, redirectTo: intoPanel() })),
  { matcher: atUser('friends'), redirectTo: friendsIntoPanel() },
  // User pages: /@username; the old /u/... form redirects.
  {
    matcher: atUser(),
    loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage),
  },
  // A shelf through its owner's anonymous link: the same page, the owner never named.
  {
    path: 'p/:code',
    loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage),
  },
  // Old video links (/@username/v/<id>) find the short code and keep the holder's context.
  {
    matcher: atUser('v', ':videoId'),
    loadComponent: () => import('./features/video/video-redirect').then((m) => m.VideoRedirectPage),
  },
  { path: 'u/:username', pathMatch: 'full', redirectTo: fromLegacyUserPath() },
  { path: 'u/:username/friends', pathMatch: 'full', redirectTo: fromLegacyUserPath('friends') },
  {
    path: 'u/:username/v/:videoId',
    pathMatch: 'full',
    redirectTo: fromLegacyUserPath('v', ':videoId'),
  },
  {
    path: 'v/:videoId',
    loadComponent: () => import('./features/video/video-redirect').then((m) => m.VideoRedirectPage),
  },
  // A video at its short code; codes always hold a digit, page names never do.
  {
    matcher: videoCodeMatcher,
    loadComponent: () => import('./features/video/video-page').then((m) => m.VideoPage),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  {
    path: '**',
    data: { frame: 'narrow' },
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFoundPage),
  },
];
