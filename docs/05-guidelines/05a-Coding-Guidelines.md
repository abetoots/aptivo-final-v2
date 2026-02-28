---
id: GUIDELINE-CODING
title: 5.a Coding Guidelines
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-01-18'
---
# 5.a Coding Guidelines

**Parent:** [04-Technical-Specifications.md](../04-specs/index.md)

---

**v3.0.0 – [Aligned with TSD v3.0.0 & ADD v2.0.0]**

## 1. Introduction

- **Purpose:** This document defines the mandatory coding standards, patterns, and best practices for Aptivo. Its goal is to ensure consistency, maintainability, and high code quality across all modules using our functional architecture.
- **Audience:** All developers, code reviewers, and technical leads working on the system. Adherence to these guidelines is required for all code contributions.

---

## Traceability

| Requirement | Source | How Addressed |
|-------------|--------|---------------|
| Functional architecture | ADD §4.1 | ReaderResult pattern, pure domain functions |
| Zero Trust security | ADD §6 | Validation at boundaries, explicit auth |
| Type safety | TSD §4.1 | TypeScript strict mode, Zod validation |
| Error handling | TSD §4.2 | Result types, RFC 7807 Problem Details |
| Observability | ADD §8 | OpenTelemetry tracing, structured logging |

---

## 2. Core Philosophy

### 2.1 Functional Core, Imperative Shell

We follow a functional programming approach with clear separation of concerns:

- **Pure Domain Functions:** All business logic is implemented as pure functions that return Result types. No exceptions, no side effects, no mutations.
- **Result Types for Errors:** Business errors are data, not exceptions. Use `Result<T, E>` for all operations that can fail.
- **ReaderResult for Dependencies:** Use ReaderResult pattern for dependency injection, making dependencies explicit and testable.
- **Immutable Data:** All data structures are immutable. Use spread operators or libraries for updates.
- **Imperative Shell:** Side effects (DB, API calls, logging) are isolated at the edges using the ReaderResult pattern.

### 2.2 Zero Trust Security Posture

Following ADD v2.0.0, we implement Zero Trust principles throughout the codebase:

- **Never Trust, Always Verify:** Every function receiving external data must validate it
- **Explicit Authorization:** Business logic contains explicit permission checks
- **Least Privilege:** Functions receive only the dependencies they need
- **Assume Breach:** Design for graceful degradation and comprehensive audit logging

---

## 3. Project Structure & Naming Conventions

### 3.1 Folder Structure

The project uses a monorepo structure with Turborepo + pnpm workspaces.

**Canonical Reference:** See [04-specs/project-structure.md](../04-specs/project-structure.md) for:
- Complete directory layout
- Package boundaries and dependencies
- Build pipeline configuration

**Key Convention:** All module code follows the vertical slice pattern:
`apps/web/src/modules/{module}/` with `domain/`, `application/`, `infrastructure/`, `interface/` layers.

```
apps/web/src/modules/{module}/
├── domain/           # pure business logic (no side effects)
├── application/      # service layer using ReaderResult
├── infrastructure/   # external integrations & data access
├── interface/        # API endpoints & UI components
└── tests/            # test files organized by layer
```

### 3.2 Naming Conventions

| Category | Convention | Example |
|----------|------------|---------|
| Files and Folders | kebab-case | `candidate-repository.ts` |
| Types & Interfaces | PascalCase | `type Candidate`, `interface ProjectServiceDeps` |
| Functions & Variables | camelCase | `createCandidate`, `validateEmail` |
| Error Types | PascalCase with descriptive tag | `{ _tag: 'ValidationError' }` |
| Zod Schemas | PascalCase with Schema suffix | `CandidateSchema`, `CreateCandidateInputSchema` |
| Test Files | `.test.ts` suffix | `candidate.test.ts` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_RETRY_ATTEMPTS` |

---

## 4. Core Patterns & Code Examples

### 4.1 Domain Layer - Pure Functions & Types

All business logic is expressed as pure functions that return Result types. Use Zod for type definitions and validation:

```typescript
// domain/validations.ts
import { z } from 'zod';

// define domain types via zod schemas
export const CandidateStatusSchema = z.enum(['new', 'interviewing', 'hired', 'rejected']);

