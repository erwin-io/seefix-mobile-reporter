import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Geolocation } from '@capacitor/geolocation';
import {
  ActionSheetController,
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  LoadingController,
  NavController,
  ToastController,
  ViewWillEnter,
} from '@ionic/angular';
import { debounceTime } from 'rxjs';
import { SessionStore } from '../../../core/auth/session.store';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { ConnectivityService } from '../../../core/connectivity/connectivity.service';
import { BuildingDto, FacilityLocationDto } from '../../../core/models/reference.model';
import { CreateReportResponse } from '../../../core/models/report.model';
import { StorageFullError } from '../../../core/storage/local-db.service';
import { ConnectivityBannerComponent } from '../../../shared/components/connectivity-banner/connectivity-banner.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { locationText, statusLabel } from '../../../shared/formatters/report-status-label';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { ReferenceStore } from '../../reference/reference.store';
import { OutboxReason, ReportOutboxStore, sha256Hex } from '../outbox/report-outbox.store';
import { ReportSyncService } from '../outbox/report-sync.service';
import { ReportsStore } from '../reports.store';
import { HasPendingChanges } from './pending-changes.guard';
import { ImageRejectedError, PhotoPermissionError, PhotoPickerService, SelectedPhoto } from './photo-picker.service';
import { ReportDraftStore } from './report-draft.store';

/** Sentinel for "my location isn't listed" -> free-text building/floor/area. */
export const OTHER_LOCATION = '__other__';

interface GpsFix {
  lat: number;
  lng: number;
  accuracy: number | null;
}

/** Screen F — dedicated full-screen report submission (not a tab). */
@Component({
  selector: 'app-new-report',
  templateUrl: 'new-report.page.html',
  styleUrls: ['new-report.page.scss'],
  imports: [
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonFooter,
    IonNote,
    IonInput,
    IonTextarea,
    IonSelect,
    IonSelectOption,
    IonButton,
    IonIcon,
    IonSpinner,
    EmptyStateComponent,
    ConnectivityBannerComponent,
  ],
})
export class NewReportPage implements ViewWillEnter, OnDestroy, HasPendingChanges {
  private readonly env = inject(APP_ENVIRONMENT);
  private readonly picker = inject(PhotoPickerService);
  private readonly reference = inject(ReferenceStore);
  private readonly reports = inject(ReportsStore);
  private readonly outbox = inject(ReportOutboxStore);
  private readonly sync = inject(ReportSyncService);
  private readonly draft = inject(ReportDraftStore);
  private readonly connectivity = inject(ConnectivityService);
  private readonly session = inject(SessionStore);
  private readonly nav = inject(NavController);
  private readonly actionSheets = inject(ActionSheetController);
  private readonly alerts = inject(AlertController);
  private readonly toasts = inject(ToastController);
  private readonly loadings = inject(LoadingController);
  private readonly confirm = inject(ConfirmService);

  readonly maxImages = this.env.maxReportImages;
  readonly maxUploadMb = this.env.maxUploadMb;
  readonly otherLocation = OTHER_LOCATION;

