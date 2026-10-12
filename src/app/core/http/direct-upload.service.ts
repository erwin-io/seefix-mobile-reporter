import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, concatMap, from, map, switchMap, throwError, timeout, toArray } from 'rxjs';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { ApiClient } from './api-client.service';
import { mapHttpError } from './api-error.mapper';

export type UploadPurpose = 'report-image';

export interface UploadFile {
  blob: Blob;
  fileName: string;
}

interface SignedUpload {
  uploadUrl: string;
  fields: Record<string, string | number>;
}

/**
 * Uploads files straight to Cloudinary (seefix-api issue #12): seefix-api signs the upload, the file goes
 * from the device to Cloudinary, and only the returned public IDs are sent to seefix-api. Files are sent
 * as picked (no resizing or re-compression): image quality matters for the AI assessment.
 */
@Injectable({ providedIn: 'root' })
export class DirectUploadService {
  private readonly api = inject(ApiClient);
  private readonly http = inject(HttpClient);
  private readonly env = inject(APP_ENVIRONMENT);

  /** Uploads one file at a time (gentler on mobile data) and returns the public IDs in the same order. */
  upload(purpose: UploadPurpose, files: UploadFile[]): Observable<string[]> {
    return this.api.post<SignedUpload>('/api/uploads/sign', { purpose }).pipe(
      switchMap((signed) =>
        from(files).pipe(
          concatMap((file) => this.send(signed, file)),
          toArray(),
        ),
      ),
    );
  }

  private send(signed: SignedUpload, file: UploadFile): Observable<string> {
    const form = new FormData();
    for (const [key, value] of Object.entries(signed.fields)) form.append(key, String(value));
    form.append('file', file.blob, file.fileName);
    // Not a seefix-api URL, so the auth interceptor adds no token.
    return this.http.post<{ public_id: string }>(signed.uploadUrl, form).pipe(
      timeout(this.env.uploadTimeoutMs),
      map((result) => result.public_id),
      catchError((error: unknown) => throwError(() => mapHttpError(error))),
    );
  }
}