export const CandidateSchema = z.object({
  id: z.string().uuid(),                    // UUID v7 compliance
  name: z.string().min(1).max(255),
  email: z.string().email(),
  status: CandidateStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

// derive TypeScript types from schemas
export type Candidate = z.infer<typeof CandidateSchema>;
export type CandidateStatus = z.infer<typeof CandidateStatusSchema>;

// input schema (omits system-generated fields)
export const CreateCandidateInputSchema = CandidateSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateCandidateInput = z.infer<typeof CreateCandidateInputSchema>;
```

```typescript
// domain/errors.ts
import { ZodError } from 'zod';

export type CandidateError =
  | { _tag: 'ZodValidationError'; cause: ZodError }
  | { _tag: 'NotFoundError'; id: string }
  | { _tag: 'InvalidStatusTransition'; from: string; to: string }
  | { _tag: 'DuplicateEmail'; email: string }
  | { _tag: 'EmailError'; message: string; cause: Error }
  | { _tag: 'EventError'; message: string; cause: Error }
  | { _tag: 'PersistenceError'; operation: string; cause: Error };

// helper to create validation errors from zod
export const zodValidationError = (error: ZodError): CandidateError => ({
  _tag: 'ZodValidationError',
  cause: error,
});
```

```typescript
// domain/candidate.ts
import { Result } from '@aptivo/domain';
import { CreateCandidateInputSchema, type Candidate, type CreateCandidateInput } from './validations';
import type { CandidateError } from './errors';
import { zodValidationError } from './errors';

export const createCandidate = (
  data: unknown  // accept unknown, validate at boundary
): Result<Candidate, CandidateError> => {
  // parse, don't validate - zod handles both
  const parsed = CreateCandidateInputSchema.safeParse(data);

  if (!parsed.success) {
    return Result.err(zodValidationError(parsed.error));
  }

  const now = new Date();
  return Result.ok({
    ...parsed.data,
    id: crypto.randomUUID(),  // UUID v7 in production
    createdAt: now,
    updatedAt: now,
  });
};

// status transition validation
const VALID_TRANSITIONS: Record<string, string[]> = {
  new: ['interviewing', 'rejected'],
  interviewing: ['hired', 'rejected'],
  hired: [],
  rejected: [],
};

export const validateStatusTransition = (
  from: string,
  to: string
): Result<void, CandidateError> => {
  const allowed = VALID_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    return Result.err({
      _tag: 'InvalidStatusTransition',
      from,
      to,
    });
  }
  return Result.ok(undefined);
};
```

### 4.2 ReaderResult Pattern for Dependency Injection

ReaderResult combines dependency injection with explicit error handling. It enables:

- **Explicit dependencies:** No hidden global state
- **Composable operations:** Chain with `pipe` and automatic error short-circuiting
- **Testability:** Provide mock dependencies directly, no module-level mocking

**Full Guide:** See [05c-ReaderResult-Guide.md](./05c-ReaderResult-Guide.md) for complete patterns and examples.

**Key Rules:**

1. Define dependencies in an interface extending `BaseDependencies`
2. Use `pipe` with Do notation for multi-step workflows
3. Use `ReaderResult.bind` for critical operations (DB, auth)
4. Use `ReaderResult.tap` only for non-critical side effects (logging)
5. Use `ReaderResult.tryCatch` for async operations that may throw

```typescript
// minimal example - see 05c-ReaderResult-Guide.md for full patterns
import { pipe, ReaderResult } from '@aptivo/domain';

export const createEntity = (
  data: unknown
): ReaderResult<ServiceDeps, DomainError, Entity> =>
  pipe(
    ReaderResult.Do<ServiceDeps, DomainError>(),
    ReaderResult.bind('_perm', () => requirePermission('entity:manage')),
    ReaderResult.bind('entity', () => ReaderResult.fromResult(createEntityDomain(data))),
    ReaderResult.bind('saved', ({ entity }) =>
      ReaderResult.tryCatch(
        (deps) => deps.repo.save(entity),
        (e) => persistenceError('save', e as Error)
      )
    ),
    ReaderResult.map(({ saved }) => saved)
  );
```

### 4.3 RFC 7807 Problem Details Error Handling

All API errors MUST conform to RFC 7807 Problem Details format:

```typescript
// lib/validation/problem-details.ts
import { ZodError } from 'zod';
import type { CandidateError } from '@/modules/candidate-management/domain/errors';

/**
 * RFC 7807 Problem Details response format
 * @see https://datatracker.ietf.org/doc/html/rfc7807
 */
export interface ProblemDetails {
  type: string;           // URI reference identifying the problem type
  title: string;          // short, human-readable summary
  status: number;         // HTTP status code
  detail?: string;        // human-readable explanation
  instance?: string;      // URI reference for this specific occurrence
  traceId?: string;       // for debugging/support
  errors?: Array<{        // for validation errors
    field: string;
    message: string;
    code?: string;
  }>;
}

// base URI for error types
const ERROR_TYPE_BASE = 'https://api.aptivo.com/errors';

/**
 * Maps domain errors to RFC 7807 Problem Details
 */
export const toProblemDetails = (
  error: CandidateError,
  instance: string,
  traceId?: string
): ProblemDetails => {
  switch (error._tag) {
    case 'ZodValidationError':
      return {
        type: `${ERROR_TYPE_BASE}/validation-error`,
        title: 'Validation Error',
        status: 400,
        detail: 'One or more fields failed validation',
        instance,
        traceId,
        errors: error.cause.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code,
        })),
      };

    case 'NotFoundError':
      return {
        type: `${ERROR_TYPE_BASE}/not-found`,
        title: 'Resource Not Found',
        status: 404,
        detail: `Resource with id '${error.id}' was not found`,
        instance,
        traceId,
      };

    case 'DuplicateEmail':
      return {
        type: `${ERROR_TYPE_BASE}/duplicate-email`,
        title: 'Duplicate Email',
        status: 409,
        detail: `A resource with email '${error.email}' already exists`,
        instance,
        traceId,
      };

    case 'InvalidStatusTransition':
      return {
        type: `${ERROR_TYPE_BASE}/invalid-status-transition`,
        title: 'Invalid Status Transition',
        status: 422,
        detail: `Cannot transition from '${error.from}' to '${error.to}'`,
        instance,
        traceId,
      };

    case 'EmailError':
    case 'EventError':
    case 'PersistenceError':
    default:
      // internal errors - don't expose details
      return {
        type: `${ERROR_TYPE_BASE}/internal-error`,
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred. Please try again later.',
        instance,
        traceId,
      };
  }
};

