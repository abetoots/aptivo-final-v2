---
id: FRD-CRYPTO-DOMAIN
title: Crypto Trading Domain - Functional Requirements Document
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-02-02'
parent: platform-core-frd.md
---

# Crypto Trading Domain - Functional Requirements Document

**Version**: 1.0.0
**Date**: February 2, 2026
**Status**: Draft (Multi-Model Consensus Review)
**Dependencies**: `platform-core-frd.md` (Inherits Core Capabilities)
**BRD Reference**: `../01-strategy/crypto-domain-addendum.md`

---

## 1. Executive Summary

This document defines the functional requirements for the **Crypto Trading Domain Application** built upon the Aptivo Agentic Core. It specifies the trading logic, risk management enforcement, and external integrations required to execute the business objectives defined in `crypto-domain-addendum.md`.

### 1.1 Scope

This FRD covers:
- Trading-specific workflow definitions (State Machines)
- Domain data models (Signals, Trades, Wallets)
- Risk management logic and position sizing
- Exchange and data provider integrations via MCP
- Paper trading and simulation requirements

### 1.2 Platform Core Inheritance

This domain application relies on the **Platform Core** for the following capabilities (do NOT reimplement):

| Core Capability | Usage in Crypto Domain |
|-----------------|------------------------|
| Workflow Orchestration (FR-CORE-WFE-*) | Durable execution of trading states |
| HITL Gateway (FR-CORE-HITL-*) | Human approval for trade execution |
| MCP Layer (FR-CORE-MCP-*) | Exchange APIs, blockchain explorers |
| LLM Gateway (FR-CORE-LLM-*) | Sentiment analysis, narrative extraction |
| Notification Bus (FR-CORE-NOTIF-*) | Trade alerts via Telegram/Email |
| Audit Service (FR-CORE-AUD-*) | Immutable logging of decisions |
| Identity Service (FR-CORE-ID-*) | Trader authentication |

---

## 2. Domain Data Model

The following entities must be defined in the domain schema (`aptivo_trading.*`).

### 2.1 Core Entities

| Entity | Business Purpose | Key Fields |
|--------|------------------|------------|
| MonitoredWallet | Blockchain address (Whale/Smart Money) to track | Address, Chain, Label, HistoricalPerformance, LastActive |
| MarketNarrative | Emerging trend identified from data sources | Name, StrengthScore, AssociatedTokens[], SourceUrls[], Timestamp |
| TradeSignal | System-generated opportunity waiting for action | Token, Direction, EntryZone, StopLoss, TakeProfit, Reasoning, ConfidenceScore, Expiration |
| TradeExecution | Realized position (Paper or Live) | SignalID, Exchange, EntryPrice, ExitPrice, Size, PnL, Status, RiskData |
| SecurityReport | Risk assessment for a specific token | TokenAddress, HoneypotCheck, LiquidityLock, RenouncedOwnership, RiskScore (0-100) |
| PortfolioState | Current holdings snapshot | TotalValue, Positions[], DailyPnL, DrawdownLevel |

---

## 3. Workflow Specifications (State Machines)

All workflows must be implemented using the **Platform Core Durable Execution Engine** (FR-CORE-WFE-*).

### 3.1 Smart Money Tracking Workflow

**Workflow ID**: CRYPTO-WF-SMT-001
**Trigger**: Periodic Schedule (e.g., every 5 mins) OR On-Chain Event (Webhook)

| State | Description | Transitions |
|-------|-------------|-------------|
| `POLLING` | Query RPC/Indexers for new txs from MonitoredWallet list | → `ANALYZING` (if tx found), → `SLEEP` (if no tx) |
| `ANALYZING` | LLM analyzes transaction intent (Buy/Sell/Bridge/Seed) | → `FILTERING` |
| `FILTERING` | Apply significance thresholds (e.g., >$10k value) | → `ALERTING` (if significant), → `SLEEP` (if noise) |
| `ALERTING` | Dispatch notification via Core Notification Bus | → `SLEEP` |
| `SLEEP` | Wait for next cycle or event (uses FR-CORE-WFE-003) | → `POLLING` |

