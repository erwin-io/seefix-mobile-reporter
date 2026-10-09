import { Injectable, inject } from '@angular/core';
import { AlertController } from '@ionic/angular';

export interface ConfirmOptions {
  header: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  /** Red confirm button for sign-out or irreversible actions. */
  destructive?: boolean;
}

/** Standard Ionic confirmation alert (same look as the Log Out dialog). Resolves true on confirm. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly alerts = inject(AlertController);

  async confirm(options: ConfirmOptions): Promise<boolean> {
    const alert = await this.alerts.create({
      header: options.header,
      message: options.message,
      buttons: [
        { text: options.cancelText ?? 'Cancel', role: 'cancel', cssClass: 'alert-button-cancel' },
        {
          text: options.confirmText,
          role: 'confirm',
          cssClass: options.destructive ? 'alert-button-danger' : 'alert-button-confirm',
        },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'confirm';
  }
}