  readonly form = inject(NonNullableFormBuilder).group({
    description: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(4000)]],
    notes: ['', [Validators.maxLength(4000)]],
    buildingId: [''],
    locationId: [''],
    building: ['', [Validators.maxLength(200)]],
    floor: ['', [Validators.maxLength(100)]],
    roomOrArea: ['', [Validators.maxLength(200)]],
  });

  readonly photos = signal<SelectedPhoto[]>([]);
  readonly photosTouched = signal(false);
  readonly buildings = signal<BuildingDto[]>([]);
  readonly locations = signal<FacilityLocationDto[]>([]);
  readonly referenceState = signal<'loading' | 'ready' | 'unavailable'>('loading');
  readonly locationsLoading = signal(false);
  readonly gps = signal<GpsFix | null>(null);
  readonly locating = signal(false);
  readonly submitting = signal(false);

  readonly buildingIdValue = toSignal(this.form.controls.buildingId.valueChanges, { initialValue: '' });
  readonly locationIdValue = toSignal(this.form.controls.locationId.valueChanges, { initialValue: '' });
  readonly remainingSlots = computed(() => this.maxImages - this.photos().length);
  readonly manualLocation = computed(
    () => this.referenceState() === 'unavailable' || this.buildingIdValue() === OTHER_LOCATION,
  );
  readonly photoError = computed(() => this.photosTouched() && this.photos().length === 0);

  /** Shared one-active-report eligibility (see ReportsStore). */
  readonly eligibility = this.reports.eligibility;
  readonly activeReport = this.reports.activeReport;
  /** What the gate shows before the form opens: a report still waiting on this phone blocks like an active one. */
  readonly gate = computed(() => (this.outbox.hasUnsent() ? 'unsent' : this.eligibility()));
  /**
   * The form opens when the server allows a new report, or can't be asked (offline: the report is saved on the
   * phone and the server decides when it is sent). Once open it stays open; the rule is re-checked before sending.
   */
  readonly unlocked = signal(false);
  readonly statusLabel = statusLabel;

  private submitted = false;
  /** Lets "View active report" leave without the discard prompt; the draft stays in the page stack. */
  private leavingToActiveReport = false;
  private confirmingSubmit = false;
  private draftChecked = false;

  constructor() {
    this.draft.open();
    // Also opens after a background re-check (back online / app resumed) that succeeds after this page's own
    // check failed, which otherwise left it on "Checking…".
    effect(() => {
      if (this.reports.canStartReport()) this.unlocked.set(true);
    });
    this.form.controls.buildingId.valueChanges.pipe(takeUntilDestroyed()).subscribe((buildingId) => {
      this.form.controls.locationId.setValue('');
      this.locations.set([]);
      if (buildingId && buildingId !== OTHER_LOCATION) void this.loadLocations(buildingId);
    });
    // Autosave the text fields on the phone (photos are saved as they are added).
    this.form.valueChanges.pipe(debounceTime(500), takeUntilDestroyed()).subscribe(() => void this.saveDraftForm());
  }

  ionViewWillEnter(): void {
    this.leavingToActiveReport = false;
    if (!this.unlocked()) void this.checkEligibility();
    if (this.referenceState() !== 'ready') void this.loadBuildings();
    if (!this.draftChecked) void this.restoreDraft();
  }

  /** Pre-flight before any camera/gallery access: also covers direct deep links to /reports/new. */
  async checkEligibility(): Promise<void> {
    await this.reports.refreshEligibility();
    if (this.reports.canStartReport()) this.unlocked.set(true);
  }

  viewActiveReport(): void {
    const active = this.activeReport();
    if (!active) return;
    this.leavingToActiveReport = true;
    void this.nav.navigateForward(['/reports', active.id]);
  }

  goBack(): void {
    void this.nav.navigateBack('/tabs/home');
  }

  ngOnDestroy(): void {
    this.photos().forEach((photo) => this.picker.release(photo));
  }

  // ---------------------------------------------------------------------------
  // Photos
  // ---------------------------------------------------------------------------

  async addPhoto(): Promise<void> {
    if (this.remainingSlots() <= 0) {
      await this.toast(`You can add up to ${this.maxImages} photos.`);
      return;
    }
    const sheet = await this.actionSheets.create({
      header: 'Add a photo',
      buttons: [
        { text: 'Take Photo', icon: 'camera-outline', data: 'camera' },
        { text: 'Choose from Gallery', icon: 'images-outline', data: 'gallery' },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data } = await sheet.onDidDismiss<'camera' | 'gallery'>();
    if (data === 'camera') await this.capture();
    if (data === 'gallery') await this.pickFromGallery();
  }

  async removePhoto(photo: SelectedPhoto): Promise<void> {
    this.picker.release(photo);
    this.photos.update((photos) => photos.filter((item) => item.id !== photo.id));
    this.photosTouched.set(true);
    void this.draft.removePhoto(photo.id);
  }

  private async capture(): Promise<void> {
    try {
      const photo = await this.picker.takePhoto();
      if (photo) this.addPhotos([photo]);
    } catch (error) {
      await this.handlePhotoError(error);
    }
  }

  private async pickFromGallery(): Promise<void> {
    try {
      const { photos, rejected } = await this.picker.chooseFromGallery(this.remainingSlots());
      if (photos.length) this.addPhotos(photos);
      if (rejected > 0) await this.toast(this.uploadRules());
    } catch (error) {
      await this.handlePhotoError(error);
    }
  }

  private addPhotos(added: SelectedPhoto[]): void {
    const accepted = added.slice(0, this.remainingSlots());
    this.photos.update((photos) => [...photos, ...accepted]);
    for (const photo of accepted) void this.draft.addPhoto(photo);
  }

  // ---------------------------------------------------------------------------
  // Draft on the phone
  // ---------------------------------------------------------------------------

  /** Brings back an unfinished report after the app was closed (only into an untouched form). */
  private async restoreDraft(): Promise<void> {
    this.draftChecked = true;
    const saved = await this.draft.load();
    if (!saved || this.form.dirty || this.photos().length) return;
    const { record, photos } = saved;
    if (!photos.length && !Object.values(record.form).some((value) => value)) return;
    this.form.patchValue(record.form);
    // Choosing the building clears and reloads its locations; restore the chosen location once they are there.
    const buildingId = record.form['buildingId'];
    if (buildingId && buildingId !== OTHER_LOCATION) {
      await this.loadLocations(buildingId);
      this.form.controls.locationId.setValue(record.form['locationId'] ?? '');
    }
    this.form.markAsDirty();
    this.gps.set(record.gps);
    this.photos.set(
      photos.slice(0, this.maxImages).map((photo) => ({
        id: photo.id,
        blob: photo.blob,
        fileName: photo.fileName,
        mimeType: photo.mimeType,
        size: photo.blob.size,
        previewUrl: URL.createObjectURL(photo.blob),
      })),
    );
    await this.toast('We restored the report you were writing.');
  }

  private saveDraftForm(): Promise<void> {
    if (this.submitted) return Promise.resolve();
    return this.draft.saveForm(this.form.getRawValue(), this.gps());
  }

  private async handlePhotoError(error: unknown): Promise<void> {
    if (error instanceof PhotoPermissionError) {
      await this.toast('Photo access is turned off. Allow camera and photo access for SEEFIX in your device settings.');
    } else if (error instanceof ImageRejectedError) {
      await this.toast(this.uploadRules());
    } else {
      await this.toast("We couldn't add that photo. Please try again.");
    }
  }

  // ---------------------------------------------------------------------------
  // Location
  // ---------------------------------------------------------------------------

  private async loadBuildings(): Promise<void> {
    this.referenceState.set('loading');
    try {
      const buildings = await this.reference.loadBuildings();
      this.buildings.set(buildings);
      this.referenceState.set(buildings.length ? 'ready' : 'unavailable');
    } catch {
      // Fall back to free-text location; never invent location IDs.
      this.referenceState.set('unavailable');
    }
  }

  private async loadLocations(buildingId: string): Promise<void> {
    this.locationsLoading.set(true);
    try {
      const items = await this.reference.loadLocations(buildingId);
      if (this.form.controls.buildingId.value === buildingId) this.locations.set(items);
    } catch {
      this.locations.set([]);
    } finally {
      this.locationsLoading.set(false);
    }
  }

  locationLabel(location: FacilityLocationDto): string {
    return locationText([location.floor, location.roomOrArea]) ?? location.code ?? 'Unnamed location';
  }

  /** Permissioned, one-off GPS fix; no background tracking. */
  async attachGps(): Promise<void> {
    if (this.locating()) return;
    this.locating.set(true);
    try {
      const permission = await Geolocation.requestPermissions({ permissions: ['location'] }).catch(() => null);
      if (permission && permission.location === 'denied') {
        await this.toast('Location access is turned off. You can still describe the location above.');
        return;
      }
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
      this.gps.set({
        lat: round6(position.coords.latitude),
        lng: round6(position.coords.longitude),
        accuracy: position.coords.accuracy ? Math.round(position.coords.accuracy) : null,
      });
      void this.saveDraftForm();
    } catch {
      await this.toast("We couldn't get your current location. You can still describe the location above.");
    } finally {
      this.locating.set(false);
    }
  }

  removeGps(): void {
    this.gps.set(null);
    void this.saveDraftForm();
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  /**
   * Saves the report and its original photos on the phone first; only after that save succeeded does it try to
   * send. Offline, slow, SEEFIX or Cloudinary unreachable: the report stays saved and is sent automatically later
   * with the same clientReportId, so a repeat never creates a second report.
   */
  async submit(): Promise<void> {
    if (this.submitting()) return; // in-flight lock
    this.form.markAllAsTouched();
    this.photosTouched.set(true);
    if (this.form.invalid || this.photos().length === 0) {
      await this.toast(this.photos().length === 0 ? 'Add at least one photo of the issue.' : 'Please complete the required fields.');
      return;
    }

    // Confirm first; the flag stops a second tap from opening another dialog.
    if (this.confirmingSubmit) return;
    this.confirmingSubmit = true;
    const photoCount = this.photos().length;
    const offline = this.connectivity.state() === 'offline';
    const confirmed = await this.confirm
      .confirm({
        header: 'Submit report?',
        message:
          `Your report with ${photoCount} photo${photoCount === 1 ? '' : 's'} will be saved on this phone and sent to ` +
          `the Maintenance Team${offline ? " when you're back online" : ''}. ` +
          'You can only have one active report at a time, and you can cancel it until the Maintenance Team reviews it.',
        confirmText: 'Submit',
      })
      .finally(() => (this.confirmingSubmit = false));
    if (!confirmed || this.submitting()) return;

    this.submitting.set(true);
    const loading = await this.loadings.create({ message: 'Saving report…', backdropDismiss: false });
    await loading.present();
    try {
      // No network call before this: the report is durable on the phone first. The one-active-report rule is
      // enforced by the server when it is sent (a conflict keeps it saved, as "blocked").
      const id = await this.saveToPhone();
      this.submitted = true;
      this.draft.reset();

      // Every saved report gets a send attempt now (slow or server-down included; offline waits for the
      // connection). Only a good connection is worth waiting for, and only for a bounded time.
      let received: CreateReportResponse | null = null;
      const sent = this.sync.sent$.subscribe((event) => {
        if (event.id === id) received = event.report;
      });
      const attempt = this.sync.syncNow(true);
      if (this.connectivity.state() === 'online') {
        loading.message = 'Sending report…';
        await Promise.race([attempt, delay(SEND_WAIT_MS)]);
      }
      sent.unsubscribe();
      await loading.dismiss();

      const report = received as CreateReportResponse | null;
      if (report) {
        await this.toast(`Report ${report.reportNo} submitted.`, 'success');
        // Replace this page so Back from the detail returns to the originating tab.
        await this.nav.navigateForward(['/reports', report.id], { replaceUrl: true });
      } else {
        await this.explainSaved(id);
      }
    } catch (error) {
      await loading.dismiss();
      this.draft.open(); // the form stays: keep autosaving it
      // Nothing was saved (the save is one transaction); the form keeps everything.
      await this.toast(
        error instanceof StorageFullError
          ? 'Not enough free space on this phone to save the report. Free up some space and try again.'
          : "We couldn't save the report on this phone. Your details are still here; please try again.",
        'danger',
      );
    } finally {
      this.submitting.set(false);
    }
  }

  /** One transaction: the report, its photos' original bytes and SHA-256 digests; the draft is deleted with it. */
  private async saveToPhone(): Promise<string> {
    const value = this.form.getRawValue();
    const useFacility = !this.manualLocation() && !!value.locationId;
    const fix = this.gps();
    const photos = await Promise.all(
      this.photos().map(async (photo) => {
        const bytes = await photo.blob.arrayBuffer();
        return { bytes, mimeType: photo.mimeType, fileName: photo.fileName, digest: await sha256Hex(bytes) };
      }),
    );
    const id = crypto.randomUUID();
    const userId = this.session.user()?.id;
    if (!userId) throw new Error('No signed-in Reporter.');
    // Stop autosaving first so a late autosave can't recreate the draft after it was deleted with this save.
    const draftKeys = await this.draft.seal();
    await this.outbox.add(
      userId,
      {
        id,
        capturedAt: new Date().toISOString(),
        fields: {
          description: value.description,
          notes: value.notes || null,
          locationId: useFacility ? value.locationId : null,
          building: useFacility ? null : this.manualBuildingName(value.building, value.buildingId),
          floor: useFacility ? null : value.floor || null,
          roomOrArea: useFacility ? null : value.roomOrArea || null,
          gpsLat: fix?.lat ?? null,
          gpsLng: fix?.lng ?? null,
        },
        photos: photos.map(({ bytes, mimeType, fileName, digest }) => ({
          fileName,
          mimeType,
          size: bytes.byteLength,
          digest,
          publicId: null,
        })),
        state: 'waiting',
        reason: this.connectivity.state() === 'offline' ? 'offline' : null,
        message: null,
        activeReport: null,
        attempts: 0,
        reuploads: 0,
        nextAttemptAt: null,
      },
      photos.map(({ bytes, mimeType }) => ({ bytes, mimeType })),
      draftKeys,
    );
    return id;
  }

  /** Saved on the phone but not received by SEEFIX yet: never claim it was submitted. */
  private async explainSaved(id: string): Promise<void> {
    const item = this.outbox.items().find((current) => current.id === id);
    const header =
      item?.state === 'blocked' || item?.state === 'attention' ? 'Saved on this device, not sent' : 'Report saved on this device';
    const message =
      item?.state === 'blocked'
        ? `${item.activeReport ? `${item.activeReport.reportNo} is still in progress. ` : 'You already have a report in progress. '}` +
          'This report stays saved on this phone.'
        : item?.state === 'attention'
          ? `${item.message ?? 'SEEFIX could not accept this report.'} It stays saved on this phone.`
          : `Waiting to send · ${item?.state === 'sending' ? 'Sending now' : waitingReason(item?.reason ?? null)}. ` +
            `Your ${photoCountText(item?.photos.length ?? 0)} and ` +
            'report details are saved on this phone. SEEFIX sends them automatically while the app is open; if you close ' +
            'the app, it sends them the next time you open it online.';
    const alert = await this.alerts.create({ header, message, buttons: ['OK'] });
    await alert.present();
    await alert.onDidDismiss();
    await this.nav.navigateRoot('/tabs/home');
  }

  /** Blocked at submit time: keep the draft and offer the active report. */
  private async explainBlocked(): Promise<void> {
    const active = this.activeReport();
    const detail = active ? `${active.reportNo} is ${statusLabel(active.status).toLowerCase()}. ` : '';
    const view = await this.confirm.confirm({
      header: 'Report already in progress',
      message: `${detail}You can submit a new report once it is resolved, closed or cancelled. Your draft is kept on this page.`,
      confirmText: active ? 'View report' : 'OK',
      cancelText: 'Stay here',
    });
    if (view && active) this.viewActiveReport();
  }

  /** When a configured building was chosen but its location isn't listed, keep the building name. */
  private manualBuildingName(text: string, buildingId: string): string | null {
    if (text.trim()) return text;
    const building = this.buildings().find((item) => item.id === buildingId);
    return building?.name ?? null;
  }

  // ---------------------------------------------------------------------------
  // Leaving
  // ---------------------------------------------------------------------------

  hasUnsentChanges(): boolean {
    return !this.submitted && (this.photos().length > 0 || this.form.dirty);
  }

  async canLeave(): Promise<boolean> {
    if (this.leavingToActiveReport || !this.hasUnsentChanges() || !this.session.isAuthenticated()) return true;
    const alert = await this.alerts.create({
      header: 'Discard this report?',
      message: "Your photos and details haven't been submitted yet.",
      buttons: [
        { text: 'Keep editing', role: 'cancel' },
        { text: 'Discard', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'destructive') return false;
    void this.draft.clear();
    return true;
  }

  formatSize(bytes: number): string {
    return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  private uploadRules(): string {
    return `Upload 1–${this.maxImages} JPEG, PNG or WebP photos (up to ${this.maxUploadMb} MB each).`;
  }

  private async toast(message: string, color?: 'success' | 'danger'): Promise<void> {
    const toast = await this.toasts.create({ message, duration: 3000, position: 'bottom', color });
    await toast.present();
  }
}

/** How long Submit waits for an immediate send on a good connection before saying "saved, sending". */
export const SEND_WAIT_MS = 15_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

const WAITING_REASONS: Record<Exclude<OutboxReason, null>, string> = {
  offline: 'No internet connection',
  slow: 'Slow connection',
  server: "SEEFIX can't be reached",
  upload: "The photo upload service can't be reached",
  busy: 'SEEFIX is busy',
  session: 'Sign in to send it',
};

export function waitingReason(reason: OutboxReason): string {
  return reason ? WAITING_REASONS[reason] : 'Not yet submitted';
}

function photoCountText(count: number): string {
  return `${count} photo${count === 1 ? '' : 's'}`;
}
