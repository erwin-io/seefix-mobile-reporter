import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../http/api-client.service';
import {
  ChangeEmailRequest,
  ChangeEmailResponse,
  ChangePasswordRequest,
  ConfirmEmailChangeRequest,
  MessageResponse,
  UpdateProfileRequest,
  UserMessageResponse,
} from '../models/account.model';
import { MeResponse } from '../models/auth.model';

/** Authenticated Reporter self-service (/api/auth/me/**). */
@Injectable({ providedIn: 'root' })
export class AccountApiService {
  private readonly api = inject(ApiClient);

  me(): Observable<MeResponse> {
    return this.api.get<MeResponse>('/api/auth/me');
  }

  /** Session is kept. */
  updateProfile(request: UpdateProfileRequest): Observable<UserMessageResponse> {
    return this.api.patch<UserMessageResponse>('/api/auth/me', request);
  }

  /** Sends an OTP to the NEW address; the current email stays active. Repeat to resend. */
  startEmailChange(request: ChangeEmailRequest): Observable<ChangeEmailResponse> {
    return this.api.post<ChangeEmailResponse>('/api/auth/me/change-email', request);
  }

  /** Revokes every existing JWT on success. */
  confirmEmailChange(request: ConfirmEmailChangeRequest): Observable<UserMessageResponse> {
    return this.api.post<UserMessageResponse>('/api/auth/me/change-email/confirm', request);
  }

  /** Revokes every existing JWT on success. */
  changePassword(request: ChangePasswordRequest): Observable<MessageResponse> {
    return this.api.post<MessageResponse>('/api/auth/me/change-password', request);
  }
}
