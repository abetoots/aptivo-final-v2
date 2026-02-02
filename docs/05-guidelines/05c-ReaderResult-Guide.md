---
id: GUIDELINE-MKJP625C
title: 5.c ReaderResult Quick-Start Guide
status: Draft
version: 1.0.0
owner: "@owner"
last_updated: "2026-01-21"
---

# 5.c ReaderResult Quick-Start Guide

**Parent:** [05-guidelines/index.md](./index.md)

---

## 1. What is ReaderResult?

ReaderResult is a pattern that combines:

- **Reader**: Dependency injection without global state
- **Result**: Explicit error handling without exceptions
- **Async**: Promise-based for async operations

Think of it as a recipe that:

1. Needs ingredients (dependencies)
2. Might fail (returns Result)
3. Is asynchronous (returns Promise)

```typescript
// a ReaderResult is just a function:
type ReaderResult<Deps, Error, Value> = (
  deps: Deps,
) => Promise<Result<Value, Error>>;
```

## 2. Why Use ReaderResult?

| Aspect             | Factory Function                            | ReaderResult                     |
| ------------------ | ------------------------------------------- | -------------------------------- |
| **Composability**  | Manual chaining with `if (!result.success)` | Automatic via `pipe`             |
| **Testability**    | Mock injection at construction              | Each step independently testable |
| **Error handling** | Manual checks at every step                 | Automatic short-circuit on error |
| **Dependencies**   | Closed over at construction time            | Explicit at each step            |
| **Readability**    | Imperative, nested conditionals             | Declarative, linear flow         |

## 3. Core Concepts

### 3.1 Do Notation

Do notation lets you build computations step-by-step:

```typescript
import { pipe } from "@aptivo/domain";
import { ReaderResult } from "@aptivo/domain";

const program = pipe(
  ReaderResult.Do<Deps, Error>(), // start with empty record {}
  ReaderResult.bind("user", () => getUser(id)), // add user to record
  ReaderResult.bind("posts", ({ user }) => getPosts(user.id)), // use user
  ReaderResult.let("count", ({ posts }) => posts.length), // pure computation
  ReaderResult.map(({ user, posts, count }) => ({ ...user, posts, count })),
);
```

### 3.2 Dependency Access

Access dependencies anywhere in the chain:

```typescript
// get all dependencies
const logMessage = ReaderResult.ask<Deps, Error>().chain((deps) => {
  deps.logger.info("Hello");
  return ReaderResult.of(undefined);
});

// extract specific dependency (preferred)
const config = ReaderResult.asks<Deps, Error, Config>((deps) => deps.config);
```

### 3.3 Error Handling

```typescript
// lift a Result into ReaderResult
ReaderResult.fromResult(Result.ok(value));
ReaderResult.fromResult(Result.err(error));

// wrap async that might throw
ReaderResult.tryCatch(
  async (deps) => deps.repo.save(data),
  (error) => persistenceError("save", error as Error),
);

// recover from errors
ReaderResult.orElse((error) => fallbackOperation())(riskyOperation());
```

### 3.4 Running

Execute the computation by providing dependencies:

```typescript
const result = await ReaderResult.run(deps)(program);

if (result.success) {
  console.log(result.data);
} else {
  console.error(result.error);
}
```

## 4. Common Patterns

### 4.1 Permission Check

```typescript
const requirePermission = (
  permission: string,
): ReaderResult<ServiceDeps, DomainError, void> =>
  ReaderResult.asks((deps) => {
    if (!hasPermission(deps.identity, permission)) {
      // throw to trigger error path
      throw forbiddenError("action");
    }
  });

// usage in chain:
pipe(
  ReaderResult.Do<ServiceDeps, DomainError>(),
  ReaderResult.bind("_perm", () => requirePermission("resource:manage")),
  // ... rest of chain
);
```

### 4.2 Lift Domain Functions

Use `liftDomain` to convert pure Result-returning functions:

```typescript
import { liftDomain } from '@aptivo/domain';

// domain function
const createEntity = (data: unknown): Result<Entity, DomainError> => { ... };

// lift to ReaderResult
const createEntityRR = liftDomain<ServiceDeps, DomainError, Entity, [unknown]>(createEntity);

// use in chain
pipe(
  ReaderResult.Do<ServiceDeps, DomainError>(),
  ReaderResult.bind('entity', () => createEntityRR(inputData)),
  // ...
);
```

### 4.3 Repository Operations

