---
id: TSD-CRYPTO-WORKFLOWS
title: Crypto Workflow Engine Specifications
status: Draft
version: 1.1.0
owner: '@owner'
last_updated: '2026-02-03'
parent: ../../03-architecture/platform-core-add.md
domain: crypto
---

# Crypto Workflow Engine Specifications

**Crypto Domain – LangGraph.js AI Reasoning Patterns**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1.1.0 | 2026-02-03 | Multi-Model Consensus | Clarified LangGraph as Inngest activity, not primary engine |
| v1.0.0 | 2026-02-02 | Document Review | Extracted from crypto ADD, aligned with Platform Core |

---

## 1. Overview

This document defines the LangGraph.js **AI reasoning patterns** for the Crypto Trading Domain. LangGraph provides cognitive capabilities **within Inngest workflow steps**, not as a separate orchestration engine.

**Contents:**
- 6 trading workflows (orchestrated by Inngest)
- LangGraph reasoning activities (run inside `step.run()`)
- State definitions
- Node functions
- Error handling patterns

> **Architecture (Multi-Model Consensus 2026-02-02):**
> - **Inngest** = Orchestration (timers, HITL, retries, state persistence)
> - **LangGraph.js** = AI Reasoning (runs INSIDE `step.run()` as an activity)
> - **Single Source of Truth**: Inngest owns workflow state; LangGraph is stateless per invocation
>
> See [Platform Core ADD](../../03-architecture/platform-core-add.md) Section 3 and [Platform Core TSD](../platform-core/index.md).

---

## 2. LangGraph.js Fundamentals

### 2.1 Core Concepts

- **State Graph**: Directed graph of nodes (functions) and edges (transitions)
- **State**: Data object passed between nodes, persisted at checkpoints
- **Nodes**: Functions that process state and return updated state
- **Edges**: Define transitions between nodes (conditional or unconditional)
- **Channels**: Named state attributes that flow through the graph

### 2.2 Pattern Template

```typescript
import { StateGraph, END } from '@langchain/langgraph';

// 1. define state interface
interface WorkflowState {
  data: SomeData;
  error?: Error;
}

// 2. define node functions
async function nodeA(state: WorkflowState): Promise<WorkflowState> {
  return { ...state, data: processedData };
}

// 3. build graph
const graph = new StateGraph({ channels: { data: null, error: null } });
graph.addNode('nodeA', nodeA);
graph.addNode('nodeB', nodeB);

// 4. define edges
graph.addEdge('nodeA', 'nodeB');
graph.addConditionalEdges('nodeB', routeLogic, {
  success: 'nodeC',
  failure: END,
});

// 5. set entry point and compile
graph.setEntryPoint('nodeA');
const workflow = graph.compile();
```

---

## 3. Trading Workflows

### 3.1 Smart Money Tracking (FR-SMT-001 to FR-SMT-006)

**Purpose**: Monitor whale wallets for significant transactions and generate actionable alerts.

#### State Definition

```typescript
interface SmartMoneyState {
  wallets: WalletAddress[];
  currentTransaction?: {
    walletAddress: string;
    blockchain: string;
    tokenSymbol: string;
    amount: number;
    direction: 'buy' | 'sell' | 'transfer';
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

#### Workflow Graph

```
monitoring → analyzing → alerting → updating_history → monitoring (loop)
           ↓
         (skip if below threshold)
