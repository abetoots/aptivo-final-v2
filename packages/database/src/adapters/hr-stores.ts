/**
 * S6-INF-HR: HR domain store adapters
 * @task S6-INF-HR
 * @frd docs/02-requirements/hr-domain-frd.md §2.1
 */

import { eq } from 'drizzle-orm';
import type { DrizzleClient } from './types.js';
import {
  candidates,
  applications,
  interviews,
  positions,
  contracts,
} from '../schema/hr-domain.js';

// -- store interfaces --

export interface CandidateStore {
  create(candidate: {
    name: string;
    email: string;
    phone?: string;
    resumeFileId?: string;
    skills?: unknown[];
    consentStatus?: string;
  }): Promise<{ id: string }>;
  findById(id: string): Promise<CandidateRecord | null>;
  findByEmail(email: string): Promise<CandidateRecord | null>;
  updateStatus(id: string, status: string): Promise<void>;
  /**
   * S18-B2: paginated list for the /api/hr/candidates and
   * /api/hr/employees endpoints. `status` filter is optional —
   * omitted means all statuses; supplied filters by exact match.
   * Hard cap of 200 rows per page to bound memory + the audit
   * `recordCount` magnitude (the anomaly gate's per-actor volume
   * scoring is meaningful only when each emit reflects a bounded
   * read).
   */
  list(params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<readonly CandidateRecord[]>;
}

export interface CandidateRecord {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  resumeFileId: string | null;
  skills: unknown;
  status: string | null;
  consentStatus: string | null;
}

export interface ApplicationStore {
  create(application: {
    candidateId: string;
    positionId?: string;
    source?: string;
    currentStage?: string;
  }): Promise<{ id: string }>;
  findByCandidate(candidateId: string): Promise<ApplicationRecord[]>;
  updateStage(id: string, stage: string): Promise<void>;
}

export interface ApplicationRecord {
  id: string;
  candidateId: string;
  positionId: string | null;
  source: string | null;
  currentStage: string;
  appliedAt: Date | null;
}

export interface InterviewStore {
  create(interview: {
    applicationId: string;
    interviewerId?: string;
    dateTime: Date;
    location?: string;
    type: string;
    status?: string;
  }): Promise<{ id: string }>;
  findByApplication(applicationId: string): Promise<InterviewRecord[]>;
  updateStatus(id: string, status: string): Promise<void>;
}

export interface InterviewRecord {
  id: string;
  applicationId: string;
  interviewerId: string | null;
  dateTime: Date;
  location: string | null;
  type: string;
  status: string;
}

// -- adapter factories --

export function createDrizzleCandidateStore(db: DrizzleClient): CandidateStore {
  return {
    async create(candidate) {
      const rows = await db
        .insert(candidates)
        .values(candidate)
        .returning({ id: candidates.id });
      return { id: rows[0]!.id };
    },

    async findById(id) {
      const rows = await db
        .select()
        .from(candidates)
        .where(eq(candidates.id, id));
      if (rows.length === 0) return null;
      const r = rows[0]!;
      return {
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        resumeFileId: r.resumeFileId,
        skills: r.skills,
        status: r.status,
        consentStatus: r.consentStatus,
      };
    },

    async findByEmail(email) {
      const rows = await db
        .select()
        .from(candidates)
        .where(eq(candidates.email, email));
      if (rows.length === 0) return null;
      const r = rows[0]!;
      return {
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        resumeFileId: r.resumeFileId,
        skills: r.skills,
        status: r.status,
        consentStatus: r.consentStatus,
      };
    },

    async updateStatus(id, status) {
      await db
        .update(candidates)
        .set({ status, updatedAt: new Date() })
        .where(eq(candidates.id, id));
    },

    async list(params) {
      const limit = Math.min(params?.limit ?? 50, 200);
      const offset = params?.offset ?? 0;
      const rows = params?.status
        ? await db
            .select()
            .from(candidates)
            .where(eq(candidates.status, params.status))
            .limit(limit)
            .offset(offset)
        : await db
            .select()
            .from(candidates)
            .limit(limit)
            .offset(offset);
      return rows.map((r: typeof candidates.$inferSelect) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        resumeFileId: r.resumeFileId,
        skills: r.skills,
        status: r.status,
        consentStatus: r.consentStatus,
      }));
    },
  };
}

export function createDrizzleApplicationStore(db: DrizzleClient): ApplicationStore {
  return {
    async create(application) {
      const rows = await db
        .insert(applications)
        .values(application)
        .returning({ id: applications.id });
      return { id: rows[0]!.id };
    },

    async findByCandidate(candidateId) {
      const rows = await db
        .select()
        .from(applications)
        .where(eq(applications.candidateId, candidateId));
      return rows.map((r: typeof applications.$inferSelect) => ({
        id: r.id,
        candidateId: r.candidateId,
        positionId: r.positionId,
        source: r.source,
        currentStage: r.currentStage,
        appliedAt: r.appliedAt,
      }));
    },

    async updateStage(id, stage) {
      await db
        .update(applications)
        .set({ currentStage: stage, updatedAt: new Date() })
        .where(eq(applications.id, id));
    },
  };
}

