/**
 * FW-03: Next.js Shell
 * @task FW-03
 * @spec docs/04-specs/project-structure.md SS2
 * @spec docs/04-specs/configuration.md SS4 (Health Checks)
 */

// Placeholder for Inngest serve endpoint -- will be implemented in SP-01

export async function POST() {
  return Response.json({ message: 'Inngest endpoint placeholder' }, { status: 501 });
}

export async function GET() {
  return Response.json({ message: 'Inngest endpoint placeholder' }, { status: 501 });
}
