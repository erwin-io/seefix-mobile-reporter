import { Screening } from './screening.model';

/** Exact business Report.Status domain in seefix-api / PostgreSQL. */
export type ReportStatus =
  | 'SUBMITTED'
  | 'PENDING_REVIEW'
  | 'ROUTED_INTERNAL'
  | 'PROCUREMENT'
  | 'PENDING_ASSIGNMENT'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'PENDING_PARTS'
  | 'ON_HOLD'
  | 'COMPLETION_SUBMITTED'
  | 'REWORK_REQUIRED'
  | 'RESOLVED'
  | 'NEEDS_INFORMATION'
  | 'NO_ACTION'
  | 'DUPLICATE'
  | 'CANCELLED';

export type AgentStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type ScopeDecision =
  | 'Facility Issue'
  | 'No Visible Maintenance Issue'
  | 'Out of Scope'
  | 'Insufficient Image';

// ---------------------------------------------------------------------------
// Raw server contracts
// ---------------------------------------------------------------------------

/** GET /api/reports/my list entry (camelCase). */
export interface ReportSummaryDto {
  id: string;
  reportNo: string;
  status: ReportStatus | string;
  agentStatus: AgentStatus | string | null;
  analysisStatus: string | null;
  scopeDecision: ScopeDecision | string | null;
  effectiveCategory: string | null;
  effectiveUrgency: string | null;
  priorityScore: number | null;
  summary: string | null;
  building: string | null;
  floor: string | null;
  roomOrArea: string | null;
  createdAt: string;
  primaryImageUrl: string | null;
  /** Server hint; the cancel request remains authoritative (may still 409). */
  canCancel?: boolean;
  screening: Screening;
}

export interface ReportListResponse {
  items: ReportSummaryDto[];
}

/** POST /api/reports 201 response. */
export interface CreateReportResponse {
  id: string;
  reportNo: string;
  status: ReportStatus | string;
  agentStatus: AgentStatus | string;
  createdAt: string;
  imageCount: number;
  agentTriggerAccepted: boolean;
}

/**
 * Detailed report record (PascalCase, `SELECT r.*` plus joined columns).
 * Only the columns the Reporter UI reads are typed; others are ignored.
 */
export interface ReportRecordDto {
  Id: string;
  ReportNo: string;
  Status: ReportStatus | string;
  AgentStatus: AgentStatus | string | null;
  AnalysisStatus?: string | null;
  ScopeDecision?: ScopeDecision | string | null;
  Description?: string | null;
  Notes?: string | null;
  Building?: string | null;
  Floor?: string | null;
  RoomOrArea?: string | null;
  AiCategory?: string | null;
  AiSummary?: string | null;
  AiRecommendedUrgency?: string | null;
  FinalCategory?: string | null;
  FinalUrgency?: string | null;
  EffectiveCategory?: string | null;
  EffectiveUrgency?: string | null;
  LivePriorityScore?: number | null;
  ResolvedAt?: string | null;
  CreatedAt: string;
  UpdatedAt?: string | null;
  /** camelCase field added by seefix-api onto the PascalCase record. */
  canCancel?: boolean;
  screening: Screening;
}

export interface ReportImageDto {
  id: string;
  secureUrl: string;
  isPrimary: boolean;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface MaintenanceReviewDto {
  Id?: string;
  Status?: string | null;
  Decision?: string | null;
  DecisionReason?: string | null;
  FinalCategory?: string | null;
  FinalUrgency?: string | null;
  ReviewedAt?: string | null;
}

export interface WorkOrderDto {
  Id?: string;
  WorkOrderNo?: string | null;
  Status?: string | null;
  PlannedStartAt?: string | null;
  Deadline?: string | null;
  ResolvedAt?: string | null;
}

/** v_ReportTimeline row. `Reason` is only surfaced for the Reporter's own cancellation. */
export interface StatusHistoryDto {
  Id?: string;
  StatusType: string;
  OldStatus: string | null;
  NewStatus: string;
  CreatedAt: string;
  Reason?: string | null;
}

/** The Reporter's single nonterminal report (one active report per account). */
export interface ActiveReportDto {
  id: string;
  reportNo: string;
  status: ReportStatus | string;
  agentStatus?: AgentStatus | string | null;
  createdAt?: string;
}

/** GET /api/reports/my/active */
export interface ActiveReportResponse {
  canSubmit: boolean;
  activeReport: ActiveReportDto | null;
}

/** POST /api/reports/:id/cancel 200 response. */
export interface CancelReportResponse {
  reportId: string;
  reportNo: string;
  status: 'CANCELLED';
  agentStatus: string | null;
  cancelledAt: string | null;
  reason: string | null;
  canCancel: false;
  alreadyCancelled: boolean;
}

/** Statuses that release the Reporter's submission slot. Everything else is active. */
export const TERMINAL_REPORT_STATUSES = ['RESOLVED', 'CANCELLED', 'NO_ACTION', 'DUPLICATE'] as const;

/** GET /api/reports/:id */
export interface ReportDetailResponse {
  report: ReportRecordDto;
  images: ReportImageDto[];
  maintenanceRequest: Record<string, unknown> | null;
  maintenanceReview: MaintenanceReviewDto | null;
  procurementHandoff: Record<string, unknown> | null;
  workOrder: WorkOrderDto | null;
  duplicateCandidates: unknown[];
  statusHistory: StatusHistoryDto[];
}

/** GET /api/reports/:id/agent-status */
export interface AgentStatusResponse {
  reportId: string;
  reportNo: string;
  businessStatus?: ReportStatus | string;
  agentStatus: AgentStatus | string | null;
  attemptCount?: number;
  screening: Screening;
}

// ---------------------------------------------------------------------------
// UI view models (normalized by report.mapper.ts)
// ---------------------------------------------------------------------------

export interface ReportSummary {
  id: string;
  reportNo: string;
  status: string;
  agentStatus: string | null;
  summary: string | null;
  locationText: string | null;
  createdAt: string;
  thumbnailUrl: string | null;
  canCancel: boolean;
  screening: Screening;
}

export interface ReportAssessment {
  category: string | null;
  urgency: string | null;
  summary: string | null;
  /** null means "Not assessed" — never render as 0. */
  priorityScore: number | null;
}

export interface HumanReview {
  decision: string | null;
  reason: string | null;
  reviewedAt: string | null;
}

export interface WorkOrderProgress {
  workOrderNo: string | null;
  status: string | null;
  plannedStartAt: string | null;
  deadline: string | null;
}

export interface TimelineEvent {
  kind: 'REPORT' | 'AGENT' | 'OTHER';
  oldStatus: string | null;
  newStatus: string;
  createdAt: string;
}

export interface ReportDetail {
  id: string;
  reportNo: string;
  status: string;
  agentStatus: string | null;
  scopeDecision: string | null;
  description: string | null;
  notes: string | null;
  locationText: string | null;
  createdAt: string;
  resolvedAt: string | null;
  images: { id: string; url: string }[];
  screening: Screening;
  assessment: ReportAssessment | null;
  review: HumanReview | null;
  workOrder: WorkOrderProgress | null;
  timeline: TimelineEvent[];
  /** True only when the server says the owner may still cancel (SUBMITTED/PENDING_REVIEW, before review). */
  canCancel: boolean;
  /** Present once the Reporter cancelled; taken from the CANCELLED status-history entry. */
  cancellation: { at: string; reason: string | null } | null;
}
