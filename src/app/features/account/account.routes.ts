import { Routes } from '@angular/router';
import { pendingChangesGuard } from '../reports/new-report/pending-changes.guard';

/** Protected, pushed account pages (outside the tab shell — never extra tabs). */
export const accountRoutes: Routes = [
  {
    path: 'edit-profile',
    canDeactivate: [pendingChangesGuard],
    loadComponent: () => import('./edit-profile/edit-profile.page').then((m) => m.EditProfilePage),
  },
  {
    path: 'change-email',
    loadComponent: () => import('./change-email/change-email.page').then((m) => m.ChangeEmailPage),
  },
  {
    path: 'confirm-email',
    loadComponent: () => import('./confirm-email/confirm-email.page').then((m) => m.ConfirmEmailPage),
  },
  {
    path: 'change-password',
    loadComponent: () => import('./change-password/change-password.page').then((m) => m.ChangePasswordPage),
  },
  { path: '', pathMatch: 'full', redirectTo: '/tabs/profile' },
];