export function createDrizzleInterviewStore(db: DrizzleClient): InterviewStore {
  return {
    async create(interview) {
      const rows = await db
        .insert(interviews)
        .values(interview)
        .returning({ id: interviews.id });
      return { id: rows[0]!.id };
    },

    async findByApplication(applicationId) {
      const rows = await db
        .select()
        .from(interviews)
        .where(eq(interviews.applicationId, applicationId));
      return rows.map((r: typeof interviews.$inferSelect) => ({
        id: r.id,
        applicationId: r.applicationId,
        interviewerId: r.interviewerId,
        dateTime: r.dateTime,
        location: r.location,
        type: r.type,
        status: r.status,
      }));
    },

    async updateStatus(id, status) {
      await db
        .update(interviews)
        .set({ status })
        .where(eq(interviews.id, id));
    },
  };
}

// -- contract store --

export interface ContractStore {
  create(contract: {
    candidateId: string;
    templateSlug: string;
    terms?: Record<string, unknown>;
    version?: number;
    status?: string;
    complianceFlags?: unknown[];
  }): Promise<{ id: string }>;
  findById(id: string): Promise<ContractRecord | null>;
  updateStatus(id: string, status: string): Promise<void>;
  /**
   * S18-B2: paginated list for /api/hr/contracts. Same hard cap of
   * 200 rows as CandidateStore.list — the audit `recordCount`
   * magnitude must stay bounded for anomaly-gate per-actor scoring.
   */
  list(params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<readonly ContractRecord[]>;
}

export interface ContractRecord {
  id: string;
  candidateId: string;
  templateSlug: string;
  terms: unknown;
  version: number | null;
  status: string;
  complianceFlags: unknown;
  createdAt: Date | null;
}

export function createDrizzleContractStore(db: DrizzleClient): ContractStore {
  return {
    async create(contract) {
      const rows = await db
        .insert(contracts)
        .values(contract)
        .returning({ id: contracts.id });
      return { id: rows[0]!.id };
    },

    async findById(id) {
      const rows = await db
        .select()
        .from(contracts)
        .where(eq(contracts.id, id));
      if (rows.length === 0) return null;
      const r = rows[0]!;
      return {
        id: r.id,
        candidateId: r.candidateId,
        templateSlug: r.templateSlug,
        terms: r.terms,
        version: r.version,
        status: r.status,
        complianceFlags: r.complianceFlags,
        createdAt: r.createdAt,
      };
    },

    async updateStatus(id, status) {
      await db
        .update(contracts)
        .set({ status, updatedAt: new Date() })
        .where(eq(contracts.id, id));
    },

    async list(params) {
      const limit = Math.min(params?.limit ?? 50, 200);
      const offset = params?.offset ?? 0;
      const rows = params?.status
        ? await db
            .select()
            .from(contracts)
            .where(eq(contracts.status, params.status))
            .limit(limit)
            .offset(offset)
        : await db
            .select()
            .from(contracts)
            .limit(limit)
            .offset(offset);
      return rows.map((r: typeof contracts.$inferSelect) => ({
        id: r.id,
        candidateId: r.candidateId,
        templateSlug: r.templateSlug,
        terms: r.terms,
        version: r.version,
        status: r.status,
        complianceFlags: r.complianceFlags,
        createdAt: r.createdAt,
      }));
    },
  };
}

// -- position store --

export interface PositionStore {
  create(position: {
    title: string;
    clientId?: string;
    requirements?: unknown[];
    status?: string;
    slaBusinessDays?: number;
  }): Promise<{ id: string }>;
  findById(id: string): Promise<PositionRecord | null>;
  findOpen(): Promise<PositionRecord[]>;
}

export interface PositionRecord {
  id: string;
  title: string;
  clientId: string | null;
  requirements: unknown;
  status: string;
  slaBusinessDays: number | null;
}

export function createDrizzlePositionStore(db: DrizzleClient): PositionStore {
  return {
    async create(position) {
      const rows = await db
        .insert(positions)
        .values(position)
        .returning({ id: positions.id });
      return { id: rows[0]!.id };
    },

    async findById(id) {
      const rows = await db
        .select()
        .from(positions)
        .where(eq(positions.id, id));
      if (rows.length === 0) return null;
      const r = rows[0]!;
      return {
        id: r.id,
        title: r.title,
        clientId: r.clientId,
        requirements: r.requirements,
        status: r.status,
        slaBusinessDays: r.slaBusinessDays,
      };
    },

    async findOpen() {
      const rows = await db
        .select()
        .from(positions)
        .where(eq(positions.status, 'open'));
      return rows.map((r: typeof positions.$inferSelect) => ({
        id: r.id,
        title: r.title,
        clientId: r.clientId,
        requirements: r.requirements,
        status: r.status,
        slaBusinessDays: r.slaBusinessDays,
      }));
    },
  };
}
