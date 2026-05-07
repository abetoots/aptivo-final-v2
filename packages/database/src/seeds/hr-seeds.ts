/**
 * S6-INF-SEED: HR domain RBAC, notification, and MCP seeds
 * @task S6-INF-SEED
 */

import type { DrizzleClient } from '../adapters/types.js';
import { rolePermissions } from '../schema/user-roles.js';
import { notificationTemplates } from '../schema/notifications.js';
import { mcpServers } from '../schema/mcp-registry.js';

// -- hr rbac permissions --

export const HR_PERMISSIONS = [
  // recruiter role
  { role: 'recruiter', permission: 'hr/candidate.create' },
  { role: 'recruiter', permission: 'hr/candidate.view' },
  { role: 'recruiter', permission: 'hr/candidate.update' },
  { role: 'recruiter', permission: 'hr/application.view' },
  { role: 'recruiter', permission: 'hr/application.update' },
  { role: 'recruiter', permission: 'hr/interview.create' },
  { role: 'recruiter', permission: 'hr/interview.view' },
  { role: 'recruiter', permission: 'hr/offer.create' },
  // S18-B2: bulk PII export — recruiter only (compliance-sensitive)
  { role: 'recruiter', permission: 'hr/candidate.export' },
  // S18-B2: contracts + employees view/export. Contracts gate is
  // tighter than candidates (salary/benefits/personalTerms PII) —
  // recruiter alone has bulk access; hiring-manager sees individual
  // records via single-record reads (FR-HR-CM scope).
  { role: 'recruiter', permission: 'hr/contract.view' },
  { role: 'recruiter', permission: 'hr/contract.export' },
  { role: 'recruiter', permission: 'hr/employee.view' },
  { role: 'recruiter', permission: 'hr/employee.export' },
  // S18-B2: onboarding read endpoint. Recruiter + hiring-manager can
  // view onboarding state (admin tooling).
  //
  // Note: candidates do NOT have an auth path to the onboarding read
  // endpoint today — there's no candidate→user mapping, no candidate
  // portal, and the dev-mode RBAC stub doesn't accept a `candidate`
  // role. The `requireConsent` middleware's self-access exemption
  // remains a forward-looking primitive (see require-consent.ts) but
  // is unreachable through this endpoint until the candidate portal
  // lands in Phase 3.5.
  { role: 'recruiter', permission: 'hr/onboarding.view' },
  // hiring-manager role
  { role: 'hiring-manager', permission: 'hr/candidate.view' },
  { role: 'hiring-manager', permission: 'hr/application.view' },
  { role: 'hiring-manager', permission: 'hr/interview.view' },
  { role: 'hiring-manager', permission: 'hr/offer.approve' },
  { role: 'hiring-manager', permission: 'hr/offer.view' },
  { role: 'hiring-manager', permission: 'hr/onboarding.view' },
  // interviewer role
  { role: 'interviewer', permission: 'hr/candidate.view' },
  { role: 'interviewer', permission: 'hr/interview.view' },
  { role: 'interviewer', permission: 'hr/feedback.submit' },
  // client-user role (read-only pipeline)
  { role: 'client-user', permission: 'hr/application.view' },
  { role: 'client-user', permission: 'hr/candidate.view' },
] as const;

// -- hr notification templates --

export const HR_TEMPLATES = [
  {
    slug: 'hr-interview-scheduled',
    name: 'Interview Scheduled',
    domain: 'hr',
    version: 1,
    isActive: true,
    emailTemplate: {
      subject: 'Interview Scheduled: {{candidateName}}',
      body: 'An interview has been scheduled for {{candidateName}} on {{dateTime}} at {{location}}.',
    },
    variableSchema: { required: ['candidateName', 'dateTime', 'location'] },
  },
  {
    slug: 'hr-offer-approval',
    name: 'Offer Approval Request',
    domain: 'hr',
    version: 1,
    isActive: true,
    emailTemplate: {
      subject: 'Offer Approval: {{candidateName}} — {{position}}',
      body: 'An offer for {{candidateName}} ({{position}}, salary: ${{salary}}) requires your approval.',
    },
    variableSchema: { required: ['candidateName', 'position', 'salary'] },
  },
  {
    slug: 'hr-consent-request',
    name: 'Consent Request',
    domain: 'hr',
    version: 1,
    isActive: true,
    emailTemplate: {
      subject: 'Data Processing Consent: {{candidateName}}',
      body: 'Hi {{candidateName}}, please review and confirm your consent for data processing as part of your application.',
    },
    variableSchema: { required: ['candidateName'] },
  },
  {
    slug: 'hr-new-application',
    name: 'New Application Received',
    domain: 'hr',
    version: 1,
    isActive: true,
    emailTemplate: {
      subject: 'New Application: {{candidateName}} — {{position}}',
      body: 'A new application has been received from {{candidateName}} (source: {{source}}) for the {{position}} position.',
    },
    variableSchema: { required: ['candidateName', 'source', 'position'] },
  },
] as const;

// -- hr mcp servers --

export const HR_MCP_SERVERS = [
  {
    name: 'gmail-connector',
    transport: 'http',
    command: 'https://gmail.googleapis.com',
    description: 'HR email integration',
    isEnabled: true,
  },
  {
    name: 'google-calendar',
    transport: 'http',
    command: 'https://www.googleapis.com/calendar',
    description: 'HR scheduling',
    isEnabled: true,
  },
] as const;

// -- seed functions --

export async function seedHrRoles(db: DrizzleClient): Promise<{ insertedCount: number }> {
  let count = 0;
  for (const perm of HR_PERMISSIONS) {
    await db
      .insert(rolePermissions)
      .values(perm)
      .onConflictDoNothing();
    count++;
  }
  return { insertedCount: count };
}

export async function seedHrTemplates(db: DrizzleClient): Promise<{ insertedCount: number }> {
  let count = 0;
  for (const template of HR_TEMPLATES) {
    await db
      .insert(notificationTemplates)
      .values({ ...template })
      .onConflictDoNothing();
    count++;
  }
  return { insertedCount: count };
}

export async function seedHrMcpServers(db: DrizzleClient): Promise<{ insertedCount: number }> {
  let count = 0;
  for (const server of HR_MCP_SERVERS) {
    await db
      .insert(mcpServers)
      .values({ ...server })
      .onConflictDoNothing();
    count++;
  }
  return { insertedCount: count };
}

export async function seedAllHr(db: DrizzleClient): Promise<void> {
  await seedHrRoles(db);
  await seedHrTemplates(db);
  await seedHrMcpServers(db);
}