### 3.2 Narrative Scouting Workflow

**Workflow ID**: CRYPTO-WF-NS-001
**Trigger**: Scheduled (e.g., every 4 hours)

| State | Description | Transitions |
|-------|-------------|-------------|
| `SCANNING` | Ingest data from configured sources | → `CLUSTERING` |
| `CLUSTERING` | LLM extracts keywords, groups into narratives | → `SCORING` |
| `SCORING` | Calculate strength score based on frequency/velocity | → `MAPPING` |
| `MAPPING` | Associate narratives with specific tokens | → `STORING` |
| `STORING` | Persist narratives, surface top ones on dashboard | → `SLEEP` |

### 3.3 Security Detection Workflow

**Workflow ID**: CRYPTO-WF-SEC-001
**Trigger**: Called by Trading Workflow before execution

| State | Description | Transitions |
|-------|-------------|-------------|
| `INITIATED` | Receive token address for screening | → `LIQUIDITY_CHECK` |
| `LIQUIDITY_CHECK` | Verify minimum liquidity threshold | → `CONTRACT_SCAN` (pass), → `REJECTED` (fail) |
| `CONTRACT_SCAN` | Check honeypot, mintable, renounced ownership | → `TEAM_VERIFY` (pass), → `REJECTED` (fail) |
| `TEAM_VERIFY` | Optional team/deployer verification | → `APPROVED` (pass), → `REJECTED` (fail) |
| `APPROVED` | Return security report with risk score | Terminal |
| `REJECTED` | Log rejection reason, block trade | Terminal |

### 3.4 Systematic Trading Workflow

**Workflow ID**: CRYPTO-WF-TRD-001
**Trigger**: Market Data Update OR Narrative Signal

| State | Description | Transitions |
|-------|-------------|-------------|
| `SIGNAL_GENERATION` | Analyze market data/narratives to propose trade | → `SECURITY_CHECK` |
| `SECURITY_CHECK` | Run Security Detection Workflow (CRYPTO-WF-SEC-001) | → `RISK_VALIDATION` (safe), → `DISCARDED` (unsafe) |
| `RISK_VALIDATION` | Check portfolio exposure, position limits | → `HITL_APPROVAL` (valid), → `DISCARDED` (limits exceeded) |
| `HITL_APPROVAL` | **Core HITL Gateway**: Pause for human sign-off | → `EXECUTION` (Approved), → `DISCARDED` (Rejected/Timeout) |
| `EXECUTION` | Execute order via Exchange MCP (Live or Paper) | → `MONITORING` |
| `MONITORING` | Track price vs SL/TP levels | → `EXIT` (SL/TP hit), → `MONITORING` (continue) |
| `EXIT` | Close position and log PnL | → `COMPLETE` |
| `DISCARDED` | Log discard reason | Terminal |
| `COMPLETE` | Trade lifecycle complete | Terminal |

---

## 4. Functional Requirements

### 4.1 Smart Money Tracking

**FR-CRYPTO-SMT-001: Multi-Chain Wallet Monitoring**

**Requirement**: System shall monitor configured addresses across EVM L2s (Base, Arbitrum, Optimism).

**Acceptance Criteria**:
- Detects ERC-20 token transfers on supported L2 chains
- Normalizes amounts to USD value using current prices
- Updates occur within 60 seconds of block confirmation
- Supports adding/removing wallets without restart

> **Scope Note**: L2-first strategy per BRD. Additional chains (Ethereum L1, Solana, BSC) deferred to Phase 3+.

**FR-CRYPTO-SMT-002: Noise Filtering**

**Requirement**: System shall filter transactions below configurable USD threshold (default: $10,000).

**Acceptance Criteria**:
- Tiny "dust" transactions do not trigger alerts
- Approval/Revoke transactions are ignored unless specified
- Threshold is configurable per wallet

**FR-CRYPTO-SMT-003: Transaction Analysis**

**Requirement**: System shall classify transaction intent using LLM analysis.

**Acceptance Criteria**:
- Classifies as: Buy, Sell, Bridge, Seed, LP Add/Remove, Other
- Provides reasoning for classification
- Stores historical patterns for each wallet

