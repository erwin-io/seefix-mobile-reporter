import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
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
import { firstValueFrom } from 'rxjs';
import { SessionStore } from '../../../core/auth/session.store';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { AppError, ERROR_COPY, mapHttpError } from '../../../core/http/api-error.mapper';
import { AppResumeService } from '../../../core/lifecycle/app-resume.service';
import { BuildingDto, FacilityLocationDto } from '../../../core/models/reference.model';
import { ActiveReportDto } from '../../../core/models/report.model';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { locationText, statusLabel } from '../../../shared/formatters/report-status-label';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { NotificationsStore } from '../../notifications/notifications.store';
import { ReferenceStore } from '../../reference/reference.store';
import { ReportsApiService } from '../reports.api.service';
import { ReportsStore } from '../reports.store';
import { HasPendingChanges } from './pending-changes.guard';
import { ImageRejectedError, PhotoPermissionError, PhotoPickerService, SelectedPhoto } from './photo-picker.service';

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
  ],
})
export class NewReportPage implements ViewWillEnter, OnDestroy, HasPendingChanges {
  private readonly env = inject(APP_ENVIRONMENT);
  private readonly picker = inject(PhotoPickerService);
  private readonly reference = inject(ReferenceStore);
  private readonly api = inject(ReportsApiService);
  private readonly reports = inject(ReportsStore);
  private readonly notifications = inject(NotificationsStore);
  private readonly session = inject(SessionStore);
  private readonly online = inject(AppResumeService).isOnline;
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
  /**
   * The form opens only after the server confirmed a report may be submitted.
   * Once open it stays open (keeping the draft); the rule is re-checked right before upload.
   */
  readonly unlocked = signal(false);
  readonly statusLabel = statusLabel;

  private submitted = false;
  /** Lets "View active report" leave without the discard prompt; the draft stays in the page stack. */
  private leavingToActiveReport = false;
  private confirmingSubmit = false;

  constructor() {
    this.form.controls.buildingId.valueChanges.pipe(takeUntilDestroyed()).subscribe((buildingId) => {
      this.form.controls.locationId.setValue('');
      this.locations.set([]);
      if (buildingId && buildingId !== OTHER_LOCATION) void this.loadLocations(buildingId);
    });
  }

  ionViewWillEnter(): void {
    this.leavingToActiveReport = false;
    if (!this.unlocked()) void this.checkEligibility();
    if (this.referenceState() !== 'ready') void this.loadBuildings();
  }

  /** Pre-flight before any camera/gallery access: also covers direct deep links to /reports/new. */
  async checkEligibility(): Promise<void> {
    if ((await this.reports.refreshEligibility()) === true) this.unlocked.set(true);
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
  }

  private async capture(): Promise<void> {
    try {
      const photo = await this.picker.takePhoto();
      if (photo) this.photos.update((photos) => [...photos, photo].slice(0, this.maxImages));
    } catch (error) {
      await this.handlePhotoError(error);
    }
  }

