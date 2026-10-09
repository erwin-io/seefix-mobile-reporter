import { ReportDetailResponse, ReportSummaryDto } from '../../core/models/report.model';
import { Screening } from '../../core/models/screening.model';

/** Sanitized fixtures modelled on verified reports RPT-2026-000001..4. No real URLs or people. */

export const HUMAN_NO_ACTION_SCREENING: Screening = {
  code: 'HUMAN_NO_ACTION',
  title: 'No maintenance action required',
  message:
    'The Maintenance Team reviewed your report and determined that no corrective maintenance is required at this time.',
  nextAction: 'NONE',
  source: 'MAINTENANCE_REVIEW',
  needsMaintenanceReview: false,
  isActionable: false,
};

export const FACILITY_ISSUE_SCREENING: Screening = {
  code: 'FACILITY_ISSUE',
  title: 'Potential maintenance issue identified',
  message: 'The automated assessment identified a potential facility issue.',
  nextAction: 'VIEW_REPORT',
  source: 'AI_PRELIMINARY',
  needsMaintenanceReview: false,
  isActionable: true,
};

export const PENDING_SCREENING: Screening = {
  code: 'ASSESSMENT_PENDING',
  title: 'Checking your report',
  message: 'Your report has been saved and is being prepared for automated assessment.',
  nextAction: 'WAIT_FOR_ASSESSMENT',
  source: 'SYSTEM',
  needsMaintenanceReview: false,
  isActionable: false,
};

export const REPORT_4_SUMMARY: ReportSummaryDto = {
  id: '00000000-0000-4000-8000-000000000004',
  reportNo: 'RPT-2026-000004',
  status: 'NO_ACTION',
  agentStatus: 'COMPLETED',
  analysisStatus: 'No Assessment',
  scopeDecision: 'No Visible Maintenance Issue',
  effectiveCategory: null,
  effectiveUrgency: null,
  priorityScore: null,
  summary: null,
  building: 'Old Building',
  floor: '2nd Floor',
  roomOrArea: 'Staircase',
  createdAt: '2026-10-05T03:00:00.000Z',
  primaryImageUrl: 'https://images.example.test/rpt4.jpg',
  screening: HUMAN_NO_ACTION_SCREENING,
};

export const REPORT_3_SUMMARY: ReportSummaryDto = {
  ...REPORT_4_SUMMARY,
  id: '00000000-0000-4000-8000-000000000003',
  reportNo: 'RPT-2026-000003',
  status: 'RESOLVED',
  analysisStatus: 'Assessed',
  scopeDecision: 'Facility Issue',
  priorityScore: 42,
  summary: 'Damaged ceiling panel near corridor lights.',
  createdAt: '2026-10-04T03:00:00.000Z',
  screening: FACILITY_ISSUE_SCREENING,
};

export const PENDING_SUMMARY: ReportSummaryDto = {
  ...REPORT_4_SUMMARY,
  id: '00000000-0000-4000-8000-000000000005',
  reportNo: 'RPT-2026-000005',
  status: 'SUBMITTED',
  agentStatus: 'PENDING',
  analysisStatus: null,
  scopeDecision: null,
  building: null,
  floor: null,
  roomOrArea: null,
  createdAt: '2026-10-09T03:00:00.000Z',
  primaryImageUrl: null,
  screening: PENDING_SCREENING,
};

export const REPORT_4_DETAIL: ReportDetailResponse = {
  report: {
    Id: REPORT_4_SUMMARY.id,
    ReportNo: 'RPT-2026-000004',
    Status: 'NO_ACTION',
    AgentStatus: 'COMPLETED',
    AnalysisStatus: 'No Assessment',
    ScopeDecision: 'No Visible Maintenance Issue',
    Description: 'Staircase railing looks loose.',
    Notes: null,
    Building: 'Old Building',
    Floor: '2nd Floor',
    RoomOrArea: 'Staircase',
    AiSummary: null,
    LivePriorityScore: null,
    ResolvedAt: null,
    CreatedAt: '2026-10-05T03:00:00.000Z',
    screening: HUMAN_NO_ACTION_SCREENING,
  },
  images: [
    {
      id: 'img-1',
      secureUrl: 'https://images.example.test/rpt4.jpg',
      isPrimary: true,
      width: 1200,
      height: 900,
      createdAt: '2026-10-05T03:00:00.000Z',
    },
  ],
  maintenanceRequest: null,
  maintenanceReview: {
    Status: 'COMPLETED',
    Decision: 'NO_ACTION',
    DecisionReason: 'The visible image shows a clean, intact staircase.',
    ReviewedAt: '2026-10-06T03:00:00.000Z',
  },
  procurementHandoff: null,
  workOrder: null,
  duplicateCandidates: [],
  statusHistory: [
    { StatusType: 'REPORT', OldStatus: 'PENDING_REVIEW', NewStatus: 'NO_ACTION', CreatedAt: '2026-10-06T03:00:00.000Z' },
    { StatusType: 'REPORT', OldStatus: 'SUBMITTED', NewStatus: 'PENDING_REVIEW', CreatedAt: '2026-10-05T03:02:00.000Z' },
    { StatusType: 'AGENT', OldStatus: 'PROCESSING', NewStatus: 'COMPLETED', CreatedAt: '2026-10-05T03:01:30.000Z' },
    { StatusType: 'AGENT', OldStatus: 'PENDING', NewStatus: 'PROCESSING', CreatedAt: '2026-10-05T03:01:00.000Z' },
  ],
};

export const REPORT_3_DETAIL: ReportDetailResponse = {
  report: {
    Id: REPORT_3_SUMMARY.id,
    ReportNo: 'RPT-2026-000003',
    Status: 'RESOLVED',
    AgentStatus: 'COMPLETED',
    AnalysisStatus: 'Assessed',
    ScopeDecision: 'Facility Issue',
    Description: 'Ceiling panel is hanging.',
    AiCategory: 'Ceiling',
    AiSummary: 'Damaged ceiling panel near corridor lights.',
    AiRecommendedUrgency: 'Medium',
    EffectiveCategory: 'Ceiling',
    EffectiveUrgency: 'High',
    LivePriorityScore: 42,
    ResolvedAt: '2026-10-08T03:00:00.000Z',
    CreatedAt: '2026-10-04T03:00:00.000Z',
    screening: FACILITY_ISSUE_SCREENING,
  },
  images: [],
  maintenanceRequest: { Id: 'mr-3' },
  maintenanceReview: { Decision: 'INTERNAL', DecisionReason: null, FinalUrgency: 'High' },
  procurementHandoff: null,
  workOrder: { WorkOrderNo: 'WO-2026-000003', Status: 'RESOLVED' },
  duplicateCandidates: [],
  statusHistory: [
    { StatusType: 'REPORT', OldStatus: 'COMPLETION_SUBMITTED', NewStatus: 'RESOLVED', CreatedAt: '2026-10-08T03:00:00.000Z' },
    { StatusType: 'REPORT', OldStatus: 'REWORK_REQUIRED', NewStatus: 'COMPLETION_SUBMITTED', CreatedAt: '2026-10-07T05:00:00.000Z' },
    { StatusType: 'REPORT', OldStatus: 'COMPLETION_SUBMITTED', NewStatus: 'REWORK_REQUIRED', CreatedAt: '2026-10-07T03:00:00.000Z' },
    { StatusType: 'REPORT', OldStatus: 'PENDING_REVIEW', NewStatus: 'ROUTED_INTERNAL', CreatedAt: '2026-10-05T03:00:00.000Z' },
  ],
};
