/**
 * HITL-09: Approval UI — Client Components
 * @task HITL-09
 * @frd FR-CORE-HITL-004
 *
 * Client components for the approval UI page:
 * - ApprovalForm: approve/reject buttons with optional comment
 * - ExpiryCountdown: live countdown to token expiry
 * - StatusBadge: visual indicator for request status
 */

'use client';

import { useState, useEffect } from 'react';
import type { ApprovalActionResult } from './actions.js';

// ---------------------------------------------------------------------------
// status badge
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  pending: 'background-color: #fbbf24; color: #78350f',
  approved: 'background-color: #34d399; color: #064e3b',
  rejected: 'background-color: #f87171; color: #7f1d1d',
  expired: 'background-color: #9ca3af; color: #1f2937',
  canceled: 'background-color: #9ca3af; color: #1f2937',
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_COLORS[status] ?? STATUS_COLORS.pending!;
  return (
    <span
      style={{ ...parseStyle(style!), padding: '4px 12px', borderRadius: '9999px', fontSize: '14px', fontWeight: 600 }}
    >
      {status.toUpperCase()}
    </span>
  );
}

function parseStyle(styleStr: string): React.CSSProperties {
  const result: Record<string, string> = {};
  for (const pair of styleStr.split(';')) {
    const [key, value] = pair.split(':').map((s) => s.trim());
    if (key && value) {
      // convert css property to camelCase
      const camelKey = key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      result[camelKey] = value;
    }
  }
  return result as React.CSSProperties;
}

// ---------------------------------------------------------------------------
// expiry countdown
// ---------------------------------------------------------------------------

export function ExpiryCountdown({
  expiresAt,
  onExpired,
}: {
  expiresAt: Date;
  onExpired?: () => void;
}) {
  const [remaining, setRemaining] = useState(() => calcRemaining(expiresAt));

  useEffect(() => {
    const interval = setInterval(() => {
      const r = calcRemaining(expiresAt);
      setRemaining(r);
      if (r <= 0) {
        onExpired?.();
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpired]);

  if (remaining <= 0) {
    return <span style={{ color: '#ef4444' }}>Expired</span>;
  }

  return <span>{formatDuration(remaining)}</span>;
}

function calcRemaining(expiresAt: Date): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ---------------------------------------------------------------------------
// approval form
// ---------------------------------------------------------------------------

interface ApprovalFormProps {
  requestId: string;
  token: string;
  expiresAt: Date;
  onApprove: (requestId: string, token: string, comment: string) => Promise<ApprovalActionResult>;
  onReject: (requestId: string, token: string, comment: string) => Promise<ApprovalActionResult>;
}

export function ApprovalForm({ requestId, token, expiresAt, onApprove, onReject }: ApprovalFormProps) {
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ApprovalActionResult | null>(null);
  const [expired, setExpired] = useState(() => expiresAt < new Date());

  async function handleAction(action: 'approve' | 'reject') {
    setSubmitting(true);
    try {
      const handler = action === 'approve' ? onApprove : onReject;
      const res = await handler(requestId, token, comment);
      setResult(res);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div
        style={{
          padding: '16px',
          borderRadius: '8px',
          backgroundColor: result.success ? '#d1fae5' : '#fee2e2',
          color: result.success ? '#065f46' : '#991b1b',
        }}
      >
        <p style={{ fontWeight: 600 }}>{result.message}</p>
      </div>
    );
  }

  if (expired) {
    return (
      <div
        style={{
          padding: '16px',
          borderRadius: '8px',
          backgroundColor: '#fef3c7',
          color: '#92400e',
        }}
      >
        <p style={{ fontWeight: 600 }}>This approval window has expired. No further action is possible.</p>
      </div>
    );
  }

  const disabled = submitting || expired;

  return (
    <div>
      <ExpiryCountdown expiresAt={expiresAt} onExpired={() => setExpired(true)} />
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional comment..."
        rows={3}
        style={{
          width: '100%',
          padding: '8px 12px',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          marginBottom: '12px',
          fontSize: '14px',
        }}
      />
      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={() => handleAction('approve')}
          disabled={disabled}
          style={{
            padding: '10px 24px',
            backgroundColor: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
          }}
        >
          {submitting ? 'Submitting...' : 'Approve'}
        </button>
        <button
          onClick={() => handleAction('reject')}
          disabled={disabled}
          style={{
            padding: '10px 24px',
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
          }}
        >
          {submitting ? 'Submitting...' : 'Reject'}
        </button>
      </div>
    </div>
  );
}
