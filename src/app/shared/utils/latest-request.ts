import { Observable, Subscription } from 'rxjs';

/**
 * One request at a time, where a newer run replaces an older one. Unsubscribing never calls `complete` or `error`,
 * so a replaced run's caller would otherwise wait forever: every caller's Promise settles when the latest run does.
 */
export class LatestRequest<T> {
  private subscription: Subscription | null = null;
  private waiters: (() => void)[] = [];

  /** A request is still running (so a settled caller must not clear a shared "loading" flag). */
  get busy(): boolean {
    return !!this.subscription && !this.subscription.closed;
  }

  run(source: Observable<T>, onValue: (value: T) => void, onError: (error: unknown) => void): Promise<void> {
    this.subscription?.unsubscribe();
    const settled = new Promise<void>((resolve) => this.waiters.push(resolve));
    this.subscription = source.subscribe({
      next: onValue,
      error: (error: unknown) => {
        onError(error);
        this.settle();
      },
      complete: () => this.settle(),
    });
    return settled;
  }

  /** Stops the current request and releases everyone waiting on it. */
  cancel(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.settle();
  }

  private settle(): void {
    this.waiters.splice(0).forEach((resolve) => resolve());
  }
}
