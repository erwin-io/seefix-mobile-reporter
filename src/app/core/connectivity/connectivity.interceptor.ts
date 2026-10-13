import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { isOwnApiRequest } from '../http/auth.interceptor';
import { ConnectivityService } from './connectivity.service';

/** Reports each seefix-api outcome and duration to ConnectivityService. Never changes the request or response. */
export const connectivityInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isOwnApiRequest(req.url, inject(APP_ENVIRONMENT).apiBaseUrl)) return next(req);
  const connectivity = inject(ConnectivityService);
  const started = Date.now();
  return next(req).pipe(
    tap({
      next: (event) => {
        if (event instanceof HttpResponse) connectivity.apiSucceeded(Date.now() - started);
      },
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse) connectivity.apiFailed(error.status, Date.now() - started);
      },
    }),
  );
};
