export type ScreeningCode =
  | 'ASSESSMENT_PENDING'
  | 'AGENT_PROCESSING_FAILED'
  | 'FACILITY_ISSUE'
  | 'NO_VISIBLE_ISSUE'
  | 'OUT_OF_SCOPE'
  | 'INSUFFICIENT_IMAGE'
  | 'HUMAN_NO_ACTION'
  | 'HUMAN_DUPLICATE'
  | 'REVIEW_REQUIRED';

export type ScreeningSource = 'AI_PRELIMINARY' | 'MAINTENANCE_REVIEW' | 'SYSTEM';

/** Presentational object added by seefix-api; not a database status. */
export interface Screening {
  code: ScreeningCode | string;
  title: string;
  message: string;
  nextAction: string;
  source: ScreeningSource | string;
  needsMaintenanceReview: boolean;
  isActionable: boolean;
}
