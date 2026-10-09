import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { IonButton, IonContent, IonFooter, IonIcon, IonToolbar, ModalController } from '@ionic/angular';

/** Full-screen success confirmation shown after an account action completes. Open via SuccessScreenService. */
@Component({
  selector: 'app-success-screen',
  templateUrl: 'success-screen.component.html',
  styleUrls: ['success-screen.component.scss'],
  imports: [IonContent, IonFooter, IonToolbar, IonButton, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuccessScreenComponent {
  private readonly modals = inject(ModalController);

  readonly title = input.required<string>();
  readonly message = input<string | null>(null);
  readonly actionText = input('Done');
  readonly icon = input('checkmark-circle');

  done(): void {
    void this.modals.dismiss(undefined, 'done');
  }
}
