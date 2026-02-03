# Application Design Document (ADD)

## Crypto Trading AI Agent Ecosystem

**Version**: 2.1
**Date**: January 2025
**Status**: Final

**Revision History:**

- **v2.1**: BRD/FRD v4.0 alignment - Alert latency updated to 30 seconds, L2-first blockchain strategy, Phase 0 backtesting + Phase 2.5 paper trading, LLM budget $300-500/month, removed legacy password/MFA remnants from entity types
- **v2.0 (MAJOR REFACTOR)**: Passwordless authentication (WebAuthn + OAuth), architectural pattern consolidation, library decision integration
  - **BREAKING**: Replaced password-based authentication with passwordless (WebAuthn/Passkeys + OAuth) - ADR-005
  - **Pattern Focus**: Refactored to emphasize architectural patterns over library choices, deferred implementation details to TSD
  - **Section Updates**:
    - 5.3: Added Kysely type-safe SQL pattern
    - 6.5: Replaced manual Result type with @satoshibits/functional library pattern
    - 7.2: Added HTTP client composition pattern (resilience + validation + error handling)
    - 8.3: CRITICAL REWRITE - Passwordless authentication replacing password + MFA flow
    - 8.3: JWT pattern updated to jose library (Web Crypto API-based)
    - 9.1: Replaced Winston with Pino structured logging pattern
    - 10.1.1: NEW - Resilience patterns (cockatiel for retry, circuit breaker, timeout)
    - 10.4: Replaced express-rate-limit with rate-limiter-flexible (distributed Redis-backed)
    - 10.5: NEW - Schema-based validation pattern (Zod integration with Result<T,E>)
    - 10.6: NEW - Async task queues (@satoshibits/queue abstraction with BullMQ)
  - **Deleted**: Section 10.6 (old 10.5) - Merged library decisions into appropriate architectural sections
  - **Appendices**: Added ADR-005 documenting passwordless authentication architectural override
  - **FRD Alignment**: Updated references from FRD v4.0 to FRD v4.0 (passwordless authentication)
- v1.1: Added Result type pattern for error handling, hybrid file structure, ADR-004 (consensus decisions from architectural review)
- v1.0: Initial ADD defining system architecture, LangGraph patterns, component design, deployment topology

---

## Document Purpose & Boundaries

### What This ADD Defines (HOW):

This Application Design Document defines **HOW** the Crypto Trading AI Agent Ecosystem is architected and designed to meet the functional requirements specified in the FRD v4.0.

**Scope:**

- System architecture and component structure
- LangGraph.js state machine patterns for all 6 trading workflows
- TypeScript type system and core interfaces
- Technology stack selection and rationale
- Deployment architecture and topology
- Integration patterns (LLM providers, MCP servers, external services)
- Security architecture and authentication flows
- Observability and monitoring patterns

### What This ADD Does NOT Define (HOW EXACTLY):

Implementation details are deferred to the Technical Specification Document (TSD):

- Database schemas (SQL CREATE TABLE statements) → See TSD
- API endpoint specifications (REST/WebSocket contracts) → See TSD
- CI/CD pipeline configuration (YAML files) → See TSD
- Development tool configurations (tsconfig.json, ESLint, Prettier) → See TSD
- Step-by-step deployment procedures → See TSD
- Detailed environment variable specifications → See TSD

### Document Conventions:

- **FRD References**: Requirements referenced by ID (e.g., FR-SMT-001, NFR-PERF-001)
- **Architecture Diagrams**: Mermaid format for system topology
- **TypeScript Interfaces**: Core abstractions showing patterns (not full implementation)
- **Code Examples**: Illustrative patterns, not production-ready code

### Relationship to Other Documents:

```
BRD (WHY)
   ↓
FRD v4.0 (WHAT)
   ↓
ADD v1.1 (HOW) ← Current document
   ↓
TSD (HOW EXACTLY)
```

---

## Table of Contents