```

#### Node Functions

**monitorWallets** (monitoring state):
- Poll on-chain indexer (The Graph MCP) for monitored wallet transactions
- Phase 1 (L2-only): Arbitrum, Base, Optimism. See database.md Appendix A for Phase 3+ chains.
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
- Deliver via HITL Gateway for user notification
- Target latency: <30 seconds from transaction confirmation

**storeTransaction** (updating_history state):
- Persist transaction to `smart_money_transactions` table
- Update wallet behavior patterns
- Transition back to `monitoring`

---

### 3.2 Narrative Scouting (FR-NS-001 to FR-NS-007)

**Purpose**: Identify emerging crypto narratives before mainstream awareness.

#### State Definition

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
  platform: 'farcaster' | 'lens' | 'reddit' | 'telegram';
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

#### Workflow Graph

```
scanning → clustering → scoring → filtering → enriching → alerting → (wait 15min) → scanning
```

#### Node Functions

**scanSocialMedia** (scanning state):
- Query LunarCrush MCP, on-chain social (Farcaster, Lens)
- Collect minimum 10,000 posts per cycle
- Filter crypto-specific keywords and hashtags
- Target cycle time: <15 minutes

**clusterPosts** (clustering state):
- Use LLM embeddings for semantic similarity
- Group posts into narrative clusters
- Assign theme labels automatically

**scoreNarratives** (scoring state):
- Calculate strength score using weighted formula:
  - Engagement Velocity (40%)
  - Influencer Participation (30%)
  - Unique Participants (20%)
  - Token Correlation (10%)

**filterDuplicates** (filtering state):
- Detect and merge near-duplicate narratives
- Ensure top 10 narratives are distinct

**enrichNarratives** (enriching state):
- Extract token mentions (ticker symbols, contract addresses)
- Validate token legitimacy
- Identify key influencers

**deliverNarratives** (alerting state):
- Display top 10 narratives on dashboard
- Highlight narratives with >20% score increase (24h)

---

### 3.3 Security & Scam Detection (FR-SEC-001 to FR-SEC-008)

**Purpose**: Automated security analysis to detect honeypots, rug pulls, and malicious contracts.

#### State Definition

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
  riskScore?: 'Low' | 'Medium' | 'High' | 'Critical';
  report?: SecurityReport;
  blocked: boolean;
}
```

#### Workflow Graph

```
initiated → contract_analysis → liquidity_check → team_verification → risk_scoring
                                                                            ↓
                                                     (risk >= High) → blocking → reporting → complete
                                                     (risk < High) → reporting → complete
```

#### Node Functions

**analyzeContract** (contract_analysis state):
- Invoke GoPlus MCP for honeypot detection
- Check for hidden transfer fees, blacklist functions
- Analyze ownership and proxy patterns
- Return findings object

**checkLiquidity** (liquidity_check state):
- Query DEX Screener for liquidity data
- Check LP token lock status via block explorer
- Calculate total liquidity depth in USD

**verifyTeam** (team_verification state):
- Cross-reference team wallets with known scammers
- Check GitHub activity for the project
- Identify red flags from social presence

**calculateRiskScore** (risk_scoring state):
- Aggregate findings into weighted risk score
- Categories: Low, Medium, High, Critical
- Conditional routing based on score

**blockToken** (blocking state):
- Add token to user's blocklist
- Prevent trade signals for this token
- Log blocking action

**generateReport** (reporting state):
- Create human-readable security report
- Store in `security_scans` table
- Send notification if High/Critical risk

---

### 3.4 Breakout Trading (FR-BT-001 to FR-BT-015)

**Purpose**: Identify and trade technical breakout patterns.

#### State Definition

```typescript
interface BreakoutTradingState {
  symbol: string;
  timeframe: string;
  candleData: Candle[];
  patterns?: {
    triangles: Pattern[];
    flags: Pattern[];
    wedges: Pattern[];
    consolidations: Pattern[];
  };
  breakout?: {
    type: 'bullish' | 'bearish';
    price: number;
    volume: number;
    strength: number;
  };
  tradeSignal?: TradeSignal;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  trade?: Trade;
  error?: Error;
}
```

#### Workflow Graph

```
scanning → pattern_detection → breakout_confirmation → signal_generation →
  → hitl_approval → (approved) → trade_execution → monitoring →
  → (exit conditions) → close_position → complete
```

#### Node Functions

**scanMarkets** (scanning state):
- Fetch OHLCV data from CCXT MCP
- Calculate technical indicators (RSI, MACD, Bollinger)
- Identify potential breakout candidates

**detectPatterns** (pattern_detection state):
- Use TradingView MCP for pattern recognition
- Classify: triangles, flags, wedges, consolidations
- Score pattern quality

**confirmBreakout** (breakout_confirmation state):
- Validate breakout with volume surge (>2x average)
- Check for false breakout indicators
- Calculate breakout strength

**generateSignal** (signal_generation state):
- Calculate entry, stop-loss, take-profit levels
- Invoke LLM for trade reasoning
- Create trade signal record

**requestApproval** (hitl_approval state):
- Send signal to HITL Gateway
- Wait for user approval with timeout
- Handle approval/rejection

**executeTrade** (trade_execution state):
- Submit order via exchange MCP
- Record trade in database
- Set up exit monitoring

