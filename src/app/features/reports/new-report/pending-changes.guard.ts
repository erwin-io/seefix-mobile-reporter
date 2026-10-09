import { CanDeactivateFn } from '@angular/router';

export interface HasPendingChanges {
  /** Resolves true when it is safe to leave (nothing unsent, or the user confirmed). */
  canLeave(): boolean | Promise<boolean>;
}

/** Confirms before discarding an unsent report (incl. Android hardware back). */
export const pendingChangesGuard: CanDeactivateFn<HasPendingChanges> = (component) =>
  component?.canLeave ? component.canLeave() : true;
