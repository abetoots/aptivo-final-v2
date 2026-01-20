---
id: SPEC-MKJP625C
title: Project Structure Specification
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-01-19'
---
# Project Structure Specification

**Parent:** [04-Technical-Specifications.md](index.md)

---

## 1. Overview

### 1.1 Purpose

This specification defines the monorepo structure, build tooling, and package boundaries for the Aptivo platform. It establishes conventions for code organization across multiple applications and shared packages.

### 1.2 Scope

| In Scope | Out of Scope |
|----------|--------------|
| Monorepo tooling selection | Individual module implementations |
| Workspace structure | Database schema details |
| Package boundaries | API endpoint specifications |
| Build pipeline configuration | Deployment procedures |
| Dependency management | Runtime configuration |

### 1.3 Traceability

| Requirement | Source | How Addressed |
|-------------|--------|---------------|
| Multiple services (worker, CLI) | ADD Section 3.2, 10.1 | Separate apps in monorepo |
| Modular ecosystem | BRD Section 2.1.1 | Package-based architecture |
| SaaS commercialization path | BRD Section 2.1.1 | Shared packages enable white-labeling |
| Event-driven decoupling | ADD Section 2.1 | Dedicated worker app for NATS consumers |

---

## 2. Monorepo Tooling Decision

### 2.1 Decision: Turborepo + pnpm Workspaces

**Selected:** Turborepo v2.x with pnpm workspaces

### 2.2 Alternatives Evaluated

| Tool | Pros | Cons | Verdict |
|------|------|------|---------|
| **Turborepo** | Simple mental model, fast remote caching, minimal config, good pnpm integration | Less granular task graph than Nx | **Selected** |
| **Nx** | Powerful dependency graph, generators, plugins | Steep learning curve, heavy config, opinionated | Rejected |
| **Lerna** | Mature, well-known | Obsolete (maintenance mode), slow without caching | Rejected |
| **pnpm workspaces (alone)** | Zero overhead, simple | No task orchestration, no caching | Insufficient |
| **Yarn workspaces + Plug'n'Play** | Fast installs, zero-installs | PnP compatibility issues with some packages | Rejected |

### 2.3 Decision Rationale

1. **Team Velocity:** Turborepo's minimal configuration reduces onboarding friction
2. **Build Performance:** Remote caching with Vercel (or self-hosted) provides CI speedups
3. **Incremental Adoption:** Easy migration path from single Next.js app
4. **pnpm Synergy:** Native pnpm workspace protocol support (`workspace:*`)
5. **Future Scalability:** Adequate for projected 5-10 packages; can migrate to Nx if needed

### 2.4 Constraints

- All packages must be buildable independently
- No circular dependencies between packages
- Shared packages must not import from apps

---

## 3. Technology Stack

### 3.1 Core Stack (Updated)

| Category | Technology | Version | Notes |
|----------|------------|---------|-------|
| **Package Manager** | pnpm | 9.x | Workspace protocol, strict peer deps |
| **Build Orchestration** | Turborepo | 2.x | Task caching, parallel execution |
| **Frontend Framework** | Next.js | 16.x | App Router, Server Components, Turbopack |
| **UI Library** | React | 19.x | Concurrent features, use() hook |
| **Runtime** | Node.js | 24.x LTS | ES2024+ features |
| **Language** | TypeScript | 5.9.x | Strict mode, isolatedDeclarations |
| **Database** | PostgreSQL | 18.x | JSON, full-text search |
| **Styling** | TailwindCSS | 4.x | CSS-first configuration |
| **Validation** | Zod | 4.x | Runtime schema validation |
| **Testing** | Vitest | 4.x | ESM-native, workspace support |
| **ORM** | Drizzle | Latest | Type-safe, SQL-like syntax |

### 3.2 Version Policy

- **LTS Preference:** Use LTS versions for runtime (Node.js) and database (PostgreSQL)
- **Latest Stable:** Use latest stable for frameworks and libraries
- **Security Updates:** Automated via Dependabot/Renovate with auto-merge for patches

