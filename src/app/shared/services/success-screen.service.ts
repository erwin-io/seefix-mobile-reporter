import { Injectable, inject } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { SuccessScreenComponent } from '../components/success-screen/success-screen.component';

export interface SuccessScreenOptions {
  title: string;
  message?: string | null;
  /** Button label; defaults to "Done". */
  actionText?: string;
}

/** Shows the full-screen success modal and resolves when the user taps the action button. */
@Injectable({ providedIn: 'root' })
export class SuccessScreenService {
  private readonly modals = inject(ModalController);

  async show(options: SuccessScreenOptions): Promise<void> {
    const modal = await this.modals.create({
      component: SuccessScreenComponent,
      componentProps: {
        title: options.title,
        message: options.message ?? null,
        actionText: options.actionText ?? 'Done',
      },
      cssClass: 'success-screen-modal',
      backdropDismiss: false,
      // Hardware back / swipe also counts as "done".
      canDismiss: true,
    });
    await modal.present();
    await modal.onDidDismiss();
  }
}