---

### 3.5 Backtesting (FR-BT-001 to FR-BT-005)

**Purpose**: Historical strategy validation before live deployment.

#### State Definition

```typescript
interface BacktestingState {
  strategy: StrategyConfig;
  symbol: string;
  startDate: Date;
  endDate: Date;
  historicalData: Candle[];
  trades: BacktestTrade[];
  metrics?: BacktestMetrics;
  report?: BacktestReport;
  error?: Error;
}

interface BacktestMetrics {
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  profitFactor: number;
}
```

#### Workflow Graph

```
loading_data → simulating → calculating_metrics → generating_report → complete
```

#### Node Functions

**loadHistoricalData** (loading_data state):
- Fetch candle data from DuckDB analytics storage
- Validate data completeness
- Prepare for simulation

**simulateTrades** (simulating state):
- Run strategy logic against historical data
- Record simulated entries and exits
- Track position sizing and P&L

**calculateMetrics** (calculating_metrics state):
- Compute performance statistics
- Calculate risk-adjusted returns (Sharpe, Sortino)
- Identify max drawdown periods

**generateReport** (generating_report state):
- Create comprehensive backtest report
- Store results in DuckDB
- Generate visualizations for dashboard

---

### 3.6 Portfolio Management (FR-PM-001 to FR-PM-006)

**Purpose**: Aggregate portfolio tracking and risk management.

#### State Definition

```typescript
interface PortfolioState {
  userId: number;
  positions: Position[];
  totalValue: number;
  allocation: AllocationMap;
  riskMetrics?: {
    portfolioBeta: number;
    valueAtRisk: number;
    correlationMatrix: number[][];
  };
  rebalanceRecommendations?: RebalanceAction[];
  error?: Error;
}

interface Position {
  tokenSymbol: string;
  tokenAddress: string;
  blockchain: string;
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  allocationPercent: number;
}
```

#### Workflow Graph

```
syncing_positions → pricing → calculating_metrics → checking_alerts →
  → (rebalance needed) → generating_recommendations → complete
```

#### Node Functions

**syncPositions** (syncing_positions state):
- Aggregate open positions from trades table
- Include external wallet holdings if configured
- Calculate quantities per token

**updatePricing** (pricing state):
- Fetch current prices from CoinGecko MCP
- Calculate portfolio total value
- Update unrealized P&L

**calculateRiskMetrics** (calculating_metrics state):
- Compute allocation percentages
- Calculate portfolio beta and VaR
- Generate correlation matrix

**checkAlerts** (checking_alerts state):
- Check concentration limits (single token >20%)
- Check drawdown thresholds
- Check rebalancing triggers

**generateRecommendations** (generating_recommendations state):
- Suggest rebalancing actions
- Calculate target allocations
- Create recommendations for user review

---

## 4. Error Handling

### 4.1 Error Categories

```typescript
type WorkflowError =
  | { _tag: 'MCPError'; serverId: string; message: string }
  | { _tag: 'LLMError'; provider: string; message: string }
  | { _tag: 'DatabaseError'; operation: string; message: string }
  | { _tag: 'ValidationError'; field: string; message: string }
  | { _tag: 'TimeoutError'; step: string; durationMs: number }
  | { _tag: 'HITLTimeoutError'; signalId: number; expirationMs: number };
```

### 4.2 Retry Strategy

```typescript
// MCP failures: exponential backoff, max 3 retries
const mcpRetry = {
  maxAttempts: 3,
  backoff: 'exponential',
  baseDelay: 1000,
  maxDelay: 10000,
};

// LLM failures: fallback to secondary provider
const llmFallback = ['openai', 'anthropic', 'google'];

// HITL timeout: workflow pauses, user notified
const hitlTimeout = 24 * 60 * 60 * 1000; // 24 hours
```

### 4.3 State Checkpointing

All workflows use LangGraph's built-in checkpointing for recovery:

```typescript
const workflow = graph.compile({
  checkpointer: new PostgresCheckpointer(db),
});

// recover from last checkpoint after restart
const state = await workflow.getState(threadId);
await workflow.invoke(state, { configurable: { thread_id: threadId } });
```

---

## 5. Observability

### 5.1 Workflow Logging

