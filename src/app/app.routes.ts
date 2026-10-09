import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { guestGuard } from './core/auth/guest.guard';
import { reporterRoleGuard } from './core/auth/reporter-role.guard';
import { pendingChangesGuard } from './features/reports/new-report/pending-changes.guard';

const reporterOnly = [authGuard, reporterRoleGuard];

export const routes: Routes = [
  {
    // Transient session resolution; never shows private data.
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/launch/launch.page').then((m) => m.LaunchPage),
  },
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.authRoutes),
  },
  {
    path: 'tabs',
    canActivate: reporterOnly,
    loadChildren: () => import('./features/tabs/tabs.routes').then((m) => m.tabsRoutes),
  },
  // Global pushed pages: siblings of the tab shell so no second tab bar is nested.
  {
    path: 'reports/new',
    canActivate: reporterOnly,
    canDeactivate: [pendingChangesGuard],
    loadComponent: () => import('./features/reports/new-report/new-report.page').then((m) => m.NewReportPage),
  },
  {
    path: 'reports/:id',
    canActivate: reporterOnly,
    loadComponent: () =>
      import('./features/reports/report-detail/report-detail.page').then((m) => m.ReportDetailPage),
  },
  {
    path: 'account',
    canActivate: reporterOnly,
    loadChildren: () => import('./features/account/account.routes').then((m) => m.accountRoutes),
  },
  {
    path: 'notifications',
    canActivate: reporterOnly,
    loadComponent: () =>
      import('./features/notifications/notification-list/notifications.page').then((m) => m.NotificationsPage),
  },
  { path: '**', redirectTo: '' },
];
