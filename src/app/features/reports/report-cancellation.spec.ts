import { HttpErrorResponse } from '@angular/common/http';
import { ERROR_COPY, mapHttpError } from '../../core/http/api-error.mapper';
import { ReportDetailResponse } from '../../core/models/report.model';
import { isAssessmentInProgress } from '../../shared/formatters/report-status-label';
import { timelineActor } from '../../shared/formatters/timeline-step';
import { PENDING_SUMMARY, REPORT_4_DETAIL } from '../../testing/fixtures/reports.fixture';
import { toActiveReport } from './new-report/new-report.page';
import { toReportDetail, toReportSummary } from './report.mapper';

const cancelledScreening = {
  code: 'REPORTER_CANCELLED',
  title: 'Report cancelled',
  message: 'You cancelled this report before maintenance processing began.',
  nextAction: 'NONE',
  source: 'REPORTER',
  needsMaintenanceReview: false,
  isActionable: false,
};

function detail(patch: Partial<ReportDetailResponse['report']>, history = REPORT_4_DETAIL.statusHistory): ReportDetailResponse {
  return {
    ...REPORT_4_DETAIL,
    maintenanceReview: null,
    report: { ...REPORT_4_DETAIL.report, ...patch },
    statusHistory: history,
  };
}

describe('M7 cancellation and one-active mapping', () => {
  it('maps canCancel from list and detail, only for pre-review statuses', () => {
    expect(toReportSummary({ ...PENDING_SUMMARY, canCancel: true }).canCancel).toBe(true);
    expect(toReportSummary(PENDING_SUMMARY).canCancel).toBe(false);
    expect(toReportDetail(detail({ Status: 'SUBMITTED', canCancel: true })).canCancel).toBe(true);
    expect(toReportDetail(detail({ Status: 'PENDING_REVIEW', canCancel: true })).canCancel).toBe(true);
    // A stale hint is ignored once the business status moved on.
    expect(toReportDetail(detail({ Status: 'ROUTED_INTERNAL', canCancel: true })).canCancel).toBe(false);
    expect(toReportDetail(detail({ Status: 'SUBMITTED', canCancel: false })).canCancel).toBe(false);
  });

  it("reads the cancellation time and the Reporter's own reason from history", () => {
    const view = toReportDetail(
      detail({ Status: 'CANCELLED', AgentStatus: 'PROCESSING', screening: cancelledScreening }, [
        { StatusType: 'REPORT', OldStatus: 'SUBMITTED', NewStatus: 'CANCELLED', CreatedAt: '2026-10-09T01:00:00Z', Reason: ' Wrong photo. ' },
        { StatusType: 'REPORT', OldStatus: null, NewStatus: 'SUBMITTED', CreatedAt: '2026-10-09T00:00:00Z' },
      ]),
    );
    expect(view.cancellation).toEqual({ at: '2026-10-09T01:00:00Z', reason: 'Wrong photo.' });
    expect(view.canCancel).toBe(false);
    expect(toReportDetail(detail({ Status: 'SUBMITTED' })).cancellation).toBeNull();
  });

  it('stops the AI spinner/polling once CANCELLED even if the Agent still reads PROCESSING (REPORT-11)', () => {
    expect(isAssessmentInProgress('SUBMITTED', 'PROCESSING')).toBe(true);
    expect(isAssessmentInProgress('CANCELLED', 'PROCESSING')).toBe(false);
    expect(isAssessmentInProgress('CANCELLED', 'PENDING')).toBe(false);
  });

  it('shows a cancellation in the timeline as done by You', () => {
    expect(timelineActor({ kind: 'REPORT', oldStatus: 'PENDING_REVIEW', newStatus: 'CANCELLED', createdAt: '' })).toBe('You');
  });

  it('keeps 409 ACTIVE_REPORT_EXISTS details and validates them before use', () => {
    const error = mapHttpError(
      new HttpErrorResponse({
        status: 409,
        error: {
          error: {
            code: 'ACTIVE_REPORT_EXISTS',
            message: 'server text',
            details: { activeReport: { id: 'r-5', reportNo: 'RPT-2026-000005', status: 'IN_PROGRESS' } },
          },
        },
      }),
    );
    expect(error.code).toBe('ACTIVE_REPORT_EXISTS');
    expect(toActiveReport(error.details?.['activeReport'])).toMatchObject({ id: 'r-5', status: 'IN_PROGRESS' });
    // The DB unique-index race path carries no details.
    expect(toActiveReport(undefined)).toBeNull();
    expect(toActiveReport({ id: 5 })).toBeNull();
  });

  it('maps cancellation conflicts and input errors to owned copy', () => {
    const conflict = (code: string) => mapHttpError(new HttpErrorResponse({ status: 409, error: { error: { code } } }));
    expect(conflict('CANCELLATION_WINDOW_CLOSED').kind).toBe('CONFLICT');
    expect(conflict('MAINTENANCE_ALREADY_STARTED').userMessage).toContain('can no longer be cancelled');
    const invalid = mapHttpError(new HttpErrorResponse({ status: 400, error: { error: { code: 'INVALID_CANCELLATION_REASON' } } }));
    expect(invalid.kind).toBe('VALIDATION');
    expect(invalid.userMessage).not.toBe(ERROR_COPY.server);
  });
});
