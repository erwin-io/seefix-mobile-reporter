import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon, IonText } from '@ionic/angular';

/**
 * Icon + title + message, with projected actions (e.g. a Retry or Report button).
 * `fill` centers it in the visible page area when it is the page's only content.
 */
@Component({
  selector: 'app-empty-state',
  templateUrl: 'empty-state.component.html',
  styleUrls: ['empty-state.component.scss'],
  imports: [IonIcon, IonText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.fill]': 'fill()' },
})
export class EmptyStateComponent {
  readonly icon = input('document-text-outline');
  readonly title = input.required<string>();
  readonly message = input<string | null>(null);
  readonly color = input<string>('medium');
  readonly fill = input(false);
}
