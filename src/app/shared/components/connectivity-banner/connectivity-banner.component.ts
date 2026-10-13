import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { IonIcon, IonToolbar } from '@ionic/angular';
import { ConnectivityService, ConnectivityState } from '../../../core/connectivity/connectivity.service';

const COPY: Record<Exclude<ConnectivityState, 'online'>, { icon: string; title: string; detail: string }> = {
  offline: { icon: 'cloud-offline-outline', title: "You're offline", detail: 'No internet connection' },
  slow: { icon: 'hourglass-outline', title: 'Slow connection', detail: 'Things may take longer to load' },
  'server-down': { icon: 'alert-circle-outline', title: "SEEFIX can't be reached", detail: 'The server is not responding' },
};

/** Status row under a page's toolbar; hidden while the connection is fine. */
@Component({
  selector: 'app-connectivity-banner',
  templateUrl: 'connectivity-banner.component.html',
  styleUrls: ['connectivity-banner.component.scss'],
  imports: [IonToolbar, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectivityBannerComponent {
  readonly state = inject(ConnectivityService).state;
  readonly copy = computed(() => {
    const state = this.state();
    return state === 'online' ? null : COPY[state];
  });
}
