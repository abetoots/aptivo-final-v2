/**
 * FW-03: Next.js Shell
 * @task FW-03
 * @spec docs/04-specs/project-structure.md SS2
 * @spec docs/04-specs/configuration.md SS4 (Health Checks)
 */

export async function GET() {
  // TODO: Add database and Redis health checks (FW-02 integration)
  const checks = [
    { name: 'database', status: 'healthy' as const },
    { name: 'redis', status: 'healthy' as const },
  ];

  const allHealthy = checks.every((c) => c.status === 'healthy');

  return Response.json(
    {
      status: allHealthy ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: allHealthy ? 200 : 503 }
  );
}
