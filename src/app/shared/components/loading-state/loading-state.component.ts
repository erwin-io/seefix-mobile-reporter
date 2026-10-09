import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IonItem, IonLabel, IonList, IonSkeletonText, IonThumbnail } from '@ionic/angular';

/** Skeleton list for first loads — no fake values. */
@Component({
  selector: 'app-loading-state',
  templateUrl: 'loading-state.component.html',
  styleUrls: ['loading-state.component.scss'],
  imports: [IonList, IonItem, IonThumbnail, IonLabel, IonSkeletonText],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingStateComponent {
  readonly rows = input(3);
  readonly withThumbnail = input(true);
  readonly placeholders = computed(() => Array.from({ length: this.rows() }, (_, index) => index));
}
