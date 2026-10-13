import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ToastController } from '@ionic/angular';
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
});
