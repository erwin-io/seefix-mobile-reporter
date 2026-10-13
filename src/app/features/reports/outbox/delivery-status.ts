import { OutboxItem, OutboxReason } from './report-outbox.store';

const WAITING_REASONS: Record<Exclude<OutboxReason, null>, string> = {
  offline: 'No internet connection',
  slow: 'Slow connection',
  server: "SEEFIX can't be reached",
  upload: "The photo upload service can't be reached",
  busy: 'SEEFIX is busy',
  session: 'Sign in to send it',
};

export function waitingReason(reason: OutboxReason): string {
  return reason ? WAITING_REASONS[reason] : 'Not yet submitted';
}

/**
 * How a report saved on the phone is described everywhere. Never "submitted": SEEFIX has not received it.
 */
export function deliveryStatus(item: OutboxItem): { title: string; detail: string; problem: boolean } {
  switch (item.state) {
    case 'sending':
      return { title: 'Sending…', detail: 'Not yet submitted', problem: false };
    case 'blocked':
      return {
        title: 'Not sent',
        detail: item.activeReport ? `${item.activeReport.reportNo} is still in progress` : 'You already have a report in progress',
        problem: true,
      };
    case 'attention':
      return { title: 'Needs your attention', detail: item.message ?? 'SEEFIX could not accept this report', problem: true };
    default:
      return { title: 'Waiting to send', detail: waitingReason(item.reason), problem: false };
  }
}

export function photoCountText(count: number): string {
  return `${count} photo${count === 1 ? '' : 's'}`;
}