---

### 4.2 Narrative Scouting

**FR-CRYPTO-NS-001: Narrative Clustering**

**Requirement**: System shall ingest text data from social/on-chain sources and cluster them into named narratives.

**Acceptance Criteria**:
- LLM extracts keywords and sentiment
- Groups similar topics (e.g., "AI Tokens", "Gaming") together
- Assigns a "Strength Score" based on mention frequency and velocity

**FR-CRYPTO-NS-002: Token Association**

**Requirement**: System shall identify specific token tickers associated with a narrative.

**Acceptance Criteria**:
- Outputs a list of tickers (e.g., $FET, $RNDR for "AI")
- Filters out tickers with low liquidity or security flags
- Links to Security Detection Workflow (FR-CRYPTO-SEC-001)

---

### 4.3 Security & Risk

**FR-CRYPTO-SEC-001: Automated Token Screening**

**Requirement**: Before any trade signal is generated, the target token must pass a security scan.

**Acceptance Criteria**:
- Check liquidity > $50k (configurable)
- Check "Honeypot" status (cannot sell)
- Check "Mintable" status (infinite supply risk)
- If Risk Score > Threshold, signal is strictly rejected
- Results are cached with configurable TTL

**FR-CRYPTO-RISK-001: Position Sizing Enforcement**

**Requirement**: System shall calculate position size based on portfolio percentage.

**Acceptance Criteria**:
- Input: Portfolio Balance, Risk %, Stop Loss distance
- Output: Exact token amount to buy
- Hard limit: Cannot exceed max position size (default 3%)
- Cannot exceed max concurrent positions (default 5)

**FR-CRYPTO-RISK-002: Daily Loss Limit (Circuit Breaker)**

**Requirement**: System shall halt new entries if daily drawdown exceeds defined limit.

**Acceptance Criteria**:
- Real-time PnL tracking
- If limit hit (default 5%), transition to PAUSED state
- Requires human intervention to reset
- PAUSED state persists across restarts

**FR-CRYPTO-RISK-003: Minimum Risk:Reward Enforcement**

**Requirement**: System shall reject signals that don't meet minimum R:R ratio.

**Acceptance Criteria**:
- Calculates R:R from entry zone, stop loss, take profit
- Minimum ratio enforced (default 1:2)
- Signals below threshold are auto-rejected

---

### 4.4 Systematic Trading Execution

**FR-CRYPTO-TRD-001: HITL Integration**

**Requirement**: All **Live** trades must pass through the Core HITL Gateway before execution.

**Acceptance Criteria**:
- Approval request includes: Token, Direction, Size ($), Reasoning, Risk Assessment
- Request expires after configurable timeout (default 15 minutes)
- No auto-execution allowed for Live Trading
- **Paper/Simulation mode**: May bypass HITL for strategy validation and backtesting (no financial risk)

> **BRD Alignment**: BRD requires human oversight for trades to manage capital risk. Paper trading has zero financial risk, so HITL bypass is permitted for testing purposes only.

**FR-CRYPTO-TRD-002: Paper Trading Mode**

**Requirement**: System shall support a "Paper Trading" mode that simulates execution without real funds.

**Acceptance Criteria**:
- Uses live price data
- Simulates slippage (configurable, default 0.5%) and fees (default 0.1%)
- Tracks "Paper PnL" separately from "Live PnL"
- Toggle switch in settings to flip between Paper/Live context
- All Paper trades are audited same as Live trades

**FR-CRYPTO-TRD-003: Order Execution**

**Requirement**: System shall execute orders via Exchange MCP tools.

**Acceptance Criteria**:
- Supports market and limit orders
- Confirms execution with actual fill price
- Logs execution details including slippage
- Handles partial fills appropriately

**FR-CRYPTO-TRD-004: Position Monitoring**

**Requirement**: System shall monitor open positions against stop loss and take profit levels.

**Acceptance Criteria**:
- Price checks occur at configurable interval (default 30 seconds)
- Stop loss triggers immediate exit
- Take profit can trigger partial or full exit
- Position state persists across restarts (Durable Execution)

---

## 5. Integration Requirements (MCP)

