import { type Routes } from '@angular/router';

import { AdminLayout } from './admin-layout';

/** Lazy admin area; the parent route carries adminGuard. */
export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminLayout,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () => import('./admin-dashboard').then((m) => m.AdminDashboardPage),
      },
      {
        path: 'reports',
        loadComponent: () => import('./admin-reports').then((m) => m.AdminReportsPage),
      },
      {
        path: 'support',
        loadComponent: () => import('./admin-support').then((m) => m.AdminSupportPage),
      },
      {
        path: 'support/:id',
        loadComponent: () => import('./admin-support-ticket').then((m) => m.AdminSupportTicketPage),
      },
      {
        path: 'users',
        loadComponent: () => import('./admin-users').then((m) => m.AdminUsersPage),
      },
      {
        path: 'users/:id',
        loadComponent: () => import('./admin-user').then((m) => m.AdminUserPage),
      },
      {
        path: 'videos',
        loadComponent: () => import('./admin-videos').then((m) => m.AdminVideosPage),
      },
      {
        path: 'videos/:id',
        loadComponent: () => import('./admin-video').then((m) => m.AdminVideoPage),
      },
      {
        path: 'trash',
        loadComponent: () => import('./admin-trash').then((m) => m.AdminTrashPage),
      },
      {
        path: 'requests',
        loadComponent: () => import('./admin-requests').then((m) => m.AdminRequestsPage),
      },
      {
        path: 'requests/:id',
        loadComponent: () => import('./admin-request').then((m) => m.AdminRequestPage),
      },
      {
        path: 'settings',
        loadComponent: () => import('./admin-settings').then((m) => m.AdminSettingsPage),
      },
      {
        path: 'audit',
        loadComponent: () => import('./admin-audit').then((m) => m.AdminAuditPage),
      },
    ],
  },
];