> **Note:** This specification supersedes the TSD Index (Section 3.1) for technology versions. The Index will be updated to reflect these versions as the canonical source for the greenfield implementation starting Q1 2026.

---

## 4. Workspace Structure

### 4.1 Directory Layout

```
aptivo/
├── apps/
│   ├── web/                     # Next.js 16 (UI, API Routes)
│   │   ├── src/
│   │   │   ├── app/             # App Router pages
│   │   │   ├── modules/         # Vertical slice modules
│   │   │   │   └── taxonomy/    # Example: Skill module
│   │   │   │       ├── domain/
│   │   │   │       ├── application/
│   │   │   │       ├── infrastructure/
│   │   │   │       ├── interface/
│   │   │   │       └── tests/
│   │   │   └── lib/             # App-specific utilities
│   │   ├── public/
│   │   └── package.json
│   │
│   ├── worker/                  # NATS consumers, Sagas, Scheduler [Phase 2+]
│   │   ├── src/
│   │   │   ├── consumers/       # Event handlers
│   │   │   ├── sagas/           # Long-running workflows
│   │   │   └── scheduler/       # Cron-like tasks
│   │   └── package.json
│   │
│   └── cli/                     # aptivo-cli tool [Phase 2+]
│       ├── src/
│       │   └── commands/
│       └── package.json
│
├── packages/
│   ├── database/                # Drizzle schemas, migrations, client
│   │   ├── src/
│   │   │   ├── schema/          # Table definitions
│   │   │   ├── migrations/      # Generated migrations
│   │   │   └── index.ts         # Client factory
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   │
│   ├── domain/                  # Shared business logic
│   │   ├── src/
│   │   │   ├── errors.ts        # RFC 7807 AppError, toProblemDetails()
│   │   │   ├── result.ts        # Result<T, E> type (re-export)
│   │   │   ├── identity.ts      # IdentityContext { userId, permissions, tenantId }
│   │   │   ├── dependencies.ts  # BaseDependencies type
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── events/                  # NATS client, topic enums [Phase 2+]
│   │   ├── src/
│   │   │   ├── client.ts        # JetStream connection factory
│   │   │   ├── topics.ts        # Topic name constants
│   │   │   └── schemas/         # Zod schemas for event payloads
│   │   └── package.json
│   │
│   └── config/                  # Shared tooling configuration
│       ├── eslint/
│       │   └── base.js          # Shared ESLint config
│       ├── typescript/
│       │   └── base.json        # Shared tsconfig
│       ├── prettier/
│       │   └── base.js          # Shared Prettier config
│       └── package.json
│
├── package.json                 # Root package.json (workspaces, scripts)
├── pnpm-workspace.yaml          # Workspace definition
├── turbo.json                   # Turborepo pipeline config
├── .npmrc                       # pnpm configuration
└── .env.example                 # Environment template
```

### 4.2 Package Naming Convention

| Package | npm Name | Description |
|---------|----------|-------------|
| `apps/web` | `@aptivo/web` | Next.js application |
| `apps/worker` | `@aptivo/worker` | Background worker |
| `apps/cli` | `@aptivo/cli` | CLI tool |
| `packages/database` | `@aptivo/database` | Database layer |
| `packages/domain` | `@aptivo/domain` | Shared domain logic |
| `packages/events` | `@aptivo/events` | Event bus client |
| `packages/config` | `@aptivo/config` | Shared configs |

---

## 5. Configuration Files

### 5.1 Root package.json

```json
{
  "name": "aptivo",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "clean": "turbo run clean && rm -rf node_modules",
    "db:generate": "turbo run db:generate --filter=@aptivo/database",
    "db:migrate": "turbo run db:migrate --filter=@aptivo/database",
    "db:studio": "turbo run db:studio --filter=@aptivo/database"
  },
  "devDependencies": {
    "turbo": "^2.5.0",
    "typescript": "^5.9.0"
  }
}
```

