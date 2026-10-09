import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { IonIcon, IonImg, IonItem, IonLabel, IonThumbnail, NavController } from '@ionic/angular';
import { ReportSummary } from '../../../core/models/report.model';
import { ReportStatusChipComponent } from '../report-status-chip/report-status-chip.component';

@Component({
  selector: 'app-report-list-item',
  templateUrl: 'report-list-item.component.html',
  styleUrls: ['report-list-item.component.scss'],
  imports: [DatePipe, IonItem, IonThumbnail, IonImg, IonIcon, IonLabel, ReportStatusChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportListItemComponent {
  private readonly nav = inject(NavController);
  readonly report = input.required<ReportSummary>();
  readonly lines = input<'full' | 'inset' | 'none'>('full');

  open(): void {
    void this.nav.navigateForward(['/reports', this.report().id]);
  }
}
