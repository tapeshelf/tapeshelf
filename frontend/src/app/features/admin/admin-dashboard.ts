import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api, type DashboardDto, adminDashboard } from '../../api';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { TABLE, TABLE_WRAP, TD, TH, apiMessage } from './admin-ui';

/** Dashboard: people, videos, storage, open work and the queues at a glance. */
@Component({
  selector: 'app-admin-dashboard',
  imports: [TranslocoPipe, RouterLink, BytesPipe, AlertComponent, SpinnerComponent],
  template: `
    @if (error(); as message) {
      <app-alert kind="error">{{ message }}</app-alert>
    } @else if (d(); as d) {
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" data-testid="admin-dashboard">
        <a routerLink="../users" [class]="card">
          <span class="label-mono text-muted">{{ 'admin.dash.users' | transloco }}</span>
          <span class="font-display text-3xl font-semibold">{{ d.usersTotal }}</span>
          <span class="text-xs text-muted">{{
            'admin.dash.usersMore'
              | transloco
                : {
                    active: d.usersActive,
                    fresh: d.usersNew,
                    banned: d.usersBanned,
                    deleted: d.usersDeleted,
                  }
          }}</span>
        </a>
        <a routerLink="../videos" [class]="card">
          <span class="label-mono text-muted">{{ 'admin.dash.videos' | transloco }}</span>
          <span class="font-display text-3xl font-semibold">{{ d.videosTotal }}</span>
          <span class="text-xs text-muted">{{
            'admin.dash.videosMore'
              | transloco
                : { ready: d.videosReady, processing: d.videosProcessing, failed: d.videosFailed }
          }}</span>
        </a>
        <a routerLink="../trash" [class]="card">
          <span class="label-mono text-muted">{{ 'admin.dash.storage' | transloco }}</span>
          <span class="font-display text-3xl font-semibold">{{ d.originalsBytes | bytes }}</span>
          <span class="text-xs text-muted">{{
            'admin.dash.storageMore'
              | transloco: { count: d.trashCount, size: (d.trashBytes | bytes) }
          }}</span>
        </a>
        <a
          routerLink="../reports"
          [class]="card"
          [class.!bg-accent]="d.openReports > 0"
          data-testid="dash-reports"
        >
          <span class="label-mono" [class.text-muted]="d.openReports === 0">{{
            'admin.dash.reports' | transloco
          }}</span>
          <span class="font-display text-3xl font-semibold">{{ d.openReports }}</span>
          <span class="text-xs" [class.text-muted]="d.openReports === 0">{{
            'admin.dash.reportsMore' | transloco: { requests: d.openRequests }
          }}</span>
        </a>
        <!-- Support: tickets waiting for an answer, the admin's move like a report. -->
        <a
          routerLink="../support"
          [class]="card"
          class="sm:col-span-2 xl:col-span-1"
          [class.!bg-accent]="d.openSupport > 0"
          data-testid="dash-support"
        >
          <span class="label-mono" [class.text-muted]="d.openSupport === 0">{{
            'admin.dash.support' | transloco
          }}</span>
          <span class="font-display text-3xl font-semibold">{{ d.openSupport }}</span>
          <span class="text-xs" [class.text-muted]="d.openSupport === 0">{{
            'admin.dash.supportMore' | transloco
          }}</span>
        </a>
        <!-- The browser extension's funnel, counted on the server alone. -->
        <div [class]="panel" class="sm:col-span-2 xl:col-span-5" data-testid="dash-extension">
          <span class="label-mono text-muted">{{ 'admin.dash.extension' | transloco }}</span>
          <span class="font-display text-3xl font-semibold">{{ d.extension.connections }}</span>
          <span class="text-xs text-muted">{{
            'admin.dash.extensionMore'
              | transloco
                : {
                    signups: d.extension.signups,
                    saves: d.extension.shelfSaves,
                    connected: d.extension.connected,
                  }
          }}</span>
        </div>
      </div>

      <h2 class="mt-8 mb-3 text-lg font-semibold">{{ 'admin.dash.queues' | transloco }}</h2>
      <div [class]="tableWrap">
        <table [class]="table">
          <thead>
            <tr>
              <th [class]="th">{{ 'admin.dash.queue' | transloco }}</th>
              <th [class]="th">{{ 'admin.dash.waiting' | transloco }}</th>
              <th [class]="th">{{ 'admin.dash.active' | transloco }}</th>
              <th [class]="th">{{ 'admin.dash.delayed' | transloco }}</th>
              <th [class]="th">{{ 'admin.dash.failed' | transloco }}</th>
            </tr>
          </thead>
          <tbody>
            @for (q of d.queues; track q.name) {
              <tr>
                <td [class]="td" class="font-mono">{{ q.name }}</td>
                <td [class]="td">{{ q.waiting }}</td>
                <td [class]="td">{{ q.active }}</td>
                <td [class]="td">{{ q.delayed }}</td>
                <td [class]="td" [class.text-danger]="q.failed > 0">{{ q.failed }}</td>
              </tr>
            }
            <tr>
              <td [class]="td">{{ 'admin.dash.outboxEvents' | transloco }}</td>
              <td [class]="td" colspan="4">
                {{ 'admin.dash.outbox' | transloco: { count: d.outboxPending } }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    } @else {
      <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
    }
  `,
})
export class AdminDashboardPage {
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);
  protected readonly d = signal<DashboardDto | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly card =
    'flex flex-col gap-1 rounded-lg border-2 border-line bg-surface p-4 shadow-hard-sm transition-transform lift-hitbox hover:-translate-y-0.5';
  /** A card that is not a link: no lift on hover. */
  protected readonly panel =
    'flex flex-col gap-1 rounded-lg border-2 border-line bg-surface p-4 shadow-hard-sm';
  protected readonly tableWrap = TABLE_WRAP;
  protected readonly table = TABLE;
  protected readonly th = TH;
  protected readonly td = TD;

  constructor() {
    this.api
      .invoke(adminDashboard)
      .then((d) => this.d.set(d))
      .catch((e: unknown) => this.error.set(apiMessage(e, this.t)));
  }
}