### 5.2 pnpm-workspace.yaml

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### 5.3 turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", "**/*.test.ts", "**/*.test.tsx"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".eslintrc*", "eslint.config.*"]
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", "tsconfig.json"]
    },
    "clean": {
      "cache": false
    },
    "db:generate": {
      "cache": false
    },
    "db:migrate": {
      "cache": false
    },
    "db:studio": {
      "cache": false,
      "persistent": true
    }
  }
}
```

### 5.4 .npmrc

```ini
# pnpm configuration
auto-install-peers=true
strict-peer-dependencies=false
shamefully-hoist=true
link-workspace-packages=true
prefer-workspace-packages=true
```

### 5.5 Shared TypeScript Config (packages/config/typescript/base.json)

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "moduleDetection": "force",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "isolatedDeclarations": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "exclude": ["node_modules", "dist", ".next", "coverage"]
}
```

---

## 6. Package Boundaries

### 6.1 Dependency Rules

```
┌─────────────────────────────────────────────────────────────┐
│                        apps/                                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                      │
│  │   web   │  │ worker  │  │   cli   │                      │
│  └────┬────┘  └────┬────┘  └────┬────┘                      │
│       │            │            │                            │
│       └────────────┼────────────┘                            │
│                    │                                         │
│                    ▼                                         │
├─────────────────────────────────────────────────────────────┤
│                      packages/                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ database │  │  domain  │  │  events  │  │  config  │     │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────┘     │
│       │             │             │                          │
│       └─────────────┴─────────────┘                          │
│                     │                                        │
│            (external dependencies only)                      │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Dependency Matrix

| From \ To | @aptivo/database | @aptivo/domain | @aptivo/events | @aptivo/config |
|-----------|------------------|----------------|----------------|----------------|
| **@aptivo/web** | ✅ | ✅ | ✅ | ✅ |
| **@aptivo/worker** | ✅ | ✅ | ✅ | ✅ |
| **@aptivo/cli** | ✅ | ✅ | ❌ | ✅ |
| **@aptivo/database** | - | ✅ | ❌ | ✅ |
| **@aptivo/domain** | ❌ | - | ❌ | ✅ |
| **@aptivo/events** | ❌ | ✅ | - | ✅ |
| **@aptivo/config** | ❌ | ❌ | ❌ | - |

### 6.3 Forbidden Dependencies

- `packages/*` must NOT import from `apps/*`
- `@aptivo/domain` must NOT import from `@aptivo/database` (pure logic, no I/O)
- `@aptivo/config` must NOT import from any other internal package

### 6.4 Boundary Enforcement

Dependency boundaries are enforced automatically via linting:

```javascript
// packages/config/eslint/boundaries.js
module.exports = {
  plugins: ['boundaries'],
  settings: {
    'boundaries/elements': [
      { type: 'app', pattern: 'apps/*' },
      { type: 'package', pattern: 'packages/*' },
    ],
    'boundaries/ignore': ['**/*.test.ts', '**/*.spec.ts'],
  },
  rules: {
    'boundaries/element-types': [
      'error',
      {
        default: 'disallow',
        rules: [
          // apps can import from packages
          { from: 'app', allow: ['package'] },
          // packages cannot import from apps
          { from: 'package', allow: ['package'] },
        ],
      },
    ],
    'boundaries/no-private': 'error',
  },
};
```

**CI Enforcement:** The `lint` task fails if restricted package boundaries are violated.

---

## 7. Worker App Architecture

### 7.1 Why Separate Worker Process?

| Concern | Next.js Embedding | Separate Worker |
|---------|-------------------|-----------------|
| **Lifecycle** | Tied to HTTP server | Independent process |
| **Scaling** | Scales with web traffic | Scales with queue depth |
| **Isolation** | Crash affects web | Isolated failure domain |
| **Memory** | Shared heap | Dedicated resources |
| **Deployment** | Coupled releases | Independent releases |

**Decision:** NATS consumers run in `apps/worker`, not embedded in Next.js.

### 7.2 Worker Responsibilities

| Component | Responsibility | Examples |
|-----------|----------------|----------|
| **Consumers** | Event handlers | `CandidateStatusChanged` → update search index |
| **Sagas** | Long-running workflows | Onboarding sequence, approval chains |
| **Scheduler** | Time-based tasks | Daily reports, cleanup jobs |

> **ADD Mapping:** The `apps/worker` directory hosts the "Execution Coordinator" and "Scheduler Service" components described in ADD Section 3.2 (Workflow Automation Module). The "Custom Automation Service" logic is split: rule definitions in `apps/web`, execution in `apps/worker`.

---

## 8. Build Pipeline

### 8.1 CI/CD Integration

```yaml
# .github/workflows/ci.yml (excerpt)
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2  # for turbo to detect changes

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm build
        env:
          TURBO_TEAM: ${{ vars.TURBO_TEAM }}
          TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}

      - name: Test
        run: pnpm test

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck
```

### 8.2 Remote Caching

| Environment | Cache Backend | Notes |
|-------------|---------------|-------|
| CI (GitHub Actions) | Vercel Remote Cache | `TURBO_TOKEN` secret |
| Local Development | Local filesystem | `~/.turbo/cache` |
| Self-Hosted CI | Custom S3 bucket | Via `--api` and `--team` flags |

---

## 9. Development Workflow

### 9.1 Getting Started

```bash
# clone repository
git clone https://github.com/aptivo/aptivo.git
cd aptivo

# install dependencies
pnpm install

# start development (all apps)
pnpm dev

# start specific app
pnpm dev --filter=@aptivo/web

# run tests
pnpm test

# run tests for specific package
pnpm test --filter=@aptivo/domain

# add dependency to package
pnpm add zod --filter=@aptivo/domain

# add workspace dependency
pnpm add @aptivo/domain --filter=@aptivo/web --workspace
```

### 9.2 Creating New Packages

```bash
# create new package directory
mkdir -p packages/new-package/src

# initialize package.json
cd packages/new-package
pnpm init

# edit package.json to add:
# - "name": "@aptivo/new-package"
# - "main": "./dist/index.js"
# - "types": "./dist/index.d.ts"
# - extend from @aptivo/config tsconfig

# add to consuming app
pnpm add @aptivo/new-package --filter=@aptivo/web --workspace
```

---

## 10. Phase Implementation

### 10.1 Phase 1: Monorepo Bootstrap (Current)

| Task | Status | Deliverables |
|------|--------|--------------|
| Initialize monorepo structure | 🔲 Pending | `pnpm-workspace.yaml`, `turbo.json` |
| Create `@aptivo/config` | 🔲 Pending | Shared tsconfig, eslint, prettier |
| Create `@aptivo/domain` | 🔲 Pending | Result types, errors, identity |
| Create `@aptivo/database` | 🔲 Pending | Drizzle client, skill schema |
| Create `apps/web` | 🔲 Pending | Next.js 16 with Skill module |

### 10.2 Phase 2: Worker & Events (Future)

| Task | Status | Deliverables |
|------|--------|--------------|
| Create `@aptivo/events` | 🔲 Pending | NATS client, topic schemas |
| Create `apps/worker` | 🔲 Pending | Consumer infrastructure |
| Implement Candidate events | 🔲 Pending | Status change handlers |

### 10.3 Phase 3: CLI Tool (Future)

| Task | Status | Deliverables |
|------|--------|--------------|
| Create `apps/cli` | 🔲 Pending | CLI framework setup |
| Feature flag commands | 🔲 Pending | `aptivo flags list/set/get` |

---

## Appendix A: Changelog

### v1.0.0 (2026-01-19)

- Initial specification
- Documented Turborepo + pnpm workspace decision
- Defined workspace structure and package boundaries
- Established technology stack versions
- Added worker app architecture rationale

---

## Appendix B: References

| Document | Relevance |
|----------|-----------|
| [ADD Section 2.1](../03-architecture/add.md) | Architectural principles alignment |
| [ADD Section 10.1](../03-architecture/add.md) | Event bus architecture |
| [BRD Section 2.1.1](../01-strategy/brd.md) | SaaS commercialization requirements |
| [Coding Guidelines](../05-guidelines/05a-Coding-Guidelines.md) | Folder structure patterns |
| [Turborepo Documentation](https://turbo.build/repo/docs) | Official tooling docs |
