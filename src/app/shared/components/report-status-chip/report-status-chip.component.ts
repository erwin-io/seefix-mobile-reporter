import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IonChip, IonIcon, IonLabel } from '@ionic/angular';
import { statusMeta } from '../../formatters/report-status-label';

/** Business status as text + icon (never color alone). */
@Component({
  selector: 'app-report-status-chip',
  templateUrl: 'report-status-chip.component.html',
  styleUrls: ['report-status-chip.component.scss'],
  imports: [IonChip, IonIcon, IonLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportStatusChipComponent {
  readonly status = input.required<string>();
  readonly meta = computed(() => statusMeta(this.status()));
}
