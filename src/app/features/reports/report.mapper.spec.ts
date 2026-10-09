import { REPORT_3_DETAIL, REPORT_4_DETAIL, REPORT_4_SUMMARY } from '../../testing/fixtures/reports.fixture';
import { statusMeta } from '../../shared/formatters/report-status-label';
import { timelineLabel } from '../../shared/formatters/timeline-step';
import { toReportDetail, toReportSummary } from './report.mapper';

describe('report mapper', () => {
  it('maps the camelCase list entry', () => {
    const summary = toReportSummary(REPORT_4_SUMMARY);
    expect(summary.reportNo).toBe('RPT-2026-000004');
    expect(summary.locationText).toBe('Old Building • 2nd Floor • Staircase');
    expect(summary.thumbnailUrl).toBe(REPORT_4_SUMMARY.primaryImageUrl);
  });

  it('report #4 NO_ACTION: human outcome, no assessment, no fabricated priority (REPORT-07)', () => {
    const detail = toReportDetail(REPORT_4_DETAIL);
    expect(detail.status).toBe('NO_ACTION');
    expect(statusMeta(detail.status).label).toBe('No action required');
    expect(detail.screening.code).toBe('HUMAN_NO_ACTION');
    expect(detail.assessment).toBeNull();
    expect(detail.review).toEqual({
      decision: 'NO_ACTION',
      reason: 'The visible image shows a clean, intact staircase.',
      reviewedAt: '2026-10-06T03:00:00.000Z',
    });
    expect(detail.resolvedAt).toBeNull();
  });

  it('orders the timeline oldest-first and separates Agent events', () => {
    const detail = toReportDetail(REPORT_4_DETAIL);
    expect(detail.timeline.map((event) => event.kind)).toEqual(['AGENT', 'AGENT', 'REPORT', 'REPORT']);
    expect(detail.timeline.map(timelineLabel)).toEqual([
      'AI assessment in progress',
      'AI assessment completed',
      'Awaiting maintenance review',
      'No action required',
    ]);
  });

  it('report #3 REWORK -> RESOLVED keeps rework in the timeline and final status authoritative (REPORT-08)', () => {
    const detail = toReportDetail(REPORT_3_DETAIL);
    expect(statusMeta(detail.status).label).toBe('Resolved');
    expect(detail.timeline.map((event) => event.newStatus)).toEqual([
      'ROUTED_INTERNAL',
      'REWORK_REQUIRED',
      'COMPLETION_SUBMITTED',
      'RESOLVED',
    ]);
    expect(detail.assessment).toEqual({
      category: 'Ceiling',
      urgency: 'High',
      summary: 'Damaged ceiling panel near corridor lights.',
      priorityScore: 42,
    });
    expect(detail.workOrder?.workOrderNo).toBe('WO-2026-000003');
  });

  it('puts Submitted before AI events that share its timestamp', () => {
    const at = '2026-10-09T03:32:00.000Z';
    const detail = toReportDetail({
      ...REPORT_4_DETAIL,
      statusHistory: [
        { StatusType: 'AGENT', OldStatus: 'PENDING', NewStatus: 'PROCESSING', CreatedAt: at },
        { StatusType: 'AGENT', OldStatus: null, NewStatus: 'PENDING', CreatedAt: at },
        { StatusType: 'REPORT', OldStatus: null, NewStatus: 'SUBMITTED', CreatedAt: at },
      ],
    });
    expect(detail.timeline.map((event) => event.newStatus)).toEqual(['SUBMITTED', 'PENDING', 'PROCESSING']);
  });

  it('keeps a null priority as null (displayed "Not assessed", never 0)', () => {
    const detail = toReportDetail({
      ...REPORT_3_DETAIL,
      report: { ...REPORT_3_DETAIL.report, LivePriorityScore: null },
    });
    expect(detail.assessment?.priorityScore).toBeNull();
  });
});