/**
 * Creates a Problem Details response
 */
export const problemResponse = (
  problem: ProblemDetails
): Response => {
  return new Response(JSON.stringify(problem), {
    status: problem.status,
    headers: {
      'Content-Type': 'application/problem+json',
    },
  });
};
```

### 4.4 API Route Integration

Connect the functional core to Next.js API routes with proper validation and error handling:

```typescript
// interface/api/candidates/route.ts
import { NextRequest } from 'next/server';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { createNewCandidate, type CandidateServiceDeps } from '@/modules/candidate-management/application/candidate-service';
import { toProblemDetails, problemResponse } from '@/lib/validation/problem-details';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/observability/logger';
import { getEmailService } from '@/lib/email';
import { getEventBus } from '@/lib/events';
import { getCurrentUser } from '@/lib/auth';

const tracer = trace.getTracer('aptivo-api');

// create runtime dependencies
const createDependencies = async (req: NextRequest): Promise<CandidateServiceDeps> => {
  const currentUser = await getCurrentUser(req);

  return {
    candidateRepo: createCandidateRepository(getDb()),
    emailService: getEmailService(),
    eventBus: getEventBus(),
    logger: logger.child({ requestId: req.headers.get('x-request-id') }),
    tracer,
    currentUser,
  };
};

