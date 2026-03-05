/**
 * FW-03: Next.js Shell
 * @task FW-03
 * @spec docs/04-specs/project-structure.md SS2
 * @spec docs/04-specs/configuration.md SS4 (Health Checks)
 */

export async function GET() {
  return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
}
