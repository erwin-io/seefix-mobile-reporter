import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { PreloadAllModules, RouteReuseStrategy, provideRouter, withComponentInputBinding, withPreloading } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';
import { routes } from './app.routes';
import { authErrorInterceptor } from './core/http/auth-error.interceptor';
import { authInterceptor } from './core/http/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    // Platform-adaptive: iOS mode on iOS, Material Design on Android.
    // useSetInputAPI: modal componentProps are applied with setInput (works with signal inputs).
    provideIonicAngular({ useSetInputAPI: true }),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor, authErrorInterceptor])),
  ],
};