```typescript
import type pino from 'pino';

function createWorkflowLogger(
  baseLogger: pino.Logger,
  workflowId: string,
  executionId: string
): pino.Logger {
  return baseLogger.child({
    workflowId,
    executionId,
    type: 'workflow',
  });
}

// usage in node function
async function analyzeTransaction(state: SmartMoneyState): Promise<SmartMoneyState> {
  const logger = createWorkflowLogger(baseLogger, 'smart-money-tracking', state.executionId);

  logger.info({ walletAddress: state.currentTransaction?.walletAddress }, 'analyzing transaction');

  // ... analysis logic

  logger.info({ confidenceScore: alert.confidenceScore }, 'analysis complete');

  return { ...state, alert };
}
```

### 5.2 Metrics

| Metric | Description | Labels |
|--------|-------------|--------|
| `workflow_executions_total` | Total workflow runs | workflow_id, status |
| `workflow_duration_seconds` | Execution time | workflow_id |
| `workflow_node_duration_seconds` | Per-node execution time | workflow_id, node_id |
| `hitl_approvals_total` | HITL approval outcomes | workflow_id, decision |
| `trade_signals_generated_total` | Trade signals created | workflow_id, signal_type |

---

## 6. Integration with Platform Core

### 6.1 HITL Gateway Integration

```typescript
import { HITLGateway } from '@aptivo/core/hitl';

async function requestApproval(state: BreakoutTradingState): Promise<BreakoutTradingState> {
  const hitl = new HITLGateway(db, logger);

  const request = await hitl.createRequest({
    userId: state.userId,
    workflowId: 'breakout-trading',
    workflowRunId: state.executionId,
    requestType: 'trade_approval',
    context: {
      signal: state.tradeSignal,
      reasoning: state.tradeSignal?.aiReasoning,
    },
    policyId: 'single-approver',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    channels: ['web', 'telegram'],
  });

  // workflow pauses here until approval received
  return { ...state, hitlRequestId: request.id, approvalStatus: 'pending' };
}
```

### 6.2 LLM Gateway Integration

```typescript
import { LLMGateway } from '@aptivo/core/llm';

async function generateReasoning(
  transaction: Transaction,
  llmGateway: LLMGateway
): Promise<string> {
  const result = await llmGateway.generateCompletion({
    workflowId: 'smart-money-tracking',
    prompt: `Analyze this smart money transaction: ${JSON.stringify(transaction)}`,
    maxTokens: 200,
    provider: 'openai', // or let gateway choose based on budget
  });

  if (!result.success) {
    throw new Error(`LLM generation failed: ${result.error.message}`);
  }

  return result.value;
}
```

### 6.3 Notification Bus Integration

```typescript
import { NotificationBus } from '@aptivo/core/notifications';

async function sendAlert(
  alert: SmartMoneyAlert,
  notificationBus: NotificationBus
): Promise<void> {
  await notificationBus.dispatch({
    userId: alert.userId,
    templateId: 'smart-money-alert',
    channel: 'telegram',
    priority: 'high',
    data: {
      walletAddress: alert.walletAddress,
      tokenSymbol: alert.tokenSymbol,
      usdValue: alert.usdValue,
      reasoning: alert.reasoning,
    },
  });
}
```

---

## Traceability

### Upstream References

| Requirement | Source Document | Section |
|-------------|-----------------|---------|
| Smart Money Tracking Workflow | crypto-domain-frd.md | CRYPTO-WF-SMT-001, FR-CRYPTO-SMT-* |
| Narrative Scouting Workflow | crypto-domain-frd.md | CRYPTO-WF-NS-001, FR-CRYPTO-NS-* |
| Security Detection Workflow | crypto-domain-frd.md | CRYPTO-WF-SEC-001, FR-CRYPTO-SEC-001 |
| Systematic Trading Workflow | crypto-domain-frd.md | CRYPTO-WF-TRD-001, FR-CRYPTO-TRD-* |
| Durable Execution | platform-core-frd.md | FR-CORE-WFE-* |
| HITL Integration | platform-core/hitl-gateway.md | All sections |
| LLM Integration | platform-core/llm-gateway.md | All sections |

### Downstream References

| Implementation | Target Document | Section |
|----------------|-----------------|---------|
| API Triggers | crypto/api.md | Workflow endpoints |
| Data Persistence | crypto/database.md | Agent runs table |
