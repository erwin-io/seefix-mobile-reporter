import { PENDING_SUMMARY, REPORT_3_SUMMARY, REPORT_4_SUMMARY } from '../../../testing/fixtures/reports.fixture';
import { toReportSummary } from '../../reports/report.mapper';
import { filterReports } from './my-reports.page';

describe('filterReports (REPORT-06)', () => {
  const items = [PENDING_SUMMARY, REPORT_4_SUMMARY, REPORT_3_SUMMARY].map(toReportSummary);

  it('groups statuses client-side', () => {
    expect(filterReports(items, 'all', '').length).toBe(3);
    expect(filterReports(items, 'ongoing', '').map((r) => r.reportNo)).toEqual(['RPT-2026-000005']);
    expect(filterReports(items, 'resolved', '').map((r) => r.reportNo)).toEqual(['RPT-2026-000003']);
    expect(filterReports(items, 'closed', '').map((r) => r.reportNo)).toEqual(['RPT-2026-000004']);
  });

  it('searches report number, summary, location and status label', () => {
    expect(filterReports(items, 'all', '000004').length).toBe(1);
    expect(filterReports(items, 'all', 'ceiling').length).toBe(1);
    expect(filterReports(items, 'all', 'old building').length).toBe(2);
    expect(filterReports(items, 'all', 'no action').map((r) => r.reportNo)).toEqual(['RPT-2026-000004']);
  });
});
