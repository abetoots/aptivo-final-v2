# TSD - Development Environment Setup
# Crypto Trading AI Agent Ecosystem

**Module**: Development Environment
**Version**: 2.0
**Last Updated**: January 15, 2026
**Status**: Complete
**References**: BRD v2.3, FRD v4.0, ADD v2.1

[← Back to TSD Root](./04-TSD-Root.md)

---

## Overview

This module defines the complete development environment setup for the Crypto Trading AI Agent Ecosystem, implementing NFR-MAINT-001 from FRD v4.0 (strict TypeScript with automated code quality checks).

> **Runtime Note:** This project targets Node.js 22 LTS with native ESM support. All configurations use modern ESM module resolution.

**Contents:**
- 5.1: TypeScript Configuration (strict mode, ESM)
- 5.2: ESLint Configuration (Flat Config for ESLint 9)
- 5.3: Prettier Configuration
- 5.4: Pre-commit Hooks (Husky 9 + lint-staged)
- 5.5: Package.json Scripts

---

## 5.1 TypeScript Configuration

**File:** `tsconfig.json`

**Purpose:** Enforce strict type safety with modern ESM module resolution for Node.js 22.

```json
{
  "compilerOptions": {
    // Strict Type Checking
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,

    // Additional Checks
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,

    // Module Resolution (ESM for Node.js 22)
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "resolveJsonModule": true,

    // Path Mapping (aligns with ADD v2.1 hybrid structure)
    "baseUrl": ".",
    "paths": {
      "@workflows/*": ["src/workflows/*"],
      "@shared/*": ["src/shared/*"],
      "@api/*": ["src/api/*"],
      "@types/*": ["src/shared/types/*"]
    },

    // Output
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,

    // Other
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.spec.ts"]
}
```

**Key Settings Explained:**

- **`strict: true`**: Enables all strict type checking options (NFR-MAINT-001 requirement)
- **`module: NodeNext`**: Native ESM support for Node.js 22 LTS
- **`moduleResolution: NodeNext`**: Modern resolution algorithm for ESM imports
- **`noUnusedLocals/Parameters`**: Catches dead code early
- **`noImplicitReturns`**: Ensures all code paths return a value
- **`noUncheckedIndexedAccess`**: Prevents runtime errors from array/object access
- **`verbatimModuleSyntax`**: Enforces explicit `type` imports for type-only imports
- **Path Mapping**: Aligns with ADD v2.1 hybrid structure (`/workflows`, `/shared`)

> **ESM Import Note:** With `NodeNext`, all relative imports must include file extensions (e.g., `import { thing } from './service.js'`). TypeScript resolves `.js` extensions to `.ts` files during development.

---

## 5.2 ESLint Configuration

**File:** `eslint.config.js` (ESLint 9 Flat Config)

**Purpose:** Enforce code quality standards and catch common errors using ESLint 9's modern flat config format.

```javascript
// eslint.config.js
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  // Base configurations
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  // Global ignores
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },

  // TypeScript configuration
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Main rules
  {
    plugins: {
      import: importPlugin,
    },
    rules: {
      // TypeScript Specific
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // Import Rules
      'import/order': ['error', {
        groups: [
          'builtin',
          'external',
          'internal',
          ['parent', 'sibling'],
          'index',
        ],
        pathGroups: [
          { pattern: '@workflows/**', group: 'internal' },
          { pattern: '@shared/**', group: 'internal' },
          { pattern: '@api/**', group: 'internal' },
        ],
        alphabetize: { order: 'asc' },
      }],
      'import/no-duplicates': 'error',

      // General Code Quality
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // Prettier must be last to disable conflicting style rules
  prettierConfig
);
```

**Key Rules Explained:**

- **`no-explicit-any: error`**: Prevents use of `any` type (NFR-MAINT-001)
- **`no-floating-promises: error`**: Ensures all promises are awaited or caught
- **`import/order`**: Enforces consistent import organization
- **`no-console: warn`**: Prevents accidental console.log in production
- **`projectService: true`**: ESLint 9's efficient TypeScript project service

**Installation:**
```bash
npm install --save-dev \
  eslint@^9.0.0 \
  typescript-eslint@^8.0.0 \
  eslint-plugin-import@^2.31.0 \
  eslint-config-prettier@^9.0.0
```

