import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonIcon } from '@ionic/angular';

/**
 * Standard ion-card section with a tinted icon badge, eyebrow label and title.
 * Body content is projected; `[slot=aside]` content sits at the header's end (e.g. a badge).
 */
@Component({
  selector: 'app-detail-card',
  templateUrl: 'detail-card.component.html',
  styleUrls: ['detail-card.component.scss'],
  imports: [IonCard, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCardContent, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailCardComponent {
  readonly icon = input.required<string>();
  readonly eyebrow = input.required<string>();
  readonly title = input<string | null>(null);
  /** Ionic color name used for the icon badge. */
  readonly color = input<string>('primary');
  readonly muted = input(false);

  readonly accent = computed(() => `var(--ion-color-${this.color()})`);
  readonly accentRgb = computed(() => `var(--ion-color-${this.color()}-rgb)`);
}
