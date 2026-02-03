---
id: TSD-CORE-API
title: API Standards Specification
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-01-18'
parent: ../03-architecture/platform-core-add.md
---
# API Standards Specification

---

## 1. REST API Conventions

### 1.1 URL Structure

```
/api/v{version}/{resource}
/api/v{version}/{resource}/{id}
/api/v{version}/{resource}/{id}/{sub-resource}
```

Examples:
- `GET /api/v1/candidates` - list candidates
- `GET /api/v1/candidates/01HXYZ123` - get candidate by ID
- `POST /api/v1/candidates/01HXYZ123/interviews` - create interview for candidate
- `GET /api/v1/interviews/01HXYZ456/feedback` - get feedback for interview

### 1.2 HTTP Methods

| Method | Purpose | Idempotent | Request Body |
|--------|---------|------------|--------------|
| GET | Retrieve resource(s) | Yes | No |
| POST | Create resource | No | Yes |
| PUT | Replace resource | Yes | Yes |
| PATCH | Partial update | Yes | Yes |
| DELETE | Remove resource | Yes | No |

### 1.3 Status Codes

| Code | Meaning | When to Use |
|------|---------|-------------|
| 200 | OK | Successful GET, PUT, PATCH |
| 201 | Created | Successful POST |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Validation error, malformed request |
| 401 | Unauthorized | Missing/invalid authentication |
| 403 | Forbidden | Authenticated but not authorized |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource, state conflict |
| 422 | Unprocessable Entity | Semantic validation error |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server error |
| 502 | Bad Gateway | External service failure |
| 504 | Gateway Timeout | External service timeout |

---

## 2. Request/Response Format

### 2.1 Request Headers

```http
Content-Type: application/json
Accept: application/json
Authorization: Bearer {jwt_token}
X-Request-ID: {correlation_id}  // optional, generated if not provided
X-Idempotency-Key: {key}        // required for non-idempotent POST requests
```

### 2.2 Successful Response Format

```typescript
// single resource
interface SingleResourceResponse<T> {
  data: T;
  meta?: {
    requestId: string;
    timestamp: string;
  };
}

// collection
interface CollectionResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    requestId: string;
    timestamp: string;
  };
  links?: {
    self: string;
    first: string;
    prev?: string;
    next?: string;
    last: string;
  };
}
```

### 2.3 Error Response Format (RFC 7807)

All API errors follow RFC 7807 Problem Details format.

**Canonical Reference:** See [common-patterns.md](common-patterns.md#4-api-error-mapping-rfc-7807) for:
- ProblemDetails interface definition
- Error type URIs
- Error-to-HTTP status mapping
- Full implementation examples

---

## 3. Pagination

### 3.1 Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number (1-indexed) |
| `pageSize` | integer | 20 | Items per page (max 100) |
| `sort` | string | varies | Sort field (prefix with `-` for descending) |

Example: `GET /api/v1/candidates?page=2&pageSize=50&sort=-createdAt`

### 3.2 Response Format

```json
{
  "data": [...],
  "meta": {
    "total": 150,
    "page": 2,
    "pageSize": 50,
    "totalPages": 3,
    "requestId": "abc123",
    "timestamp": "2025-01-15T10:30:00Z"
  },
  "links": {
    "self": "/api/v1/candidates?page=2&pageSize=50",
    "first": "/api/v1/candidates?page=1&pageSize=50",
    "prev": "/api/v1/candidates?page=1&pageSize=50",
    "next": "/api/v1/candidates?page=3&pageSize=50",
    "last": "/api/v1/candidates?page=3&pageSize=50"
  }
}
```

---

## 4. Filtering

### 4.1 Query Parameter Syntax

| Operator | Syntax | Example |
|----------|--------|---------|
| Equals | `field=value` | `status=active` |
| Not equals | `field!=value` | `status!=rejected` |
| Greater than | `field>value` | `createdAt>2025-01-01` |
| Less than | `field<value` | `salary<100000` |
| In list | `field=val1,val2` | `status=new,screening` |
| Contains | `field~=value` | `name~=john` |

Example: `GET /api/v1/candidates?status=interviewing,offer&createdAt>2025-01-01`

### 4.2 Search

Full-text search uses the `q` parameter:

```
GET /api/v1/candidates?q=john+smith
```

---

## 5. Zod Schema Validation

All API inputs are validated using Zod schemas:

### 5.1 Schema Definition Pattern

```typescript
import { z } from 'zod';

// base schemas
export const UUIDSchema = z.string().uuid();
export const EmailSchema = z.string().email().max(255);
export const PhoneSchema = z.string().regex(/^\+?[1-9]\d{1,14}$/);

// candidate schemas
export const CandidateStatusSchema = z.enum([
  'new',
  'screening',
  'interviewing',
  'offer',
  'hired',
  'rejected',
  'withdrawn',
]);

export const CreateCandidateSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: EmailSchema,
  phone: PhoneSchema.optional(),
  source: z.string().max(100).optional(),
  referredById: UUIDSchema.optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  notes: z.string().max(10000).optional(),
});

export const UpdateCandidateSchema = CreateCandidateSchema.partial();

export const UpdateCandidateStatusSchema = z.object({
  status: CandidateStatusSchema,
  reason: z.string().max(500).optional(),
});

// infer types from schemas
export type CreateCandidateInput = z.infer<typeof CreateCandidateSchema>;
export type UpdateCandidateInput = z.infer<typeof UpdateCandidateSchema>;
```

### 5.2 Validation Middleware

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z, ZodSchema } from 'zod';
import { ProblemDetails } from '@/types/api';

