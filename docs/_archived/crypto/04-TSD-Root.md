# Technical Specification Document (TSD)

# Crypto Trading AI Agent Ecosystem

**Version**: 2.1
**Date**: January 2025
**Status**: Final

**Revision History:**

- v2.1: Updated document references to FRD v4.0 and ADD v2.1
- v2.0: Updated to reflect ADD v2.1 architectural decisions (passwordless auth, Pino logging, queue abstraction)
- v1.0: Initial TSD defining exact implementation details, configurations, schemas, and procedures

---

## Table of Contents

### Core Documents

1. **[TSD-Database.md](./04-TSD-Database.md)** - Database Specifications

   - PostgreSQL schema definitions
   - Database indexing and query optimization strategies
   - Database migrations strategy
   - Data integrity constraints and relationships

2. **[TSD-Configuration.md](./04-TSD-Configuration.md)** - Environment Variables & Secrets Management

   - Environment variable specifications
   - Secret management procedures for deployment environments
   - Local development configuration
   - Production environment configuration

3. **[TSD-Dev-Environment.md](./04-TSD-Dev-Environment.md)** - Development Environment Setup

   - TypeScript project configuration
   - Code linting and formatting standards
   - Pre-commit hooks for code quality
   - Standardized package.json scripts

4. **[TSD-Services.md](./04-TSD-Services.md)** - Shared Services Implementation

   - Multi-provider LLM service with cost tracking
   - Model Context Protocol (MCP) server integration
   - Structured logging service (Pino)
   - Background job queue service
   - Notification service (multi-channel)
   - Human-in-the-loop (HITL) approval queue
   - Resilience patterns (retry, circuit breaker, timeout)

5. **[TSD-Authentication.md](./04-TSD-Authentication.md)** - Authentication Implementation

   - Passwordless authentication with WebAuthn/Passkeys
   - OAuth 2.0 social login integration
   - JWT-based session management
   - Multi-device support and recovery flows

6. **[TSD-API.md](./04-TSD-API.md)** - API Specifications

   - REST endpoint contracts
   - Request/response schema validation
   - WebSocket communication protocol
   - Standardized API error responses

7. **[TSD-DevOps.md](./04-TSD-DevOps.md)** - CI/CD Pipeline & Monitoring

   - Continuous integration and deployment (CI/CD) workflow
   - Frontend (Vercel) deployment configuration
   - Backend (Railway) deployment configuration
   - Log aggregation and observability strategy
   - Application metrics collection and monitoring
   - Alerting rules and integration procedures
   - Health check endpoint specifications

8. **[TSD-Appendices.md](./04-TSD-Appendices.md)** - Appendices
   - Appendix A: Complete database schema SQL script (executable)
   - Appendix B: Complete GitHub Actions workflow YAML
   - Appendix C: Migration scripts examples
   - Appendix D: Traceability matrix (FRD → TSD mapping)

---

## 1. Introduction & Document Control

### 1.1 Purpose and Scope

This Technical Specification Document (TSD) serves as the **developer playbook** for the Crypto Trading AI Agent Ecosystem. It defines the exact implementation details required to build, deploy, and operate the system.

**Purpose:**

- Provide complete, copy-paste ready code examples and configurations
- Eliminate ambiguity in technical implementation
- Serve as the single source of truth for database schemas, API contracts, and deployment procedures
- Enable consistent implementation across the development team

**Scope:**
The TSD is organized as a collection of focused sub-documents, each covering a specific technical domain:

- **Database**: PostgreSQL schemas, indexes, migrations
- **Configuration**: Environment variables, secrets management
- **Dev Environment**: TypeScript, ESLint, Prettier, pre-commit hooks
- **Services**: LLM, MCP, Auth, HITL service implementations
- **API**: REST endpoints, WebSocket protocol, error responses
- **DevOps**: CI/CD pipelines, monitoring, logging, alerting
- **Appendices**: Executable scripts, traceability matrix

**Out of Scope:**

- Functional requirements (defined in FRD v4.0)
- Architectural decisions and rationale (defined in ADD v2.1)
- User interface designs and mockups
- Business logic and workflow descriptions

### 1.2 Relationship to Other Documents

This TSD is part of a three-tier specification hierarchy:

```
┌─────────────────────────────────────────────────────────────┐
│ FRD v4.0 - Functional Requirements Document                │
│ WHAT the system must do                                     │
│ - Feature requirements (FR-*)                               │
│ - Non-functional requirements (NFR-*)                       │
│ - Data entities (what data exists)                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ ADD v2.1 - Application Design Document                     │
│ HOW the system is architected                               │
│ - Agentic workflow orchestration patterns                   │
│ - Resilient component design (Result<T,E> pattern)          │
│ - Deployment topology (Vercel, Railway)                     │
│ - Hybrid file structure (/workflows, /shared)               │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ TSD v2.0 - Technical Specification Document (THIS DOC)     │
│ HOW EXACTLY to implement the system                         │
│ - SQL CREATE TABLE statements                               │
│ - TypeScript code implementations                           │
│ - CI/CD YAML configurations                                 │
│ - Environment variable lists                                │
└─────────────────────────────────────────────────────────────┘
```

**Traceability:**

