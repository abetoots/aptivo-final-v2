/**
 * @testcase SP-04-COMP-001 through SP-04-COMP-006
 * @requirements FR-CORE-NTF-001 through FR-CORE-NTF-004
 * @warnings T1-W24, S3-W7 (Novu transactionId dedup window)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-04
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SP_04_CONFIG,
  renderTemplate,
  DeliveryTracker,
  TransactionDedup,
  SubscriberManager,
  type NotificationTemplate,
  type NotificationChannel,
} from '../src/sp-04-novu-notifications.js';

// ---------------------------------------------------------------------------
// SP-04-COMP-001: spike configuration
// ---------------------------------------------------------------------------

describe('SP-04: Novu Notifications', () => {
  it('has correct spike configuration', () => {
    expect(SP_04_CONFIG.name).toBe('SP-04: Novu Notifications');
    expect(SP_04_CONFIG.risk).toBe('HIGH');
    expect(SP_04_CONFIG.validations).toHaveLength(6);
  });

  // -------------------------------------------------------------------------
  // SP-04-COMP-002: template rendering
  // -------------------------------------------------------------------------

  describe('template rendering', () => {
    const template: NotificationTemplate = {
      id: 'tpl-001',
      name: 'Welcome Email',
      channels: ['email'],
      content: 'Hello {{name}}, welcome to {{company}}!',
    };

    it('renders a template with all variables provided', () => {
      const result = renderTemplate(template, { name: 'Alice', company: 'Aptivo' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('Hello Alice, welcome to Aptivo!');
      }
    });

    it('returns error for missing variables', () => {
      const result = renderTemplate(template, { name: 'Alice' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Missing template variables');
        expect(result.error).toContain('company');
      }
    });

    it('returns error listing all missing variables at once', () => {
      const result = renderTemplate(template, {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('name');
        expect(result.error).toContain('company');
      }
    });

    it('renders nested-style dot-notation variables', () => {
      const nestedTemplate: NotificationTemplate = {
        id: 'tpl-002',
        name: 'Approval Request',
        channels: ['email', 'in-app'],
        content: 'Workflow {{workflow.name}} requires approval by {{approver.name}}.',
      };

      const result = renderTemplate(nestedTemplate, {
        'workflow.name': 'Onboarding',
        'approver.name': 'Bob',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('Workflow Onboarding requires approval by Bob.');
      }
    });

    it('handles templates with no placeholders', () => {
      const plainTemplate: NotificationTemplate = {
        id: 'tpl-003',
        name: 'Static Notice',
        channels: ['in-app'],
        content: 'System maintenance scheduled for tonight.',
      };

      const result = renderTemplate(plainTemplate, {});
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('System maintenance scheduled for tonight.');
      }
    });

    it('handles duplicate placeholders in the same template', () => {
      const repeatTemplate: NotificationTemplate = {
        id: 'tpl-004',
        name: 'Repeat Greeting',
        channels: ['email'],
        content: 'Hi {{name}}, your name is {{name}}.',
      };

      const result = renderTemplate(repeatTemplate, { name: 'Carol' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('Hi Carol, your name is Carol.');
      }
    });
  });

  // -------------------------------------------------------------------------
  // SP-04-COMP-003: multi-channel delivery tracking
  // -------------------------------------------------------------------------

  describe('multi-channel delivery tracking', () => {
    let tracker: DeliveryTracker;

    beforeEach(() => {
      tracker = new DeliveryTracker();
    });

    it('sends an email notification and returns a delivery ID', () => {
      const deliveryId = tracker.send('sub-001', 'tpl-001', 'email', { subject: 'Welcome' });
      expect(deliveryId).toMatch(/^dlv-\d{6}$/);
    });

    it('sends an in-app notification and tracks it separately', () => {
      const id1 = tracker.send('sub-001', 'tpl-001', 'email', {});
      const id2 = tracker.send('sub-001', 'tpl-001', 'in-app', {});
      expect(id1).not.toBe(id2);

      // both start as pending
      const s1 = tracker.getStatus(id1);
      const s2 = tracker.getStatus(id2);
      expect(s1.ok && s1.value).toBe('pending');
      expect(s2.ok && s2.value).toBe('pending');
    });

    it('sends a chat channel notification', () => {
      const deliveryId = tracker.send('sub-002', 'tpl-002', 'chat', { text: 'Hello Telegram' });
      const status = tracker.getStatus(deliveryId);
      expect(status.ok).toBe(true);
      if (status.ok) {
        expect(status.value).toBe('pending');
      }
    });

    it('returns error for unknown delivery ID', () => {
      const result = tracker.getStatus('dlv-nonexistent');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Delivery not found');
      }
    });
  });

  // -------------------------------------------------------------------------
  // SP-04-COMP-004: delivery status lifecycle
  // -------------------------------------------------------------------------

  describe('delivery status lifecycle', () => {
    let tracker: DeliveryTracker;
    let deliveryId: string;

    beforeEach(() => {
      tracker = new DeliveryTracker();
      deliveryId = tracker.send('sub-001', 'tpl-001', 'email', { body: 'test' });
    });

    it('starts in pending status', () => {
      const status = tracker.getStatus(deliveryId);
      expect(status.ok).toBe(true);
      if (status.ok) {
        expect(status.value).toBe('pending');
      }
    });

    it('transitions from pending to sent', () => {
      const markResult = tracker.markSent(deliveryId);
      expect(markResult.ok).toBe(true);

      const status = tracker.getStatus(deliveryId);
      expect(status.ok).toBe(true);
      if (status.ok) {
        expect(status.value).toBe('sent');
      }
    });

    it('transitions from pending to delivered via simulateDelivery', () => {
      tracker.simulateDelivery(deliveryId);
      const status = tracker.getStatus(deliveryId);
      expect(status.ok).toBe(true);
      if (status.ok) {
        expect(status.value).toBe('delivered');
      }
    });

    it('transitions from pending to failed with reason', () => {
      const reason = 'SMTP connection refused';
      tracker.simulateFailure(deliveryId, reason);

      const status = tracker.getStatus(deliveryId);
      expect(status.ok).toBe(true);
      if (status.ok) {
        expect(status.value).toBe('failed');
      }

      // verify failure reason is recorded
      const record = tracker.getRecord(deliveryId);
      expect(record.ok).toBe(true);
      if (record.ok) {
        expect(record.value.failureReason).toBe(reason);
      }
    });

    it('returns error when simulating delivery for unknown ID', () => {
      const result = tracker.simulateDelivery('dlv-missing');
      expect(result.ok).toBe(false);
    });

    it('returns error when simulating failure for unknown ID', () => {
      const result = tracker.simulateFailure('dlv-missing', 'reason');
      expect(result.ok).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // SP-04-COMP-005: transaction deduplication (T1-W24 / S3-W7)
  //
  // KEY FINDING: Novu uses transactionId for dedup. The dedup window
  // determines how long a transactionId is considered a duplicate.
  // Within the window, duplicates are blocked. Outside the window,
  // the same transactionId is allowed again.
  // -------------------------------------------------------------------------

  describe('transaction deduplication (T1-W24 / S3-W7)', () => {
    it('does not flag unknown transactionId as duplicate', () => {
      const dedup = new TransactionDedup(5000);
      expect(dedup.isDuplicate('txn-001')).toBe(false);
    });

    it('flags same transactionId as duplicate within window', () => {
      const dedup = new TransactionDedup(5000);
      dedup.record('txn-001');
      expect(dedup.isDuplicate('txn-001')).toBe(true);
    });

    it('allows same transactionId after window expires', () => {
      const dedup = new TransactionDedup(1000); // 1 second window
      // record with a timestamp 2 seconds in the past
      const twoSecondsAgo = Date.now() - 2000;
      dedup.recordAt('txn-001', twoSecondsAgo);
      expect(dedup.isDuplicate('txn-001')).toBe(false);
    });

    it('tracks multiple transactionIds independently', () => {
      const dedup = new TransactionDedup(5000);
      dedup.record('txn-001');
      dedup.record('txn-002');
      expect(dedup.isDuplicate('txn-001')).toBe(true);
      expect(dedup.isDuplicate('txn-002')).toBe(true);
      expect(dedup.isDuplicate('txn-003')).toBe(false);
    });

    it('exposes window size for validation', () => {
      const dedup = new TransactionDedup(30_000);
      expect(dedup.getWindowMs()).toBe(30_000);
    });

    it('validates edge case: message sent exactly at window boundary', () => {
      const windowMs = 1000;
      const dedup = new TransactionDedup(windowMs);
      // record exactly at the window boundary (1000ms ago for a 1000ms window)
      const exactlyAtBoundary = Date.now() - windowMs;
      dedup.recordAt('txn-boundary', exactlyAtBoundary);
      // elapsed === windowMs, condition is elapsed < windowMs, so not a duplicate
      expect(dedup.isDuplicate('txn-boundary')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // SP-04-COMP-006: subscriber management
  // -------------------------------------------------------------------------

  describe('subscriber management', () => {
    let manager: SubscriberManager;

    beforeEach(() => {
      manager = new SubscriberManager();
    });

    it('registers a subscriber with channel preferences', () => {
      manager.register('sub-001', ['email', 'in-app']);
      expect(manager.isRegistered('sub-001')).toBe(true);
    });

    it('returns channel preferences for a registered subscriber', () => {
      manager.register('sub-001', ['email', 'in-app', 'chat']);
      const result = manager.getPreferences('sub-001');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(expect.arrayContaining(['email', 'in-app', 'chat']));
        expect(result.value).toHaveLength(3);
      }
    });

    it('returns error for unregistered subscriber preferences', () => {
      const result = manager.getPreferences('sub-unknown');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Subscriber not found');
      }
    });

    it('unsubscribes a subscriber from a specific channel', () => {
      manager.register('sub-001', ['email', 'in-app', 'sms']);
      const unsubResult = manager.unsubscribe('sub-001', 'sms');
      expect(unsubResult.ok).toBe(true);

      const prefs = manager.getPreferences('sub-001');
      expect(prefs.ok).toBe(true);
      if (prefs.ok) {
        expect(prefs.value).toEqual(expect.arrayContaining(['email', 'in-app']));
        expect(prefs.value).not.toContain('sms');
      }
    });

    it('returns error when unsubscribing an unregistered subscriber', () => {
      const result = manager.unsubscribe('sub-unknown', 'email');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Subscriber not found');
      }
    });

    it('handles unsubscribing from all channels gracefully', () => {
      manager.register('sub-001', ['email']);
      manager.unsubscribe('sub-001', 'email');
      const prefs = manager.getPreferences('sub-001');
      expect(prefs.ok).toBe(true);
      if (prefs.ok) {
        expect(prefs.value).toHaveLength(0);
      }
    });
  });
});