  private async pickFromGallery(): Promise<void> {
    try {
      const { photos, rejected } = await this.picker.chooseFromGallery(this.remainingSlots());
      if (photos.length) this.photos.update((current) => [...current, ...photos].slice(0, this.maxImages));
      if (rejected > 0) await this.toast(this.uploadRules());
    } catch (error) {
      await this.handlePhotoError(error);
    }
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
    } catch {
      await this.toast("We couldn't get your current location. You can still describe the location above.");
    } finally {
      this.locating.set(false);
    }
  }

  removeGps(): void {
    this.gps.set(null);
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async submit(): Promise<void> {
    if (this.submitting()) return; // in-flight lock: never send a second upload
    this.form.markAllAsTouched();
    this.photosTouched.set(true);
    if (this.form.invalid || this.photos().length === 0) {
      await this.toast(this.photos().length === 0 ? 'Add at least one photo of the issue.' : 'Please complete the required fields.');
      return;
    }
    if (!this.online()) {
      await this.toast(ERROR_COPY.offline);
      return;
    }

    // Confirm before uploading; the flag stops a second tap from opening another dialog.
    if (this.confirmingSubmit) return;
    this.confirmingSubmit = true;
    const photoCount = this.photos().length;
    const confirmed = await this.confirm
      .confirm({
        header: 'Submit report?',
        message:
          `Your report with ${photoCount} photo${photoCount === 1 ? '' : 's'} will be sent to the Maintenance Team. ` +
          'You can only have one active report at a time, and you can cancel it until the Maintenance Team reviews it.',
        confirmText: 'Submit',
      })
      .finally(() => (this.confirmingSubmit = false));
    if (!confirmed || this.submitting()) return;

    this.submitting.set(true);
    const loading = await this.loadings.create({ message: 'Submitting report…', backdropDismiss: false });
    await loading.present();

    // Re-check the one-active-report rule just before upload (the server still has the final say).
    const canSubmit = await this.reports.refreshEligibility();
    if (canSubmit !== true) {
      await loading.dismiss();
      this.submitting.set(false);
      if (canSubmit === false) await this.explainBlocked();
      else await this.toast("We couldn't confirm whether you can submit right now. Check your connection and try again.");
      return;
    }
    const submitStartedAt = Date.now();

    try {
      const value = this.form.getRawValue();
      const useFacility = !this.manualLocation() && !!value.locationId;
      const fix = this.gps();
      const created = await firstValueFrom(
        this.api.create({
          images: this.photos().map((photo) => ({ blob: photo.blob, fileName: photo.fileName })),
          description: value.description,
          notes: value.notes,
          locationId: useFacility ? value.locationId : null,
          building: useFacility ? null : this.manualBuildingName(value.building, value.buildingId),
          floor: useFacility ? null : value.floor,
          roomOrArea: useFacility ? null : value.roomOrArea,
          gpsLat: fix?.lat ?? null,
          gpsLng: fix?.lng ?? null,
        }),
      );

      this.submitted = true;
      this.reports.markBlocked({
        id: created.id,
        reportNo: created.reportNo,
        status: created.status,
        agentStatus: created.agentStatus,
        createdAt: created.createdAt,
      });
      this.reports.invalidate();
      void this.notifications.refresh();
      await loading.dismiss();
      await this.toast(`Report ${created.reportNo} submitted.`, 'success');
      // Replace this page so Back from the detail returns to the originating tab.
      await this.nav.navigateForward(['/reports', created.id], { replaceUrl: true });
    } catch (error) {
      await loading.dismiss();
      await this.handleSubmitError(mapHttpError(error), submitStartedAt);
    } finally {
      this.submitting.set(false);
    }
  }

  private async handleSubmitError(error: AppError, submitStartedAt: number): Promise<void> {
    if (error.code === 'ACTIVE_REPORT_EXISTS') {
      // Another report won (or a race hit the DB unique index, which carries no details).
      const active = toActiveReport(error.details?.['activeReport']);
      if (active) this.reports.markBlocked(active);
      else await this.reports.refreshEligibility();
      await this.explainBlocked();
      return;
    }
    if (error.isUncertain) {
      // The server may already have created the report: never retry blindly. Check first.
      const canSubmit = await this.reports.refreshEligibility();
      const active = this.activeReport();
      const createdNow = active?.createdAt ? Date.parse(active.createdAt) >= submitStartedAt - 60_000 : false;
      if (canSubmit === false && active && createdNow) {
        this.submitted = true;
        this.reports.invalidate();
        const view = await this.confirm.confirm({
          header: 'Your report may have been submitted',
          message: `${active.reportNo} was created just now. Open it to check before trying again.`,
          confirmText: 'View report',
          cancelText: 'Stay here',
        });
        if (view) await this.nav.navigateForward(['/reports', active.id], { replaceUrl: true });
        return;
      }
      const alert = await this.alerts.create({
        header: 'Submission not confirmed',
        message: ERROR_COPY.uploadUncertain,
        buttons: [
          { text: 'Stay here', role: 'cancel' },
          {
            text: 'Check My Reports',
            handler: () => {
              this.submitted = true;
              this.reports.invalidate();
              void this.nav.navigateRoot('/tabs/reports');
            },
          },
        ],
      });
      await alert.present();
      return;
    }
    if (error.kind === 'UNAUTHORIZED') return; // handled globally
    await this.toast(error.userMessage, 'danger');
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
    return role === 'destructive';
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

/** Validates `error.details.activeReport` from a 409 before trusting it. */
export function toActiveReport(value: unknown): ActiveReportDto | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ActiveReportDto>;
  return typeof candidate.id === 'string' && typeof candidate.reportNo === 'string' && typeof candidate.status === 'string'
    ? {
        id: candidate.id,
        reportNo: candidate.reportNo,
        status: candidate.status,
        agentStatus: candidate.agentStatus ?? null,
        createdAt: candidate.createdAt,
      }
    : null;
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
