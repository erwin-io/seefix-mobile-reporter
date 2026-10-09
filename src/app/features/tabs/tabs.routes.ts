import { Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

/** Exactly three tabs: Home, Reports, Profile. */
export const tabsRoutes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      { path: 'home', loadComponent: () => import('./home/home.page').then((m) => m.HomePage) },
      { path: 'reports', loadComponent: () => import('./reports/my-reports.page').then((m) => m.MyReportsPage) },
      { path: 'profile', loadComponent: () => import('./profile/profile.page').then((m) => m.ProfilePage) },
      { path: '', pathMatch: 'full', redirectTo: 'home' },
    ],
  },
];
