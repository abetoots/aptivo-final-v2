/**
 * HITL-09: Approval UI Page
 * @task HITL-09
 * @frd FR-CORE-HITL-004
 *
 * Server Component page for approvers to review and act on HITL requests.
 * Token-based access (from email link) or session-based (logged-in user).
 *
 * URL: /hitl/:requestId?action=approve&token=...
 */

import { loadRequest, submitApproval, submitRejection } from './actions.js';
import { StatusBadge, ExpiryCountdown, ApprovalForm } from './components.js';

// ---------------------------------------------------------------------------
// page props
// ---------------------------------------------------------------------------

interface HitlPageProps {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<{ token?: string; action?: string }>;
}

// ---------------------------------------------------------------------------
// page component
// ---------------------------------------------------------------------------

export default async function HitlApprovalPage({ params, searchParams }: HitlPageProps) {
  const { requestId } = await params;
  const { token, action } = await searchParams;

  const request = await loadRequest(requestId);

  // request not found
  if (!request) {
    return (
      <main style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>Request Not Found</h1>
          <p style={textStyle}>
            The approval request <code>{requestId}</code> could not be found.
          </p>
        </div>
      </main>
    );
  }

  // terminal states: already decided or expired
  if (request.status !== 'pending') {
    return (
      <main style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h1 style={titleStyle}>{request.actionType}</h1>
            <StatusBadge status={request.status} />
          </div>
          <p style={textStyle}>{request.summary}</p>
          <p style={{ ...textStyle, color: '#6b7280', fontSize: '14px' }}>
            {request.status === 'approved' && 'This request has already been approved.'}
            {request.status === 'rejected' && 'This request has been rejected.'}
            {request.status === 'expired' && 'This request has expired. No further action is possible.'}
            {request.status === 'canceled' && 'This request has been canceled.'}
          </p>
        </div>
      </main>
    );
  }

  // check if expired by time (pending but token expired)
  const isExpired = request.tokenExpiresAt < new Date();
  if (isExpired) {
    return (
      <main style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h1 style={titleStyle}>{request.actionType}</h1>
            <StatusBadge status="expired" />
          </div>
          <p style={textStyle}>{request.summary}</p>
          <p style={{ ...textStyle, color: '#6b7280', fontSize: '14px' }}>
            The approval window has closed. This request can no longer be acted upon.
          </p>
        </div>
      </main>
    );
  }

  // active pending request — show approval form
  return (
    <main style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h1 style={titleStyle}>{request.actionType}</h1>
          <StatusBadge status={request.status} />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <p style={textStyle}>{request.summary}</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' }}>
            <div>
              <span style={labelStyle}>Domain</span>
              <span style={valueStyle}>{request.domain}</span>
            </div>
            <div>
              <span style={labelStyle}>Expires in</span>
              <ExpiryCountdown expiresAt={request.tokenExpiresAt} />
            </div>
            <div>
              <span style={labelStyle}>Created</span>
              <span style={valueStyle}>{request.createdAt.toLocaleString()}</span>
            </div>
            <div>
              <span style={labelStyle}>Request ID</span>
              <span style={{ ...valueStyle, fontSize: '12px', fontFamily: 'monospace' }}>{request.id}</span>
            </div>
          </div>

          {request.details && Object.keys(request.details).length > 0 && (
            <details style={{ marginTop: '16px' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 500, color: '#4b5563' }}>
                Additional Details
              </summary>
              <pre style={{
                marginTop: '8px',
                padding: '12px',
                backgroundColor: '#f9fafb',
                borderRadius: '6px',
                fontSize: '13px',
                overflow: 'auto',
              }}>
                {JSON.stringify(request.details, null, 2)}
              </pre>
            </details>
          )}
        </div>

        {token ? (
          <ApprovalForm
            requestId={requestId}
            token={token}
            expiresAt={request.tokenExpiresAt}
            onApprove={submitApproval}
            onReject={submitRejection}
          />
        ) : (
          <p style={{ ...textStyle, color: '#6b7280' }}>
            No token provided. Please use the link from your notification email.
          </p>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// styles (inline — no tailwind dependency for server component)
// ---------------------------------------------------------------------------

const containerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  minHeight: '100vh',
  padding: '48px 16px',
  backgroundColor: '#f3f4f6',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const cardStyle: React.CSSProperties = {
  maxWidth: '600px',
  width: '100%',
  backgroundColor: 'white',
  borderRadius: '12px',
  padding: '32px',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
};

const titleStyle: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 700,
  color: '#111827',
  margin: 0,
};

const textStyle: React.CSSProperties = {
  fontSize: '16px',
  color: '#374151',
  lineHeight: 1.6,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '4px',
};

const valueStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '14px',
  color: '#111827',
};
