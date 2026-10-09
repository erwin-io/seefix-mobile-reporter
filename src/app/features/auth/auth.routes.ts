import { Routes } from '@angular/router';

/** Public, guest-only screens. Emails/codes never travel in these URLs. */
export const authRoutes: Routes = [
  { path: 'login', loadComponent: () => import('./login/login.page').then((m) => m.LoginPage) },
  { path: 'register', loadComponent: () => import('./register/register.page').then((m) => m.RegisterPage) },
  {
    path: 'verify-email',
    loadComponent: () => import('./verify-email/verify-email.page').then((m) => m.VerifyEmailPage),
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./forgot-password/forgot-password.page').then((m) => m.ForgotPasswordPage),
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./reset-password/reset-password.page').then((m) => m.ResetPasswordPage),
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
];