> **Migration Note:** ESLint 9 uses flat config by default. The legacy `.eslintrc.*` format is deprecated. If migrating from ESLint 8, use `npx @eslint/migrate-config .eslintrc.json` for assistance.

---

## 5.3 Prettier Configuration

**File:** `.prettierrc.json`

**Purpose:** Enforce consistent code formatting across the team.

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "avoid",
  "bracketSpacing": true,
  "endOfLine": "lf"
}
```

**File:** `.prettierignore`

```
node_modules
dist
build
coverage
.next
*.md
package-lock.json
```

**Installation:**
```bash
npm install --save-dev prettier
```

**VS Code Integration:**

Create `.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

---

## 5.4 Pre-commit Hooks

**Purpose:** Automatically lint and format code before commits using Husky 9 and lint-staged.

> **Husky 9 Note:** Husky 9 no longer uses `package.json` configuration. All hooks are shell scripts in the `.husky/` directory.

**Installation:**
```bash
npm install --save-dev husky@^9.0.0 lint-staged@^15.0.0
npx husky init
```

**Configure lint-staged in `package.json`:**
```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md}": [
      "prettier --write"
    ]
  }
}
```

**Create Husky Hooks:**

**File:** `.husky/pre-commit`
```bash
npx lint-staged
```

**File:** `.husky/pre-push`
```bash
npm run typecheck && npm test
```

**Setup Commands:**
```bash
# Create pre-commit hook
echo "npx lint-staged" > .husky/pre-commit

# Create pre-push hook (includes tests)
echo "npm run typecheck && npm test" > .husky/pre-push
```

**How It Works:**

1. **Before commit**: Runs ESLint (--fix) and Prettier on staged files only
2. **Before push**: Runs full TypeScript type checking AND test suite
3. **Commit blocked**: If linting or formatting fails

**Benefits:**
- Prevents committing code with linting errors
- Ensures consistent formatting across team
- Catches type errors and test failures before CI/CD
- Only lints staged files (fast commits)

---

## 5.5 Package.json Scripts

**File:** `package.json` (partial)

**Purpose:** Standardized npm scripts for development workflow with ESM support.

```json
{
  "name": "crypto-trading-ai-agent-ecosystem",
  "type": "module",
  "scripts": {
    "dev": "tsx --watch src/index.ts",
    "dev:debug": "tsx --watch --inspect src/index.ts",

    "build": "tsc",
    "build:clean": "rm -rf dist && npm run build",

    "lint": "eslint src",
    "lint:fix": "eslint src --fix",
    "format": "prettier --write \"src/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\"",

    "typecheck": "tsc --noEmit",

    "test": "vitest run",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest",

    "migrate:up": "node-pg-migrate up",
    "migrate:down": "node-pg-migrate down",
    "migrate:create": "node-pg-migrate create",

    "prebuild": "npm run lint && npm run typecheck",
    "prepare": "husky",

    "start": "node dist/index.js",
    "start:prod": "NODE_ENV=production node dist/index.js"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "eslint": "^9.0.0",
    "eslint-config-prettier": "^9.0.0",
    "eslint-plugin-import": "^2.31.0",
    "husky": "^9.0.0",
    "lint-staged": "^15.0.0",
    "node-pg-migrate": "^7.0.0",
    "prettier": "^3.0.0",
    "tsx": "^4.7.0",
    "typescript": "^5.6.0",
    "typescript-eslint": "^8.0.0",
    "vitest": "^2.0.0",
    "@vitest/ui": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0"
  }
}
```

> **ESM Note:** The `"type": "module"` field enables native ESM. All `.js` files are treated as ES modules.

**Script Usage:**

**Development:**
```bash
npm run dev           # Start dev server with hot reload
npm run dev:debug     # Start with Node.js debugger
```

**Code Quality:**
```bash
npm run lint          # Check for linting errors
npm run lint:fix      # Auto-fix linting errors
npm run format        # Format all TypeScript files
npm run typecheck     # Run TypeScript compiler (no emit)
```

**Testing:**
```bash
npm test              # Run tests
npm run test:ui       # Open Vitest UI
npm run test:coverage # Generate coverage report
```

**Database:**
```bash
npm run migrate:up              # Run pending migrations
npm run migrate:down            # Rollback last migration
npm run migrate:create my_migration  # Create new migration
```