```typescript
const findById = (
  id: string,
): ReaderResult<ServiceDeps, DomainError, Entity | null> =>
  ReaderResult.tryCatch(
    (deps) => deps.repo.findById(id, deps.identity.tenantId),
    (error) => persistenceError("findById", error as Error),
  );

const save = (entity: Entity): ReaderResult<ServiceDeps, DomainError, Entity> =>
  ReaderResult.tryCatch(
    (deps) => deps.repo.save(entity),
    (error) => persistenceError("save", error as Error),
  );
```

### 4.4 Non-Critical Side Effects

Use `tap` or `tapDeps` for logging and other non-critical operations:

```typescript
pipe(
  ReaderResult.Do<ServiceDeps, DomainError>(),
  ReaderResult.bind("entity", () => createEntity(data)),
  ReaderResult.bind("saved", ({ entity }) => save(entity)),
  // option 1: tap with ReaderResult (when you need full ReaderResult semantics)
  ReaderResult.tap(({ saved }) =>
    ReaderResult.asks((deps) => {
      deps.logger.info({ id: saved.id }, "Entity created");
    }),
  ),
  ReaderResult.map(({ saved }) => saved),
);

// option 2: tapDeps - ergonomic version with direct dependency access
pipe(
  ReaderResult.Do<ServiceDeps, DomainError>(),
  ReaderResult.bind("entity", () => createEntity(data)),
  ReaderResult.bind("saved", ({ entity }) => save(entity)),
  ReaderResult.tapDeps(({ saved }, deps) => {
    deps.logger.info({ id: saved.id }, "Entity created");
  }),
  ReaderResult.map(({ saved }) => saved),
);
```

**Note:** `pipe` from `@satoshibits/functional/composition` supports up to 6 functions. For longer chains, combine the tap and map into a single `chain` step:

```typescript
// when you have 6+ steps, combine tap + map:
ReaderResult.chain(({ saved }: { saved: Entity }) =>
  ReaderResult.asks<ServiceDeps, DomainError, Entity>((deps) => {
    deps.logger.info({ id: saved.id }, "Entity created");
    return saved;
  }),
);
```

### 4.5 Full Service Example

```typescript
import { pipe, ReaderResult, liftDomain } from "@aptivo/domain";
import { createEntity, validateUniqueness } from "../domain/entity";
import {
  type EntityError,
  persistenceError,
  forbiddenError,
} from "../domain/errors";

export interface EntityServiceDeps extends BaseDependencies {
  entityRepo: EntityRepository;
}

const requirePermission = (
  permission: string,
): ReaderResult<EntityServiceDeps, EntityError, void> =>
  ReaderResult.asks((deps) => {
    if (!hasPermission(deps.identity, permission)) {
      throw forbiddenError("operation");
    }
  });

export const createNewEntity = (
  data: unknown,
): ReaderResult<EntityServiceDeps, EntityError, Entity> =>
  pipe(
    ReaderResult.Do<EntityServiceDeps, EntityError>(),
    // 1. check permission
    ReaderResult.bind("_perm", () => requirePermission("entity:manage")),
    // 2. validate and create domain object
    ReaderResult.bind("entity", () =>
      ReaderResult.asks((deps) => {
        const result = createEntity(data, {
          userId: deps.identity.userId,
          tenantId: deps.identity.tenantId,
        });
        if (!result.success) throw result.error;
        return result.data;
      }),
    ),
    // 3. check uniqueness
    ReaderResult.bind("existing", ({ entity }) =>
      ReaderResult.tryCatch(
        (deps) =>
          deps.entityRepo.findByName(entity.name, deps.identity.tenantId),
        (e) => persistenceError("findByName", e as Error),
      ),
    ),
    ReaderResult.bind("_unique", ({ existing, entity }) =>
      ReaderResult.fromResult(validateUniqueness(existing, entity.name)),
    ),
    // 4. persist
    ReaderResult.bind("saved", ({ entity }) =>
      ReaderResult.tryCatch(
        (deps) => deps.entityRepo.create(entity),
        (e) => persistenceError("create", e as Error),
      ),
    ),
    // 5. log success and return (combined to stay within pipe's 6-function limit)
    ReaderResult.chain(({ saved }: { saved: Entity }) =>
      ReaderResult.asks<EntityServiceDeps, EntityError, Entity>((deps) => {
        deps.logger.info({ id: saved.id, name: saved.name }, "Entity created");
        return saved;
      }),
    ),
  );
```

## 5. Testing ReaderResult

Tests become simpler because you can:

1. Test each step independently
2. Provide mock dependencies directly
3. No module-level mocking needed