export function validateBody<T>(schema: ZodSchema<T>) {
  return async (req: NextRequest): Promise<T | NextResponse<ProblemDetails>> => {
    try {
      const body = await req.json();
      return schema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json<ProblemDetails>(
          {
            type: '/errors/validation',
            title: 'Validation Failed',
            status: 400,
            detail: 'One or more fields failed validation',
            errors: error.errors.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
              code: e.code,
            })),
          },
          { status: 400 }
        );
      }
      throw error;
    }
  };
}
```

---

## 6. OpenAPI Generation

### 6.1 Code-First Approach

Use `zod-to-openapi` for automatic OpenAPI schema generation:

```typescript
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { CreateCandidateSchema } from '@/schemas/candidate';

const registry = new OpenAPIRegistry();

// register schemas
registry.register('CreateCandidateInput', CreateCandidateSchema);

// register endpoints
registry.registerPath({
  method: 'post',
  path: '/api/v1/candidates',
  description: 'Create a new candidate',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateCandidateSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Candidate created successfully',
      content: {
        'application/json': {
          schema: CandidateResponseSchema,
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ProblemDetailsSchema,
        },
      },
    },
  },
});

// generate OpenAPI document
const generator = new OpenApiGeneratorV3(registry.definitions);
export const openApiDocument = generator.generateDocument({
  openapi: '3.0.3',
  info: {
    title: 'Aptivo API',
    version: '1.0.0',
    description: 'Aptivo Agentic Platform API',
  },
  servers: [
    { url: 'https://api.aptivo.com', description: 'Production' },
    { url: 'https://api.staging.aptivo.com', description: 'Staging' },
  ],
});
```

### 6.2 OpenAPI Endpoint

Expose the OpenAPI spec at `/api/openapi.json`:

```typescript
// app/api/openapi.json/route.ts
import { NextResponse } from 'next/server';
import { openApiDocument } from '@/lib/openapi';

export async function GET() {
  return NextResponse.json(openApiDocument);
}
```

---

## 7. Rate Limiting

### 7.1 Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705315800
Retry-After: 60  // only on 429
```

### 7.2 Default Limits

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Read (GET) | 100/min | Per user |
| Write (POST/PUT/PATCH) | 30/min | Per user |
| Delete | 10/min | Per user |
| Search | 20/min | Per user |
| File Upload | 10/min | Per user |

### 7.3 Rate Limit Response

```json
{
  "type": "/errors/rate-limit",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "Rate limit exceeded. Please wait 60 seconds before retrying.",
  "retryAfter": 60
}
```

---

## 8. Versioning

### 8.1 URL Versioning

The API version is included in the URL path:

```
/api/v1/candidates
/api/v2/candidates  // future
```

### 8.2 Deprecation Policy

1. **Announce deprecation** - 6 months notice via `Deprecation` header
2. **Sunset date** - Communicate end-of-life date
3. **Migration guide** - Provide documentation for migration

```http
Deprecation: Sun, 15 Jul 2025 00:00:00 GMT
Sunset: Sun, 15 Jan 2026 00:00:00 GMT
Link: </docs/migration/v1-to-v2>; rel="deprecation"
```

---

## 9. Security Headers

All API responses include these security headers:

```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 0
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'
Referrer-Policy: strict-origin-when-cross-origin
Cache-Control: no-store
```

---

## 10. CORS Configuration

```typescript
const corsConfig = {
  origin: [
    'https://app.aptivo.com',
    'https://admin.aptivo.com',
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-ID',
    'X-Idempotency-Key',
  ],
  exposedHeaders: [
    'X-Request-ID',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],
  credentials: true,
  maxAge: 86400, // 24 hours
};
```

---

## Traceability

### Upstream References

| Requirement | Source Document | Section |
|-------------|-----------------|---------|
| REST API Standards | platform-core-frd.md | Section 11.1 (FR-CORE-INT-001) |
| Error Handling | platform-core-frd.md | Section 8.5 (FR-CORE-BLOB-001) |
| Rate Limiting | platform-core-frd.md | Section 5.3 (FR-CORE-MCP-003) |

### Downstream References

| Implementation | Target Document | Section |
|----------------|-----------------|---------|
| API Patterns | 05a-Coding-Guidelines.md | API Layer Patterns |
| Error Response Implementation | common-patterns.md | Section 4 |