export async function POST(req: NextRequest) {
  const traceId = req.headers.get('x-trace-id') ?? crypto.randomUUID();
  const instance = req.nextUrl.pathname;

  return tracer.startActiveSpan('POST /api/candidates', async (span) => {
    try {
      span.setAttributes({
        'http.method': 'POST',
        'http.url': instance,
        'trace.id': traceId,
      });

      const data = await req.json();
      const deps = await createDependencies(req);
      const result = await createNewCandidate(data)(deps);

      if (!result.success) {
        const problem = toProblemDetails(result.error, instance, traceId);
        span.setStatus({ code: SpanStatusCode.ERROR, message: problem.title });
        span.setAttributes({ 'http.status_code': problem.status });
        return problemResponse(problem);
      }

      span.setStatus({ code: SpanStatusCode.OK });
      span.setAttributes({
        'http.status_code': 201,
        'candidate.id': result.data.id,
      });

      return Response.json(result.data, { status: 201 });
    } catch (error) {
      // unexpected errors
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Unexpected error' });
      span.recordException(error as Error);

      const problem = toProblemDetails(
        { _tag: 'PersistenceError', operation: 'unknown', cause: error as Error },
        instance,
        traceId
      );
      return problemResponse(problem);
    } finally {
      span.end();
    }
  });
}
```

### 4.5 Zero Trust Security Practices

Security is not a checklist—it's built into every layer:

#### Input Validation at Every Boundary

```typescript
// every function receiving external data MUST validate it
export const processWebhook = (rawPayload: unknown): Result<WebhookEvent, WebhookError> => {
  // parse, don't validate
  const parsed = WebhookPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return Result.err({ _tag: 'InvalidPayload', cause: parsed.error });
  }

  // verify signature (zero trust: don't trust the source)
  const verified = verifySignature(parsed.data);
  if (!verified) {
    return Result.err({ _tag: 'InvalidSignature' });
  }

  return Result.ok(parsed.data);
};
```

#### Explicit Authorization in Business Logic

```typescript
// don't assume authorization passed at the gateway
export const updateCandidateStatus = (
  candidateId: string,
  newStatus: CandidateStatus
): ReaderResult<CandidateServiceDeps, CandidateError, Candidate> =>
  pipe(
    ReaderResult.Do<CandidateServiceDeps, CandidateError>(),
    // explicit permission check
    ReaderResult.tap(() => requirePermission('candidate:update')),
    ReaderResult.bind('candidate', () => findCandidateById(candidateId)),
    // verify user can access THIS candidate (resource-level auth)
    ReaderResult.tap(({ candidate }) => ReaderResult.asks((deps) => {
      if (!canAccessCandidate(deps.currentUser, candidate)) {
        throw new UnauthorizedError('Cannot access this candidate');
      }
    })),
    // proceed with update...
  );
```

#### Security Headers Middleware

```typescript
// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const response = NextResponse.next();

  // security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
  );

  // add request ID for tracing
  if (!req.headers.get('x-request-id')) {
    response.headers.set('x-request-id', crypto.randomUUID());
  }

  return response;
}
```

### 4.6 Performance Patterns

#### Database Query Optimization

```typescript
// BAD: N+1 query problem
const projects = await db.query.projects.findMany();
for (const project of projects) {
  project.tasks = await db.query.tasks.findMany({
    where: eq(tasks.projectId, project.id)
  });
}

// GOOD: single query with join
const projectsWithTasks = await db.query.projects.findMany({
  with: {
    tasks: true
  }
});
```

#### Async Caching with TTL

```typescript
import pMemoize from 'p-memoize';
import ExpiryMap from 'expiry-map';

// cache with TTL (5 minutes)
const cache = new ExpiryMap(5 * 60 * 1000);

export const getPermissionsForRole = pMemoize(
  async (roleId: string): Promise<Permission[]> => {
    return db.query.rolePermissions.findMany({
      where: eq(rolePermissions.roleId, roleId),
      with: { permission: true }
    });
  },
  { cache, cacheKey: ([roleId]) => `role-permissions-${roleId}` }
);
```

### 4.7 Testing Patterns

**Full Guide:** See [05b-Testing-Strategies.md](./05b-Testing-Strategies.md) for comprehensive patterns, examples, and CI/CD integration.

**Coverage Requirements:**

| Layer | Target | Rationale |
|-------|--------|-----------|
| Domain | **100%** | Pure functions are easy to test |
| Application | **80%** | Service composition with mocked deps |
| Interface | **60%** | API contracts and UI behavior |

**Key Rules:**

1. Test Result types explicitly: check `result.success`, then `result.data` or `result.error._tag`
2. Use `vi.hoisted()` for mock state (vi.mock is hoisted)
3. Test Zod schemas at domain layer boundaries
4. Provide mock dependencies directly to `ReaderResult.run(deps)`
5. Use table-driven tests (`it.each`) for edge cases

### 4.8 Pipeline Pattern for Data Transformations

Use Pipeline for synchronous, multi-step data transformations:

```typescript
import { Pipeline } from '@aptivo/domain';
import { Result } from '@aptivo/domain';

