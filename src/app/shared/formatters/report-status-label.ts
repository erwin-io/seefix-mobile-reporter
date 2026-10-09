/**
 * Reporter-friendly labels for the exact business Report.Status domain.
 * Status is always conveyed with text plus an icon, never color alone.
 */
export type StatusGroup = 'ongoing' | 'resolved' | 'closed';

export interface StatusMeta {
  label: string;
  description: string;
  icon: string;
  color: 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'danger' | 'medium';
  group: StatusGroup;
}

const STATUS_META: Record<string, StatusMeta> = {
  SUBMITTED: {
    label: 'Submitted',
    description: 'Your report was received and is awaiting assessment.',
    icon: 'paper-plane-outline',
    color: 'medium',
    group: 'ongoing',
  },
  PENDING_REVIEW: {
    label: 'Awaiting maintenance review',
    description: 'The initial screening is done. The Maintenance Team will review your report next.',
    icon: 'hourglass-outline',
    color: 'warning',
    group: 'ongoing',
  },
  ROUTED_INTERNAL: {
    label: 'Approved for internal maintenance',
    description: 'The Maintenance Team approved this for internal repair.',
    icon: 'construct-outline',
    color: 'primary',
    group: 'ongoing',
  },
  PROCUREMENT: {
    label: 'Sent for procurement',
    description: 'Materials or services are being arranged before work can begin.',
    icon: 'cart-outline',
    color: 'tertiary',
    group: 'ongoing',
  },
  PENDING_ASSIGNMENT: {
    label: 'Waiting for assignment',
    description: 'A work order exists and is waiting to be assigned.',
    icon: 'people-outline',
    color: 'primary',
    group: 'ongoing',
  },
  ASSIGNED: {
    label: 'Assigned',
    description: 'A maintenance lead has been assigned to this work.',
    icon: 'person-outline',
    color: 'primary',
    group: 'ongoing',
  },
  IN_PROGRESS: {
    label: 'Work in progress',
    description: 'Maintenance work is under way.',
    icon: 'hammer-outline',
    color: 'primary',
    group: 'ongoing',
  },
  PENDING_PARTS: {
    label: 'Waiting for parts',
    description: 'Work is waiting on materials.',
    icon: 'cube-outline',
    color: 'warning',
    group: 'ongoing',
  },
  ON_HOLD: {
    label: 'On hold',
    description: 'Work is temporarily paused.',
    icon: 'pause-circle-outline',
    color: 'warning',
    group: 'ongoing',
  },
  COMPLETION_SUBMITTED: {
    label: 'Completion under review',
    description: 'The work was reported complete and is being checked.',
    icon: 'checkmark-done-outline',
    color: 'tertiary',
    group: 'ongoing',
  },
  REWORK_REQUIRED: {
    label: 'Additional work required',
    description: 'A supervisor asked for additional work before closing.',
    icon: 'refresh-outline',
    color: 'warning',
    group: 'ongoing',
  },
  RESOLVED: {
    label: 'Resolved',
    description: 'The work was accepted and this report is closed.',
    icon: 'checkmark-circle-outline',
    color: 'success',
    group: 'resolved',
  },
  NEEDS_INFORMATION: {
    label: 'More information needed',
    description: 'The Maintenance Team needs more information. They may contact you.',
    icon: 'help-circle-outline',
    color: 'warning',
    group: 'ongoing',
  },
  NO_ACTION: {
    label: 'No action required',
    description: 'The Maintenance Team reviewed your report and no maintenance action is required.',
    icon: 'remove-circle-outline',
    color: 'medium',
    group: 'closed',
  },
  DUPLICATE: {
    label: 'Related report already exists',
    description: 'This submission was linked to an existing report.',
    icon: 'copy-outline',
    color: 'medium',
    group: 'closed',
  },
  CANCELLED: {
    label: 'Cancelled',
    description: 'You cancelled this report before the Maintenance Team reviewed it. No maintenance work will start from it.',
    icon: 'close-circle-outline',
    color: 'medium',
    group: 'closed',
  },
};

export function statusMeta(status: string | null | undefined): StatusMeta {
  return (
    (status && STATUS_META[status]) || {
      label: humanize(status) || 'Unknown',
      description: '',
      icon: 'ellipse-outline',
      color: 'medium',
      group: 'ongoing',
    }
  );
}

export function statusLabel(status: string | null | undefined): string {
  return statusMeta(status).label;
}

export const AGENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'AI assessment queued',
  PROCESSING: 'AI assessment in progress',
  COMPLETED: 'AI assessment completed',
  FAILED: "AI assessment couldn't finish",
};

export function isAgentActive(agentStatus: string | null | undefined): boolean {
  return agentStatus === 'PENDING' || agentStatus === 'PROCESSING';
}

/**
 * Whether the app should show "AI assessment in progress" and poll agent-status.
 * A CANCELLED report is final even if an old Agent attempt still reads PROCESSING.
 */
export function isAssessmentInProgress(status: string | null | undefined, agentStatus: string | null | undefined): boolean {
  return status !== 'CANCELLED' && isAgentActive(agentStatus);
}

export function screeningSourceLabel(source: string | null | undefined): string {
  switch (source) {
    case 'AI_PRELIMINARY':
      return 'AI preliminary screening';
    case 'MAINTENANCE_REVIEW':
      return 'Maintenance review';
    case 'REPORTER':
      return 'Your cancellation';
    default:
      return 'System update';
  }
}

export const REVIEW_DECISION_LABELS: Record<string, string> = {
  INTERNAL: 'Routed to internal maintenance',
  PROCUREMENT: 'Sent for procurement',
  NO_ACTION: 'No maintenance action required',
  DUPLICATE: 'Linked to an existing report',
};

/** SNAKE_CASE or "Title Case" -> "Sentence case" for values without a curated label. */
export function humanize(value: string | null | undefined): string {
  if (!value) return '';
  const text = value.replace(/_/g, ' ').toLowerCase().trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function locationText(parts: (string | null | undefined)[]): string | null {
  const text = parts
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .join(' • ');
  return text || null;
}