```typescript
import { describe, it, expect } from "vitest";
import { ReaderResult } from "@aptivo/domain";
import { createNewEntity, type EntityServiceDeps } from "./entity-service";

describe("createNewEntity", () => {
  const createMockDeps = (
    overrides?: Partial<EntityServiceDeps>,
  ): EntityServiceDeps => ({
    identity: {
      userId: "user-1",
      tenantId: "tenant-1",
      permissions: ["entity:manage"],
      // ...
    },
    logger: { info: vi.fn(), error: vi.fn() /* ... */ },
    tracer: {
      /* ... */
    },
    requestId: "req-1",
    entityRepo: {
      findByName: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((e) => Promise.resolve(e)),
    },
    ...overrides,
  });

  it("should create entity successfully", async () => {
    const deps = createMockDeps();

    const result = await ReaderResult.run(deps)(
      createNewEntity({ name: "Test" }),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Test");
    }
  });

  it("should fail without permission", async () => {
    const deps = createMockDeps({
      identity: { ...createMockDeps().identity, permissions: [] },
    });

    const result = await ReaderResult.run(deps)(
      createNewEntity({ name: "Test" }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error._tag).toBe("ForbiddenError");
    }
  });
});
```

## 6. API Route Integration

```typescript
// route.ts
import { ReaderResult } from "@aptivo/domain";
import {
  createNewEntity,
  type EntityServiceDeps,
} from "@/modules/entity/application/entity-service";

export async function POST(request: NextRequest) {
  const deps: EntityServiceDeps = {
    identity: await getIdentity(request),
    logger: logger.child({ requestId }),
    tracer,
    requestId,
    entityRepo: createEntityRepository(db, logger),
  };

  const body = await request.json();
  const result = await ReaderResult.run(deps)(createNewEntity(body));

  if (!result.success) {
    const problem = toProblemDetails(toAppError(result.error), request.url);
    return NextResponse.json(problem, {
      status: problem.status,
      headers: { "Content-Type": "application/problem+json" },
    });
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
```

## 7. Decision Tree

```
Need to perform an operation with dependencies and error handling?
│
├─ Is it a pure computation? → Use `ReaderResult.let()`
│
├─ Does it need dependencies? → Use `ReaderResult.asks()` or `ReaderResult.ask()`
│
├─ Does it return Result<T, E>? → Use `ReaderResult.fromResult()`
│
├─ Is it an async operation that might throw?
│   └─ Yes → Use `ReaderResult.tryCatch()`
│
├─ Is it a non-critical side effect (logging)?
│   └─ Yes → Use `ReaderResult.tap()` or `ReaderResult.tapDeps()`
│
└─ Does it return ReaderResult? → Use `ReaderResult.bind()`
```

## 8. Common Mistakes

### ❌ Don't throw in `tap`

```typescript
// BAD: tap should be non-critical
ReaderResult.tap(() => {
  if (condition) throw error; // Don't do this
});
```

### ❌ Don't forget to handle the Result from domain functions

```typescript
// BAD: ignores the Result wrapper
ReaderResult.bind(
  "entity",
  () => ReaderResult.asks((deps) => createEntity(data, context)), // Returns Result, not Entity!
);

// GOOD: handle the Result
ReaderResult.bind("entity", () =>
  ReaderResult.asks((deps) => {
    const result = createEntity(data, context);
    if (!result.success) throw result.error;
    return result.data;
  }),
);
```

### ❌ Don't use ReaderResult.run inside a ReaderResult chain

```typescript
// BAD: breaks the dependency chain
ReaderResult.bind("result", () =>
  ReaderResult.asks(async (deps) => {
    return await ReaderResult.run(deps)(otherOperation()); // Wrong!
  }),
);

// GOOD: compose directly
ReaderResult.bind("result", () => otherOperation());
```

## 9. Reference

Full API documentation is available in the source:

- `@satoshibits/functional/reader-result`
- `@satoshibits/functional/composition`

Key exports from `@aptivo/domain`:

- `ReaderResult` - The main namespace with all combinators
- `liftDomain` - Lift Result-returning functions
- `liftAsync` - Lift async throwing functions
- `pipe` - Function composition

## 10. Migration Checklist

When converting from factory function pattern:

- [ ] Define `ServiceDeps` interface with explicit repository dependencies
- [ ] Create permission check helper using `ReaderResult.asks`
- [ ] Convert each service method to a ReaderResult-returning function
- [ ] Use `pipe` with Do notation to compose steps
- [ ] Replace `if (!result.success) return result` with `ReaderResult.bind`
- [ ] Update route handlers to use `ReaderResult.run(deps)(operation)`
- [ ] Update tests to provide mock deps directly to `ReaderResult.run`
