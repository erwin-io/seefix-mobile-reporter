import {
  ReportDetail,
  ReportDetailResponse,
  ReportSummary,
  ReportSummaryDto,
  TimelineEvent,
} from '../../core/models/report.model';
import { locationText } from '../../shared/formatters/report-status-label';

/** camelCase list DTO -> view model. */
export function toReportSummary(dto: ReportSummaryDto): ReportSummary {
  return {
    id: dto.id,
    reportNo: dto.reportNo,
    status: dto.status,
    agentStatus: dto.agentStatus ?? null,
    summary: dto.summary ?? null,
    locationText: locationText([dto.building, dto.floor, dto.roomOrArea]),
    createdAt: dto.createdAt,
    thumbnailUrl: dto.primaryImageUrl ?? null,
    canCancel: dto.canCancel === true,
    screening: dto.screening,
  };
}

/** Latest CANCELLED transition; its Reason is the Reporter's own text. */
function toCancellation(dto: ReportDetailResponse): ReportDetail['cancellation'] {
  if (dto.report.Status !== 'CANCELLED') return null;
  const entry = (dto.statusHistory ?? [])
    .filter((row) => row.StatusType === 'REPORT' && row.NewStatus === 'CANCELLED')
    .sort((a, b) => Date.parse(b.CreatedAt) - Date.parse(a.CreatedAt))[0];
  return entry ? { at: entry.CreatedAt, reason: entry.Reason?.trim() || null } : null;
}

/** PascalCase detail DTO -> view model. */
export function toReportDetail(dto: ReportDetailResponse): ReportDetail {
  const r = dto.report;
  const isAssessedFacilityIssue = r.AgentStatus === 'COMPLETED' && r.ScopeDecision === 'Facility Issue';
  const review = dto.maintenanceReview;
  const workOrder = dto.workOrder;

  return {
    id: r.Id,
    reportNo: r.ReportNo,
    status: r.Status,
    agentStatus: r.AgentStatus ?? null,
    scopeDecision: r.ScopeDecision ?? null,
    description: r.Description ?? null,
    notes: r.Notes ?? null,
    locationText: locationText([r.Building, r.Floor, r.RoomOrArea]),
    createdAt: r.CreatedAt,
    resolvedAt: r.ResolvedAt ?? null,
    images: (dto.images ?? []).filter((image) => !!image.secureUrl).map((image) => ({ id: image.id, url: image.secureUrl })),
    screening: r.screening,
    assessment: isAssessedFacilityIssue
      ? {
          category: review?.FinalCategory ?? r.FinalCategory ?? r.EffectiveCategory ?? r.AiCategory ?? null,
          urgency: review?.FinalUrgency ?? r.FinalUrgency ?? r.EffectiveUrgency ?? r.AiRecommendedUrgency ?? null,
          summary: r.AiSummary ?? null,
          priorityScore: typeof r.LivePriorityScore === 'number' ? r.LivePriorityScore : null,
        }
      : null,
    review: review?.Decision
      ? { decision: review.Decision, reason: review.DecisionReason ?? null, reviewedAt: review.ReviewedAt ?? null }
      : null,
    workOrder: workOrder
      ? {
          workOrderNo: workOrder.WorkOrderNo ?? null,
          status: workOrder.Status ?? null,
          plannedStartAt: workOrder.PlannedStartAt ?? null,
          deadline: workOrder.Deadline ?? null,
        }
      : null,
    timeline: toTimeline(dto),
    // Only offered for the pre-review statuses, even if a stale hint says otherwise.
    canCancel: r.canCancel === true && (r.Status === 'SUBMITTED' || r.Status === 'PENDING_REVIEW'),
    cancellation: toCancellation(dto),
  };
}

/**
 * Order for events sharing a timestamp (e.g. written in one transaction):
 * the submission comes first, then AI queue/processing/result, then later business steps.
 */
function sameTimeRank(event: TimelineEvent): number {
  if (event.kind === 'REPORT' && event.newStatus === 'SUBMITTED') return 0;
  if (event.kind === 'AGENT') return { PENDING: 1, PROCESSING: 2 }[event.newStatus] ?? 3;
  return 4;
}

/** Chronological (oldest first); the API returns newest first. */
function toTimeline(dto: ReportDetailResponse): TimelineEvent[] {
  return (dto.statusHistory ?? [])
    .map(
      (row): TimelineEvent => ({
        kind: row.StatusType === 'REPORT' ? 'REPORT' : row.StatusType === 'AGENT' ? 'AGENT' : 'OTHER',
        oldStatus: row.OldStatus ?? null,
        newStatus: row.NewStatus,
        createdAt: row.CreatedAt,
      }),
    )
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || sameTimeRank(a) - sameTimeRank(b));
}