- All TSD sections trace back to FRD requirements (see TSD-Appendices.md for mapping)
- All TSD implementations follow ADD architectural patterns
- No implementation detail in TSD contradicts FRD requirements or ADD architecture

### 1.3 How to Use This Document

**Modular Structure Benefits:**

- **Focused Context**: Each document covers a single domain (database, API, DevOps, etc.)
- **Parallel Development**: Different teams can work on different modules without merge conflicts
- **Clear Ownership**: DevOps team owns TSD-DevOps.md, backend team owns TSD-Services.md, etc.
- **Faster Navigation**: Find specific information quickly without scrolling through 6,000+ lines
- **Maintainability**: Update one module without affecting others

**For Backend Developers:**

1. Start with [TSD-Database.md](./04-TSD-Database.md) to understand data structures
2. Review [TSD-Services.md](./04-TSD-Services.md) for shared service implementations
3. Reference [TSD-Configuration.md](./04-TSD-Configuration.md) for local setup
4. Use [TSD-Dev-Environment.md](./04-TSD-Dev-Environment.md) to configure your IDE

**For Frontend Developers:**

1. Review [TSD-API.md](./04-TSD-API.md) for endpoint contracts and WebSocket protocol
2. Reference [TSD-Configuration.md](./04-TSD-Configuration.md) for Vercel environment variables
3. Check [TSD-DevOps.md](./04-TSD-DevOps.md) for deployment procedures

**For DevOps Engineers:**

1. Start with [TSD-Configuration.md](./04-TSD-Configuration.md) for secret management
2. Review [TSD-DevOps.md](./04-TSD-DevOps.md) for CI/CD pipelines and monitoring
3. Reference [TSD-Database.md](./04-TSD-Database.md) for database provisioning
4. Use [TSD-Appendices.md](./04-TSD-Appendices.md) for executable scripts

**For QA Engineers:**

1. Review [TSD-API.md](./04-TSD-API.md) for API test cases
2. Reference [TSD-DevOps.md](./04-TSD-DevOps.md) for health checks
3. Use [TSD-Appendices.md](./04-TSD-Appendices.md) for traceability matrix

### 1.4 Document Conventions

**Code Blocks:**

- All code examples are complete and copy-paste ready
- File paths are absolute or relative to project root
- Placeholder values use `<ANGLE_BRACKETS>` or `${ENVIRONMENT_VARIABLE}` format

**SQL Conventions:**

- Table names: `snake_case` (e.g., `smart_money_transactions`)
- Column names: `snake_case` (e.g., `wallet_address`)
- Index names: `idx_<table>_<columns>` (e.g., `idx_users_email`)
- Foreign key names: `fk_<table>_<referenced_table>` (e.g., `fk_sessions_users`)

**TypeScript Conventions:**

- Interfaces: `PascalCase` with `I` prefix optional (e.g., `LLMProvider`)
- Classes: `PascalCase` (e.g., `LLMService`)
- Functions: `camelCase` (e.g., `generateCompletion`)
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `MAX_RETRIES`)

**Environment Variable Conventions:**

- All uppercase with underscores: `DATABASE_URL`
- Prefixes indicate purpose:
  - `DATABASE_` - Database configuration
  - `REDIS_` - Cache configuration
  - `JWT_` - Authentication configuration
  - `NEXT_PUBLIC_` - Client-exposed variables (frontend only)

**Requirement References:**

- FRD requirements referenced as `FR-<CATEGORY>-<NUMBER>` (e.g., FR-SMT-001)
- NFR requirements referenced as `NFR-<CATEGORY>-<NUMBER>` (e.g., NFR-PERF-001)

---

## Getting Started

To begin implementing the system, follow these steps:

1. **Database Setup**: Read [TSD-Database.md](./04-TSD-Database.md) and run the schema SQL script from Appendix A
2. **Environment Configuration**: Follow [TSD-Configuration.md](./04-TSD-Configuration.md) to set up local `.env` file
3. **Development Environment**: Configure your IDE using [TSD-Dev-Environment.md](./04-TSD-Dev-Environment.md)
4. **Service Implementation**: Build shared services following [TSD-Services.md](./04-TSD-Services.md)
5. **API Development**: Implement endpoints per [TSD-API.md](./04-TSD-API.md)
6. **Deployment**: Set up CI/CD following [TSD-DevOps.md](./04-TSD-DevOps.md)

---

## Document Status

| Module                 | Status   | Completion | Last Updated |
| ---------------------- | -------- | ---------- | ------------ |
| TSD-Database.md        | Complete | 100%       | 2025-10-20   |
| TSD-Configuration.md   | Complete | 100%       | 2025-10-20   |
| TSD-Dev-Environment.md | Complete | 100%       | 2025-10-20   |
| TSD-Services.md        | Complete | 100%       | 2025-01-21   |
| TSD-Authentication.md  | Complete | 100%       | 2025-01-21   |
| TSD-API.md             | Complete | 100%       | 2025-10-20   |
| TSD-DevOps.md          | Complete | 100%       | 2025-01-21   |
| TSD-Appendices.md      | Complete | 100%       | 2025-10-20   |

---

**Status**: All TSD modules complete and aligned with ADD v2.1! The complete technical specification is ready for implementation.