This domain requires specific MCP Servers registered with the Core MCP Layer.

### 5.1 Exchange Integrations (Priority A)

| Server | Capabilities | Notes |
|--------|--------------|-------|
| Binance | GetPrice, GetBalance, ExecuteOrder, GetOrderStatus | Primary CEX |
| Coinbase | GetPrice, GetBalance, ExecuteOrder, GetOrderStatus | Backup CEX |
| Uniswap/DEX | GetQuote, ExecuteSwap | DEX trades |

### 5.2 Data Integrations (Priority A+)

| Server | Capabilities | Notes |
|--------|--------------|-------|
| DexScreener | GetTokenInfo, GetLiquidity, GetPairs | Market data |
| CoinGecko | GetPrice, GetMarketData | Price feeds |
| Etherscan/Basescan/Arbiscan | GetWalletTx, GetContractABI, GetTokenHolders | On-chain data (EVM L2s) |

### 5.3 Security Integrations (Priority A)

| Server | Capabilities | Notes |
|--------|--------------|-------|
| GoPlus | GetSecurityReport | Contract security |
| Honeypot.is | CheckHoneypot | Sell check |

---

## 6. User Interface Requirements

### 6.1 Dashboard Widgets

| Widget | Purpose |
|--------|---------|
| Active Signals | List of signals waiting for HITL approval |
| Open Positions | Live tracking of PnL for active trades |
| Narrative Heatmap | Visual representation of trending sectors |
| Recent Alerts | Log of Smart Money movements |
| Portfolio Summary | Total value, daily PnL, drawdown status |

### 6.2 Configuration Screens

| Screen | Purpose |
|--------|---------|
| Wallet Watchlist | Add/Remove addresses to track |
| Risk Settings | Configure Max Position Size, Daily Stop Loss |
| Mode Toggle | Switch between Paper and Live trading |
| Alert Preferences | Configure notification channels and quiet hours |

---

## 7. Non-Functional Requirements

### 7.1 Performance

| Metric | Target |
|--------|--------|
| Whale alert latency | <2 minutes from block confirmation |
| Security scan duration | <30 seconds |
| Price monitoring interval | 30 seconds |

### 7.2 Reliability

| Metric | Target |
|--------|--------|
| Trade execution success | >99% (excluding market conditions) |
| Position state durability | Zero loss on crash |

---

## 8. Validation Scenarios

### 8.1 Scenario: Whale Alert

**Given**: A monitored wallet moves $50k USDT on Base
**When**: The Polling workflow runs
**Then**: An alert is sent via Telegram within 2 minutes

### 8.2 Scenario: Trade Safety Block

**Given**: A signal is generated for a token with "Mintable" authority enabled
**When**: The Security Check runs
**Then**: The workflow transitions to DISCARDED and logs the security risk

### 8.3 Scenario: HITL Expiration

**Given**: A trade signal is waiting for approval
**When**: The user does not respond within 15 minutes
**Then**: The request status updates to EXPIRED and no trade is executed

### 8.4 Scenario: Daily Loss Limit

**Given**: Portfolio has lost 5% today
**When**: A new trade signal is generated
**Then**: The signal is blocked and system enters PAUSED state

---

## 9. Downstream TSD Links

The following Technical Specification Documents implement the requirements defined in this FRD:

| TSD ID | Document | Implements |
|--------|----------|------------|
| TSD-CORE-API | [api.md](../04-specs/api.md) | Exchange API integration patterns |
| TSD-CORE-DATABASE | [database.md](../04-specs/database.md) | Trading data model |
| TSD-CORE-OBSERVABILITY | [observability.md](../04-specs/observability.md) | Trading activity monitoring |

> **Note:** Crypto-specific TSDs will be created as implementation progresses. The domain currently inherits shared infrastructure from Platform Core TSDs.

---

## 10. References

| Document | Purpose |
|----------|---------|
| Platform Core FRD | Shared infrastructure requirements |
| Crypto Domain BRD Addendum | Business requirements this FRD implements |
| Platform Core ADD | Architecture design document |

---

**END OF CRYPTO DOMAIN FRD**