1. [Document Purpose & Boundaries](#document-purpose--boundaries)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Technology Stack Justification](#3-technology-stack-justification)
4. [LangGraph.js State Machine Architecture](#4-langgraphjs-state-machine-architecture)
5. [Component Design & Module Structure](#5-component-design--module-structure)
6. [Type System & Interfaces](#6-type-system--interfaces)
7. [Integration Architecture](#7-integration-architecture)
8. [Deployment Architecture & Security](#8-deployment-architecture--security)
9. [Observability & Monitoring](#9-observability--monitoring)
10. [Cross-Cutting Concerns](#10-cross-cutting-concerns)
11. [Appendices](#11-appendices)

---

## 2. System Architecture Overview

### 2.1 Architecture Principles

The system is built on the following core principles:

**Event-Driven State Machines**

- Each trading workflow implemented as a LangGraph state machine
- State transitions triggered by events (on-chain transactions, breakouts, user approvals)
- State persistence enables recovery from failures (NFR-REL-002)

**Separation of Concerns**

- **Frontend Layer**: User interface and visualization
- **Backend Layer**: Workflow orchestration and business logic
- **Data Layer**: Persistent storage and caching
- **Integration Layer**: External services (LLM, MCP, notifications)

**LLM-Agnostic Design** (FR-LLM-001)

- Provider abstraction layer enables runtime switching
- No hard dependencies on specific LLM vendors
- Fallback strategy for high availability

**MCP-Based Integration** (FR-MCP-001)

- External data sources accessed via Model Context Protocol
- Standardized tool invocation across providers
- Caching and rate limiting at MCP layer

**Human-in-the-Loop** (FR-HITL-001)

- Mandatory approval gates for all trade executions
- Multi-channel delivery (web, Telegram, mobile push)
- Audit trail for regulatory compliance

### 2.2 System Topology

```mermaid
graph TB
    User[User]
    Frontend[Frontend Layer<br/>Next.js + React<br/>Vercel]
    Backend[Backend Layer<br/>Node.js + LangGraph<br/>Railway]
    DB[(Database<br/>PostgreSQL)]
    Cache[(Cache<br/>Redis)]
    LLM[LLM Providers<br/>OpenAI, Anthropic, Google]
    MCP[MCP Servers<br/>The Graph, CoinGecko, etc.]
    External[External Services<br/>Email, Telegram, Push]

    User --> Frontend
    Frontend --> Backend
    Backend --> DB
    Backend --> Cache
    Backend --> LLM
    Backend --> MCP
    Backend --> External

    style Frontend fill:#e1f5ff
    style Backend fill:#fff4e1
    style DB fill:#f0f0f0
    style Cache fill:#f0f0f0
    style LLM fill:#ffe1f5
    style MCP fill:#e1ffe1
    style External fill:#f5e1ff
```

### 2.3 Core Components

**Frontend Layer** (Vercel)

- Next.js application with React components
- Server-side rendering for SEO and performance
- WebSocket connection for real-time alerts
- SWR for client-side data fetching

**Backend Layer** (Railway)

- Node.js runtime with TypeScript
- LangGraph workflow engine
- REST API for frontend requests
- WebSocket server for real-time push
- Background job scheduler (cron)

**Data Layer** (Railway)

- PostgreSQL 15+ for relational data
- Redis 7+ for caching and pub/sub
- Connection pooling (PgBouncer)
- Automatic backups (daily)

**Integration Layer**

- LLM Service: Abstraction over multiple providers
- MCP Service: MCP server registry and invocation
- Notification Service: Email, Telegram, mobile push
- Auth Service: User authentication and session management

**External Services**

- Email: SendGrid or AWS SES
- Telegram: Bot API with webhook
- Push: Firebase Cloud Messaging (FCM)
- Monitoring: Sentry for errors, Railway for logs

---

## 3. Technology Stack Justification

### 3.1 Framework: LangGraph.js

**Selected**: LangGraph.js (TypeScript-based state machine framework)

**Rationale**:

- **Cyclical Workflow Support**: All 6 trading workflows require stateful, event-driven patterns with loops
- **TypeScript Native**: First-class TypeScript support reduces bugs, improves DX
- **State Persistence**: Built-in checkpointing for fault tolerance (NFR-REL-002)
- **Production-Ready**: Mature ecosystem, active development, good documentation
- **LangChain Integration**: Seamless integration with LLM providers

**Supports FRD Requirements**:

- FR-SMT-001 to FR-SMT-006 (Smart Money Tracking)
- FR-NS-001 to FR-NS-007 (Narrative Scouting)
- FR-SEC-001 to FR-SEC-008 (Security Detection)
- FR-BT-001 to FR-BT-015 (Backtesting, Breakout Trading)
- FR-PM-001 to FR-PM-006 (Portfolio Management)

**Alternatives Considered**:

- **Custom State Machines**: Too complex to build and maintain
- **Temporal**: Workflow orchestration overkill, heavy infrastructure
- **n8n**: Low-code platform, not suitable for code-first development
- **Apache Airflow**: Designed for data pipelines, not real-time agentic workflows

**Decision**: LangGraph.js selected for cyclical workflow support and TypeScript integration.

### 3.2 Runtime: Node.js + TypeScript

**Selected**: Node.js 22 LTS (or latest LTS at project start) + TypeScript 5.x

**Rationale**:

- **Async/Await**: Non-blocking I/O ideal for API-heavy workflows
- **Ecosystem Maturity**: Rich package ecosystem (npm), battle-tested libraries
- **Strong Typing**: TypeScript catches bugs at compile-time (NFR-MAINT-001)
- **Developer Experience**: Fast iteration, hot reload, excellent tooling
- **LangGraph Compatibility**: LangGraph.js is Node.js native

**Supports FRD Requirements**:

- NFR-MAINT-001 (Code quality)
- NFR-PERF-001 to NFR-PERF-006 (Performance targets)
- Rapid development velocity for MVP timeline

**Alternatives Considered**:

- **Python**: Stronger ML/AI ecosystem, but slower async performance, weaker typing
- **Go**: Fast and efficient, but smaller AI/LLM library ecosystem
- **Rust**: Maximum performance, but steep learning curve, slower development

**Decision**: Node.js + TypeScript balances performance, ecosystem, and development speed.

### 3.3 Database: PostgreSQL 15+

**Selected**: PostgreSQL 15+ (managed by Railway)

**Rationale**:

- **ACID Compliance**: Critical for trade execution integrity
- **JSONB Support**: Flexible storage for AI reasoning, nested data structures
- **Full-Text Search**: Efficient narrative and post searching
- **Mature Ecosystem**: Proven reliability, extensive tooling, strong community
- **Scalability**: Handles growth from MVP to Phase 3 (NFR-SCALE-004)

**Supports FRD Requirements**:

- NFR-COMP-002 (7-year trade retention)
- NFR-REL-003 (Data backup and recovery)
- NFR-PERF-006 (Database query performance)
- Section 7.1 (All data entities)

**Alternatives Considered**:

- **MongoDB**: No ACID guarantees for trades, eventual consistency risks
- **MySQL**: Weaker JSONB support compared to PostgreSQL
- **DynamoDB**: NoSQL, higher costs, more complex for relational queries

**Decision**: PostgreSQL chosen for ACID compliance and JSONB flexibility.

### 3.4 Cache: Redis 7+

**Selected**: Redis 7+ (managed by Railway)

**Rationale**:

- **In-Memory Speed**: Sub-millisecond latency for hot data
- **Pub/Sub Support**: Real-time alert broadcasting (FR-HITL-002)
- **Stream Support**: Ordered event logs for audit trail
- **Proven Scalability**: Handles high throughput (NFR-SCALE-001)
- **Rich Data Structures**: Sets, sorted sets, hashes for flexible caching

**Supports FRD Requirements**:

- FR-MCP-004 (MCP response caching with TTLs)
- FR-HITL-002 (Real-time alert delivery)
- Section 7.2 (Caching requirements)

**Cache Strategy**:

- Price data: 1-minute TTL
- On-chain transactions: 5-minute TTL
- Social media posts: 15-minute TTL
- Security scans: 24-hour TTL
- Target cache hit rate: >60%

**Alternatives Considered**:

- **Memcached**: No pub/sub, no persistence, limited data structures
- **DynamoDB**: Higher cost, higher latency than Redis
- **Upstash**: Serverless Redis, good for edge but higher latency for centralized backend

**Decision**: Redis chosen for pub/sub and performance.

### 3.5 Frontend: Next.js 14+ + React

**Selected**: Next.js 14+ with React 18+

**Rationale**:

- **Server-Side Rendering**: Faster initial page loads (NFR-PERF-005)
- **API Routes**: Serverless functions for lightweight backend tasks
- **React Ecosystem**: Rich component library, excellent DX
- **TypeScript Support**: First-class TypeScript integration
- **Vercel Deployment**: Optimized for Next.js, seamless deployment

**Supports FRD Requirements**:

- NFR-PERF-005 (Dashboard load time <2s)
- NFR-UX-001 (Responsive design)
- NFR-UX-002 (Accessibility WCAG 2.1 AA)

**Alternatives Considered**:

- **Vite + React**: Faster dev server, but no SSR out-of-the-box
- **SvelteKit**: Smaller bundle sizes, but smaller ecosystem
- **Vue/Nuxt**: Good DX, but team prefers React

**Decision**: Next.js chosen for SSR and Vercel integration.

---

## 4. LangGraph.js State Machine Architecture

This section defines HOW each of the 6 trading workflows is implemented as LangGraph state machines.

### 4.1 LangGraph Fundamentals

**Core Concepts**:

- **State Graph**: Directed graph of nodes (functions) and edges (transitions)
- **State**: Data object passed between nodes, persisted at checkpoints
- **Nodes**: Functions that process state and return updated state
- **Edges**: Define transitions between nodes (conditional or unconditional)
- **Channels**: Named state attributes that flow through the graph

**Pattern Template**:

```typescript
import { StateGraph, END } from "@langchain/langgraph";

// 1. Define state interface
interface WorkflowState {
  data: SomeData;
  error?: Error;
}

// 2. Define node functions
async function nodeA(state: WorkflowState): Promise<WorkflowState> {
  // Process state
  return { ...state, data: processedData };
}

// 3. Build graph
const graph = new StateGraph({ channels: { data: null, error: null } });
graph.addNode("nodeA", nodeA);
graph.addNode("nodeB", nodeB);

// 4. Define edges
graph.addEdge("nodeA", "nodeB");
graph.addConditionalEdges("nodeB", routeLogic, {
  success: "nodeC",
  failure: END,
});

// 5. Set entry point and compile
graph.setEntryPoint("nodeA");
const workflow = graph.compile();
```

### 4.2 MVP Workflows

#### 4.2.1 Smart Money Tracking (FR-SMT-001 to FR-SMT-006)

**Purpose**: Monitor whale wallets for significant transactions and generate actionable alerts.

**State Definition**:

```typescript
interface SmartMoneyState {
  wallets: WalletAddress[];
  currentTransaction?: {
    walletAddress: string;
    blockchain: string;
    tokenSymbol: string;
    amount: number;
    direction: "buy" | "sell" | "transfer";
    usdValue: number;
    transactionHash: string;
    timestamp: Date;
  };
  alert?: {
    reasoning: string;
    confidenceScore: number;
    deliveryChannels: string[];
  };
  error?: Error;
}
```

**Workflow Graph**:

```
monitoring → analyzing → alerting → updating_history → monitoring (loop)
           ↓
         (skip if below threshold)
```

**Node Functions**:

**monitorWallets** (monitoring state):

- Poll on-chain indexer (The Graph MCP or equivalent) for monitored wallet transactions
- **L2-first strategy**: Prioritize Arbitrum, Base, Optimism, Polygon; include Ethereum L1, Solana, BSC as secondary
- Filter transactions exceeding USD threshold (default: $100,000)
- Transition to `analyzing` if significant transaction detected

**analyzeTransaction** (analyzing state):

- Query CoinGecko MCP for token price (USD conversion)
- Retrieve wallet historical behavior from database
- Invoke LLM to generate reasoning (2-3 sentences)
- Calculate confidence score (1-10) based on pattern strength
- Conditional edge: `shouldAlert` → `alerting` or `monitoring`

**generateAlert** (alerting state):

- Format alert with transaction details + AI reasoning
- Deliver via web dashboard, Telegram, Discord, email
- Target latency: <30 seconds from transaction confirmation (NFR-PERF-001)

**storeTransaction** (updating_history state):

- Persist transaction to `smart_money_transactions` table
- Update wallet behavior patterns
- Transition back to `monitoring`

**Error Handling**:

- The Graph MCP failure → Retry with exponential backoff, circuit breaker after 5 failures
- LLM provider failure → Fallback to secondary provider (FR-LLM-004)
- Database failure → Queue transaction for later persistence

---

#### 4.2.2 Narrative Scouting (FR-NS-001 to FR-NS-007)

**Purpose**: Identify emerging crypto narratives before mainstream awareness.

**State Definition**:

```typescript
interface NarrativeScoutingState {
  posts: SocialPost[];
  narrativeClusters: NarrativeCluster[];
  scoredNarratives: ScoredNarrative[];
  topNarratives: TopNarrative[];
  error?: Error;
}

interface SocialPost {
  id: string;
  platform: "twitter" | "reddit" | "telegram";
  author: string;
  content: string;
  engagement: number;
  timestamp: Date;
}

interface NarrativeCluster {
  id: string;
  posts: SocialPost[];
  semanticVector: number[];
  theme: string;
}
```

**Workflow Graph**:

```
scanning → clustering → scoring → filtering → enriching → alerting → (wait 15min) → scanning
```

**Node Functions**:

**scanSocialMedia** (scanning state):

- Query LunarCrush MCP, Twitter API, Reddit API, Telegram API
- Collect minimum 10,000 posts per cycle (NFR-SCALE-003)
- Filter crypto-specific keywords and hashtags
- Target cycle time: <15 minutes (NFR-PERF-002)

**clusterPosts** (clustering state):

- Use LLM embeddings for semantic similarity
- Group posts into narrative clusters
- Assign theme labels automatically

**scoreNarratives** (scoring state):

- Calculate strength score using weighted formula:
  - Engagement Velocity (40%): Rate of likes, retweets, comments
  - Influencer Participation (30%): Weighted by follower count
  - Unique Participants (20%): Number of unique authors
  - Token Correlation (10%): Strength of token mentions
- Rank narratives by score (descending)

**filterDuplicates** (filtering state):

- Detect and merge near-duplicate narratives (semantic similarity threshold)
- Ensure top 10 narratives are distinct

**enrichNarratives** (enriching state):

- Extract token mentions (ticker symbols, contract addresses)
- Validate token legitimacy (filter scam tokens)
- Identify key influencers driving narrative

**deliverNarratives** (alerting state):

- Display top 10 narratives on dashboard
- Highlight narratives with >20% score increase (24h)
- Optional push notifications for new narratives entering top 10

**State Persistence**:

- Narratives cached for 1 year (Section 7.3)
- Social posts retained for 7 days only

---

#### 4.2.3 Security & Scam Detection (FR-SEC-001 to FR-SEC-008)

**Purpose**: Automated security analysis to detect honeypots, rug pulls, and malicious contracts.

**State Definition**:

```typescript
interface SecurityCheckState {
  tokenAddress: string;
  blockchain: string;
  contractAnalysis?: {
    honeypotDetected: boolean;
    hiddenFees: boolean;
    blacklistFunctions: boolean;
    centralizedControl: boolean;
  };
  liquidityCheck?: {
    lpLocked: boolean;
    lpBurned: boolean;
    liquidityDepthUSD: number;
  };
  teamVerification?: {
    doxxed: boolean;
    githubActivity: boolean;
    previousProjects: string[];
    redFlags: string[];
  };
  riskScore?: "Low" | "Medium" | "High" | "Critical";
  report?: SecurityReport;
  blocked: boolean;
}
```

**Workflow Graph**:

```
initiated → contract_analysis → liquidity_check → team_verification → risk_scoring
                                                                            ↓
                                                     (risk >= High) → blocking → reporting → complete
                                                     (risk < High) → reporting → complete
```

**Node Functions**:

**analyzeContract** (contract_analysis state):

- Query Etherscan/BscScan/Solscan API for contract bytecode
- Invoke GoPlus Security API for honeypot detection
- Scan for: hidden fees, blacklist functions, unlimited minting, selfdestruct
- Flag centralized control vulnerabilities

**checkLiquidity** (liquidity_check state):

- Query DexScreener API for liquidity pool data
- Verify LP lock status (locked, burned, or unlocked)
- Check minimum liquidity threshold (default: $50,000 USD)
- Monitor liquidity depth for market depth

**verifyTeam** (team_verification state):

- Search for doxxed team members (LinkedIn, Twitter, project website)
- Verify team history: previous projects, GitHub activity
- Flag red flags: anonymous team, fake profiles, no verifiable history

**calculateRisk** (risk_scoring state):

- Assign risk level based on findings:
  - **Low**: All checks pass
  - **Medium**: 1-2 minor concerns
  - **High**: Multiple red flags
  - **Critical**: Confirmed scam indicators
- Conditional edge: risk >= High → `blocking`, risk < High → `reporting`

**blockToken** (blocking state):

- Automatically block trade signals for high-risk tokens
- Notify user with detailed reasoning and evidence
- Log block decision to audit trail
- Allow manual override with explicit confirmation

**generateReport** (reporting state):

- Compile security report with evidence
- Include: contract analysis, liquidity status, team verification, risk score
- Attach report to trade signals for user review
- Store report for historical reference

**Performance Target**: <30 seconds (NFR-PERF-003)

---

### 4.3 Post-MVP Workflows

#### 4.3.1 Backtesting & Simulation (FR-BT-001 to FR-BT-005)

**Purpose**: Validate trading strategies against historical data before deploying real capital.

**State Definition**:

```typescript
interface BacktestingState {
  config: {
    strategyParams: StrategyParams;
    riskSettings: RiskSettings;
    timeRange: { start: Date; end: Date };
    assetPair: string;
  };
  ohlcvData?: OHLCV[];
  trades?: SimulatedTrade[];
  metrics?: {
    totalTrades: number;
    winRate: number;
    profitFactor: number;
    maxDrawdown: number;
    sharpeRatio: number;
    totalReturn: number;
  };
  approved: boolean;
}
```

**Workflow Graph**:

```
configuration → data_loading → simulation_running → metrics_calculation → reporting
                                                                              ↓
                                                        (user modifies) → configuration
                                                        (user approves) → strategy_approval → complete
```

**Node Functions**:

**loadHistoricalData** (data_loading state):

- Fetch OHLCV data from Exchange MCP (Binance, Coinbase, etc.)
- Validate data integrity: check for gaps, missing candles, outliers
- Handle data adjustments if applicable

**executeSimulation** (simulation_running state):

- Apply strategy logic on historical data: detect entry signals, apply stop/target
- Simulate order fills using OHLC prices
- Apply configurable slippage (default: 0.1%)
- Track portfolio state: cash balance, positions, realized P&L
- Log every trade: entry price, exit price, P&L, reasoning

**calculateMetrics** (metrics_calculation state):

- Compute performance metrics:
  - Total trades, win rate (%)
  - Profit factor (gross profit / gross loss)
  - Max drawdown (%)
  - Sharpe ratio
  - Total return (%)

**checkApprovalCriteria** (reporting state):

- Display approval criteria thresholds:
  - Win rate > 35%
  - Profit factor > 1.5
  - Max drawdown < 25%
  - Sharpe ratio > 1.0
  - Minimum 50 trades
- Provide visual indicators: green checkmarks for passed, red X for failed
- Allow user to proceed to live trading only if criteria met (or manual override with warning)

**Performance Target**: <5 minutes for 6 months of 1-hour candle data

---

#### 4.3.2 Systematic Breakout Trading (FR-BT-006 to FR-BT-015)

**Purpose**: Semi-autonomous trading workflow with breakout pattern detection and HITL approval.

**State Definition**:

```typescript
interface BreakoutTradingState {
  watchlist: TokenSymbol[];
  signal?: {
    tokenSymbol: string;
    currentPrice: number;
    entryPrice: number;
    positionSizeUSD: number;
    stopLoss: number;
    takeProfit: number;
    confidenceScore: number;
    reasoning: string;
  };
  securityCheck?: SecurityCheckState; // Sub-graph invocation
  hitlRequest?: HITLApprovalRequest;
  order?: {
    orderId: string;
    fillPrice: number;
    slippage: number;
    fees: number;
  };
  position?: {
    positionId: string;
    unrealizedPnL: number;
    stopOrderId: string;
    targetOrderId: string;
  };
  trade?: CompletedTrade;
}
```

**Workflow Graph**:

```
monitoring → signal_generation → security_check
                                       ↓
                         (risk >= High) → blocked → monitoring
                         (risk < High) → risk_calculation → hitl_approval
                                                                  ↓
                                                    (approved) → order_placement → position_management → position_closed
                                                    (rejected/expired) → monitoring
```

**Node Functions**:

**detectBreakout** (signal_generation state):

- Monitor watchlist tokens for breakout patterns (default: 20-day high)
- Require volume confirmation (>2x average daily volume)
- Apply RSI filter (50-70 range to avoid overbought)
- Filter extreme volatility and low liquidity

**runSecurityCheck** (security_check state):

- **Sub-Graph Invocation**: Invoke Security Detection workflow as sub-graph
- Pass token address to security workflow
- Conditional edge based on risk level:
  - risk >= High → `blocked`
  - risk < High → `risk_calculation`

**calculatePositionSize** (risk_calculation state):

- Calculate position size as % of portfolio (default: 2%)
- Calculate stop loss and take profit (defaults: -2%, +4%)
- Enforce max risk per trade: 2-3% of portfolio
- Apply risk limits: max 5 concurrent positions, max 10% exposure per token

**requestHITLApproval** (hitl_approval state):

- Generate approval request with all signal details
- Set expiration time (default: 15 minutes)
- Deliver via web dashboard, Telegram, mobile push
- Wait for user action: approve, reject, modify, defer
- Auto-reject on expiration

**placeOrder** (order_placement state):

- Place market order on configured exchange
- Immediately place stop loss and take profit orders
- Confirm order fills, handle errors (insufficient balance, rate limits)
- Log execution details: order ID, fill price, slippage, fees

**managePosition** (position_management state):

- Monitor open position in real-time
- Update unrealized P&L continuously
- Execute stop loss / take profit when triggered
- Handle partial fills, order cancellations

**closePosition** (position_closed state):

- Close position when stop/target hit or user manually closes
- Record trade with: entry, exit, P&L, exit reason (stop/target/manual)
- Update portfolio state
- Notify user of trade result

**Audit Trail**: Log every workflow step (FR-BT-015)

**Performance Target**: Signal generation to HITL request <60 seconds (NFR-PERF-004)

---

#### 4.3.3 Portfolio Management & Tax Optimization (FR-PM-001 to FR-PM-006)

**Purpose**: Track portfolio performance and generate tax reports for compliance.

**State Definition**:

```typescript
interface PortfolioManagementState {
  holdings: Holding[];
  trades: Trade[];
  metrics?: {
    totalValueUSD: number;
    dailyReturnPct: number;
    weeklyReturnPct: number;
    monthlyReturnPct: number;
    maxDrawdown: number;
    sharpeRatio: number;
    winRate: number;
  };
  taxReport?: TaxReport;
}
```

**Workflow Graph**:

```
tracking → calculating_metrics → (periodic trigger) → tracking
        ↓
      (on demand) → generating_tax_report
```

**Node Functions**:

**updateHoldings** (tracking state):

- Query Exchange MCP for current prices (every 10 seconds)
- Calculate unrealized P&L for open positions
- Update portfolio value in real-time
- Support WebSocket for real-time price feeds (fallback to polling)

**calculateMetrics** (calculating_metrics state):

- Compute portfolio metrics:
  - Total value (USD)
  - Daily/weekly/monthly return (%)
  - Max drawdown
  - Sharpe ratio
  - Win rate
- Generate equity curve chart data
- Compute P&L distribution histogram

**generateTaxReport** (generating_tax_report state):

- Export all trades with: buy date, sell date, buy price, sell price, quantity, P&L
- Include transaction fees and gas costs in cost basis
- Format compatible with major tax software (CoinTracker, Koinly, TokenTax)
- Retain trade history for 7 years (NFR-COMP-002)

**Performance Target**: Dashboard load <2 seconds (NFR-PERF-005)

---

### 4.4 Cross-Workflow Patterns

**Sub-Graph Pattern**:

```typescript
// Security Detection as reusable sub-graph
const securityWorkflow = buildSecurityDetectionGraph();

// Invoked from Breakout Trading workflow
const breakoutGraph = new StateGraph({ ... });
breakoutGraph.addNode("security_check", async (state) => {
  const securityResult = await securityWorkflow.invoke({
    tokenAddress: state.signal.tokenAddress,
    blockchain: state.signal.blockchain
  });
  return { ...state, securityCheck: securityResult };
});
```

**Parallel Execution**:

```typescript
// Multiple monitoring workflows run concurrently
const smartMoneyWorkflow = buildSmartMoneyGraph().compile();
const narrativeWorkflow = buildNarrativeGraph().compile();

// Execute in parallel
await Promise.all([
  smartMoneyWorkflow.invoke(initialState),
  narrativeWorkflow.invoke(initialState),
]);
```

**State Persistence**:

```typescript
// Checkpoint after each node for recovery
const workflow = graph.compile({
  checkpointer: new PostgresSaver(pool), // Save to database
  checkpointEvery: 1, // Checkpoint after every node
});

// Recover from failure
const state = await workflow.getState(checkpointId);
await workflow.invoke(state); // Resume from checkpoint
```

**Error Handling**:

```typescript
// Retry logic with exponential backoff
async function nodeWithRetry(state: WorkflowState): Promise<WorkflowState> {
  let retries = 0;
  while (retries < 3) {
    try {
      return await processNode(state);
    } catch (error) {
      retries++;
      await sleep(Math.pow(2, retries) * 1000); // Exponential backoff
    }
  }
  throw new Error("Max retries exceeded");
}

// Circuit breaker integration
const circuitBreaker = new CircuitBreaker(mcpService.call, {
  failureThreshold: 5,
  resetTimeout: 60000, // 60 seconds
});
```

---

## 5. Component Design & Module Structure

### 5.1 Frontend Architecture (Next.js + React)

**Framework**: Next.js 14+ with App Router

**Component Hierarchy**:

```
app/
├── (dashboard)/
│   ├── layout.tsx                # Dashboard shell
│   ├── page.tsx                  # Main dashboard
│   ├── trades/
│   │   └── page.tsx              # Trade history
│   ├── security/
│   │   └── page.tsx              # Security reports
│   └── settings/
│       └── page.tsx              # User settings
├── components/
│   ├── alerts/
│   │   ├── AlertFeed.tsx         # Real-time alert stream
│   │   ├── AlertCard.tsx         # Individual alert
│   │   └── AlertFilters.tsx      # Filter alerts
│   ├── narratives/
│   │   ├── NarrativeGrid.tsx     # Top 10 narratives
│   │   ├── NarrativeCard.tsx     # Narrative detail
│   │   └── TokenMappings.tsx     # Token correlations
│   ├── positions/
│   │   ├── PositionMonitor.tsx   # Open positions
│   │   ├── PositionCard.tsx      # Single position
│   │   └── PnLChart.tsx          # P&L visualization
│   ├── approvals/
│   │   ├── ApprovalRequest.tsx   # HITL approval card
│   │   ├── ApprovalActions.tsx   # Approve/Reject buttons
│   │   └── ApprovalTimer.tsx     # Expiration countdown
│   └── shared/
│       ├── Button.tsx
│       ├── Modal.tsx
│       ├── Chart.tsx
│       └── Table.tsx
├── hooks/
│   ├── useAlerts.ts              # Real-time alerts
│   ├── useWebSocket.ts           # WebSocket connection
│   ├── useTradeSignals.ts        # Trade signals data
│   └── useAuth.ts                # Authentication state
├── lib/
│   ├── api.ts                    # API client
│   ├── websocket.ts              # WebSocket client
│   └── utils.ts                  # Utility functions
└── types/
    └── index.ts                  # Shared TypeScript types
```

**State Management**:

- **Global State**: React Context for user session, theme, settings
- **Server State**: SWR for data fetching with automatic revalidation
- **Real-time State**: WebSocket updates pushed to React state

**Real-Time Updates**:

```typescript
// WebSocket hook for real-time alerts
function useAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    const ws = new WebSocket("wss://api.cryptotrading.ai/alerts");

    ws.onmessage = (event) => {
      const alert = JSON.parse(event.data);
      setAlerts((prev) => [alert, ...prev]);
    };

    return () => ws.close();
  }, []);

  return alerts;
}
```

**Performance Optimizations**:

- Server-side rendering for initial page load
- Code splitting by route (automatic with Next.js App Router)
- Image optimization (next/image)
- Font optimization (next/font)
- Lazy loading for heavy components

---

### 5.2 Backend Architecture (Node.js + LangGraph)

**Framework**: Node.js 22 LTS + Express.js

**Module Structure**:

```
backend/
├── workflows/                    # LangGraph state machines
│   ├── smart-money/
│   │   ├── graph.ts              # State graph definition
│   │   ├── nodes.ts              # Node functions
│   │   ├── state.ts              # State interface
│   │   └── index.ts              # Exported workflow
│   ├── narrative-scouting/
│   ├── security-detection/
│   ├── backtesting/
│   ├── breakout-trading/
│   └── portfolio/
├── services/                     # Business logic
│   ├── llm/
│   │   ├── LLMService.ts         # Provider abstraction
│   │   ├── providers/
│   │   │   ├── OpenAIProvider.ts
│   │   │   ├── AnthropicProvider.ts
│   │   │   ├── GoogleProvider.ts
│   │   │   └── OllamaProvider.ts
│   │   └── CostTracker.ts        # Token usage tracking
│   ├── mcp/
│   │   ├── MCPService.ts         # MCP server registry
│   │   ├── MCPCache.ts           # Response caching
│   │   └── servers/
│   │       ├── TheGraphMCP.ts
│   │       ├── CoinGeckoMCP.ts
│   │       └── ... (other MCP servers)
│   ├── hitl/
│   │   ├── HITLService.ts        # Approval request management
│   │   ├── ApprovalQueue.ts      # Request queue
│   │   └── ExpirationHandler.ts  # Auto-reject expired requests
│   ├── auth/
│   │   ├── AuthService.ts        # Authentication (WebAuthn + OAuth)
│   │   ├── SessionManager.ts     # Session handling
│   │   ├── WebAuthnService.ts    # WebAuthn/Passkey credential management
│   │   └── OAuthService.ts       # OAuth provider integration
│   └── notifications/
│       ├── NotificationService.ts
│       ├── EmailService.ts       # SendGrid integration
│       ├── TelegramService.ts    # Bot API
│       └── PushService.ts        # FCM
├── api/                          # API routes
│   ├── rest/
│   │   ├── auth.ts               # POST /auth/login, /auth/register
│   │   ├── workflows.ts          # GET /workflows, POST /workflows/:id/trigger
│   │   ├── trades.ts             # GET /trades, POST /trades/:id/close
│   │   ├── approvals.ts          # POST /approvals/:id/approve
│   │   └── settings.ts           # GET/PUT /settings
│   └── websocket/
│       └── alerts.ts             # WebSocket /alerts
├── db/                           # Database access
│   ├── repositories/
│   │   ├── UserRepository.ts
│   │   ├── TradeRepository.ts
│   │   ├── SmartMoneyRepository.ts
│   │   └── ... (other repositories)
│   ├── migrations/               # Database migrations (TSD)
│   └── client.ts                 # PostgreSQL client
├── jobs/                         # Background jobs
│   ├── scheduler.ts              # Cron scheduler
│   └── workflows/
│       ├── smartMoneyMonitor.ts  # Runs every 60s
│       ├── narrativeScout.ts     # Runs every 15min
│       └── portfolioUpdate.ts    # Runs every 10s
├── middleware/
│   ├── auth.ts                   # JWT validation
│   ├── errorHandler.ts           # Global error handling
│   └── rateLimit.ts              # Rate limiting
├── types/                        # Shared types
│   └── index.ts
└── server.ts                     # Express app entry
```

**Service Layer Pattern**:

```typescript
// LLM Service with provider abstraction
class LLMService {
  private providers: Map<string, LLMProvider> = new Map();
  private config: ProviderConfig;

  async generateCompletion(prompt: string): Promise<string> {
    try {
      const primary = this.providers.get(this.config.primary.provider);
      return await primary.generateCompletion(prompt);
    } catch (error) {
      // Fallback to secondary provider
      const fallback = this.providers.get(this.config.fallback.provider);
      return await fallback.generateCompletion(prompt);
    }
  }
}
```

**Repository Pattern**:

```typescript
// Trade Repository with type-safe queries
class TradeRepository {
  constructor(private db: DatabaseClient) {}

  async findByUserId(userId: string): Promise<Trade[]> {
    const result = await this.db.query(
      'SELECT * FROM trades WHERE user_id = $1 ORDER BY opened_at DESC',
      [userId]
    );
    return result.rows.map(row => this.mapRowToTrade(row));
  }

  async insert(trade: Trade): Promise<Trade> {
    const result = await this.db.query(
      'INSERT INTO trades (...) VALUES (...) RETURNING *',
      [...]
    );
    return this.mapRowToTrade(result.rows[0]);
  }
}
```

---

### 5.2.1 Hybrid File Structure Pattern

**Decision**: Adopt a hybrid structure combining vertical (feature-based) organization for workflows with horizontal (layer-based) organization for shared services.

**Rationale**: After consensus analysis with multiple architectural perspectives, a pure vertical structure was found incompatible with the system's cross-cutting services (LLM, MCP, authentication) used by all workflows. A pure horizontal structure scatters workflow-specific logic across multiple directories. The hybrid approach resolves both concerns.

**Structure**:

```
backend/
├── workflows/                    # VERTICAL: Feature-based isolation
│   ├── smart-money/
│   │   ├── graph.ts             # LangGraph state machine
│   │   ├── nodes.ts             # Node functions (pure)
│   │   ├── state.ts             # State interface
│   │   ├── service.ts           # Workflow-specific business logic
│   │   └── repository.ts        # Workflow-specific data access
│   ├── narrative-scouting/
│   ├── security-detection/
│   ├── backtesting/
│   ├── breakout-trading/
│   └── portfolio/
│
├── shared/                       # HORIZONTAL: Cross-cutting concerns
│   ├── services/
│   │   ├── llm/                 # Used by all workflows
│   │   │   ├── LLMService.ts
│   │   │   ├── providers/
│   │   │   └── CostTracker.ts
│   │   ├── mcp/                 # Used by all workflows
│   │   │   ├── MCPService.ts
│   │   │   ├── MCPCache.ts
│   │   │   └── servers/
│   │   ├── auth/
│   │   ├── notifications/
│   │   └── hitl/
│   ├── repositories/            # Base patterns (Repository, UnitOfWork)
│   ├── types/                   # Shared TypeScript interfaces
│   └── utils/
│
├── api/                         # REST + WebSocket routes
├── jobs/                        # Background schedulers
├── middleware/                  # Auth, error handling, rate limiting
└── db/                          # Database client, migrations (TSD)
```

**Placement Decision Rule**:

- **Shared by >1 workflow** → `/shared/services/` or `/shared/types/`
- **Workflow-specific** → `/workflows/{workflow-name}/`
- **API layer** → `/api/` (handles HTTP/WebSocket, delegates to workflows)
- **Infrastructure** → Top-level (jobs, middleware, db)

**Benefits**:

- **Workflow Isolation**: Each workflow folder contains all its specific logic (graph, nodes, state, service, repository)
- **No Code Duplication**: Shared services like LLMService and MCPService live in `/shared`, used by all workflows
- **Clear Dependencies**: Workflows depend on `/shared`, never on each other
- **Scalability**: Easy to add new workflows without touching existing ones
- **Testing**: Each workflow can be tested in isolation with mocked shared services

**Migration Path** (Post-MVP):

1. Create `/shared` directory structure
2. Move LLMService, MCPService, auth, notifications to `/shared/services/`
3. Migrate workflows one at a time (start with smart-money)
4. Update import paths incrementally
5. Remove old horizontal directories once empty

**See Also**: ADR-004 for detailed rationale on why hybrid over pure vertical.

---

### 5.3 Data Access Layer

**Patterns**:

**Repository Pattern**: Abstraction over database queries

- One repository per domain entity
- Type-safe query methods
- Hides database implementation details

**Unit of Work**: Transaction management

```typescript
class UnitOfWork {
  async transaction<T>(fn: (client: DatabaseClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

// Usage
await unitOfWork.transaction(async (client) => {
  await tradeRepo.insert(trade, client);
  await portfolioRepo.updateBalance(userId, -trade.amountUSD, client);
});
```

**Type-Safe Query Builder**: Kysely for compile-time SQL safety

**Pattern**: All database interactions use a type-safe query builder that provides compile-time validation of table names, column names, and types.

**Library**: Kysely - TypeScript-first SQL query builder for PostgreSQL.

**Rationale**:
- **Compile-Time Safety**: Database schema types prevent entire classes of runtime errors (typos, wrong types, missing columns)
- **No ORM Magic**: Explicit SQL prevents N+1 queries, hidden joins, and performance surprises
- **Lightweight**: ~15KB vs 100KB+ for ORMs like TypeORM
- **Migration Compatible**: Works with existing node-pg-migrate for schema management

**Architectural Impact**:

```typescript
// Database schema types (generated or manual)
interface Database {
  trades: {
    id: string;
    user_id: string;
    token_symbol: string;
    entry_price: number;
    p_l_usd: number | null;
    opened_at: Date;
  };
  users: {
    id: string;
    email: string;
    created_at: Date;
  };
}

// Kysely instance with full type safety
const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

// Fully typed queries - compiler catches errors
async function getUserProfitableTrades(userId: string): Promise<Trade[]> {
  return db
    .selectFrom('trades')           // Autocomplete for table names
    .selectAll()                    // Return type automatically inferred
    .where('user_id', '=', userId)  // Compile error if wrong column or type
    .where('p_l_usd', '>', 0)       // TypeScript knows p_l_usd is number | null
    .orderBy('opened_at', 'desc')
    .limit(50)
    .execute();
}

// Repository integration with Result pattern
class TradeRepository {
  async findByUserId(userId: string): Promise<Result<Trade[], string>> {
    try {
      const trades = await db
        .selectFrom('trades')
        .selectAll()
        .where('user_id', '=', userId)
        .execute();

      return Result.ok(trades);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to fetch trades');
      return Result.err('DATABASE_ERROR');
    }
  }
}
```

**Implementation**: See TSD-Database.md for Kysely installation, Database interface generation, transaction patterns, and complex query examples.

**Connection Pooling**:

```typescript
import { Pool } from "pg";

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20, // Max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

---

## 6. Type System & Interfaces

This section defines core TypeScript interfaces from DEFERRED_ITEMS_TRACKER.md.

### 6.1 LLM Abstraction Types

```typescript
// Core provider interface
interface LLMProvider {
  name: string;
  generateCompletion(
    prompt: string,
    options?: CompletionOptions
  ): Promise<string>;
  generateWithTools(
    messages: Message[],
    tools: Tool[]
  ): Promise<ToolCallResponse>;
  estimateCost(tokens: number): number;
  isAvailable(): Promise<boolean>;
}

interface CompletionOptions {
  temperature?: number; // 0-1, default 0.7
  maxTokens?: number; // Max output tokens
  stopSequences?: string[]; // Stop generation at these sequences
  topP?: number; // Nucleus sampling
  frequencyPenalty?: number; // Penalize frequent tokens
  presencePenalty?: number; // Penalize repeated tokens
}

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string; // Optional name for multi-turn
}

interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
}

interface ToolCallResponse {
  content: string;
  toolCalls?: ToolCall[];
}

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// Provider configuration
interface ProviderConfig {
  primary: {
    provider: "openai" | "anthropic" | "google" | "ollama";
    model: string;
    apiKey: string;
  };
  fallback: {
    provider: "openai" | "anthropic" | "google" | "ollama";
    model: string;
    apiKey: string;
  };
  costLimits: {
    dailyUSD: number;
    monthlyUSD: number;
  };
}
```

### 6.2 MCP Integration Types

```typescript
// MCP Server definition
interface MCPServer {
  id: string; // Unique identifier
  name: string; // Display name
  version: string; // Semver version
  capabilities: string[]; // Supported capabilities
  tools: MCPTool[]; // Available tools
  baseURL?: string; // Optional base URL
  apiKey?: string; // Optional API key
}

interface MCPTool {
  name: string; // Tool identifier
  description: string; // Human-readable description
  inputSchema: JSONSchema; // Input parameter schema
  outputSchema: JSONSchema; // Output schema
}

interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  [key: string]: unknown;
}

// MCP request/response
interface MCPRequest {
  tool: string;
  arguments: Record<string, unknown>;
}

interface MCPResponse {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

// MCP cache entry
interface MCPCacheEntry {
  key: string;
  value: unknown;
  ttl: number; // Seconds
  createdAt: Date;
}
```

### 6.3 Workflow State Types

```typescript
// Smart Money Tracking
interface SmartMoneyState {
  wallets: WalletAddress[];
  currentTransaction?: {
    walletAddress: string;
    blockchain: string;
    tokenSymbol: string;
    tokenAddress: string;
    amount: number;
    direction: "buy" | "sell" | "transfer";
    usdValue: number;
    transactionHash: string;
    blockNumber: number;
    timestamp: Date;
  };
  alert?: {
    reasoning: string;
    confidenceScore: number;
    deliveryChannels: ("web" | "telegram" | "discord" | "email")[];
  };
  error?: Error;
}

// Narrative Scouting
interface NarrativeScoutingState {
  posts: SocialPost[];
  narrativeClusters: NarrativeCluster[];
  scoredNarratives: ScoredNarrative[];
  topNarratives: TopNarrative[];
  error?: Error;
}

interface SocialPost {
  id: string;
  platform: "twitter" | "reddit" | "telegram";
  platformPostId: string;
  author: string;
  content: string;
  engagementScore: number;
  timestamp: Date;
}

// Security Detection
interface SecurityCheckState {
  tokenAddress: string;
  blockchain: string;
  contractAnalysis?: {
    honeypotDetected: boolean;
    hiddenFees: boolean;
    blacklistFunctions: boolean;
    ownershipRisks: boolean;
    unlimitedMinting: boolean;
  };
  liquidityCheck?: {
    lpLocked: boolean;
    lpBurned: boolean;
    liquidityDepthUSD: number;
    dexes: string[];
  };
  teamVerification?: {
    doxxed: boolean;
    githubActivity: boolean;
    previousProjects: string[];
    redFlags: string[];
  };
  riskScore?: "Low" | "Medium" | "High" | "Critical";
  report?: SecurityReport;
  blocked: boolean;
}

// Backtesting
interface BacktestingState {
  config: {
    strategyParams: {
      breakoutPeriod: number;
      volumeThreshold: number;
      rsiRange: [number, number];
    };
    riskSettings: {
      positionSizePct: number;
      stopLossPct: number;
      takeProfitPct: number;
    };
    timeRange: {
      start: Date;
      end: Date;
    };
    assetPair: string;
  };
  ohlcvData?: OHLCV[];
  trades?: SimulatedTrade[];
  metrics?: BacktestMetrics;
  approved: boolean;
}

// Breakout Trading
interface BreakoutTradingState {
  watchlist: TokenSymbol[];
  signal?: TradeSignal;
  securityCheck?: SecurityCheckState;
  hitlRequest?: HITLApprovalRequest;
  order?: ExchangeOrder;
  position?: OpenPosition;
  trade?: CompletedTrade;
}

// Portfolio Management
interface PortfolioManagementState {
  holdings: Holding[];
  trades: Trade[];
  metrics?: PortfolioMetrics;
  taxReport?: TaxReport;
}
```

### 6.4 Domain Entity Types

```typescript
// User (Passwordless - no password storage)
interface User {
  id: string;
  email: string;
  accountStatus: "active" | "locked" | "deleted";
  createdAt: Date;
  updatedAt: Date;
}

// Authenticator (WebAuthn credentials)
interface Authenticator {
  id: string;
  userId: string;
  credentialId: string; // WebAuthn credential ID
  publicKey: string; // WebAuthn public key
  counter: number; // Signature counter for replay protection
  deviceName: string;
  createdAt: Date;
  lastUsedAt: Date;
}

// OAuthAccount (Linked OAuth providers)
interface OAuthAccount {
  id: string;
  userId: string;
  provider: "google" | "apple";
  providerAccountId: string;
  email: string;
  linkedAt: Date;
}

// Trade Signal
interface TradeSignal {
  id: string;
  userId: string;
  tokenSymbol: string;
  action: "BUY" | "SELL";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  positionSizeUSD: number;
  confidenceScore: number;
  reasoning: string;
  securityRiskLevel: "Low" | "Medium" | "High" | "Critical";
  status: "pending" | "approved" | "rejected" | "expired" | "blocked";
  createdAt: Date;
  expiresAt: Date;
}

// Trade
interface Trade {
  id: string;
  signalId: string;
  userId: string;
  tokenSymbol: string;
  side: "BUY" | "SELL";
  entryPrice: number;
  entryQuantity: number;
  exitPrice?: number;
  exitQuantity?: number;
  pnlUSD?: number;
  pnlPct?: number;
  exitReason?: "stop" | "target" | "manual";
  exchangeOrderIds: string[];
  feesUSD: number;
  openedAt: Date;
  closedAt?: Date;
}

// HITL Approval Request
interface HITLApprovalRequest {
  id: string;
  workflowId: string;
  actionType: "trade_execution" | "config_change";
  priority: "low" | "medium" | "high" | "urgent";
  details: {
    tokenSymbol?: string;
    action?: "BUY" | "SELL";
    entryPrice?: number;
    positionSizeUSD?: number;
    stopLoss?: number;
    takeProfit?: number;
    riskUSD?: number;
  };
  reasoning: string;
  securityRiskLevel?: "Low" | "Medium" | "High" | "Critical";
  status: "pending" | "approved" | "rejected" | "expired";
  createdAt: Date;
  expiresAt: Date;
  decidedAt?: Date;
  decisionReason?: string;
}

// Holding
interface Holding {
  tokenSymbol: string;
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnLUSD: number;
  unrealizedPnLPct: number;
}

// Portfolio Metrics
interface PortfolioMetrics {
  totalValueUSD: number;
  dailyReturnPct: number;
  weeklyReturnPct: number;
  monthlyReturnPct: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
}
```

---

### 6.5 Result Type for Error Handling

**Pattern**: Explicit error handling using the `Result<T, E>` type for all fallible operations in workflow nodes and service layers.

**Library**: `@satoshibits/functional` - Zero-dependency functional programming library providing the Result type.

**Rationale**:
- **Type Safety**: Errors are explicit in function signatures (`Promise<Result<T, E>>`), preventing forgotten error handling
- **No Silent Failures**: Type system enforces error checking - cannot access `.data` without verifying `.success`
- **Composability**: Results can be chained, transformed, and combined using functional utilities
- **Production-Tested**: Already in use by the development team, proven patterns and reliability
- **Progressive Adoption**: Start with workflow nodes, gradually migrate service layer without breaking existing code

**Architectural Impact**:

```typescript
// All workflow nodes return Result type
async function analyzeTransaction(
  state: SmartMoneyState
): Promise<Result<SmartMoneyState, string>> {
  const llmResult = await llmService.generateCompletion(prompt);

  if (!Result.isOk(llmResult)) {
    // Type system enforces error handling
    return Result.err(llmResult.error);
  }

  // Extract data only after success check
  const reasoning = llmResult.data;

  return Result.ok({ ...state, alert: { reasoning, confidenceScore } });
}

// Service layer methods return Result
class LLMService {
  async generateCompletion(prompt: string): Promise<Result<string, string>> {
    try {
      const response = await primary.generateCompletion(prompt);
      return Result.ok(response);
    } catch (error) {
      return Result.err(`LLM failed: ${error.message}`);
    }
  }
}

// Pattern matching in orchestration
const result = await analyzeTransaction(state);

if (Result.isOk(result)) {
  return generateAlert(result.data); // Type-safe access to data
} else {
  logger.error({ error: result.error }, 'Analysis failed');
  return fallbackBehavior(state);
}
```

**Adoption Strategy**:
1. **Phase 1 (MVP)**: All LangGraph workflow nodes return `Result<State, string>`
2. **Phase 2**: Migrate service layer (LLMService, MCPService) to return `Result<T, E>`
3. **Phase 3**: Convert repository layer for database operations
4. **Keep try-catch for**: Infrastructure code, third-party library callbacks where Result doesn't add value

**Implementation**: See TSD-Services.md for `@satoshibits/functional` installation, Result API reference, pattern matching utilities, and integration examples with LangGraph.

---

## 7. Integration Architecture

### 7.1 LLM Provider Abstraction Layer (FR-LLM-001 to FR-LLM-005)

**Architecture Pattern**: Strategy Pattern

**Supported Providers**:

- **OpenAI**: GPT-4, GPT-4o, GPT-4o-mini
- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Haiku
- **Google**: Gemini 1.5 Pro, Gemini 1.5 Flash
- **Ollama**: Local models for development (llama3, mistral)

**Provider Implementation**:

```typescript
class OpenAIProvider implements LLMProvider {
  name = "openai";

  async generateCompletion(
    prompt: string,
    options?: CompletionOptions
  ): Promise<string> {
    const response = await openai.chat.completions.create({
      model: this.config.model,
      messages: [{ role: "user", content: prompt }],
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 1000,
    });
    return response.choices[0].message.content;
  }

  estimateCost(tokens: number): number {
    // Model-specific pricing
    const inputCostPer1K = 0.01;
    const outputCostPer1K = 0.03;
    return (tokens / 1000) * (inputCostPer1K + outputCostPer1K);
  }
}
```

**Fallback Strategy** (FR-LLM-004):

```typescript
class LLMService {
  async generateCompletion(prompt: string): Promise<string> {
    try {
      const primary = this.providers.get(this.config.primary.provider);
      logger.info("Using primary LLM provider", { provider: primary.name });
      return await primary.generateCompletion(prompt);
    } catch (error) {
      logger.warn("Primary provider failed, trying fallback", { error });

      const fallback = this.providers.get(this.config.fallback.provider);
      logger.info("Using fallback LLM provider", { provider: fallback.name });
      return await fallback.generateCompletion(prompt);
    }
  }
}
```

**Cost Tracking** (FR-LLM-005):

**Budget Limits** (aligned with BRD/FRD):
- Monthly LLM budget: $300-500/month (ecosystem-wide)
- Alert threshold: 90% of monthly budget
- Strategy: Cost-effective models (GPT-4o-mini, Haiku) for high-frequency tasks, premium models for critical decisions

```typescript
class CostTracker {
  private readonly MONTHLY_BUDGET_USD = 500; // Hard limit from BRD

  async logUsage(
    workflowId: string,
    provider: string,
    tokensIn: number,
    tokensOut: number
  ): Promise<void> {
    const cost = this.calculateCost(provider, tokensIn, tokensOut);

    await db.query(
      "INSERT INTO llm_usage_logs (workflow_id, provider, tokens_in, tokens_out, cost_usd) VALUES ($1, $2, $3, $4, $5)",
      [workflowId, provider, tokensIn, tokensOut, cost]
    );

    // Alert if approaching budget limits ($300-500/month)
    const monthlyTotal = await this.getMonthlyTotal();
    if (monthlyTotal > this.MONTHLY_BUDGET_USD * 0.9) {
      await alertService.send("LLM costs approaching monthly limit ($500)");
    }
  }
}
```

---

### 7.2 MCP Server Integration (FR-MCP-001 to FR-MCP-006)

**MCP Server Registry** (from DEFERRED_ITEMS_TRACKER.md):

| MCP Server      | Repository                      | Version | NPM Package                      | Purpose                      |
| --------------- | ------------------------------- | ------- | -------------------------------- | ---------------------------- |
| The Graph MCP   | kukapay/thegraph-mcp            | ^1.0.0  | @kukapay/thegraph-mcp            | On-chain transaction queries |
| CoinGecko MCP   | official                        | ^2.0.0  | coingecko-mcp                    | Token price data, market cap |
| DefiLlama MCP   | official                        | ^1.5.0  | defillama-mcp                    | Protocol TVL, liquidity data |
| LunarCrush MCP  | official                        | ^3.0.0  | lunarcrush-mcp                   | Social sentiment, engagement |
| CryptoPanic MCP | kukapay/cryptopanic-mcp         | ^1.2.0  | @kukapay/cryptopanic-mcp         | News aggregation             |
| TradingView MCP | atilaahmettaner/tradingview-mcp | ^2.1.0  | @atilaahmettaner/tradingview-mcp | Technical indicators         |
| Binance MCP     | AnalyticAce/BinanceMCPServer    | ^1.0.0  | @analyticace/binance-mcp         | Exchange API integration     |
| CCXT MCP        | alternative                     | ^4.0.0  | ccxt-mcp                         | Multi-exchange support       |

**MCP Architecture Pattern**:

```typescript
class MCPService {
  private servers: Map<string, MCPServer> = new Map();
  private cache: MCPCache;
  private circuitBreaker: CircuitBreaker;

  async invokeTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    // 1. Check cache first
    const cacheKey = this.getCacheKey(serverName, toolName, args);
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      logger.debug("MCP cache hit", { serverName, toolName });
      return cached;
    }

    // 2. Invoke tool via circuit breaker
    const server = this.servers.get(serverName);
    const result = await this.circuitBreaker.execute(async () => {
      return await server.invokeTool(toolName, args);
    });

    // 3. Cache response
    const ttl = this.getTTL(serverName, toolName);
    await this.cache.set(cacheKey, result, ttl);

    return result;
  }
}
```

**Response Caching** (FR-MCP-004):

```typescript
class MCPCache {
  private redis: RedisClient;

  // Cache TTLs by data type
  private TTL_MAP = {
    price: 60, // 1 minute
    transaction: 300, // 5 minutes
    social: 900, // 15 minutes
    security: 86400, // 24 hours
  };

  async get(key: string): Promise<unknown | null> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set(key: string, value: unknown, ttl: number): Promise<void> {
    await this.redis.setex(key, ttl, JSON.stringify(value));
  }
}
```

**Resilience Patterns** (FR-MCP-006):

MCP server calls are wrapped in resilience policies (circuit breaker, retry, timeout) to prevent cascading failures and ensure graceful degradation when external services become unavailable.

**Pattern**: See Section 10.1.1 (Resilience Patterns) for the architectural pattern using cockatiel library.

**Implementation**: See TSD-Services.md for MCP-specific policy configuration and integration examples.

**Rate Limiting**:

```typescript
class RateLimiter {
  private queues: Map<string, Queue> = new Map();

  // Rate limits per API provider
  private LIMITS = {
    coingecko: { requests: 50, window: 60000 }, // 50/min
    twitter: { requests: 300, window: 900000 }, // 300/15min
    etherscan: { requests: 5, window: 1000 }, // 5/sec
  };

  async enqueue(
    provider: string,
    fn: () => Promise<unknown>
  ): Promise<unknown> {
    const queue = this.getQueue(provider);
    return queue.add(fn);
  }
}
```

**HTTP Client Pattern**:

All HTTP requests to external APIs (CoinGecko, Twitter, Etherscan, etc.) must compose three architectural patterns for reliability and type safety.

**Pattern**: Compose HTTP client with resilience policies (Section 10.1.1), schema validation (Section 10.5), and Result-based error handling (Section 6.5).

**Architectural Impact**:

```typescript
// Compose patterns for external API calls
async function apiCall<T>(
  url: string,
  schema: z.Schema<T>,
  options?: RequestInit
): Promise<Result<T, string>> {
  try {
    // 1. Apply resilience policy (retry, timeout, circuit breaker)
    const response = await apiPolicy.execute(() => fetch(url, options));

    if (!response.ok) {
      return Result.err(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // 2. Validate response schema
    const validated = schema.safeParse(data);

    // 3. Return Result type
    return validated.success
      ? Result.ok(validated.data)
      : Result.err(`Validation failed: ${validated.error.message}`);
  } catch (error) {
    return Result.err(`Request failed: ${error.message}`);
  }
}
```

**Rationale**:
- **Composable Primitives**: Builds complex functionality by composing simple patterns
- **Type Safety**: Schema validation prevents runtime errors from malformed API responses
- **Graceful Degradation**: Resilience policies ensure fast failures and circuit breaking for degraded services
- **Explicit Errors**: Result type forces error handling at call sites

**Implementation**: See TSD-Services.md for HTTP client library choice (native fetch vs ky), request/response interceptors, and MCP-specific API client examples.

---

### 7.3 External Service Integration

**Email Service** (SendGrid or AWS SES):

```typescript
class EmailService {
  async sendAlert(userId: string, alert: Alert): Promise<void> {
    const user = await userRepo.findById(userId);

    await this.client.send({
      to: user.email,
      from: "alerts@cryptotrading.ai",
      subject: `Alert: ${alert.title}`,
      html: this.renderTemplate("alert", { alert }),
    });
  }

  async sendAccountRecovery(email: string, recoveryLink: string): Promise<void> {
    // For passwordless systems: sends link to add new authenticator
    await this.client.send({
      to: email,
      from: "noreply@cryptotrading.ai",
      subject: "Account Recovery - Add New Authenticator",
      html: this.renderTemplate("account-recovery", { recoveryLink }),
    });
  }

  private renderTemplate(
    template: string,
    data: Record<string, unknown>
  ): string {
    // Handlebars template rendering
    return handlebars.compile(templates[template])(data);
  }
}
```

**Telegram Bot**:

```typescript
class TelegramService {
  async sendApprovalRequest(
    userId: string,
    request: HITLApprovalRequest
  ): Promise<void> {
    const user = await userRepo.findById(userId);

    await this.bot.sendMessage(user.telegramChatId, {
      text: this.formatApprovalRequest(request),
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Approve ✅", callback_data: `approve:${request.id}` },
            { text: "Reject ❌", callback_data: `reject:${request.id}` },
          ],
        ],
      },
    });
  }

  async handleCallback(callbackQuery: CallbackQuery): Promise<void> {
    const [action, requestId] = callbackQuery.data.split(":");

    if (action === "approve") {
      await hitlService.approve(requestId, callbackQuery.from.id);
    } else if (action === "reject") {
      await hitlService.reject(requestId, callbackQuery.from.id);
    }
  }
}
```

**Mobile Push Notifications** (Firebase Cloud Messaging):

```typescript
class PushService {
  async sendApprovalRequest(
    userId: string,
    request: HITLApprovalRequest
  ): Promise<void> {
    const user = await userRepo.findById(userId);
    const tokens = await this.getDeviceTokens(userId);

    await this.fcm.sendMulticast({
      tokens,
      notification: {
        title: "Trade Approval Required",
        body: `${request.details.action} ${request.details.tokenSymbol} at $${request.details.entryPrice}`,
      },
      data: {
        type: "approval_request",
        requestId: request.id,
      },
      webpush: {
        fcmOptions: {
          link: `https://app.cryptotrading.ai/approvals/${request.id}`,
        },
      },
    });
  }
}
```

---

## 8. Deployment Architecture & Security

### 8.1 Deployment Topology

**Frontend: Vercel**

**Selected**: Vercel Edge Network

**Features**:

- Global CDN with edge caching
- Serverless functions for API routes (Next.js API routes)
- Automatic HTTPS with custom domains
- Git-based automatic deployments (main branch → production)
- Preview deployments for pull requests
- Environment variables managed via Vercel dashboard

**Configuration**:

```json
// vercel.json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm ci",
  "env": {
    "NEXT_PUBLIC_API_URL": "https://api.cryptotrading.ai",
    "NEXT_PUBLIC_WS_URL": "wss://api.cryptotrading.ai"
  },
  "regions": ["iad1", "sfo1", "fra1"]
}
```

**Alternatives Considered**:

- **Netlify**: Similar features, slightly less edge coverage
- **Cloudflare Pages**: Great performance, less mature serverless
- **AWS Amplify**: More complex setup, overkill for frontend-only

**Decision**: Vercel chosen for seamless Next.js integration and global edge network.

---

**Backend: Railway**

**Selected**: Railway Container Platform

**Features**:

- Docker-based deployments
- Managed PostgreSQL database (automatic backups, connection pooling)
- Managed Redis cache
- Auto-scaling based on CPU/memory load (NFR-SCALE-001)
- Zero-downtime deployments (rolling updates)
- Built-in monitoring and log aggregation
- Environment variable management
- Health check configuration

**Configuration**:

```dockerfile
# Dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

```toml
# railway.toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10

[[services]]
name = "backend"
[services.env]
PORT = "3000"
NODE_ENV = "production"

[[services]]
name = "postgres"
image = "postgres:15-alpine"

[[services]]
name = "redis"
image = "redis:7-alpine"
```

**Alternatives Considered**:

- **Fly.io**: Great performance, less database maturity
- **Render**: Simpler interface, less flexible scaling
- **Heroku**: Too expensive at scale ($25-50/mo per dyno)
- **AWS ECS**: Over-engineered for MVP, steep learning curve

**Decision**: Railway chosen for managed database, Redis, and easy scaling.

---

### 8.2 Environment Strategy

**Environments**:

**Development** (Local):

- Docker Compose for PostgreSQL + Redis
- Local LLM provider (Ollama) for cost savings
- Mock MCP servers for offline development
- Hot reload enabled

**Staging** (Railway):

- Separate Railway project
- Smaller database/Redis instances
- Real LLM providers (lower-cost models)
- Real MCP servers
- Automatic deployment on `staging` branch

**Production** (Railway + Vercel):

- Main Railway project
- Production-grade database/Redis
- Real LLM providers (optimized models)
- Real MCP servers
- Automatic deployment on `main` branch
- Manual approval for major releases

**Configuration Management**:

```bash
# Environment variables (NFR-SEC-007)
# .env.example
DATABASE_URL=postgresql://user:pass@host:5432/db
REDIS_URL=redis://host:6379
JWT_SECRET=<generate-random-secret>
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
SENDGRID_API_KEY=SG...
TELEGRAM_BOT_TOKEN=...
FCM_SERVER_KEY=...
```

**Secret Rotation**:

- API keys rotated quarterly
- Database credentials rotated bi-annually
- JWT secret rotated annually
- All rotations logged to audit trail

---

### 8.3 Security Architecture

**Authentication Pattern - Passwordless** (FR-USER-001, FR-USER-002):

**Pattern**: Passwordless authentication using WebAuthn/Passkeys (primary) and OAuth providers (secondary). **No password-based authentication.**

**Library**: Auth.js - Next.js authentication framework with passwordless provider support.

**Rationale**:
- **Phishing-Resistant Security**: WebAuthn credentials cryptographically bound to origin, eliminating account takeover vectors
- **Crypto-Native Trust Model**: Private keys stay on user's device (self-custody), no centralized credential database to breach
- **Optimal HITL UX**: Biometric authentication provides fastest approval flow for time-sensitive trade decisions
- **No Password Liability**: Eliminates credential stuffing, password reuse, weak passwords, secure storage burden
- **OAuth Pragmatism**: Google/Apple Sign-In provides familiar one-click login, outsources security to robust providers

**Authentication Flow**:

```
WebAuthn Flow (Primary):
1. User Registration → WebAuthn Credential Creation (device-bound keypair)
   ↓
2. Email Verification (optional for OAuth)
   ↓
3. Account Active → Credential stored in database
   ↓
4. Login → WebAuthn Assertion (biometric/PIN on device)
   ↓
5. Session Token (JWT via jose, 24h expiration)

OAuth Flow (Secondary):
1. User Clicks "Sign in with Google/Apple"
   ↓
2. OAuth Provider Authentication (provider's MFA policies apply)
   ↓
3. Callback with OAuth tokens
   ↓
4. Account Created/Linked
   ↓
5. Session Token (JWT via jose, 24h expiration)
```

**JWT Token Pattern**:

**Library**: jose - Web Crypto API-based JWT library.

**Rationale**:
- **Zero Dependencies**: No transitive vulnerabilities, minimal supply chain risk for authentication
- **Web Crypto API**: Uses native Node.js crypto (15+), future-proof for edge runtimes
- **Async-First**: Promise-based API aligns with TypeScript patterns
- **Secure by Default**: Automatic algorithm validation, timing-safe comparisons, prevents JWT vulnerabilities

**Architectural Impact**:

```typescript
import { SignJWT, jwtVerify } from "jose";

// JWT generation for user authentication
async function generateAuthToken(userId: string): Promise<Result<string, string>> {
  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const token = await new SignJWT({ userId })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .setIssuer("cryptotrading.ai")
      .setAudience("cryptotrading.ai")
      .sign(secret);

    return Result.ok(token);
  } catch (err) {
    logger.error({ error: err, userId }, "Token generation failed");
    return Result.err("TOKEN_GENERATION_ERROR");
  }
}

// JWT verification with Result<T,E> pattern
async function verifyAuthToken(token: string): Promise<Result<{ userId: string }, string>> {
  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, {
      issuer: "cryptotrading.ai",
      audience: "cryptotrading.ai",
    });

    return Result.ok({ userId: payload.userId as string });
  } catch (err) {
    logger.warn({ error: err }, "Token verification failed");
    return Result.err("INVALID_TOKEN");
  }
}
```

**Implementation**: See TSD-Authentication.md for jose installation, JWK configuration, refresh token rotation, and session management.

**Architectural Impact**:

```typescript
// Auth.js configuration with passwordless providers
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { WebAuthnProvider } from "@/lib/auth/webauthn-provider";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    // Primary: WebAuthn/Passkeys (phishing-resistant)
    WebAuthnProvider({
      name: "Passkey",
      authorize: async (credentials) => {
        const verification = await verifyAuthenticationResponse(credentials);
        if (!verification.verified) return null;
        return { id: credentials.userId, email: credentials.email };
      },
    }),

    // Secondary: OAuth providers
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) token.userId = user.id;
      return token;
    },
  },
});
```

**Multi-Factor Authentication**:

Passwordless authentication provides **inherent multi-factor security**:

- **WebAuthn Users**: Device possession + biometric/PIN = two factors (FIDO2-compliant)
- **OAuth Users**: Provider's MFA policies apply (Google 2FA, Apple 2FA)
- **No Additional TOTP**: Passwordless approach eliminates need for separate TOTP setup

**MVP Phasing**:

- **Phase 1 (MVP Launch)**: OAuth providers (Google, Apple Sign-In) for secure baseline with minimal implementation time
- **Phase 2 (Fast-Follow)**: WebAuthn/Passkeys using `simplewebauthn` library for crypto-native users
- **Never**: Password-based authentication (maintenance burden, security liability)

**Trade-offs**: WebAuthn requires modern browser support (97%+ coverage). OAuth introduces provider dependency. Both acceptable given security improvements and alignment with crypto-native user values.

**Implementation Details**: See TSD-Authentication.md for Auth.js configuration, WebAuthn provider setup, OAuth callback handling, and session management.

**API Key Encryption** (NFR-SEC-002):

```typescript
class EncryptionService {
  private algorithm = "aes-256-gcm";
  private key = Buffer.from(process.env.ENCRYPTION_KEY, "hex"); // 32 bytes

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  }

  decrypt(ciphertext: string): string {
    const [ivHex, authTagHex, encrypted] = ciphertext.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }
}
```

**HITL Approval Security** (NFR-SEC-003):

```typescript
class HITLService {
  async createApprovalRequest(request: HITLApprovalRequest): Promise<void> {
    // 1. Sign request with HMAC-SHA256
    const signature = this.signRequest(request);

    // 2. Set expiration timestamp
    request.expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // 3. Store in database
    await db.query(
      'INSERT INTO hitl_approvals (...) VALUES (...)',
      [request.id, request.workflowId, signature, ...]
    );
  }

  async approve(requestId: string, userId: string): Promise<void> {
    const request = await db.query('SELECT * FROM hitl_approvals WHERE id = $1', [requestId]);

    // 1. Verify signature
    if (!this.verifySignature(request)) {
      throw new Error('Invalid request signature');
    }

    // 2. Check expiration
    if (new Date() > request.expiresAt) {
      throw new Error('Request expired');
    }

    // 3. Verify user owns request
    if (request.userId !== userId) {
      throw new Error('Unauthorized');
    }

    // 4. Execute approved action
    await this.executeAction(request);
  }

  private signRequest(request: HITLApprovalRequest): string {
    const data = `${request.id}:${request.workflowId}:${request.createdAt.toISOString()}`;
    return crypto.createHmac('sha256', process.env.HITL_SECRET).update(data).digest('hex');
  }
}
```

**Data Encryption** (NFR-SEC-004):

- **In Transit**: TLS 1.3 for all connections
  - Database: PostgreSQL with SSL/TLS
  - Redis: Redis with TLS
  - External APIs: HTTPS only
  - Frontend ↔ Backend: HTTPS only
- **At Rest**: AES-256 for sensitive data
  - API keys encrypted in database
  - MFA secrets encrypted in database
  - Backup encryption enabled on Railway

---

## 9. Observability & Monitoring

### 9.1 Logging Strategy (NFR-MAINT-005)

**Pattern**: Structured JSON logging with service-specific child loggers, integrated with other architectural patterns (Result<T,E>, resilience policies, database queries).

**Library**: Pino - High-performance JSON logger.

**Rationale**:
- **Performance**: ~5x faster than alternatives, low overhead critical for trading latency
- **Structured JSON**: Native JSON output integrates with modern log aggregators (DataDog, Splunk, CloudWatch)
- **Child Loggers**: Type-safe service-specific loggers with shared context
- **Composable**: Integrates with cockatiel (circuit breaker events), Result<T,E> (error logging), Kysely (slow query logs)

**Architectural Impact**:

```typescript
import pino from "pino";

// Base logger with structured context
const logger = pino({
  level: env.LOG_LEVEL ?? "info",
  formatters: {
    level: (label) => ({ level: label }),
  },
});

// Service-specific child loggers
const tradeLogger = logger.child({ service: "trade-service" });
const mcpLogger = logger.child({ service: "mcp-service" });

// Log with structured context
tradeLogger.info(
  { workflowId: "breakout-trading", userId: req.user.id, tokenSymbol: "SOL" },
  "Breakout detected"
);

// Integration with Result<T,E>
async function executeTrade(trade: TradeRequest): Promise<Result<Trade, string>> {
  const result = await tradeService.execute(trade);

  if (!Result.isOk(result)) {
    tradeLogger.error({ error: result.error, trade }, "Trade execution failed");
    return result;
  }

  tradeLogger.info({ trade: result.data }, "Trade executed successfully");
  return result;
}

// Integration with cockatiel circuit breaker
mcpPolicy.onBreak(() => {
  mcpLogger.error({ policy: "mcp" }, "Circuit breaker opened - MCP service degraded");
});
```

**Implementation**: See TSD-Services.md for Pino installation, transport configuration (file, console, log aggregator), and custom serializers.

**Log Levels**:

- **ERROR**: Unhandled exceptions, critical failures
- **WARN**: Degraded service, fallback activated, approaching limits
- **INFO**: Normal operations, workflow milestones
- **DEBUG**: Detailed execution traces (disabled in production)

**Log Aggregation**:

- **Provider**: Railway built-in logs (MVP)
- **Upgrade Path**: Datadog or Logtail (Phase 2)
- **Retention**: 30 days (MVP), 90 days (Phase 2)
- **Search**: Full-text search on log messages

---

### 9.2 Metrics & Dashboards

**Application Metrics** (NFR-PERF):

- **Request Metrics**:
  - Requests/second per endpoint
  - P50, P95, P99 latency
  - Error rate (%)
- **Workflow Metrics**:
  - Execution time per workflow
  - Success rate per workflow
  - Pending approval count
- **Business Metrics**:
  - Trade signals generated (per hour)
  - Approval rate (approved / total)
  - Win rate (profitable / total trades)
  - Security blocks (blocked / total scans)

**Infrastructure Metrics**:

- **Database**:
  - Connection pool usage
  - Query latency (P95, P99)
  - Active connections
  - Deadlock count
- **Redis**:
  - Cache hit rate (target >60%)
  - Memory usage
  - Evictions per second
  - Connected clients
- **LLM API**:
  - Token usage per workflow
  - Cost per workflow
  - Provider availability
  - Fallback count

**Dashboard Provider**:

- **MVP**: Railway built-in monitoring
- **Phase 2**: Grafana + Prometheus

**Example Dashboard**:

```
+---------------------------+---------------------------+
| Request Rate              | Error Rate                |
| 42 req/s                  | 0.3%                      |
+---------------------------+---------------------------+
| P95 Latency               | Cache Hit Rate            |
| 234ms                     | 67%                       |
+---------------------------+---------------------------+
| Trade Signals (24h)       | Win Rate                  |
| 127                       | 62%                       |
+---------------------------+---------------------------+
```

---

### 9.3 Error Tracking

**Provider**: Sentry (recommended) or Railway Errors

**Integration**:

```typescript
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1, // 10% of transactions
  beforeSend(event, hint) {
    // Filter sensitive data
    if (event.request) {
      delete event.request.headers["authorization"];
      delete event.request.cookies;
    }
    return event;
  },
});

// Capture errors
app.use(Sentry.Handlers.errorHandler());
```

**Captured Events**:

- Unhandled exceptions
- Failed API calls (with retry count)
- LLM provider failures
- MCP server failures
- Database errors
- Workflow execution failures

**Error Context**:

- Stack trace
- User ID (if authenticated)
- Workflow state before error
- Request parameters (sanitized)
- Environment variables (non-sensitive)

**Alert Rules**:

- **Critical**: Error rate >5% for 5 minutes → Slack + Email
- **Warning**: P99 latency >10s for 10 minutes → Slack
- **Info**: New error type detected → Slack

---

### 9.4 Distributed Tracing

**Library**: OpenTelemetry (standard)

**Trace Propagation**:

```typescript
import { trace, context } from "@opentelemetry/api";

const tracer = trace.getTracer("crypto-trading-backend");

async function executeWorkflow(workflowId: string): Promise<void> {
  const span = tracer.startSpan("workflow.execute", {
    attributes: {
      "workflow.id": workflowId,
      "workflow.type": "breakout-trading",
    },
  });

  try {
    // Trace propagates across function calls
    await context.with(trace.setSpan(context.active(), span), async () => {
      await runWorkflow();
    });

    span.setStatus({ code: SpanStatusCode.OK });
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}
```

**Trace Example**:

```
Span: User approves trade signal
├─ Span: HITLService.validateApprovalToken()
│  Duration: 12ms
├─ Span: BreakoutTradingWorkflow.placeOrder()
│  ├─ Span: ExchangeMCP.createMarketOrder()
│  │  Duration: 234ms
│  ├─ Span: Database.insertTrade()
│  │  Duration: 45ms
│  └─ Span: NotificationService.sendTradeConfirmation()
│     Duration: 156ms
│  Duration: 487ms
└─ Total Duration: 512ms
```

**Trace Storage**:

- **MVP**: In-memory (development only)
- **Phase 2**: Jaeger or Tempo

---

### 9.5 Uptime Monitoring (NFR-REL-001)

**Provider**: UptimeRobot or Better Uptime

**Endpoints Monitored**:

- **Frontend**: https://app.cryptotrading.ai (every 5 minutes)
- **Backend Health**: https://api.cryptotrading.ai/health (every 5 minutes)
- **Database**: Connection check via health endpoint

**Health Endpoint**:

```typescript
app.get("/health", async (req, res) => {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    llm: await checkLLMProviders(),
    mcp: await checkMCPServers(),
  };

  const healthy = Object.values(checks).every((check) => check === "ok");

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "healthy" : "unhealthy",
    checks,
    timestamp: new Date().toISOString(),
  });
});
```

**Alerting**:

- **Downtime**: Email + Slack immediately
- **Degraded**: Slack notification
- **Recovery**: Slack notification

**Uptime Targets** (NFR-REL-001):

- MVP: 95% uptime (36 hours downtime/month acceptable)
- Phase 2: 99% uptime (7.2 hours downtime/month acceptable)
- Phase 3: 99.5% uptime (3.6 hours downtime/month acceptable)

---

## 10. Cross-Cutting Concerns

### 10.1 Error Handling Patterns

#### 10.1.1 Resilience Patterns

**Pattern**: All external service interactions (LLM providers, MCP servers, external APIs) are wrapped in resilience policies to prevent cascading failures.

**Library**: cockatiel - TypeScript-first library for retry, circuit breaker, timeout, and bulkhead patterns.

**Rationale**:
- **Prevents Cascading Failures**: Circuit breakers stop calling degraded services, allowing them to recover
- **Graceful Degradation**: Timeout policies ensure fast failures instead of hanging requests
- **Composable**: Wrap policies around functions with clean syntax (`retry`, `timeout`, `wrap`)
- **All-in-One**: Single library (~15KB) provides retry + circuit breaker + timeout + bulkhead

**Architectural Impact**:

```typescript
import { retry, circuitBreaker, timeout, wrap } from 'cockatiel';

// Compose resilience policies for MCP calls
const mcpPolicy = wrap(
  retry(handleAll, { maxAttempts: 3, backoff: new ExponentialBackoff() }),
  timeout(5000), // 5 second timeout
  circuitBreaker(handleAll, { halfOpenAfter: 10000 }) // Open circuit for 10s after failures
);

// Apply to external calls
async function fetchPrice(tokenId: string): Promise<Result<number, string>> {
  try {
    const price = await mcpPolicy.execute(() => coinGeckoMCP.getPrice(tokenId));
    return Result.ok(price);
  } catch (error) {
    logger.error({ error, tokenId }, 'MCP call failed after retries');
    return Result.err('MCP_UNAVAILABLE');
  }
}

// Circuit breaker events for observability
mcpPolicy.onBreak(() => {
  logger.error({ policy: 'mcp' }, 'Circuit breaker opened - MCP service degraded');
});

mcpPolicy.onReset(() => {
  logger.info({ policy: 'mcp' }, 'Circuit breaker reset - MCP service recovered');
});

// Separate policies for different SLAs
const llmPolicy = wrap(
  retry(handleAll, { maxAttempts: 2 }), // Fewer retries for expensive LLM calls
  timeout(30000) // Longer timeout for LLM generation
);
```

**Adoption Strategy**:
1. **Phase 1 (MVP)**: Wrap all MCP server calls with `mcpPolicy`
2. **Phase 2**: Add resilience to LLM provider calls with `llmPolicy`
3. **Phase 3**: Add bulkhead pattern for resource isolation between workflows

**Implementation**: See TSD-Services.md for cockatiel installation, policy configuration, and integration with Result<T,E> pattern.

---

**Graceful Degradation** (NFR-REL-002):

```typescript
// LLM provider failure → Fallback
async function generateReasoning(transaction: Transaction): Promise<string> {
  try {
    return await llmService.generateCompletion(prompt);
  } catch (error) {
    logger.warn('LLM generation failed, using fallback reasoning', { error });
    return `Large transaction detected: ${transaction.tokenSymbol} worth $${transaction.usdValue}`;
  }
}

// MCP server failure → Skip non-critical step
async function enrichNarrative(narrative: Narrative): Promise<Narrative> {
  try {
    const tokenData = await coinGeckoMCP.getTokenData(narrative.tokens);
    return { ...narrative, tokenData };
  } catch (error) {
    logger.warn('Token enrichment failed, continuing without enrichment', { error });
    return narrative; // Continue without enrichment
  }
}

// Database failure → Queue for later
async function storeTransaction(transaction: Transaction): Promise<void> {
  try {
    await db.query('INSERT INTO transactions (...) VALUES (...)', [...]);
  } catch (error) {
    logger.error('Database write failed, queueing for retry', { error });
    await messageQueue.push('database-writes', transaction);
  }
}
```

**User-Facing Error Messages** (NFR-UX-005):

```typescript
class AppError extends Error {
  constructor(
    public code: string,
    public userMessage: string,
    public technicalDetails?: unknown
  ) {
    super(userMessage);
  }
}

// Good error message
throw new AppError(
  "MCP_UNAVAILABLE",
  "Unable to fetch price data. CoinGecko API is temporarily unavailable. Trying backup source...",
  { provider: "coingecko", statusCode: 503 }
);

// Bad error message (avoid)
throw new Error("500 Internal Server Error");
```

**Result Type Pattern** (v1.1):

The Result<T, E> pattern provides explicit error handling for workflow nodes and service methods. See Section 6.5 for full type definition.

```typescript
// Workflow node with Result type
async function monitorWallets(
  state: SmartMoneyState
): Promise<Result<SmartMoneyState>> {
  // Query The Graph MCP for transactions
  const transactionsResult = await theGraphMCP.queryTransactions(state.wallets);

  if (Result.isErr(transactionsResult)) {
    // Explicit error handling - visible in type signature
    logger.error("Failed to fetch wallet transactions", {
      error: transactionsResult.error,
    });

    // Return error - caller must handle
    return Result.err(
      new Error(`MCP query failed: ${transactionsResult.error.message}`)
    );
  }

  // Extract transactions from successful result
  const transactions = transactionsResult.value;

  // Filter for significant transactions
  const significantTx = transactions.find(
    (tx) => tx.usdValue >= state.alertThreshold
  );

  if (significantTx) {
    return Result.ok({
      ...state,
      currentTransaction: significantTx,
    });
  }

  // No significant transactions found - continue monitoring
  return Result.ok(state);
}

// Graceful degradation with Result type
async function generateReasoningWithFallback(
  transaction: Transaction
): Promise<string> {
  const result = await llmService.generateCompletion(buildPrompt(transaction));

  if (Result.isOk(result)) {
    return result.value;
  }

  // LLM failed - use fallback reasoning
  logger.warn("LLM generation failed, using fallback", {
    error: result.error,
  });

  return `Large transaction detected: ${transaction.tokenSymbol} worth $${transaction.usdValue}`;
}
```

**Benefits over try-catch**:

- Type system enforces error handling (cannot ignore Result.isErr check)
- Error types are visible in function signatures
- Composable with functional patterns
- Easier to test (pure functions return Result values)

---

### 10.2 Data Flow Architecture

**Real-Time Data Flow** (Alerts):

```
1. Smart Money Workflow detects whale transaction
   ↓
2. LLM generates reasoning (analyzes significance)
   ↓
3. Alert object created and stored in PostgreSQL
   ↓
4. Alert published to Redis pub/sub channel
   ↓
5. WebSocket server broadcasts to connected clients
   ↓
6. Telegram bot sends notification (async)
   ↓
7. Frontend displays alert in real-time
```

**Request-Response Flow** (API):

```
1. Frontend makes GET /trades request
   ↓
2. API Gateway validates JWT
   ↓
3. TradeService.getUserTrades(userId)
   ↓
4. TradeRepository queries PostgreSQL
   ↓
5. Response mapped to DTOs
   ↓
6. JSON response returned to frontend
```

**Background Job Flow** (Cron):

```
1. Cron scheduler triggers narrative scouting (every 15 min)
   ↓
2. NarrativeScoutingWorkflow.invoke()
   ↓
3. Workflow executes asynchronously (scanning → clustering → scoring)
   ↓
4. Results persisted to PostgreSQL
   ↓
5. If new narrative enters top 10 → Publish to Redis pub/sub
   ↓
6. WebSocket broadcasts to frontend
```

---

### 10.3 Caching Strategy

**Cache Layers**:

**Client-Side** (SWR in React):

```typescript
import useSWR from "swr";

function Dashboard() {
  const { data: trades, error } = useSWR("/api/trades", fetcher, {
    refreshInterval: 10000, // Revalidate every 10s
    revalidateOnFocus: true,
  });

  if (error) return <ErrorMessage />;
  if (!data) return <Loading />;

  return <TradeList trades={trades} />;
}
```

**Server-Side** (Redis):

```typescript
class CacheService {
  async get<T>(key: string): Promise<T | null> {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set(key: string, value: unknown, ttl: number): Promise<void> {
    await redis.setex(key, ttl, JSON.stringify(value));
  }

  async invalidate(pattern: string): Promise<void> {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}
```

**Cache Invalidation**:

**Time-Based** (TTLs):

- Price data: 60 seconds
- On-chain transactions: 300 seconds (5 minutes)
- Social media posts: 900 seconds (15 minutes)
- Security scans: 86400 seconds (24 hours)

**Event-Based**:

```typescript
// Invalidate user trades cache on new trade
await tradeRepo.insert(trade);
await cache.invalidate(`trades:user:${userId}:*`);

// Invalidate security scan cache on new scan
await securityRepo.insert(scan);
await cache.invalidate(`security:${tokenAddress}`);
```

---

### 10.4 Rate Limiting

**External APIs**:

```typescript
class RateLimiter {
  private queues = new Map<string, PQueue>();

  // Rate limits per API provider
  private LIMITS = {
    coingecko: { concurrency: 10, intervalCap: 50, interval: 60000 }, // 50/min
    twitter: { concurrency: 5, intervalCap: 300, interval: 900000 }, // 300/15min
    etherscan: { concurrency: 5, intervalCap: 5, interval: 1000 }, // 5/sec
  };

  async execute<T>(provider: string, fn: () => Promise<T>): Promise<T> {
    const queue = this.getOrCreateQueue(provider);
    return queue.add(fn);
  }

  private getOrCreateQueue(provider: string): PQueue {
    if (!this.queues.has(provider)) {
      const limits = this.LIMITS[provider];
      this.queues.set(provider, new PQueue(limits));
    }
    return this.queues.get(provider);
  }
}

// Usage
const price = await rateLimiter.execute("coingecko", async () => {
  return coinGeckoMCP.getPrice("bitcoin");
});
```

**Internal APIs (Distributed Rate Limiting)**:

**Pattern**: Distributed API rate limiting across multiple service instances to prevent abuse and DDoS attacks.

**Library**: rate-limiter-flexible - Redis-backed distributed rate limiter.

**Rationale**:
- **Framework-Agnostic**: Works across Express, Fastify, raw Node.js - supports future framework migrations
- **Distributed Architecture**: Redis-backed ensures consistent limits across multiple service instances
- **Advanced Algorithms**: Token bucket, leaky bucket, sliding window strategies
- **Multi-Dimensional Limits**: Rate limit by IP, user ID, API key, or custom keys
- **Security-Critical**: Prevents brute force attacks on HITL approvals, API abuse, resource exhaustion

**Architectural Impact**:

```typescript
import { RateLimiterRedis } from "rate-limiter-flexible";
import { redis } from "@/lib/redis";

// Global API rate limiter (distributed across instances)
const apiRateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl:api",
  points: 100, // Number of requests
  duration: 60, // Per 60 seconds
});

// Strict rate limiting for trade execution endpoints
const tradeRateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl:trade",
  points: 10, // 10 trades per user
  duration: 60,
  blockDuration: 300, // Block for 5 minutes after exceeding
});

// Middleware integration with Result<T,E>
async function rateLimitMiddleware(req: Request, key: string): Promise<Result<void, string>> {
  try {
    await apiRateLimiter.consume(key);
    return Result.ok(undefined);
  } catch (error) {
    logger.warn({ key, endpoint: req.path }, "Rate limit exceeded");
    return Result.err("RATE_LIMIT_EXCEEDED");
  }
}
```

**Trade-offs**: Slightly more complex API than express-rate-limit, requires manual middleware setup. However, framework agnosticism and Redis-backed distributed rate limiting provide architectural flexibility and security benefits.

**Implementation**: See TSD-API.md for rate-limiter-flexible installation, Redis configuration, custom key strategies, and Express/Fastify middleware integration.

---

### 10.5 Schema-Based Validation

**Pattern**: All external data (API inputs, environment variables, configuration) must be validated against a schema at system boundaries.

**Library**: Zod - TypeScript-first schema validation library.

**Rationale**:
- **Single Source of Truth**: Schema definitions serve as both runtime validators and compile-time type generators
- **Type Safety**: `z.infer<typeof schema>` derives TypeScript types from schemas, eliminating type/validator drift
- **Composability**: Build complex schemas from primitives, extend with `.merge()`, `.pick()`, `.omit()`
- **Integration**: Integrates with Result<T,E> pattern (Section 6.5) for functional error handling
- **Bundle Size**: ~8KB vs 50KB+ for alternatives (class-validator, joi)

**Architectural Impact**:

```typescript
import { z } from 'zod';
import { Result } from '@satoshibits/functional';

// Environment variable validation (single source of truth)
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().default(6379),
  OPENAI_API_KEY: z.string().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>; // TypeScript type
export const env = envSchema.parse(process.env); // Runtime validation

// API input validation with Result pattern
const tradeSignalSchema = z.object({
  tokenSymbol: z.string().regex(/^[A-Z0-9]+$/),
  action: z.enum(['BUY', 'SELL']),
  entryPrice: z.number().positive(),
  stopLoss: z.number().positive(),
  takeProfit: z.number().positive(),
  positionSizeUSD: z.number().positive().max(5000), // Max $5k per trade
});

function validateTradeSignal(data: unknown): Result<TradeSignal, string> {
  const result = tradeSignalSchema.safeParse(data);

  if (result.success) {
    return Result.ok(result.data);
  } else {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    return Result.err(`Validation failed: ${errors}`);
  }
}

// Workflow integration
async function createTradeSignal(request: Request): Promise<Result<TradeSignal, string>> {
  const validationResult = validateTradeSignal(request.body);

  if (!Result.isOk(validationResult)) {
    logger.warn({ error: validationResult.error }, 'Invalid trade signal input');
    return validationResult;
  }

  const signal = validationResult.data;
  // Proceed with validated, type-safe data
  return saveToDatabase(signal);
}
```

**Adoption Strategy**:
1. **Phase 1 (MVP)**: Validate all API inputs (REST endpoints, WebSocket messages)
2. **Phase 2**: Validate environment variables and configuration files on startup
3. **Phase 3**: Add schema validation to LLM response parsing for structured outputs

**Implementation**: See TSD-API.md for Zod installation, schema definition patterns, custom validators, and error message customization.

---

### 10.6 Async Task Queues

**Pattern**: HITL approval requests and background jobs are processed asynchronously through persistent queues with retry, priority, and scheduling capabilities.

**Library**: @satoshibits/queue - Queue abstraction with BullMQ provider.

**Rationale**:
- **Immediate Development Velocity**: In-memory provider enables fast unit tests without Redis dependency
- **Team Familiarity**: Production-tested in team's existing projects, zero onboarding friction
- **Consistency**: Integrates with @satoshibits/functional Result<T,E> pattern (Section 6.5)
- **Architectural Optionality**: Thin abstraction preserves future flexibility without speculative implementation
- **BullMQ Provider Strengths**: Redis-backed, TypeScript-first, robust retry/priority/scheduling for HITL workflows

**Architectural Impact**:

```typescript
import { Queue, Worker } from "@satoshibits/queue";
import { Result } from "@satoshibits/functional";

// Queue for HITL approval workflows
const hitlQueue = new Queue<TradeApprovalRequest>("hitl-approvals", {
  provider: queueProvider,
});

// Worker with Result<T,E> integration
const worker = new Worker<TradeApprovalRequest, ApprovalDecision>(
  "hitl-approvals",
  async (data, job) => {
    const result = await processApproval(data);

    if (!Result.isOk(result)) {
      logger.error({ error: result.error, requestId: data.id }, "Approval processing failed");
      return result; // Worker handles retry based on error type
    }

    return result;
  },
  { provider: queueProvider }
);

// Enqueue with priority
await hitlQueue.add(approvalRequest, { priority: 1 });
```

**Use Cases**:
- **HITL Approvals**: Process user approval/rejection decisions asynchronously
- **Delayed Notifications**: Send alerts and notifications with retry logic
- **Background Jobs**: Process trade analytics, portfolio updates, security scans

**Trade-offs**: Abstraction adds slight indirection vs direct BullMQ, but immediate testing benefits and team consistency outweigh minimal overhead.

**Implementation**: See TSD-Services.md for @satoshibits/queue installation, BullMQ provider configuration, job retry strategies, and graceful shutdown patterns.

---

## 11. Appendices

### 11.1 FRD Traceability Matrix

This table maps ADD sections to FRD requirements for full traceability.

| ADD Section                 | FRD Requirements                        | Description                                          |
| --------------------------- | --------------------------------------- | ---------------------------------------------------- |
| 2.1 Architecture Principles | FR-LLM-001, FR-MCP-001, FR-HITL-001     | Event-driven state machines, LLM-agnostic, MCP-based |
| 3.1 Framework: LangGraph.js | Section 3, Section 4 (all workflows)    | Supports all 6 trading workflows                     |
| 3.3 Database: PostgreSQL    | Section 7.1, NFR-COMP-002, NFR-PERF-006 | ACID compliance, 7-year retention, query performance |
| 3.4 Cache: Redis            | FR-MCP-004, Section 7.2                 | MCP caching, real-time pub/sub                       |
| 4.2.1 Smart Money Tracking  | FR-SMT-001 to FR-SMT-006                | Whale wallet monitoring workflow                     |
| 4.2.2 Narrative Scouting    | FR-NS-001 to FR-NS-007                  | Social media narrative detection                     |
| 4.2.3 Security Detection    | FR-SEC-001 to FR-SEC-008                | Honeypot and scam detection                          |
| 4.3.1 Backtesting           | FR-BT-001 to FR-BT-005                  | Strategy validation workflow                         |
| 4.3.2 Breakout Trading      | FR-BT-006 to FR-BT-015                  | Semi-autonomous trading workflow                     |
| 4.3.3 Portfolio Management  | FR-PM-001 to FR-PM-006                  | Performance tracking and tax reporting               |
| 6.1 LLM Types               | FR-LLM-001 to FR-LLM-005                | Provider abstraction interface                       |
| 6.2 MCP Types               | FR-MCP-001 to FR-MCP-006                | MCP server and tool interfaces                       |
| 7.1 LLM Abstraction         | FR-LLM-001 to FR-LLM-005                | Provider switching, fallback, cost tracking          |
| 7.2 MCP Integration         | FR-MCP-001 to FR-MCP-006                | Tool registry, caching, circuit breaker              |
| 8.1 Deployment Topology     | Section 8.3                             | Vercel (frontend), Railway (backend)                 |
| 8.3 Authentication          | FR-USER-001 to FR-USER-006              | Registration, MFA, password management               |
| 8.3 HITL Security           | NFR-SEC-003                             | Approval token signing and validation                |
| 8.3 Data Encryption         | NFR-SEC-002, NFR-SEC-004                | API key encryption, TLS 1.3                          |
| 9.1 Logging                 | NFR-MAINT-005                           | Structured logging, log aggregation                  |
| 9.2 Metrics                 | NFR-PERF-001 to NFR-PERF-006            | Performance monitoring                               |
| 9.5 Uptime Monitoring       | NFR-REL-001                             | 95-99.5% uptime targets                              |

**Coverage**: All FRD functional requirements and NFRs traced to ADD design sections.

---

### 11.2 Technology Decision Records (ADRs)

**ADR-001: Why LangGraph.js over Custom State Machines**

**Context**: All 6 trading workflows require stateful, event-driven execution with cyclical patterns.

**Decision**: Use LangGraph.js as the state machine framework.

**Rationale**:

- **Cyclical Workflow Support**: Native support for loops and conditional branching
- **TypeScript Integration**: First-class TypeScript support, strong typing
- **State Persistence**: Built-in checkpointing for fault tolerance
- **Production-Ready**: Mature ecosystem, active development
- **LangChain Compatibility**: Seamless LLM provider integration

**Alternatives Considered**:

- Custom state machines: Too complex to build and maintain
- Temporal: Workflow orchestration overkill, heavy infrastructure
- n8n: Low-code platform, not suitable for code-first development

**Consequences**:

- Positive: Fast development, reliable execution, easy debugging
- Negative: Vendor dependency, learning curve for team

**Status**: Accepted

---

**ADR-002: Why PostgreSQL over MongoDB**

**Context**: Need reliable database for trade execution, audit trails, and compliance.

**Decision**: Use PostgreSQL 15+ as primary database.

**Rationale**:

- **ACID Compliance**: Critical for trade execution integrity
- **JSONB Support**: Flexible storage for AI reasoning, nested data
- **Mature Ecosystem**: Proven reliability, extensive tooling
- **7-Year Retention**: Supports NFR-COMP-002 compliance requirement

**Alternatives Considered**:

- MongoDB: No ACID guarantees, eventual consistency risks
- MySQL: Weaker JSONB support
- DynamoDB: NoSQL, higher cost for relational queries

**Consequences**:

- Positive: Data integrity, regulatory compliance, query flexibility
- Negative: Vertical scaling limits (mitigated by Railway auto-scaling)

**Status**: Accepted

---

**ADR-003: Why Vercel + Railway over AWS**

**Context**: Need fast deployment, managed infrastructure, minimal DevOps overhead for MVP.

**Decision**: Use Vercel for frontend, Railway for backend.

**Rationale**:

- **Vercel**: Optimized for Next.js, global CDN, zero-config deployments
- **Railway**: Managed PostgreSQL + Redis, Docker-based, auto-scaling
- **Developer Experience**: Git-based deployments, preview environments, simple pricing
- **Cost**: $50-100/month (MVP) vs $200-500/month on AWS

**Alternatives Considered**:

- AWS (ECS + RDS + ElastiCache): Over-engineered, steep learning curve, higher costs
- Heroku: Too expensive at scale ($25-50/mo per dyno)
- Self-hosted (DigitalOcean): Requires DevOps expertise, higher operational burden

**Consequences**:

- Positive: Fast MVP iteration, low operational burden, predictable costs
- Negative: Vendor lock-in (mitigated by containerization), scaling limits at high volume

**Status**: Accepted (MVP), revisit at 10,000+ users

---

**ADR-004: Why Hybrid File Structure over Pure Vertical**

**Context**: After consensus analysis with multiple architectural perspectives (PRO, NEUTRAL, AGAINST), we needed to decide between vertical (feature-based), horizontal (layer-based), or hybrid file structure organization for the backend codebase.

**Decision**: Adopt a hybrid structure combining vertical organization for workflows with horizontal organization for shared services.

**Rationale**:

- **Shared Services Problem**: LLMService, MCPService, auth, and notifications are used by all 6 workflows. Pure vertical structure would force code duplication or awkward placement.
- **Workflow Isolation**: Each workflow (smart-money, narrative-scouting, etc.) benefits from having all its specific code (graph, nodes, state, service, repository) in one folder.
- **Clear Dependencies**: Workflows depend on `/shared` services, never on each other, preventing cross-workflow coupling.
- **Scalability**: Easy to add new workflows without touching existing ones. Easy to delete workflows without affecting shared infrastructure.
- **Team Parallelization**: Different developers can own different workflow folders without merge conflicts.

**Structure**:

```
backend/
├── workflows/          # VERTICAL: Feature-based
│   ├── smart-money/
│   ├── narrative-scouting/
│   └── ...
├── shared/             # HORIZONTAL: Cross-cutting
│   ├── services/
│   │   ├── llm/
│   │   ├── mcp/
│   │   └── ...
│   ├── repositories/
│   └── types/
```

**Alternatives Considered**:

- **Pure Vertical**: Forces duplication of LLMService/MCPService across workflows or awkward `/common` folder that defeats vertical organization
- **Pure Horizontal (current)**: Scatters workflow-specific logic across multiple directories, making features hard to understand and modify
- **Vertical with /common**: Leads to confusion about what goes in /common vs /workflows, no clear rule

**Decision Rule**: If used by >1 workflow → `/shared`, if workflow-specific → `/workflows/{name}`

**Consequences**:

- Positive: Best of both worlds - workflow isolation + shared service reuse, clear placement rules, scales to 100+ workflows
- Negative: Requires migration from current horizontal structure (post-MVP), two organizational patterns to learn

**Status**: Accepted (v1.1), migration planned for post-MVP

**See Also**: Section 5.2.1 for detailed structure and migration path

---

**ADR-005: Passwordless Authentication (Architectural Override)**

**Context**: FRD originally specified password-based authentication with MFA (FR-USER-003). During architectural design, we re-evaluated this decision for a crypto trading platform requiring high-frequency HITL approvals.

**Decision**: Override FR-USER-003. Use passwordless authentication with WebAuthn/Passkeys (primary) and OAuth providers (secondary). **No password-based authentication.**

**Rationale**:

- **Phishing-Resistant Security**: WebAuthn credentials are cryptographically bound to the origin domain, eliminating the #1 account takeover vector for crypto trading platforms (phishing attacks). Passwords remain vulnerable to phishing regardless of MFA.
- **Crypto-Native Trust Model**: WebAuthn mirrors self-custody principles—private keys stay on user's device, no centralized credential database to breach. Aligns with target user values.
- **Optimal HITL UX**: Biometric authentication (fingerprint/face scan) provides fastest possible approval flow for time-sensitive trade decisions. Password + TOTP creates friction at the worst possible moment.
- **No Password Liability**: Eliminates entire attack surfaces: credential stuffing, password reuse, weak passwords, rainbow table attacks, password database breaches, secure password storage/rotation requirements.
- **OAuth Pragmatism**: Google/Apple Sign-In provides familiar one-click login for mainstream users, outsources security to providers with robust infrastructure and dedicated security teams.
- **Auth.js Ecosystem**: Industry-standard Next.js authentication library actively discourages password-based authentication, provides well-tested provider model.

**Alternatives Considered**:

- **Password + MFA (FRD Original)**: Vulnerable to phishing, slow HITL UX, maintenance burden for password policies/rotation/recovery
- **Magic Links**: Too slow for time-sensitive HITL approvals (email delivery latency), poor UX on mobile devices
- **SMS OTP**: Vulnerable to SIM swapping (common in crypto space), regulatory restrictions, delivery costs

**FRD Changes Required**:

Updated FRD to v3.0 with breaking changes:
- FR-USER-001: Registration via WebAuthn/Passkeys or OAuth
- FR-USER-002: Authentication via WebAuthn/Passkeys or OAuth (inherent MFA)
- FR-USER-003: **SUPERSEDED** - Replaced with passwordless security requirements
- NFR-SEC-001: Mandatory passwordless authentication for all user accounts
- New Entities: Authenticators, OAuth Accounts (replace password hash field)

**Consequences**:

- Positive: Step-function security improvement, faster HITL approvals, no password maintenance burden, alignment with crypto-native values
- Negative: WebAuthn requires modern browser (97%+ coverage), OAuth introduces provider dependency, fallback for device loss requires recovery flow
- Trade-offs Accepted: Modern browser requirement acceptable for crypto trading user base, OAuth provider dependency acceptable given security benefits

**Status**: Accepted (v2.0), implemented in FRD v4.0 and Section 8.3

**See Also**: Section 8.3 (Security Architecture), TSD-Authentication.md

---

### 11.3 Deployment Checklist

**Pre-Launch Validation**:

**Environment Configuration**:

- [ ] Environment variables configured (Vercel + Railway)
- [ ] Database credentials set
- [ ] Redis connection string set
- [ ] LLM API keys configured (OpenAI, Anthropic, Google)
- [ ] MCP server API keys configured
- [ ] Email service API key (SendGrid)
- [ ] Telegram bot token set
- [ ] FCM server key configured
- [ ] JWT secret generated (random, 256-bit)
- [ ] Encryption key generated (random, 256-bit)

**Database Setup**:

- [ ] Database migrations applied (see TSD)
- [ ] Indexes created (see TSD)
- [ ] Connection pooling configured (PgBouncer)
- [ ] Backup schedule enabled (daily, 30-day retention)

**MCP Servers**:

- [ ] The Graph MCP connected and tested
- [ ] CoinGecko MCP connected and tested
- [ ] DefiLlama MCP connected and tested
- [ ] LunarCrush MCP connected and tested
- [ ] CryptoPanic MCP connected and tested
- [ ] TradingView MCP connected and tested
- [ ] Exchange MCP (Binance or CCXT) connected and tested

**LLM Providers**:

- [ ] OpenAI provider configured and tested
- [ ] Anthropic provider configured and tested
- [ ] Google provider configured and tested
- [ ] Fallback provider tested
- [ ] Cost tracking enabled
- [ ] Cost limits configured

**Monitoring**:

- [ ] Sentry error tracking configured
- [ ] Railway monitoring enabled
- [ ] Uptime monitoring configured (UptimeRobot)
- [ ] Alert rules set up (Slack + Email)
- [ ] Health endpoint tested (/health)

**Security**:

- [ ] HTTPS enabled (automatic on Vercel + Railway)
- [ ] CORS configured
- [ ] Rate limiting enabled
- [ ] JWT expiration tested
- [ ] MFA setup tested
- [ ] API key encryption tested

**Testing**:

- [ ] Unit tests passing (80% coverage minimum)
- [ ] Integration tests passing (all workflows)
- [ ] E2E tests passing (critical paths)
- [ ] Load testing completed (expected traffic + 2x buffer)
- [ ] Security scan completed (OWASP Top 10)

**Documentation**:

- [ ] README updated with setup instructions
- [ ] API documentation generated (OpenAPI spec)
- [ ] Architecture Decision Records (ADRs) documented
- [ ] Deployment runbook created (see TSD)

---

### 11.4 References

**External Documentation**:

- [LangGraph.js Documentation](https://js.langchain.com/docs/langgraph)
- [Model Context Protocol (MCP) Specification](https://modelcontextprotocol.io/)
- [Next.js Documentation](https://nextjs.org/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Redis Documentation](https://redis.io/documentation)
- [Vercel Deployment Guide](https://vercel.com/docs)
- [Railway Documentation](https://docs.railway.app/)

**Internal Documentation**:

- [FRD v4.0 - Functional Requirements Document](./02-Functional%20Requirements%20Document%20-%20Crypto%20Trading%20AI%20Agent%20Ecosystem.md)
- [Building AI Agents - A Complete Guide](./Building%20AI%20Agents%20-%20A%20Complete%20Guide.md)
- [The Complete Professional Crypto Trading Framework](./The%20Complete%20Professional%20Crypto%20Trading%20Framework.md)

**MCP Server Repositories**:

- [The Graph MCP](https://github.com/kukapay/thegraph-mcp)
- [CryptoPanic MCP](https://github.com/kukapay/cryptopanic-mcp)
- [TradingView MCP](https://github.com/atilaahmettaner/tradingview-mcp)
- [Binance MCP](https://github.com/AnalyticAce/BinanceMCPServer)

---

**End of Application Design Document (v2.1)**

**Document Boundaries Maintained**:

- This ADD defines HOW the system is architected and designed
- Technical Specification Document (TSD) will define HOW EXACTLY (database schemas, API specs, CI/CD config, deployment procedures)

**Next Steps**:

1. User reviews and approves ADD v2.1
2. Create Technical Specification Document (TSD) - Database schemas, API specifications, CI/CD pipelines, deployment procedures
3. Begin implementation following ADD architecture patterns
