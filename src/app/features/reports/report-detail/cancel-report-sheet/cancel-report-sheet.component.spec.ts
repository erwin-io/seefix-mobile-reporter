import { TestBed } from '@angular/core/testing';
import { ModalController } from '@ionic/angular';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AppError } from '../../../../core/http/api-error.mapper';
import { ReportsApiService } from '../../reports.api.service';
import { CancelReportSheetComponent } from './cancel-report-sheet.component';

describe('CancelReportSheetComponent', () => {
  const modals = { dismiss: vi.fn().mockResolvedValue(true) };
  const api = { cancel: vi.fn() };

  function create(): CancelReportSheetComponent {
    TestBed.configureTestingModule({
      imports: [CancelReportSheetComponent],
      providers: [
        { provide: ModalController, useValue: modals },
        { provide: ReportsApiService, useValue: api },
      ],
    });
    const fixture = TestBed.createComponent(CancelReportSheetComponent);
    fixture.componentRef.setInput('reportId', 'r-5');
    fixture.componentRef.setInput('reportNo', 'RPT-2026-000005');
    return fixture.componentInstance;
  }

  beforeEach(() => {
    modals.dismiss.mockClear();
    api.cancel.mockReset();
  });

  it('requires a 5–500 character reason (trimmed) before calling the API', async () => {
    const sheet = create();
    sheet.reason.setValue('   abc   ');
    await sheet.confirm();
    expect(api.cancel).not.toHaveBeenCalled();
    sheet.reason.setValue('x'.repeat(501));
    await sheet.confirm();
    expect(api.cancel).not.toHaveBeenCalled();
  });

  it('dismisses with the server result on success', async () => {
    const result = { reportId: 'r-5', status: 'CANCELLED', canCancel: false, alreadyCancelled: false };
    api.cancel.mockReturnValue(of(result));
    const sheet = create();
    sheet.reason.setValue('Wrong photo submitted.');
    await sheet.confirm();
    expect(api.cancel).toHaveBeenCalledWith('r-5', 'Wrong photo submitted.');
    expect(modals.dismiss).toHaveBeenCalledWith(result, 'cancelled');
  });

  it('hands a review race (409) back to the page instead of showing Cancelled', async () => {
    api.cancel.mockReturnValue(
      throwError(() => new AppError('CONFLICT', 'already reviewed', 'MAINTENANCE_ALREADY_STARTED', 409)),
    );
    const sheet = create();
    sheet.reason.setValue('Wrong photo submitted.');
    await sheet.confirm();
    expect(modals.dismiss).toHaveBeenCalledWith(expect.any(AppError), 'conflict');
  });

  it('keeps the sheet open with an inline error on a transient failure', async () => {
    api.cancel.mockReturnValue(throwError(() => new AppError('OFFLINE', 'offline', 'NETWORK', 0)));
    const sheet = create();
    sheet.reason.setValue('Wrong photo submitted.');
    await sheet.confirm();
    expect(modals.dismiss).not.toHaveBeenCalled();
    expect(sheet.errorMessage()).toBe('offline');
  });
});
