/**
 * S7-INT-03: minimal LLM usage dashboard page
 * @task S7-INT-03
 */

export default async function LlmUsagePage() {
  return (
    <main style={{ fontFamily: 'monospace', padding: '2rem', maxWidth: '960px' }}>
      <h1>LLM Usage Dashboard</h1>
      <p style={{ color: '#666' }}>
        API-first dashboard. Use the API endpoints for programmatic access:
      </p>
      <ul>
        <li><code>GET /api/admin/llm-usage?range=30d</code> — cost breakdown by domain/provider/day</li>
        <li><code>GET /api/admin/llm-usage/budget</code> — daily/monthly spend vs limits</li>
      </ul>
      <hr />
      <section>
        <h2>Quick View</h2>
        <p>
          This page will display tabular cost data once the LLM gateway is processing real requests.
          Interactive charts and widgets are planned for Phase 2.
        </p>
      </section>
    </main>
  );
}