// simple transformation pipeline
const processUserData = (rawData: unknown) =>
  Pipeline.of(rawData)
    .flatMap(data => {
      const parsed = UserInputSchema.safeParse(data);
      return parsed.success
        ? Result.ok(parsed.data)
        : Result.err(`Validation failed: ${parsed.error.message}`);
    })
    .filter(user => user.age >= 18, 'User must be 18 or older')
    .map(user => ({
      ...user,
      isAdult: true,
      processedAt: new Date()
    }))
    .value();
```

> **When to use Pipeline vs ReaderResult:**
> - Use `ReaderResult` for orchestrating workflows with dependencies, async operations, and cross-layer error handling
> - Use `Pipeline` for synchronous data transformations within a single function

---

## 5. Environment & Configuration

### 5.1 Type-Safe Environment Variables

Use `@t3-oss/env-nextjs` for validated, type-safe environment access:

```typescript
// lib/env.ts
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'staging', 'production']),
    DATABASE_URL: z.string().url(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(20),

    REDIS_URL: z.string().url(),

    AUTH_ISSUER: z.string().url(),
    AUTH_SECRET: z.string().min(32),

    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
    SENTRY_DSN: z.string().url().optional(),
  },

  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },

  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX,
    REDIS_URL: process.env.REDIS_URL,
    AUTH_ISSUER: process.env.AUTH_ISSUER,
    AUTH_SECRET: process.env.AUTH_SECRET,
    OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    SENTRY_DSN: process.env.SENTRY_DSN,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },

  skipValidation: process.env.SKIP_ENV_VALIDATION === 'true',
});
```

**IMPORTANT:** Never access `process.env` directly in feature code. Always use the validated `env` object:

```typescript
// BAD
const dbUrl = process.env.DATABASE_URL;  // might be undefined!

// GOOD
import { env } from '@/lib/env';
const dbUrl = env.DATABASE_URL;  // type-safe, validated at build time
```

---

## 6. Observability

### 6.1 Structured Logging

Use Pino for structured JSON logging:

```typescript
// lib/observability/logger.ts
import pino from 'pino';
import { env } from '@/lib/env';

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: 'aptivo-app',
    version: env.SERVICE_VERSION ?? '0.0.0',
    environment: env.NODE_ENV,
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  redact: ['password', 'token', 'secret', 'authorization', 'cookie'],
});

// create child logger with request context
export const createRequestLogger = (requestId: string, traceId?: string) => {
  return logger.child({
    requestId,
    traceId,
  });
};
```

### 6.2 OpenTelemetry Tracing

Integrate OpenTelemetry for distributed tracing:

```typescript
// lib/observability/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { env } from '@/lib/env';

export const initTracing = () => {
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    console.warn('OTEL_EXPORTER_OTLP_ENDPOINT not set, tracing disabled');
    return;
  }

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'aptivo-app',
      [SemanticResourceAttributes.SERVICE_VERSION]: env.SERVICE_VERSION ?? '0.0.0',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: env.NODE_ENV,
    }),
    traceExporter: new OTLPTraceExporter({
      url: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingPaths: ['/health/live', '/health/ready', '/metrics'],
        },
        '@opentelemetry/instrumentation-pg': { enabled: true },
        '@opentelemetry/instrumentation-redis': { enabled: true },
      }),
    ],
  });

  sdk.start();
};
```

### 6.3 Wrapping ReaderResult with Spans

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('aptivo-app');

// helper to wrap ReaderResult operations with tracing
export const withSpan = <D, E, A>(
  name: string,
  operation: ReaderResult<D, E, A>
): ReaderResult<D, E, A> =>
  ReaderResult.asks((deps: D) => {
    return tracer.startActiveSpan(name, async (span) => {
      try {
        const result = await operation(deps);
        if (result.success) {
          span.setStatus({ code: SpanStatusCode.OK });
        } else {
          span.setStatus({ code: SpanStatusCode.ERROR });
        }
        return result;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  });
```

