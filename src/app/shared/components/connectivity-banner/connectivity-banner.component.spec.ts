import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConnectivityService, ConnectivityState } from '../../../core/connectivity/connectivity.service';
import { ConnectivityBannerComponent } from './connectivity-banner.component';

describe('ConnectivityBannerComponent', () => {
  const state = signal<ConnectivityState>('online');

  function render(): HTMLElement {
    TestBed.configureTestingModule({ providers: [{ provide: ConnectivityService, useValue: { state } }] });
    const fixture = TestBed.createComponent(ConnectivityBannerComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows nothing while the connection is fine', () => {
    state.set('online');
    expect(render().textContent?.trim()).toBe('');
  });

  it.each<[ConnectivityState, string]>([
    ['offline', "You're offline"],
    ['slow', 'Slow connection'],
    ['server-down', "SEEFIX can't be reached"],
  ])('announces %s as a status message', (value, text) => {
    state.set(value);
    const el = render();
    expect(el.textContent).toContain(text);
    expect(el.querySelector('[role="status"]')).not.toBeNull();
  });
});