**Production:**
```bash
npm run build         # Compile TypeScript to /dist
npm start             # Run compiled code
```

---

## IDE Configuration Recommendations

### VS Code Extensions

**Required:**
- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

**Recommended:**
- [Error Lens](https://marketplace.visualstudio.com/items?itemName=usernamehw.errorlens) - Inline error highlighting
- [Pretty TypeScript Errors](https://marketplace.visualstudio.com/items?itemName=yoavbls.pretty-ts-errors)
- [GitLens](https://marketplace.visualstudio.com/items?itemName=eamodio.gitlens)
- [Vitest](https://marketplace.visualstudio.com/items?itemName=vitest.explorer) - Test explorer integration

### JetBrains IDEs (WebStorm, IntelliJ)

**Settings:**
1. Enable "ESLint" in **Settings → Languages & Frameworks → JavaScript → Code Quality Tools**
2. Enable "Prettier" in **Settings → Languages & Frameworks → JavaScript → Prettier**
3. Check "Run eslint --fix on save"
4. Check "On code reformat" for Prettier

---

## Troubleshooting

### Issue: ESLint "Cannot find tsconfig.json"

**Solution (ESLint 9 Flat Config):**
Ensure `parserOptions.tsconfigRootDir` points to the project root in `eslint.config.js`:
```javascript
languageOptions: {
  parserOptions: {
    projectService: true,
    tsconfigRootDir: import.meta.dirname,
  },
},
```

### Issue: Husky hooks not running

**Solution (Husky 9):**
```bash
# Reinitialize Husky
rm -rf .husky
npx husky init
echo "npx lint-staged" > .husky/pre-commit
echo "npm run typecheck && npm test" > .husky/pre-push
```

### Issue: TypeScript path aliases not resolving at runtime

**Solution:**
With ESM (`NodeNext`), `tsx` v4 handles path aliases automatically via `tsconfig.json` paths. If issues persist:
```bash
# For production builds, use a bundler or tsc-alias
npm install --save-dev tsc-alias

# Update build script
"build": "tsc && tsc-alias"
```

### Issue: ESM import errors ("ERR_MODULE_NOT_FOUND")

**Solution:**
ESM requires file extensions in imports. Update imports to include `.js`:
```typescript
// Before (CommonJS style)
import { service } from './service';

// After (ESM style)
import { service } from './service.js';
```

TypeScript resolves `.js` to `.ts` files during compilation.

### Issue: Prettier and ESLint conflicts

**Solution (ESLint 9 Flat Config):**
Ensure `prettierConfig` is spread last in `eslint.config.js`:
```javascript
export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettierConfig,  // Must be last
  // ... other configs
);
```

---

## Verification Checklist

After setup, verify all configurations work:

```bash
# 1. TypeScript compiles without errors
npm run typecheck

# 2. ESLint runs without errors
npm run lint

# 3. Prettier formats code
npm run format:check

# 4. Tests run
npm test

# 5. Build succeeds
npm run build

# 6. Pre-commit hooks work
git add .
git commit -m "test: verify hooks"  # Should auto-lint
```

**Expected Result:** All commands should complete successfully with no errors.

---

## Next Steps

1. Install dependencies: `npm install`
2. Configure your IDE with recommended extensions
3. Run verification checklist
4. Begin development following ADD v2.1 hybrid structure:
   - `/src/workflows/` - Feature-based workflow modules
   - `/src/shared/` - Cross-cutting services

---

**Related Modules:**
- [TSD-Configuration.md](./04-TSD-Configuration.md) - Environment variables setup
- [TSD-Services.md](./04-TSD-Services.md) - Shared service implementations
- [TSD-DevOps.md](./04-TSD-DevOps.md) - CI/CD pipeline configuration

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-20 | Initial | Initial development environment specification |
| 2.0 | 2026-01-15 | Multi-model Review | Major modernization: migrated to ESM (NodeNext module resolution), updated ESLint to v9 flat config format (eslint.config.js), updated Husky to v9 (.husky/ directory), updated all package versions (@types/node ^22, typescript-eslint ^8, vitest ^2, tsx ^4), removed TypeScript Vue Plugin recommendation, added ESM troubleshooting section, updated document references to FRD v4.0 and ADD v2.1 |