---

## 7. Tooling & Automation

### 7.1 Formatting (Prettier)

```json
// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

### 7.2 Linting (ESLint Flat Config)

Use the modern flat config format:

```typescript
// eslint.config.js
import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import next from '@next/eslint-plugin-next';

export default [
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      'react': react,
      'react-hooks': reactHooks,
      '@next/next': next,
    },
    rules: {
      // typescript
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/strict-boolean-expressions': 'warn',

      // react
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // general
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
    },
  },
  {
    ignores: ['node_modules/', '.next/', 'dist/', 'coverage/'],
  },
];
```

### 7.3 Testing (Vitest & Playwright)

- **Unit/Integration:** Use Vitest. Test files in parallel `tests/` directories.
- **End-to-End:** Use Playwright for critical user flow testing.
- **Coverage Requirements:**
  - Domain layer: **100%** (pure functions are easy to test)
  - Application layer: **80%** minimum
  - Interface layer: **60%** minimum
  - Overall: **80%** minimum

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'tests/', '**/*.d.ts'],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

---

## 8. Team Processes

### 8.1 Version Control (Git)

- **Branching:** GitFlow model (`main`, `develop`, `feature/`, `release/`, `hotfix/`)
- **Commit Messages:** Conventional Commits specification
  - `feat(candidates): add RFC 7807 error handling`
  - `fix(auth): resolve token refresh race condition`
  - `refactor(db): migrate to UUID v7 primary keys`

### 8.2 Documentation

- **Code:** Use TSDoc for all exported functions and types
- **Comments:** Explain the "why", not the "what"
- **Error Types:** Document all error variants with examples

```typescript
/**
 * Creates a new candidate profile in the system.
 *
 * Uses Zod for validation - accepts unknown input and validates at the boundary.
 *
 * @param data - Raw input data (will be validated)
 * @returns A Result containing the created candidate or a domain error
 *
 * @example
 * const result = createCandidate({
 *   name: 'John Doe',
 *   email: 'john@example.com',
 *   status: 'new'
 * });
 *
 * if (result.success) {
 *   console.log('Created:', result.data.id);
 * } else {
 *   switch (result.error._tag) {
 *     case 'ZodValidationError':
 *       console.error('Invalid input:', result.error.cause.errors);
 *       break;
 *   }
 * }
 */
export const createCandidate = (data: unknown): Result<Candidate, CandidateError> => { ... };
```

### 8.3 Code Review Checklist

- [ ] All functions return Result types (no throws in domain/application layers)
- [ ] Input validation uses Zod schemas at boundaries
- [ ] Error types use tagged unions with descriptive tags
- [ ] API errors conform to RFC 7807 Problem Details
- [ ] Dependencies are explicitly defined in interfaces
- [ ] No side effects in domain functions
- [ ] ReaderResult used for operations with dependencies
- [ ] Authorization checks are explicit (Zero Trust)
- [ ] Tests focus on pure functions (domain layer: 100% coverage)
- [ ] No direct `process.env` access (use `env` object)
- [ ] Observability: logging and tracing integrated
- [ ] All data structures are immutable
- [ ] UUID v7 used for primary keys

---

## 9. Summary

This document establishes our functional programming approach aligned with TSD v3.0.0 and ADD v2.0.0:

| Principle | Implementation |
|-----------|----------------|
| **Pure Functions First** | Business logic in domain layer as pure functions |
| **Explicit Error Handling** | Result types with Zod validation, RFC 7807 responses |
| **Dependency Injection** | ReaderResult pattern for testable services |
| **Zero Trust Security** | Validate everything, authorize explicitly |
| **Observability** | OpenTelemetry tracing, structured logging |
| **Type Safety** | Zod schemas, derived types, tagged unions |

By following these guidelines, we ensure our codebase is:

- **Testable:** Pure functions are easy to test in isolation
- **Maintainable:** Clear separation of concerns and explicit dependencies
- **Reliable:** Errors are handled explicitly with standardized responses
- **Secure:** Zero Trust principles built into every layer
- **Observable:** Full tracing and logging for debugging and monitoring
- **Scalable:** Functional patterns compose well as the system grows
