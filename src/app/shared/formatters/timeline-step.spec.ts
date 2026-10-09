import { TimelineEvent } from '../../core/models/report.model';
import { timelineActor, timelineStep } from './timeline-step';

const report = (newStatus: string, oldStatus: string | null = null): TimelineEvent => ({
  kind: 'REPORT',
  oldStatus,
  newStatus,
  createdAt: '2026-10-09T00:00:00Z',
});
const agent = (newStatus: string): TimelineEvent => ({ kind: 'AGENT', oldStatus: null, newStatus, createdAt: '2026-10-09T00:00:00Z' });

describe('timelineStep', () => {
  it('marks AI events as technical with AI icons and actor', () => {
    expect(timelineStep(agent('PENDING'))).toMatchObject({ technical: true, icon: 'hourglass-outline', actor: 'SEEFIX AI' });
    expect(timelineStep(agent('COMPLETED'))).toMatchObject({ technical: true, icon: 'sparkles' });
    expect(timelineStep(agent('FAILED'))).toMatchObject({ icon: 'alert-circle-outline', color: 'warning' });
  });

  it('uses a submitted icon for the Reporter and a filled success check for Resolved', () => {
    expect(timelineStep(report('SUBMITTED'))).toMatchObject({ icon: 'paper-plane-outline', color: 'primary', actor: 'You' });
    expect(timelineStep(report('RESOLVED'))).toMatchObject({ icon: 'checkmark-circle', color: 'success', actor: 'Supervisor' });
  });

  it('derives the human actor from the workflow role that sets each status', () => {
    expect(timelineActor(report('PENDING_REVIEW'))).toBe('SEEFIX');
    expect(timelineActor(report('ROUTED_INTERNAL'))).toBe('Maintenance Team');
    expect(timelineActor(report('NO_ACTION'))).toBe('Maintenance Team');
    expect(timelineActor(report('IN_PROGRESS'))).toBe('Maintenance crew');
    expect(timelineActor(report('COMPLETION_SUBMITTED'))).toBe('Maintenance crew');
    expect(timelineActor(report('REWORK_REQUIRED'))).toBe('Supervisor');
    expect(timelineActor(report('PENDING_ASSIGNMENT', 'PROCUREMENT'))).toBe('Procurement');
    expect(timelineActor(report('PENDING_ASSIGNMENT', 'ROUTED_INTERNAL'))).toBe('Maintenance Team');
  });
});
