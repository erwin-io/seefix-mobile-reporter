import { TimelineEvent } from '../../core/models/report.model';
import { AGENT_STATUS_LABELS, StatusMeta, humanize, statusLabel, statusMeta } from './report-status-label';

/** Who performs a step, derived from which role the SEEFIX workflow allows to set it. */
export type TimelineActor = 'You' | 'SEEFIX AI' | 'SEEFIX' | 'Maintenance Team' | 'Procurement' | 'Maintenance crew' | 'Supervisor';

export interface TimelineStep {
  label: string;
  icon: string;
  color: StatusMeta['color'];
  actor: TimelineActor;
  /** AI processing events (hidden unless "Show AI processing events" is on). */
  technical: boolean;
}

const AGENT_STEPS: Record<string, Pick<TimelineStep, 'icon' | 'color'>> = {
  PENDING: { icon: 'hourglass-outline', color: 'medium' },
  PROCESSING: { icon: 'sparkles-outline', color: 'tertiary' },
  COMPLETED: { icon: 'sparkles', color: 'tertiary' },
  FAILED: { icon: 'alert-circle-outline', color: 'warning' },
};

/** Statuses decided by the Maintenance Team (staff or supervisor) during review/routing. */
const MAINTENANCE_TEAM = new Set(['ROUTED_INTERNAL', 'PROCUREMENT', 'NO_ACTION', 'DUPLICATE', 'NEEDS_INFORMATION', 'ASSIGNED']);
/** Statuses reported by the assigned crew while doing the work. */
const CREW = new Set(['IN_PROGRESS', 'PENDING_PARTS', 'ON_HOLD', 'COMPLETION_SUBMITTED']);
/** Supervisor acceptance or rework decisions on completed work. */
const SUPERVISOR = new Set(['RESOLVED', 'REWORK_REQUIRED']);

export function timelineLabel(event: TimelineEvent): string {
  if (event.kind === 'REPORT') return statusLabel(event.newStatus);
  if (event.kind === 'AGENT') return AGENT_STATUS_LABELS[event.newStatus] ?? `AI assessment: ${humanize(event.newStatus)}`;
  return humanize(event.newStatus);
}

export function timelineActor(event: TimelineEvent): TimelineActor {
  if (event.kind === 'AGENT') return 'SEEFIX AI';
  const status = event.newStatus;
  // Reporter-owned steps: submitting and (the only cancellation path in the workflow) cancelling.
  if (status === 'SUBMITTED' || status === 'CANCELLED') return 'You';
  if (status === 'PENDING_REVIEW') return 'SEEFIX';
  // A work order follows either internal preparation or a recorded procurement outcome.
  if (status === 'PENDING_ASSIGNMENT') return event.oldStatus === 'PROCUREMENT' ? 'Procurement' : 'Maintenance Team';
  if (MAINTENANCE_TEAM.has(status)) return 'Maintenance Team';
  if (CREW.has(status)) return 'Maintenance crew';
  if (SUPERVISOR.has(status)) return 'Supervisor';
  return 'SEEFIX';
}

export function timelineStep(event: TimelineEvent): TimelineStep {
  const label = timelineLabel(event);
  const actor = timelineActor(event);
  if (event.kind === 'AGENT') {
    const step = AGENT_STEPS[event.newStatus] ?? { icon: 'sparkles-outline', color: 'tertiary' };
    return { label, actor, technical: true, ...step };
  }
  const meta = statusMeta(event.newStatus);
  // Final, positive outcome gets the filled check; everything else uses the status icon.
  const icon = event.newStatus === 'RESOLVED' ? 'checkmark-circle' : meta.icon;
  const color = event.newStatus === 'SUBMITTED' ? 'primary' : meta.color;
  return { label, actor, technical: false, icon, color };
}
