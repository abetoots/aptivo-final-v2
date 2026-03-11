/**
 * S7-INT-02: minimal admin dashboard page
 * @task S7-INT-02
 */

export default async function AdminPage() {
  return (
    <main style={{ fontFamily: 'monospace', padding: '2rem', maxWidth: '960px' }}>
      <h1>Admin Dashboard</h1>
      <p style={{ color: '#666' }}>
        API-first dashboard. Use the API endpoints for programmatic access:
      </p>
      <ul>
        <li><code>GET /api/admin/overview</code> — pending approvals, SLO health, active workflows</li>
        <li><code>GET /api/admin/audit?page=1&amp;limit=50</code> — paginated audit logs</li>
        <li><code>GET /api/admin/hitl?status=pending</code> — HITL request listing</li>
        <li><code>GET /api/admin/llm-usage?range=30d</code> — LLM cost breakdown</li>
      </ul>
      <hr />
      <section>
        <h2>Pending Approvals</h2>
        <p>Pending HITL requests will be displayed here once data is flowing through the platform.</p>
      </section>
      <section>
        <h2>Recent Audit Events</h2>
        <p>Recent audit trail entries will be displayed here.</p>
      </section>
      <section>
        <h2>SLO Status</h2>
        <p>SLO health indicators will be displayed here.</p>
      </section>
    </main>
  );
}
