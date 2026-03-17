/**
 * NOTIF2-03: Priority routing + quiet hours
 * @task NOTIF2-03
 *
 * routes notifications based on priority level and quiet hours configuration.
 * critical/high priorities bypass quiet hours by default.
 */

import { Result } from '@aptivo/types';

export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low';

export interface QuietHoursConfig {
  startHour: number; // 0-23, default 22
  endHour: number;   // 0-23, default 7
  timezone: string;  // IANA timezone, default 'UTC'
}

export interface PriorityRoutingConfig {
  defaultPriority: NotificationPriority;
  quietHours: QuietHoursConfig;
  // critical always sends, high sends to admins even during quiet hours
  bypassQuietHours: NotificationPriority[];
}

export const DEFAULT_PRIORITY_CONFIG: PriorityRoutingConfig = {
  defaultPriority: 'normal',
  quietHours: { startHour: 22, endHour: 7, timezone: 'UTC' },
  bypassQuietHours: ['critical', 'high'],
};

export interface RoutingDecision {
  shouldSend: boolean;
  reason: string;
  priority: NotificationPriority;
  delayed: boolean;
}

export function createPriorityRouter(config?: Partial<PriorityRoutingConfig>) {
  const cfg: PriorityRoutingConfig = {
    ...DEFAULT_PRIORITY_CONFIG,
    ...config,
    quietHours: {
      ...DEFAULT_PRIORITY_CONFIG.quietHours,
      ...config?.quietHours,
    },
  };

  function isQuietHours(now: Date): boolean {
    // simple UTC-based check (timezone-aware would need Intl.DateTimeFormat)
    const hour = now.getUTCHours();
    if (cfg.quietHours.startHour > cfg.quietHours.endHour) {
      // wraps midnight: e.g., 22-7
      return hour >= cfg.quietHours.startHour || hour < cfg.quietHours.endHour;
    }
    return hour >= cfg.quietHours.startHour && hour < cfg.quietHours.endHour;
  }

  return {
    route(priority: NotificationPriority, now?: Date): RoutingDecision {
      const currentTime = now ?? new Date();
      const inQuietHours = isQuietHours(currentTime);

      if (!inQuietHours) {
        return { shouldSend: true, reason: 'outside quiet hours', priority, delayed: false };
      }

      // during quiet hours — check bypass
      if (cfg.bypassQuietHours.includes(priority)) {
        return { shouldSend: true, reason: `${priority} bypasses quiet hours`, priority, delayed: false };
      }

      // normal/low during quiet hours — delay
      return { shouldSend: false, reason: 'quiet hours active', priority, delayed: true };
    },

    isQuietHours,
  };
}
