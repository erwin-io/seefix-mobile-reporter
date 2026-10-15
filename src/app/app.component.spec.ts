import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { ActionSheetController, NavController, Platform, ToastController } from '@ionic/angular';
import { AppComponent } from './app.component';
import { ReportSyncService } from './features/reports/outbox/report-sync.service';

describe('AppComponent', () => {
  it('should create the app', async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])]
    }).compileComponents();
    
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('announces once when SEEFIX received a report saved on this phone', async () => {
    const created: { message: string }[] = [];
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        { provide: ToastController, useValue: { create: async (o: { message: string }) => (created.push(o), { present: async () => undefined }) } },
      ],
    });
    TestBed.createComponent(AppComponent);
    TestBed.inject(ReportSyncService).sent$.next({
      id: 'local-1',
      report: { id: 'r-41', reportNo: 'RPT-2026-000041', status: 'SUBMITTED', agentStatus: 'PENDING', createdAt: '', imageCount: 1, agentTriggerAccepted: true },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(created.map((toast) => toast.message)).toEqual(['Report RPT-2026-000041 received by SEEFIX.']);
  });

  it('Android back asks on main screens, returns Register to Login, and keeps default back elsewhere', async () => {
    @Component({ template: '' })
    class BlankPage {}
    let handler!: (next: () => void) => void;
    const sheets: unknown[] = [];
    const backTo: string[] = [];
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter(['tabs/home', 'auth/login', 'auth/register', 'reports/:id'].map((path) => ({ path, component: BlankPage }))),
        { provide: Platform, useValue: { backButton: { subscribeWithPriority: (_: number, fn: typeof handler) => (handler = fn) } } },
        { provide: ActionSheetController, useValue: { create: async (o: unknown) => (sheets.push(o), { present: async () => undefined }) } },
      ],
    });
    TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    vi.spyOn(TestBed.inject(NavController), 'navigateBack').mockImplementation(async (url) => (backTo.push(String(url)), true));
    const press = async (url: string) => {
      await router.navigateByUrl(url);
      let defaultBack = false;
      handler(() => (defaultBack = true));
      await new Promise((resolve) => setTimeout(resolve, 0));
      return defaultBack;
    };

    expect(await press('/tabs/home')).toBe(false);
    expect(await press('/auth/login?returnUrl=%2Ftabs%2Fhome')).toBe(false);
    expect(sheets.length).toBe(2);
    expect(await press('/auth/register')).toBe(false);
    expect(backTo).toEqual(['/auth/login']);
    expect(await press('/reports/r-1')).toBe(true);
    expect(sheets.length).toBe(2);
  });
});
