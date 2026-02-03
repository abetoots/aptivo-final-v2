# Functional Requirements Document (FRD)
## Crypto Trading AI Agent Ecosystem

**Version**: 4.0 (BRD Alignment Update)
**Date**: January 2025
**Status**: Final

**Revision History:**
- v4.0: **BRD Alignment** - Updated alert latency (30 seconds), added Paper Trading validation gate (Phase 2.5), aligned budgets with BRD ($300-500/month LLM), abstracted technology prescriptions to capabilities, updated timeline to 8+ months, added L2-first blockchain support, removed legacy password references
- v3.0: **BREAKING CHANGE** - Replaced password-based authentication (FR-USER-003) with passwordless strategy (WebAuthn + OAuth). Updated FR-USER-001 (Registration), FR-USER-002 (Authentication) to reflect architectural override. Architectural decision documented in ADD v2.0 ADR-005.
- v2.1: Applied consensus review fixes - removed database indexes, generalized technology choices, softened framework language, removed dev process standards
- v2.0: Refactored to enforce document boundaries, removed implementation details, added missing user management and admin requirements
- v1.0: Initial comprehensive FRD with implementation details

---

## Document Purpose & Boundaries

### What This FRD Defines (WHAT):
- Functional requirements: what the system must do
- User stories and acceptance criteria
- Non-functional requirements: performance, security, compliance targets
- Data entity requirements: what data must be stored (not how)
- Integration requirements: what external services are needed (not implementation)

### What This FRD Does NOT Define (HOW):
- Implementation details: code, database schemas, API specifications → See TSD
- System architecture and design patterns → See ADD
- Deployment procedures and infrastructure setup → See ADD/TSD
- Technology choices unless functionally required

---

## Table of Contents

1. [Document Overview](#1-document-overview)
2. [User Personas & User Stories](#2-user-personas--user-stories)
3. [MVP Workflow Specifications](#3-mvp-workflow-specifications)
4. [Post-MVP Workflow Specifications](#4-post-mvp-workflow-specifications)
5. [Core System Features](#5-core-system-features)
6. [User Management & Administration](#6-user-management--administration)
7. [Data Requirements](#7-data-requirements)
8. [Integration Requirements](#8-integration-requirements)
9. [Non-Functional Requirements](#9-non-functional-requirements)
10. [Acceptance Criteria](#10-acceptance-criteria)
11. [Traceability Matrix](#11-traceability-matrix)

---

## 1. Document Overview

### 1.1 Purpose

This Functional Requirements Document (FRD) defines **what** the Crypto Trading AI Agent Ecosystem must do to meet business objectives. It specifies functional requirements, user stories, and acceptance criteria without prescribing **how** the system will be implemented.

### 1.2 Scope

**Framework**: State machine architecture for agentic workflows (specific framework defined in ADD)
**Target Users**: Solo crypto trader initially, scaling to 2-5 person team
**Starting Capital**: $5,000 with moderate risk tolerance (2-3% per trade)
**Deployment**: Cloud-based (specific vendors defined in ADD)

**Phase 0 (Month 1-2)**: Strategy Validation Foundation
- Backtesting & Simulation - critical validation gate before infrastructure investment

**Phase 1 - MVP (Months 3-5)**:
- Smart Money Tracking
- Narrative Scouting
- Security & Scam Detection

**Phase 2.5 - Validation Gate (Month 6)**:
- Paper Trading validation - forward-test strategies on live data without real capital

**Phase 3 - Post-MVP (Months 7-8+)**:
- Systematic Breakout Trading (live execution)
- Portfolio Management & Tax Optimization

### 1.3 Document Conventions

- **FR-XXX-NNN**: Functional Requirement identifier
- **NFR-XXX-NNN**: Non-Functional Requirement identifier
- **AC-NNN**: Acceptance Criteria identifier
- **BO-NNN**: Business Objective (from BRD)

---

## 2. User Personas & User Stories

### 2.1 Primary Persona: Alex - Solo Crypto Trader

**Background**:
- Age: 28-35
- Experience: 2-3 years trading crypto, moderate technical knowledge
- Current pain points: Information overload, FOMO, manual analysis takes 40+ hours/week
- Goals: Systematic edge, time savings, risk management, regulatory compliance

**Technical Proficiency**:
- Comfortable with web dashboards and APIs
- Familiar with basic trading concepts (stop loss, take profit, risk/reward)
- Needs guidance on advanced features (backtesting, strategy optimization)

### 2.2 Core User Stories (MVP)

#### US-001: Smart Money Tracking

**As** Alex, **I want to** receive real-time alerts when whale wallets make significant moves
**So that** I can identify early accumulation patterns before broader market awareness

**Acceptance Criteria**:
- System monitors at least 20 pre-configured wallet addresses
- Alerts trigger within 30 seconds of on-chain transaction confirmation
- Alert includes: wallet address, token, amount, direction (buy/sell), USD value, historical behavior summary
- Delivery via web dashboard plus configurable channels (Telegram/Discord/email)
- False positive rate < 10%

---

#### US-002: Narrative Discovery

**As** Alex, **I want to** discover emerging crypto narratives before they go mainstream
**So that** I can position myself early in trending themes

**Acceptance Criteria**:
- System scans major social media platforms (e.g., X/Twitter, Reddit, Telegram) every 15 minutes
- Narratives ranked by strength score (engagement velocity, influencer participation)
- Each narrative includes token mappings (e.g., "AI agents" → relevant token symbols)
- Top 10 narratives displayed on dashboard with change indicators
- Duplicate narratives filtered automatically

---

#### US-003: Security Screening

**As** Alex, **I want to** automatically screen tokens for scams before trading
**So that** I avoid honeypots, rug pulls, and malicious contracts

**Acceptance Criteria**:
- Security check completes in < 30 seconds
- Risk score provided: Low / Medium / High / Critical
- High/Critical risk tokens automatically blocked from trading
- Security report includes specific evidence (honeypot detection, LP lock status, team verification)
- 95% detection rate for known scams, < 5% false positives

---

### 2.3 Core User Stories (Post-MVP)

#### US-004: Strategy Validation

**As** Alex, **I want to** backtest trading strategies before deploying real capital
**So that** I can validate edge and avoid costly trial-and-error

**Acceptance Criteria**:
- Backtest against 6 months of historical data
- Metrics displayed: win rate, profit factor, max drawdown, Sharpe ratio
- Can modify parameters and re-run simulation
- Clear pass/fail indication based on approval criteria
- Trade-by-trade log exportable (CSV/PDF)

---

#### US-005: Semi-Autonomous Trading

**As** Alex, **I want to** approve trade signals before execution
**So that** I maintain control while leveraging AI analysis

**Acceptance Criteria**:
- Every trade requires HITL approval (no autonomous execution)
- Approval request includes: entry, stop, target, reasoning, security risk
- Can approve, reject, or modify parameters
- 15-minute expiration with auto-reject on timeout
- Multi-channel delivery (web, Telegram, mobile push)

---

#### US-006: Portfolio Tracking

**As** Alex, **I want to** track portfolio performance and generate tax reports
**So that** I can monitor returns and comply with tax regulations

**Acceptance Criteria**:
- Real-time portfolio value and P&L calculations
- Trade history with realized gains/losses
- Tax report export compatible with major tax software
- 7-year data retention for compliance
- Dashboard loads in < 2 seconds

---

#### US-007: Account Management

**As** Alex, **I want to** manage my account settings and security preferences
**So that** I can maintain control over my profile and protect my data

**Acceptance Criteria**:
- Can update email, notification preferences
- Passwordless authentication with inherent MFA (WebAuthn/OAuth)
- Can manage authentication methods (add/remove Passkeys, link/unlink OAuth)
- Can export all personal data (GDPR compliance)
- Can delete account with trade history retained for tax compliance

---

## 3. MVP Workflow Specifications

### 3.1 Smart Money Tracking

#### 3.1.1 Overview

Monitors whale wallets across multiple blockchains to detect significant transactions and generate actionable alerts.

#### 3.1.2 Workflow State Transitions

The system must implement the following workflow states and transitions:

**States:**
- `monitoring`: Continuously polling on-chain data for monitored wallets
- `analyzing`: Transaction detected, analyzing significance against thresholds
- `alerting`: Creating and delivering alert to user
- `updating_history`: Storing transaction for pattern analysis

**Required Transitions:**
- `monitoring` → `analyzing` when significant transaction detected (> threshold)
- `analyzing` → `alerting` when transaction meets significance criteria
- `analyzing` → `monitoring` when transaction below threshold (no alert)
- `alerting` → `updating_history` → `monitoring` after alert delivered

#### 3.1.3 Data Source Requirements

System must integrate with the following data source capabilities:
- **On-chain indexer**: Transaction queries for EVM-compatible chains (Ethereum, Arbitrum, Base, Optimism, Polygon - L2-first strategy)
- **Market data provider**: Real-time token price data for USD conversion
- **DeFi analytics provider**: Protocol TVL and liquidity data
- **Solana data provider**: Solana blockchain transaction data
- **BSC data provider**: Binance Smart Chain transaction data

#### 3.1.4 Functional Requirements

**FR-SMT-001: Wallet Configuration**
- User must be able to add/remove wallet addresses to monitoring list via UI
- System must support L2-first blockchain addresses: Arbitrum, Base, Optimism, Polygon (primary), Ethereum L1, Solana, BSC (secondary)
- System must validate wallet address format before adding to monitoring list
- System must support minimum 20 wallets (MVP), expandable to 500 wallets (Phase 3)

**FR-SMT-002: Transaction Detection**
- System must poll on-chain data at configurable intervals (default: 60 seconds)
- System must detect transactions exceeding configurable USD threshold (default: $100,000)
- System must capture: token symbol, amount, direction (buy/sell/transfer), timestamp, USD value

**FR-SMT-003: Significance Analysis**
- System must analyze transaction context using wallet's historical behavior
- System must generate reasoning for alert (2-3 sentences): accumulation pattern, distribution, rotation
- System must assign confidence score (1-10) based on pattern strength

**FR-SMT-004: Alert Generation**
- Alert must include: wallet address, token symbol, amount, USD value, direction, AI reasoning, confidence score
- System must deliver alerts within 30 seconds of transaction confirmation (P95 latency)
- System must support delivery via: web dashboard notification, Telegram bot, Discord webhook, email

**FR-SMT-005: Historical Tracking**
- System must store all monitored transactions for pattern analysis
- System must track wallet behavior patterns over time (accumulation phases, distribution cycles)
- System must generate weekly summary report: top movers, unusual activity

**FR-SMT-006: False Positive Reduction**
- User must be able to mark alerts as "not actionable" for feedback
- System must learn from user feedback to reduce noise over time
- System must achieve < 10% false positive rate (verified via manual review)

#### 3.1.5 UI Requirements

- **Dashboard Widget**: Recent alerts (last 24 hours), wallet status indicators (active/paused)
- **Configuration Page**: Add/remove wallets, set detection thresholds, configure alert channels
- **History View**: Searchable transaction log with filters (wallet, token, date range, significance)

---

### 3.2 Narrative Scouting

#### 3.2.1 Overview

Scans social media to identify emerging crypto narratives before mainstream awareness, ranked by strength and mapped to relevant tokens.

#### 3.2.2 Workflow State Transitions

**States:**
- `scanning`: Collecting social media posts from configured sources
- `clustering`: Grouping posts by topic/narrative using semantic similarity
- `scoring`: Calculating narrative strength metrics
- `filtering`: Removing low-score and duplicate narratives
- `enriching`: Adding token mappings, influencer analysis
- `alerting`: Delivering top narratives to dashboard

**Required Transitions:**
- `scanning` → `clustering` → `scoring` → `filtering` → `enriching` → `alerting` → `scanning` (continuous cycle every 15 minutes)

#### 3.2.3 Strength Scoring Requirements

System must calculate narrative strength score using the following weighted factors:
- **Engagement Velocity** (40% weight): Rate of likes, retweets, comments over time period
- **Influencer Participation** (30% weight): Weighted by follower count (>10K followers = higher weight)
- **Unique Participants** (20% weight): Number of unique authors discussing narrative
- **Token Correlation** (10% weight): Strength of token mentions within narrative cluster

#### 3.2.4 Data Source Requirements

System must integrate with data sources providing these capabilities:
- **Social sentiment provider**: Social media sentiment and engagement metrics
- **News aggregation provider**: Crypto news aggregation
- **Microblogging platform API**: Real-time post collection from major platforms (e.g., X/Twitter)
- **Forum platform API**: Crypto community post collection (e.g., Reddit)
- **Messaging platform API**: Crypto channel message collection (e.g., Telegram)
- **Market data provider**: Token metadata for mapping

#### 3.2.5 Functional Requirements

**FR-NS-001: Social Media Scanning**
- System must scan major social platforms (X/Twitter, Reddit, Telegram) at configurable intervals (default: 15 minutes)
- System must process minimum 10,000 posts per cycle (MVP), scalable to 200,000 (Phase 3)
- System must focus on crypto-specific keywords, hashtags, and accounts

**FR-NS-002: Narrative Clustering**
- System must use semantic similarity to group posts into narrative clusters
- System must filter noise: spam, promotional content, low-quality posts
- System must identify narrative themes automatically (no manual categorization)

**FR-NS-003: Strength Scoring**
- System must apply weighted scoring formula to each narrative cluster
- System must rank narratives by score (descending order)
- System must track score changes over time (trending up/down indicators)

**FR-NS-004: Token Mapping**
- System must extract token mentions from narrative posts (ticker symbols, contract addresses)
- System must map tokens to narratives with confidence scores
- System must validate token legitimacy (filter scam tokens)

**FR-NS-005: Influencer Analysis**
- System must identify key influencers driving each narrative
- System must weight engagement by influencer reach (follower count)
- System must track influencer sentiment (bullish/bearish/neutral)

**FR-NS-006: Duplicate Filtering**
- System must detect and merge duplicate narratives using semantic similarity threshold
- System must ensure top 10 narratives are distinct (no near-duplicates)

**FR-NS-007: Alert Delivery**
- System must display top 10 narratives on dashboard with strength scores
- System must highlight narratives with significant score increases (>20% in 24h)
- System must support optional push notifications for new narratives entering top 10

#### 3.2.6 UI Requirements

- **Dashboard Widget**: Top 10 narratives with strength scores, trend indicators (up/down arrows), token mappings
- **Narrative Detail Page**: Post samples, influencer list, token breakdown, historical score chart
- **Configuration**: Customize scanning sources, adjust scoring weights, set alert thresholds

---

### 3.3 Security & Scam Detection

#### 3.3.1 Overview

Automated security analysis of token contracts to detect honeypots, rug pulls, and malicious patterns before trading.

#### 3.3.2 Workflow State Transitions

**States:**
- `initiated`: Security check requested for token contract
- `contract_analysis`: Analyzing smart contract code for malicious patterns
- `liquidity_check`: Verifying LP lock status and liquidity depth
- `team_verification`: Checking team credentials and history
- `risk_scoring`: Calculating overall risk level based on findings
- `blocking`: Automatically blocking high-risk tokens from trading
- `reporting`: Generating security report
- `complete`: Security check finished

**Required Transitions:**
- `initiated` → `contract_analysis` → `liquidity_check` → `team_verification` → `risk_scoring`
- `risk_scoring` → `reporting` → `complete` (if risk < High)
- `risk_scoring` → `blocking` → `reporting` → `complete` (if risk >= High)

#### 3.3.3 Data Source Requirements

System must integrate with data sources providing these capabilities:
- **Blockchain explorer API**: Contract source code, transaction history (per-chain)
- **DEX aggregator API**: Liquidity pool data, trading volume across DEXs
- **Contract security analyzer**: Honeypot detection, contract risk analysis
- **Market data provider**: Token metadata, market cap, listing exchanges
- **Public data sources**: Professional networks, code repositories, social media for team verification

#### 3.3.4 Functional Requirements

**FR-SEC-001: Contract Analysis**
- System must analyze smart contract bytecode for malicious patterns
- System must detect: honeypot patterns, hidden fees, blacklist functions, ownership risks
- System must scan for: unlimited minting, proxy patterns, selfdestruct, hidden backdoors
- System must flag centralized control vulnerabilities

**FR-SEC-002: Liquidity Verification**
- System must query DEX liquidity pools (Uniswap, PancakeSwap, Raydium, etc.)
- System must verify LP lock status: locked, burned, or unlocked
- System must check minimum liquidity threshold (configurable, default: $50,000 USD)
- System must monitor liquidity depth for sufficient market depth

**FR-SEC-003: Team Verification**
- System must search for doxxed team members (LinkedIn, Twitter, project website)
- System must verify team history: previous projects, reputation, GitHub activity
- System must flag red flags: anonymous team, fake profiles, no verifiable history

**FR-SEC-004: Risk Scoring**
- System must calculate risk score based on analysis results
- Risk levels must be: Low (all checks pass), Medium (1-2 minor concerns), High (multiple red flags), Critical (confirmed scam indicators)
- Risk score must be deterministic and auditable

**FR-SEC-005: Automatic Blocking**
- System must automatically block trade signals for tokens with risk >= High
- System must notify user with detailed reasoning and evidence
- System must log block decision to audit trail
- User must be able to manually override (requires explicit confirmation and warning)

**FR-SEC-006: Security Report Generation**
- System must generate detailed security report with evidence for each check
- Report must include: contract analysis results, liquidity status, team verification findings, final risk score
- System must attach security report to trade signals for user review
- System must store security reports for historical reference

**FR-SEC-007: Whitelist Management**
- User must be able to whitelist trusted tokens to skip security checks
- System must pre-populate whitelist with major tokens (BTC, ETH, SOL, major DeFi tokens)
- Whitelist must be configurable via UI (add/remove tokens)

**FR-SEC-008: Continuous Monitoring**
- System must re-scan tokens periodically (configurable, default: 24 hours for active holdings)
- System must alert on security status changes (e.g., LP unlocked, ownership transferred)
- System must enable proactive risk management

#### 3.3.5 UI Requirements

- **Security Dashboard**: Token watchlist with security status indicators (color-coded: green/yellow/orange/red)
- **Security Report Page**: Detailed analysis results, evidence, risk score breakdown
- **Configuration**: Set risk thresholds, manage whitelist, configure alert preferences

---

## 4. Post-MVP Workflow Specifications

### 4.1 Backtesting & Simulation

#### 4.1.1 Overview

Critical validation gate that allows users to backtest trading strategies against historical data before deploying real capital.

#### 4.1.2 Workflow State Transitions

**States:**
- `configuration`: User configuring strategy parameters
- `data_loading`: Fetching historical OHLCV data
- `simulation_running`: Executing backtest with entry/exit signals
- `metrics_calculation`: Computing performance metrics
- `reporting`: Generating backtest report
- `strategy_approval`: Checking if strategy meets approval criteria
- `complete`: Backtest finished

**Required Transitions:**
- `configuration` → `data_loading` → `simulation_running` → `metrics_calculation` → `reporting`
- `reporting` → `configuration` (if user requests changes)
- `reporting` → `strategy_approval` → `complete` (if user approves)

#### 4.1.3 Data Source Requirements

System must integrate with:
- **Exchange API**: Historical OHLCV data (via unified exchange adapter or MCP)
- **Alternative exchanges**: Support for multiple data sources
- **Technical analysis provider**: Advanced charting, technical indicators (via MCP)

#### 4.1.4 Functional Requirements

**FR-BT-001: Strategy Configuration**
- User must be able to define strategy parameters: breakout period, volume threshold, RSI range
- User must be able to configure risk settings: position size (% portfolio), stop loss (%), take profit (%)
- User must be able to select time range: 3, 6, 12 months of historical data
- User must be able to select asset pair (e.g., SOL/USDT, BTC/USDT)

**FR-BT-002: Historical Data Loading**
- System must fetch OHLCV data from exchange API
- System must validate data integrity: check for gaps, missing candles, outliers
- System must handle data adjustments if applicable

**FR-BT-003: Simulation Execution**
- System must execute strategy logic on historical data: detect entry signals, apply stop/target
- System must simulate order fills using OHLC prices
- System must apply configurable slippage (default: 0.1%)
- System must track portfolio state: cash balance, positions, realized P&L
- System must log every trade: entry price, exit price, P&L, reasoning

**FR-BT-004: Performance Metrics**
- System must calculate: total trades, win rate (%), profit factor, max drawdown (%), Sharpe ratio, total return (%)
- All metrics must be displayed with clear labels and tooltips

**FR-BT-005: Approval Criteria Guidance**
- System must display approval criteria thresholds: Win rate > 35%, Profit factor > 1.5, Max drawdown < 25%, Sharpe ratio > 1.0, Minimum 50 trades
- System must provide visual indicators: green checkmarks for passed criteria, red X for failed
- User must be able to proceed to live trading only if criteria met (or manually override with warning)

#### 4.1.5 UI Requirements

- **Configuration Page**: Strategy parameter inputs, time range selector, asset picker
- **Simulation Progress**: Real-time progress indicator, trades executed count
- **Results Dashboard**: Metrics summary, equity curve chart, trade log table
- **Export**: Download backtest report (PDF), trade log (CSV)

---

### 4.2 Paper Trading Validation (Phase 2.5)

#### 4.2.1 Overview

Critical validation gate between backtesting and live trading. Forward-tests strategies on live market data without executing real trades, validating that backtested performance translates to real-world conditions.

#### 4.2.2 Workflow State Transitions

**States:**
- `configuration`: User enabling paper trading mode for validated strategy
- `monitoring`: Watching live market for signals (same as live trading)
- `signal_generation`: Signal detected, creating paper trade
- `paper_execution`: Simulating order execution at current market prices
- `position_tracking`: Tracking simulated position P&L
- `position_closed`: Paper trade closed, recording simulated P&L
- `validation_review`: Comparing paper trading results to backtest expectations

**Required Transitions:**
- `configuration` → `monitoring` when paper trading enabled
- `monitoring` → `signal_generation` → `paper_execution` → `position_tracking`
- `position_tracking` → `position_closed` → `monitoring` (continuous cycle)
- Any state → `validation_review` when user requests performance review

#### 4.2.3 Functional Requirements

**FR-PT-001: Paper Trading Mode**
- User must be able to enable paper trading mode for any validated strategy
- Paper trading must use real-time market data (same feeds as live trading)
- Paper trading must NOT place real orders or risk real capital
- System must clearly indicate paper trading mode in UI (distinct visual indicator)

**FR-PT-002: Simulated Execution**
- System must simulate order fills using real-time prices at signal generation
- System must apply realistic slippage modeling (configurable, default: 0.1-0.3%)
- System must simulate stop loss and take profit triggers
- System must track simulated fees based on exchange fee schedule

**FR-PT-003: Performance Tracking**
- System must track paper trading performance separately from live trading
- System must calculate same metrics as backtesting: win rate, profit factor, max drawdown, Sharpe ratio
- System must allow comparison between backtest results and paper trading results
- System must flag significant divergence (>20%) between backtest and paper results

**FR-PT-004: Validation Gate**
- System must require minimum paper trading period before live trading (configurable, default: 14 days or 20 trades, whichever comes first)
- System must require paper trading performance within acceptable variance of backtest (configurable, default: within 25% of backtest metrics)
- User must be able to manually override validation gate (with explicit warning and confirmation)

**FR-PT-005: Transition to Live**
- System must provide clear indication when paper trading validation criteria are met
- System must preserve paper trading history for audit and comparison
- System must allow seamless transition to live trading with same strategy parameters

#### 4.2.4 UI Requirements

- **Paper Trading Dashboard**: Clear "PAPER MODE" indicator, simulated portfolio value, P&L
- **Comparison View**: Side-by-side backtest vs paper trading metrics
- **Validation Status**: Progress toward meeting validation criteria (days, trades, performance)
- **Transition Prompt**: Clear call-to-action when ready for live trading

---

### 4.3 Systematic Breakout Trading

#### 4.3.1 Overview

Semi-autonomous trading workflow that detects breakout patterns, generates trade signals, and executes approved trades via exchange integration.

#### 4.3.2 Workflow State Transitions

**States:**
- `monitoring`: Scanning watchlist for breakout patterns
- `signal_generation`: Breakout detected, creating trade signal
- `security_check`: Running security analysis on token
- `blocked`: Security risk high, trade blocked
- `risk_calculation`: Calculating position size and risk parameters
- `hitl_approval`: Waiting for human approval
- `order_placement`: Executing approved trade on exchange
- `position_management`: Monitoring open position, managing stop/target
- `position_closed`: Trade completed, recording P&L

**Required Transitions:**
- `monitoring` → `signal_generation` (when breakout detected)
- `signal_generation` → `security_check`
- `security_check` → `blocked` → `monitoring` (if risk >= High)
- `security_check` → `risk_calculation` → `hitl_approval` (if risk < High)
- `hitl_approval` → `order_placement` → `position_management` (if approved)
- `hitl_approval` → `monitoring` (if rejected or expired)
- `position_management` → `position_closed` → `monitoring` (when stop/target hit)

#### 4.3.3 Data Source Requirements

System must integrate with:
- **Exchange API**: Real-time price data, order placement (via unified exchange adapter)
- **Technical analysis provider**: Technical indicators (RSI, volume, breakout detection)
- **Security Detection Workflow**: Integrated security check (FR-SEC)

#### 4.3.4 Functional Requirements

**FR-BT-006: Watchlist Monitoring**
- User must be able to configure watchlist (default: 50 tokens, expandable to 500)
- System must monitor watchlist tokens for breakout patterns at configurable intervals (default: 5 minutes)

**FR-BT-007: Breakout Detection**
- System must detect configurable breakout patterns (default: 20-day high)
- System must require volume confirmation (default: > 2x average daily volume)
- System must apply RSI filter (default: RSI between 50-70 to avoid overbought)
- System must apply additional filters: extreme volatility, low liquidity

**FR-BT-008: Signal Generation**
- System must generate trade signal with: token symbol, current price (entry), position size, stop loss, take profit, confidence score, AI reasoning
- Position size must be calculated as percentage of portfolio (configurable, default: 2%)
- Stop loss and take profit must be calculated as percentage from entry (configurable, defaults: -2%, +4%)

**FR-BT-009: Security Integration**
- System must automatically invoke security detection workflow for each signal
- System must block signal if risk >= High, notify user, log decision
- System must attach security summary to signal if risk < High, proceed to approval

**FR-BT-010: Position Sizing & Risk Management**
- System must calculate position size based on portfolio value and risk percentage
- System must enforce maximum risk per trade: 2-3% of portfolio
- System must ensure sufficient capital before generating signal
- System must apply risk limits: max 5 concurrent positions, max 10% total exposure per token

**FR-BT-011: HITL Approval Request**
- System must send approval request to user (see FR-HITL below)
- Approval request must expire after configurable time (default: 15 minutes)
- System must support multi-channel delivery: web dashboard, Telegram, mobile push

**FR-BT-012: Order Execution**
- System must place market order on configured exchange
- System must immediately place stop loss and take profit orders
- System must confirm order fills, handle errors (insufficient balance, rate limits, connectivity)
- System must log execution details: order ID, fill price, slippage, fees

**FR-BT-013: Position Management**
- System must monitor open positions in real-time
- System must update unrealized P&L continuously
- System must execute stop loss / take profit when triggered
- System must handle partial fills, order cancellations

**FR-BT-014: Trade Completion**
- System must close position when stop/target hit or user manually closes
- System must record trade with: entry, exit, P&L, exit reason (stop/target/manual)
- System must update portfolio state
- System must notify user of trade result

**FR-BT-015: Audit Trail**
- System must log every workflow step to audit trail: signal generation, approval decision, execution, close
- System must store agent reasoning for each decision
- System must enable full traceability for regulatory compliance

#### 4.3.5 UI Requirements

- **Watchlist Configuration**: Add/remove tokens, set breakout parameters
- **Active Signals**: Pending approval requests with countdown timer
- **Open Positions**: Real-time P&L, stop/target visualization, manual close button
- **Trade History**: Searchable log with filters (date, token, P&L, exit reason)

---

### 4.4 Portfolio Management & Tax Optimization

#### 4.4.1 Overview

Comprehensive portfolio tracking, performance analytics, and tax reporting for compliance.

#### 4.4.2 Functional Requirements

**FR-PM-001: Portfolio Dashboard**
- System must display current holdings: token, quantity, average entry price, current price, unrealized P&L
- System must display portfolio metrics: total value (USD), daily/weekly/monthly return (%), max drawdown, Sharpe ratio, win rate

**FR-PM-002: Real-Time Price Updates**
- System must update prices for active holdings at configurable intervals (default: 10 seconds)
- System must support real-time price feeds (WebSocket preferred, polling fallback)
- System must display last update timestamp

**FR-PM-003: Trade History**
- System must display all closed trades: token, entry/exit date, entry/exit price, realized P&L, exit reason
- System must support filters: date range, token, P&L (profitable/unprofitable)
- System must support pagination for large datasets

**FR-PM-004: Risk Exposure**
- System must display total capital deployed vs available cash
- System must display per-token exposure: % of portfolio in each asset
- System must alert if exposure exceeds configurable limits (default: >30% in single asset)

**FR-PM-005: Performance Analytics**
- System must display equity curve chart: portfolio value over time
- System must display P&L distribution histogram
- System must display drawdown chart to identify drawdown periods
- System must display Sharpe ratio trend: risk-adjusted performance over time

**FR-PM-006: Tax Reporting**
- System must generate tax report: export with all trades (buy date, sell date, buy price, sell price, quantity, P&L)
- System must be compatible with major tax software formats (CoinTracker, Koinly, TokenTax)
- System must retain trade history for 7 years (regulatory compliance)
- System must include transaction fees and gas costs in cost basis calculations

#### 4.4.3 UI Requirements

- **Portfolio Dashboard**: Holdings table, metrics cards, equity curve chart
- **Trade History Table**: Sortable columns, export button
- **Analytics Page**: Performance charts, risk exposure breakdown
- **Tax Report**: Generate and download tax report (CSV)

---

## 5. Core System Features

### 5.1 LLM-Agnostic Architecture

#### 5.1.1 Overview

Provider abstraction layer enabling runtime switching between LLM providers without code changes or redeployment.

#### 5.1.2 Functional Requirements

**FR-LLM-001: Provider Abstraction**
- System must support multiple LLM providers: OpenAI, Anthropic, Google, local models
- System must provide consistent API regardless of underlying provider
- System must abstract provider-specific differences (token limits, API formats, error handling)

**FR-LLM-002: Runtime Provider Selection**
- System must allow provider configuration without code changes
- System must support hot reload: update provider configuration without redeployment
- Configuration must be manageable via environment variables or admin UI

**FR-LLM-003: Per-Workflow Model Assignment**
- User must be able to configure which model to use for each workflow
- System must persist model configuration
- System must support model assignment via UI (e.g., "Smart Money Tracking: GPT-4o-mini")

**FR-LLM-004: Fallback Strategy**
- System must automatically switch to secondary provider on primary provider failure (API error, rate limit, timeout)
- System must attempt fallback within 5 seconds of primary failure
- System must log provider switch events
- System must retry primary provider after configurable cooldown (default: 60 seconds)

**FR-LLM-005: Cost Tracking**
- System must log LLM API usage: provider, model, tokens (input/output), estimated cost
- System must aggregate metrics: monthly cost per user, cost per workflow
- System must alert if approaching configurable budget thresholds

---

### 5.2 MCP Integration Layer

#### 5.2.1 Overview

Universal integration layer for external data sources using Model Context Protocol (MCP) standard.

#### 5.2.2 Functional Requirements

**FR-MCP-001: MCP Server Registry**
- System must maintain registry of available MCP servers and their capabilities
- System must validate MCP server availability before invoking tools
- System must support adding new MCP servers without code changes

**FR-MCP-002: Required MCP Capabilities (MVP)**
System must integrate with MCP servers providing these capabilities:
- **On-chain data**: Transaction queries, wallet balances, token transfers
- **Market data**: Token price data, market cap, metadata
- **DeFi analytics**: Protocol TVL, liquidity data
- **Social sentiment**: Social media sentiment, engagement metrics
- **News aggregation**: Crypto news and events
- **Technical analysis**: Technical indicators, charting
- **Exchange integration**: Exchange API integration for trading

**FR-MCP-003: Tool Invocation**
- System must enable agents to invoke MCP tools via natural language
- System must map natural language requests to appropriate MCP tool calls
- System must return tool responses to agents in structured format

**FR-MCP-004: Response Caching**
- System must cache MCP tool responses to reduce API costs and latency
- System must apply appropriate cache TTLs based on data volatility:
  - Price data: 1 minute
  - Social media posts: 15 minutes
  - Security scans: 24 hours
  - On-chain transactions: 5 minutes
- System must achieve cache hit rate > 60%

**FR-MCP-005: Rate Limit Handling**
- System must implement request queuing for rate-limited APIs
- System must apply exponential backoff on repeated failures
- System must notify user if external service repeatedly fails
- System must gracefully degrade when MCP server unavailable

**FR-MCP-006: Circuit Breaker**
- System must open circuit after configurable consecutive failures (default: 5)
- System must retry after configurable cooldown (default: 60 seconds)
- System must prevent cascading failures from slow/failing MCP servers

---

### 5.3 Human-in-the-Loop (HITL) Approval Workflow

#### 5.3.1 Overview

Mandatory approval gate for all critical actions (trade executions) ensuring human oversight and regulatory compliance.

#### 5.3.2 Functional Requirements

**FR-HITL-001: Approval Request Structure**
Approval request must include:
- Unique request ID
- Workflow identifier (e.g., "breakout_trading")
- Action type (e.g., "trade_execution")
- Priority level (low/medium/high/urgent)
- Action details: token, action (BUY/SELL), entry price, quantity, USD value, stop loss, take profit, risk USD
- AI reasoning (2-3 sentences)
- Security risk level (if applicable)
- Expiration timestamp
- Creation timestamp

**FR-HITL-002: Multi-Channel Delivery**
System must deliver approval requests via:
- Web dashboard: Real-time notification banner
- Telegram: Message with inline approval buttons
- Mobile push: Notification with deep link to app
- Delivery latency target: < 10 seconds

**FR-HITL-003: User Actions**
User must be able to:
- **Approve**: Proceed with action immediately, log approval decision
- **Reject**: Discard request, optionally add rejection reason
- **Modify**: Adjust parameters (e.g., reduce position size, tighten stop), re-submit for confirmation
- **Defer**: Extend expiration by configurable time (default: 15 minutes, max 2 deferrals)

**FR-HITL-004: Expiration Handling**
- System must auto-reject expired requests (prevent accidental executions)
- System must notify user of expiration
- System must log expiration event to audit trail

**FR-HITL-005: Audit Trail**
System must log all approval decisions with:
- Request ID, workflow, action type
- Agent reasoning
- User decision (approved/rejected/expired/modified)
- Timestamp, approver user ID
- Execution result (if approved)

---

## 6. User Management & Administration

### 6.1 User Account Management

#### 6.1.1 Functional Requirements

**FR-USER-001: User Registration**
- System must allow new users to register via passwordless authentication methods:
  - **Primary**: WebAuthn/Passkey registration (biometric or security key)
  - **Secondary**: OAuth provider registration (Google, Apple Sign-In)
- System must validate email format for all registration methods
- System must require email verification for OAuth-based registrations
- System must NOT require password creation, storage, or management

**FR-USER-002: Authentication**
- System must support passwordless authentication methods:
  - **WebAuthn/Passkeys**: Cryptographic credentials bound to origin domain (phishing-resistant)
  - **OAuth Providers**: Google Sign-In, Apple Sign-In (outsource credential management)
- System must provide inherent multi-factor authentication:
  - **WebAuthn users**: Device possession (hardware/software authenticator) + biometric/PIN = two factors
  - **OAuth users**: Provider's MFA policies (Google 2FA, Apple 2FA)
- System must implement session management with configurable timeout (default: 24 hours)
- System must support "remember me" functionality (extended session via refresh tokens)

**FR-USER-003: Credential Security (Passwordless Override)**
- System must NOT implement password-based authentication
- **Rationale**: Passwordless authentication provides superior security for crypto trading platform:
  - Eliminates password database breach risk (no passwords to steal)
  - Prevents credential stuffing, password reuse, and phishing attacks
  - Provides faster authentication flow for time-sensitive HITL trade approvals
  - Aligns with crypto-native self-custody principles (private keys on user's device)
- **Legacy MFA Support**: TOTP (Google Authenticator) may be offered as backup MFA for account recovery only, not primary authentication
- System must lock account after configurable failed authentication attempts (default: 5 attempts, 30-minute lockout)

**FR-USER-004: Profile Management**
- User must be able to update email address (requires email verification)
- User must be able to update display name, timezone, language preferences
- User must be able to manage authentication methods (add/remove Passkeys, link/unlink OAuth providers)
- User must be able to view active sessions and revoke access
- User must be able to view registered Passkeys/authenticators (device name, registration date, last used)

**FR-USER-005: Notification Preferences**
- User must be able to configure notification channels per workflow (email, Telegram, mobile push, Discord)
- User must be able to set quiet hours (no notifications during specified times)
- User must be able to configure notification frequency (real-time, digest)

**FR-USER-006: Data Export & Account Deletion**
- User must be able to export all personal data in machine-readable format (JSON/CSV) - GDPR compliance
- User must be able to request account deletion with confirmation
- System must anonymize user data on account deletion while retaining trade history for 7 years (tax compliance)
- System must process data export within 48 hours, account deletion within 7 days

---

### 6.2 API Key Management

#### 6.2.1 Functional Requirements

**FR-API-001: Exchange API Key Configuration**
- User must be able to securely add exchange API keys (API key, secret, optional passphrase)
- System must validate API key permissions (trading enabled, withdrawal disabled)
- System must encrypt API keys at rest
- System must never display full API keys in UI (show masked version only)

**FR-API-002: API Key Security**
- User must be able to view API key permissions (read-only, trading, withdrawal status)
- User must be able to rotate API keys (add new, remove old)
- System must alert user if API key permissions change unexpectedly
- System must support API key whitelisting (restrict IP addresses if exchange supports)

**FR-API-003: Test Connection**
- User must be able to test API key connection before saving
- System must verify API key validity and permissions during test
- System must display connection status and detected permissions

---

### 6.3 System Administration

#### 6.3.1 Functional Requirements

**FR-ADMIN-001: User Management (Admin Only)**
- Admin must be able to view all user accounts with status (active, locked, deleted)
- Admin must be able to manually unlock locked accounts
- Admin must be able to view user activity logs (login history, API usage)
- Admin must NOT be able to view user passwords, API keys, or trade details (privacy)

**FR-ADMIN-002: System Health Monitoring (Admin Only)**
- Admin must be able to view system health dashboard: uptime, error rate, API latency
- Admin must be able to view MCP server status (connected, rate-limited, error)
- Admin must be able to view LLM provider status and cost metrics
- Admin must be able to trigger manual system health checks

**FR-ADMIN-003: Configuration Management (Admin Only)**
- Admin must be able to view and update system configuration (without code deployment)
- Admin must be able to configure global settings: rate limits, cache TTLs, alert thresholds
- All configuration changes must be logged to audit trail with timestamp and admin user ID

---

## 7. Data Requirements

### 7.1 Data Entities Overview

The system must persist the following data entities. Note: Actual database schemas (table structures, column types, indexes, constraints) are defined in the Technical Specification Document (TSD).

#### 7.1.1 User Data

**Users Entity**
Must store: user ID, email, account status (active, locked, deleted), created/updated timestamps

**Authenticators Entity** (NEW - for passwordless auth)
Must store: authenticator ID, user ID, authenticator type (webauthn/oauth), provider name (google/apple/passkey), credential ID (for WebAuthn), device name, registration date, last used timestamp

**OAuth Accounts Entity** (NEW - for OAuth providers)
Must store: account ID, user ID, provider (google/apple), provider account ID, email, access token (encrypted), refresh token (encrypted), token expiration, linked date

**User Sessions Entity**
Must store: session ID, user ID, session token, IP address, user agent, created/expiration timestamps

---

#### 7.1.2 Trading Data

**Smart Money Transactions Entity**
Must store: transaction ID, wallet address, blockchain, token symbol/address, amount, direction (buy/sell/transfer), USD value, transaction hash, block number, timestamp, AI reasoning, confidence score, user feedback

Performance requirement: System must support efficient queries by wallet address and timestamp (see NFR-PERF-006)
Retention: Indefinite (unlimited value for pattern analysis)

**Narratives Entity**
Must store: narrative ID, title, description, strength score, engagement metrics (velocity, influencer count, unique participants), token mappings, top influencers, first detected timestamp, last updated timestamp

Performance requirement: System must support efficient sorting by strength score and last updated timestamp
Retention: 1 year

**Social Posts Entity**
Must store: post ID, narrative ID, platform, platform-specific post ID, author, content, engagement score, timestamp

Performance requirement: System must support efficient queries by timestamp and narrative ID
Retention: 7 days (minimize storage, automated cleanup)

**Security Scans Entity**
Must store: scan ID, token symbol, contract address, blockchain, risk level, honeypot detected flag, LP locked flag, liquidity depth USD, team doxxed flag, audit status, detailed findings

Performance requirement: System must support efficient queries by contract address and scanned timestamp
Retention: 1 year

**Trade Signals Entity**
Must store: signal ID, user ID, token symbol, action (BUY/SELL), entry price, stop loss, take profit, position size USD, confidence score, AI reasoning, security risk level, status (pending/approved/rejected/expired/blocked), timestamps

Performance requirement: System must support efficient queries by user ID + status and created timestamp
Retention: Indefinite (linked to trades)

**Trades Entity**
Must store: trade ID, signal ID, user ID, token symbol, side (BUY/SELL), entry/exit prices, entry/exit quantities, P&L USD, P&L percent, exit reason, exchange order IDs, fees USD, timestamps

Performance requirement: System must support efficient queries by user ID + opened timestamp and P&L USD
Retention: 7 years (tax compliance, regulatory requirement)

---

#### 7.1.3 Audit & Compliance Data

**Agent Runs Entity**
Must store: run ID, workflow identifier, action type, agent reasoning, approval request ID, approver user ID, decision (approved/rejected/expired), decision timestamp, execution result

Performance requirement: System must support efficient queries by workflow + created timestamp and approval request ID
Retention: 7 years (regulatory compliance, audit trail)

**LLM Usage Logs Entity**
Must store: usage ID, workflow identifier, provider, model, tokens input/output, cost USD, latency milliseconds, success flag, error message, created timestamp

Performance requirement: System must support efficient queries by workflow + created timestamp and provider + created timestamp
Retention: 90 days (cost analysis, debugging)

---

### 7.2 Caching Requirements

The system must implement caching for frequently accessed data:

**Price Data**: 1-minute TTL (high volatility)
**On-Chain Transactions**: 5-minute TTL (balance between freshness and API costs)
**Social Media Posts**: 15-minute TTL (narrative scanning cycle)
**Security Scans**: 24-hour TTL (contract code doesn't change frequently)
**Rate Limit Counters**: Dynamic TTL based on API provider reset windows

Target cache hit rate: > 60% to reduce API costs and latency

---

### 7.3 Data Retention Policies

| Data Entity | Retention Period | Justification |
|-------------|------------------|---------------|
| Social Posts | 7 days | Minimize storage, historical narrative tracking |
| LLM Usage Logs | 90 days | Cost analysis, debugging |
| Trades | 7 years | Tax compliance, regulatory requirements |
| Agent Runs | 7 years | Audit trail, regulatory compliance |
| Narratives | 1 year | Long-term trend analysis |
| Security Scans | 1 year | Historical security reference |
| Smart Money Transactions | Indefinite | Pattern analysis, unlimited value |
| User Account Data | Until deletion request | GDPR compliance |

**Automated Cleanup**:
- Daily job: Delete social posts older than 7 days
- Quarterly archival: Move old LLM usage logs to cold storage
- Never delete: Trades, Agent Runs (regulatory compliance)

---

## 8. Integration Requirements

### 8.1 External Service Integrations

The system must integrate with the following external services (specific implementation details in TSD):

**Email Service**:
- Purpose: Daily/weekly summary reports, alert notifications (fallback), email verification for account changes
- Requirements: Transactional email support, delivery tracking, bounce handling

**Telegram Bot API**:
- Purpose: Real-time alerts, HITL approval requests with inline buttons
- Requirements: Two-way interaction support, webhook delivery, inline keyboards

**Mobile Push Notifications**:
- Purpose: Browser/mobile notifications for HITL approval requests
- Requirements: Cross-platform support (iOS, Android, web), deep linking

**Discord Webhook** (optional):
- Purpose: Alert notifications for users who prefer Discord
- Requirements: Webhook URL configuration, message formatting

---

### 8.2 Exchange API Integration

**Primary Exchange Integration**:
- System must integrate with at least one cryptocurrency exchange
- Integration must support: order placement (market, limit), order status queries, account balance queries, trade history retrieval

**Exchange API Requirements**:
- Real-time price data (WebSocket preferred, REST fallback)
- Historical OHLCV data for backtesting
- Order execution with error handling (insufficient balance, rate limits)
- Stop-loss and take-profit order support

**Multi-Exchange Support** (optional, post-MVP):
- System should support multiple exchanges via unified API
- User should be able to select preferred exchange per trade

---

### 8.3 Deployment & Infrastructure Requirements

**Cloud Platform Requirements**:
- System must be deployable to cloud environment (vendor selection in ADD)
- Must support horizontal scaling for increased user load
- Must support managed relational database service
- Must support managed in-memory cache service

**Frontend Deployment Requirements**:
- Must support serverless or edge deployment for optimal performance
- Must support custom domain configuration
- Must support SSL/TLS encryption (HTTPS)

**Backend Deployment Requirements**:
- Must support scalable and portable deployment method
- Must support environment variable configuration (no secrets in code)
- Must support automated health checks

**CI/CD Requirements**:
- Must support automated testing on every code commit
- Must support automated deployment on main branch merge
- Must run linting, unit tests, integration tests before deployment
- Must support rollback capability

---

### 8.4 Monitoring & Observability Requirements

**Error Tracking**:
- System must capture and report unhandled exceptions
- Must track error frequency, affected users, stack traces
- Must support error grouping and prioritization

**Metrics & Dashboards**:
- System must track key metrics: request rates, error rates, latency (P50, P95, P99)
- Must track business metrics: trade signals generated, approval rate, win rate
- Must provide real-time dashboards for system health

**Uptime Monitoring**:
- System must be monitored for uptime (ping frontend and backend health endpoints)
- Must support alerting on downtime (email/Slack notifications)
- Should provide public status page (optional)

---

## 9. Non-Functional Requirements

### 9.1 Performance Requirements

**NFR-PERF-001: Alert Latency**
- Smart Money Tracking alerts must be delivered within 30 seconds of on-chain transaction confirmation (P95)
- Measurement: Latency from blockchain confirmation to user notification

**NFR-PERF-002: Narrative Scouting Refresh**
- Social media scanning must complete full cycle every 15 minutes (90% of cycles)
- Measurement: Time from scan initiation to narrative scoring completion

**NFR-PERF-003: Security Scan Response Time**
- Token security analysis must complete within 30 seconds (P99 < 30s, P50 < 10s)
- Measurement: API response time from contract address input to risk score output

**NFR-PERF-004: Trade Signal Generation**
- Breakout detection → signal generation → HITL request must complete in < 60 seconds (P95)
- Measurement: End-to-end latency from price movement to approval request

**NFR-PERF-005: Dashboard Load Time**
- Main dashboard must load in < 2 seconds on 4G connection
- Measurement: Time to Interactive (TTI), Lighthouse performance score > 90

**NFR-PERF-006: Database Query Performance**
- Trade history queries must return in < 500ms for 1 year of data (P95 < 500ms, P99 < 1s)
- Measurement: Query execution time with proper indexing

---

### 9.2 Scalability Requirements

**NFR-SCALE-001: Concurrent Users**
- Phase 0-1 (Months 1-5): Support 1-5 concurrent users
- Phase 2.5 (Month 6): Support 5-10 concurrent users
- Phase 3 (Months 7-8+): Support 10-50 concurrent users
- Acceptance: < 5% increase in P95 latency under target load

**NFR-SCALE-002: Smart Money Wallet Tracking**
- MVP: Track 20 wallets across 3 blockchains
- Phase 2: Track 100 wallets across 5 blockchains
- Phase 3: Track 500 wallets across 10 blockchains
- Acceptance: 100% transaction capture rate for monitored wallets

**NFR-SCALE-003: Social Media Post Volume**
- MVP: Process 10,000 posts per 15-minute cycle
- Phase 2: Process 50,000 posts per 15-minute cycle
- Phase 3: Process 200,000 posts per 15-minute cycle
- Acceptance: No dropped posts, clustering completes within cycle

**NFR-SCALE-004: Database Growth**
- Year 1: Support up to 10GB database storage
- Year 2: Support up to 50GB database storage
- Acceptance: Automated partitioning/archiving maintains query performance

**NFR-SCALE-005: MCP API Rate Limits**
- System must handle external API rate limits gracefully
- Must implement request queuing, exponential backoff, caching
- Acceptance: > 99% request success rate with caching strategy

---

### 9.3 Security Requirements

**NFR-SEC-001: Authentication & Authorization**
- Passwordless authentication must be mandatory for all user accounts (WebAuthn/Passkeys or OAuth)
- WebAuthn credentials must be cryptographically bound to origin domain (phishing-resistant)
- OAuth providers must enforce their own MFA policies (Google 2FA, Apple 2FA)
- Acceptance: 100% user accounts use passwordless authentication, zero password-based logins

**NFR-SEC-002: API Key Management**
- Exchange API keys must be encrypted at rest (AES-256 or equivalent)
- API keys must be transmitted over TLS 1.3
- API keys must never be logged or exposed in UI
- Acceptance: Zero API key leaks, annual security audit

**NFR-SEC-003: Approval Workflow Security**
- HITL approval requests must be signed to prevent tampering
- Approval tokens must have expiration
- Acceptance: 100% approval requests validate authenticity before execution

**NFR-SEC-004: Data Encryption**
- All sensitive data must be encrypted at rest and in transit
- Database connections must use TLS
- Cache connections must use TLS
- Acceptance: SOC 2 Type II compliance-ready architecture

**NFR-SEC-005: Audit Logging**
- All critical actions must be logged to immutable audit trail
- Coverage: Trade executions, approval decisions, agent reasoning, config changes
- Retention: 7 years (regulatory compliance)
- Acceptance: 100% critical actions captured

**NFR-SEC-006: Input Validation**
- All user inputs must be sanitized to prevent injection attacks
- Coverage: SQL injection, XSS, SSRF, command injection
- Acceptance: OWASP Top 10 vulnerability scan passes

**NFR-SEC-007: Secrets Management**
- No secrets in code, environment variables logged, or version control
- Secrets must be stored in secure vault
- Acceptance: Secret scanning passes on every commit

---

### 9.4 Reliability & Availability Requirements

**NFR-REL-001: System Uptime**
- MVP: 95% uptime (acceptable downtime: 36 hours/month)
- Phase 2: 99% uptime (acceptable downtime: 7.2 hours/month)
- Phase 3: 99.5% uptime (acceptable downtime: 3.6 hours/month)
- Measurement: Uptime monitoring, synthetic checks
- Acceptance: Meet SLA targets, post-mortems for incidents

**NFR-REL-002: Fault Tolerance**
- System must gracefully degrade when external services fail
- Examples: Fall back to alternative data source, skip non-critical workflow step, notify user
- Acceptance: System remains operational with degraded features (no full crashes)

**NFR-REL-003: Data Backup**
- Database must be backed up daily with 30-day retention
- Recovery Point Objective (RPO): 24 hours max data loss
- Recovery Time Objective (RTO): 4 hours to restore from backup
- Acceptance: Quarterly restore drills succeed within RTO

**NFR-REL-004: Error Handling**
- All errors must be logged with context
- User-facing errors must have actionable messages (no generic "500 error")
- Acceptance: < 1% unhandled exceptions, 100% errors have clear messages

**NFR-REL-005: Circuit Breaker**
- System must implement circuit breaker pattern for external service calls
- Circuit must open after 5 consecutive failures, retry after 60 seconds
- Acceptance: Failing external service doesn't block entire workflow

---

### 9.5 Maintainability Requirements

**NFR-MAINT-001: Code Quality**
- Code must adhere to project coding standards (defined in separate engineering guidelines document)
- Acceptance: CI pipeline enforces quality gates, code reviews pass standards checks

**NFR-MAINT-002: Test Coverage**
- Unit test coverage: 80% minimum
- Integration tests: All critical workflows must have integration tests
- E2E tests: Happy path for each MVP workflow
- Acceptance: Coverage gates enforced in CI, tests run on every PR

**NFR-MAINT-003: Documentation**
- Complex logic must have inline code comments
- Each module must have README with setup instructions
- API must be documented (OpenAPI spec for REST endpoints)
- Architecture decisions must be documented (ADRs)
- Acceptance: New developers can onboard in < 2 days

**NFR-MAINT-004: Dependency Management**
- Dependencies must be updated automatically (via automated dependency update tooling)
- Security vulnerabilities must be scanned (via automated vulnerability scanner)
- Critical security patches must be reviewed and merged within 48 hours
- Acceptance: Zero high/critical vulnerabilities in production dependencies

**NFR-MAINT-005: Observability**
- Structured logging must be implemented
- Distributed tracing must be implemented for workflow execution
- Metrics dashboards must be available: request rates, error rates, latencies
- Acceptance: < 30 minutes mean time to detection (MTTD) for critical issues

---

### 9.6 Usability Requirements

**NFR-UX-001: Responsive Design**
- Dashboard must be fully functional on desktop, tablet, mobile
- Acceptance: Manual testing on 3 device sizes, no horizontal scroll

**NFR-UX-002: Accessibility**
- System must comply with WCAG 2.1 Level AA
- Coverage: Keyboard navigation, screen reader support, color contrast
- Acceptance: Lighthouse accessibility score > 90

**NFR-UX-003: Notification Preferences**
- Users must be able to customize alert channels per workflow
- Acceptance: Granular per-workflow notification settings persist correctly

**NFR-UX-004: Dashboard Customization**
- Users must be able to rearrange dashboard widgets
- Acceptance: Widget layout persists across sessions

**NFR-UX-005: Error Messages**
- User-facing error messages must be clear and actionable
- Bad: "Error: 500 Internal Server Error"
- Good: "Unable to fetch price data. CoinGecko API is temporarily unavailable. Trying backup source..."
- Acceptance: 100% user-facing errors have clear, actionable messages

---

### 9.7 Compliance Requirements

**NFR-COMP-001: GDPR Compliance**
- EU users must be able to export personal data (JSON/CSV)
- EU users must be able to delete personal data (right to be forgotten)
- System must obtain explicit consent for analytics cookies
- Acceptance: GDPR self-assessment checklist 100% complete

**NFR-COMP-002: Financial Data Retention**
- Trade history must be retained for 7 years (tax compliance)
- Account deletion must anonymize user data but retain trade records
- Acceptance: Trade records survive user account deletion

**NFR-COMP-003: Terms of Service & Disclaimers**
- System must display clear disclaimers: advisory only, not financial advice
- Users must accept TOS on signup
- Trade signals must include disclaimers
- Acceptance: Legal review approval, user must acknowledge before first trade

**NFR-COMP-004: Audit Trail**
- All agent decisions must be traceable with reasoning stored
- Acceptance: Can reconstruct full decision history for any trade

---

### 9.8 Cost & Resource Requirements

**NFR-COST-001: Infrastructure Budget**
- Phase 0-1 (Months 1-5): $100-200/month
- Phase 2.5 (Month 6): $150-250/month
- Phase 3 (Months 7-8+): $200-400/month
- Acceptance: Actual costs within 20% of budget

**NFR-COST-002: LLM API Budget**
- Monthly LLM budget: $300-500/month (ecosystem-wide, not per-user)
- Strategy: Use cost-effective models for high-frequency tasks (narrative scanning), premium models for critical decisions (trade signals)
- Cost optimization: Aggressive caching, rate limiting, prompt optimization
- Acceptance: Stay within monthly LLM budget while meeting 30-second alert latency

**NFR-COST-003: External API Free Tier Utilization**
- System must maximize use of free tiers before upgrading to paid plans
- Acceptance: MVP operates on free tiers where possible + paid LLM APIs

---

## 10. Acceptance Criteria

### 10.1 MVP Workflow Acceptance Criteria

#### AC-001: Smart Money Tracking

**Given** the system is monitoring 20 whale wallets across L2s (Arbitrum, Base, Optimism) and L1s (Ethereum, Solana, BSC)
**When** a monitored wallet executes a transaction > $100,000
**Then**:
- Alert generated within 30 seconds (NFR-PERF-001)
- Alert includes: wallet address, token, amount, direction, USD value, historical behavior
- Alert delivered via web dashboard plus configured channels
- Transaction stored with AI reasoning
- False positive rate < 10%

**Pass Criteria**:
- 95% of significant transactions trigger alerts within 30 seconds
- Alert data accuracy: 100% (correct wallet, token, amount)
- AI reasoning quality: Human evaluator rates >= 7/10 on average
- Zero missed transactions for monitored wallets (100% capture rate)

---

#### AC-002: Narrative Scouting

**Given** the system is scanning social media every 15 minutes
**When** narrative scouting cycle completes
**Then**:
- Minimum 10,000 posts processed from major social platforms (X/Twitter, Reddit, Telegram)
- Posts clustered into narratives using semantic similarity
- Each narrative scored with weighted formula
- Top 10 narratives delivered to dashboard, ranked by strength score
- Duplicate narratives filtered
- Token mappings included for each narrative

**Pass Criteria**:
- 90% of scan cycles complete within 15 minutes (NFR-PERF-002)
- Narrative clustering accuracy: 80% precision (manual validation sample)
- Token mapping accuracy: 85% (correct tokens linked to narratives)
- No duplicate narratives in top 10
- Scoring formula produces actionable rankings

---

#### AC-003: Security & Scam Detection

**Given** a trade signal is generated for a new token
**When** security detection workflow executes
**Then**:
- Contract analysis checks: honeypot detection, ownership analysis, malicious patterns
- Liquidity check: LP locked/burned, liquidity depth > $50K
- Team verification: Doxxed founders, GitHub activity, past projects
- Risk score calculated: Low / Medium / High / Critical
- If risk >= High: Trade signal blocked, user notified with reasoning
- If risk < High: Trade signal proceeds to HITL approval with security summary

**Pass Criteria**:
- Scan completes in < 30 seconds (NFR-PERF-003)
- Detection accuracy: 95% sensitivity for known scams
- False positive rate: < 5% (legitimate tokens not incorrectly flagged)
- 100% of High/Critical risk tokens blocked before user approval
- Security report includes specific evidence

---

### 10.2 Post-MVP Workflow Acceptance Criteria

#### AC-004: Backtesting & Simulation

**Given** user configures breakout trading strategy parameters
**When** backtesting workflow runs against 6 months historical data
**Then**:
- Simulation executes all entry/exit signals as if trading live
- Metrics calculated: total trades, win rate, profit factor, max drawdown, Sharpe ratio, total return
- Trade-by-trade log available for review
- User can modify parameters and re-run simulation
- Approval criteria guidance displayed

**Pass Criteria**:
- Backtest completes in < 5 minutes for 6 months of 1-hour candle data
- Simulation accuracy: Matches exchange historical OHLCV data exactly
- Slippage modeling: Configurable slippage applied
- User can export backtest report (PDF/CSV)
- Clear visual indication when strategy meets/fails approval criteria

---

#### AC-005: Systematic Breakout Trading

**Given** backtesting shows strategy meets approval criteria
**When** breakout trading workflow is live
**Then**:
- Monitors configured watchlist tokens for breakout patterns
- Detects breakout with volume confirmation and RSI filter
- Generates trade signal with entry, position size, stop, target
- Security check executes automatically
- If security passes: HITL approval request sent with expiration
- User approves/rejects via web dashboard, Telegram, or mobile
- If approved: Order placed on exchange
- Position managed: Stop loss / take profit orders placed immediately
- If stop/target hit: Position closed, P&L recorded, user notified

**Pass Criteria**:
- Signal generation latency < 60 seconds (NFR-PERF-004)
- HITL approval request includes all required fields (AC-007)
- Order execution: 100% of approved signals result in successful order placement
- Stop loss / take profit execution: 95% reliability (slippage within 0.5%)
- Zero unauthorized trades (100% require HITL approval)
- Audit trail: Every signal, approval decision, execution logged

---

#### AC-006: Portfolio Management & Tax Optimization

**Given** user has active trades and closed positions
**When** portfolio dashboard loads
**Then**:
- Current holdings displayed: token, quantity, avg entry price, current price, unrealized P&L
- Portfolio metrics: total value, daily/weekly/monthly return %, max drawdown, Sharpe ratio
- Trade history: All closed trades with realized P&L, exit reason
- Risk exposure: Total capital deployed, available cash, per-trade risk percentage
- Tax report available: CSV export with all trades for tax filing

**Pass Criteria**:
- Dashboard loads in < 2 seconds (NFR-PERF-005)
- P&L calculations accurate to 2 decimal places (matches exchange data)
- Real-time price updates every 10 seconds
- Tax report format: Compatible with major tax software
- Data retention: 7 years (NFR-COMP-002)

---

### 10.3 Core System Acceptance Criteria

#### AC-007: HITL Approval Workflow

**Given** a trade signal requires user approval
**When** HITL approval request is generated
**Then**:
- Approval request includes: Signal ID, token, action, entry price, quantity, USD value, stop loss, take profit, risk USD, agent reasoning, security risk level, expiration time
- Request delivered via: Web dashboard notification plus configured channels
- User can: Approve, Reject, Modify, Defer
- If approved: Order executed immediately
- If rejected: Signal discarded, reason logged
- If expired: Auto-rejected, user notified
- All decisions logged to audit trail

**Pass Criteria**:
- 100% of critical actions (trade executions) require HITL approval
- Approval request delivery latency < 10 seconds
- Modification feature works: Adjusted parameters reflected in executed order
- Expiration handling: 100% of expired requests auto-rejected
- Multi-channel delivery: User receives notification on all configured channels

---

#### AC-008: LLM-Agnostic Architecture

**Given** user wants to switch LLM provider
**When** provider configuration is updated
**Then**:
- System supports runtime switching between providers
- No code changes required
- Per-workflow model assignment persists
- Cost tracking: API usage logged per provider
- Fallback strategy: If primary provider fails, system automatically tries secondary provider

**Pass Criteria**:
- Provider switching works without redeployment
- All configured providers functional
- Fallback executes automatically within 5 seconds of provider failure
- Cost tracking accuracy: Matches provider billing statements within 5%
- No workflow failures due to provider-specific API differences

---

#### AC-009: MCP Integration

**Given** workflows require external data
**When** MCP tool is invoked
**Then**:
- Tool schemas registered in system
- Agent can invoke tools via natural language
- Responses cached with appropriate TTLs
- Rate limits handled gracefully: Request queuing, exponential backoff, user notification on repeated failures
- Circuit breaker opens after 5 consecutive failures, retries after 60 seconds

**Pass Criteria**:
- All required MVP MCP servers functional and tested
- Cache hit rate > 60% (reduces API costs and latency)
- Rate limit handling: 99% request success rate despite API limits
- Circuit breaker prevents cascading failures
- Tool invocation errors logged with context

---

#### AC-010: User Account Management

**Given** user wants to manage their account
**When** user accesses account settings
**Then**:
- User can update email (requires verification)
- User can manage authentication methods (add/remove Passkeys, link/unlink OAuth providers)
- User can view and revoke active sessions
- User can configure notification preferences
- User can export personal data (GDPR)
- User can request account deletion (with confirmation)

**Pass Criteria**:
- Email update: Verification email sent, new email confirmed
- Authentication management: Can add multiple Passkeys, link OAuth providers
- Session management: Can view all active sessions, revoke any session
- Data export: Complete within 48 hours, includes all user data
- Account deletion: Processed within 7 days, trade history retained (anonymized)

---

### 10.4 Test Scenarios (High-Level)

**Test Scenario 1: End-to-End Smart Money Alert**
1. Configure system to monitor specific wallet address on L2 (Arbitrum/Base)
2. Simulate large transaction from wallet (> $100K)
3. Verify alert generated within 30 seconds
4. Verify alert includes correct data
5. Verify alert delivered to dashboard plus configured channels
6. Verify transaction stored with AI reasoning

**Test Scenario 2: Trade Signal with HITL Approval**
1. Configure breakout trading strategy
2. Simulate breakout pattern
3. Verify signal generated within 60 seconds
4. Verify security check executes
5. Verify HITL approval request sent to all channels
6. User approves via configured channel
7. Verify order placed on exchange
8. Verify stop loss / take profit orders placed
9. Verify all steps logged to audit trail

**Test Scenario 3: Security Detection Blocks Scam**
1. Input known honeypot token contract address
2. Verify security workflow detects: honeypot pattern, no LP lock, anonymous team
3. Verify risk score = Critical
4. Verify trade signal automatically blocked
5. Verify user notified with detailed reasoning
6. Verify block decision logged to audit trail

**Test Scenario 4: LLM Provider Fallback**
1. Configure primary and secondary providers
2. Simulate primary provider failure
3. Verify system automatically switches to secondary within 5 seconds
4. Verify workflow completes successfully
5. Verify provider switch logged
6. Verify cost tracking attributes usage to correct provider

**Test Scenario 5: User Account Deletion (GDPR)**
1. User requests account deletion
2. System sends confirmation email
3. User confirms deletion
4. Verify user data anonymized
5. Verify trade history retained (anonymized)
6. Verify user cannot log in
7. Verify audit trail shows deletion event

---

## 11. Traceability Matrix

### 11.1 FRD → BRD Mapping

This table maps functional requirements back to business objectives from the BRD.

| **FRD Requirement** | **BRD Business Objective** | **Success Metric (BRD)** |
|---------------------|----------------------------|--------------------------|
| FR-SMT-001 to FR-SMT-006 (Smart Money Tracking) | BO-001: Information edge without capital risk | Early signal detection, 35-45% win rate |
| FR-NS-001 to FR-NS-007 (Narrative Scouting) | BO-001: Identify emerging trends early | Narrative strength score accuracy |
| FR-SEC-001 to FR-SEC-008 (Security Detection) | BO-002: Zero security incidents | 95% scam detection rate, < 5% false positives |
| FR-BT-001 to FR-BT-005 (Backtesting) | BO-003: Validate before deploying capital | Strategy approval criteria (win rate > 35%, PF > 1.5) |
| FR-BT-006 to FR-BT-015 (Breakout Trading) | BO-004: Semi-autonomous execution | 100% HITL approval, positive expectancy |
| FR-PM-001 to FR-PM-006 (Portfolio Management) | BO-005: Time savings, tax optimization | 40h/week → 10-20h/week, 7-year retention |
| FR-HITL-001 to FR-HITL-005 (HITL Workflow) | BO-006: Regulatory compliance | 100% trade approval audit trail |
| FR-LLM-001 to FR-LLM-005 (LLM-Agnostic) | BO-007: Vendor flexibility, cost control | Runtime switching works, LLM budget $300-500/month |
| FR-USER-001 to FR-USER-006 (User Management) | BO-008: Professional platform | GDPR compliance, MFA enforcement |
| NFR-COST-001 to NFR-COST-003 (Budget) | BO-009: Cost-effective operation | $100-200/month (Phase 0-1) → $200-400/month (Phase 3), LLM budget $300-500/month |

**Coverage Analysis**:
- All BRD business objectives have corresponding FRD functional requirements
- All FRD workflows trace back to specific business value
- Success metrics from BRD are operationalized as acceptance criteria in FRD

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **HITL** | Human-in-the-Loop: Manual approval gate for critical decisions |
| **MCP** | Model Context Protocol: Universal standard for AI tool/data integration |
| **Agentic Workflow** | State machine-based architecture for building AI agent workflows |
| **Smart Money** | Large institutional or whale investors whose trades signal market movements |
| **Narrative** | Emerging crypto trend or theme gaining social media attention |
| **Honeypot** | Malicious token contract that prevents selling after purchase |
| **LP Lock** | Liquidity pool tokens locked in smart contract, preventing rug pull |
| **Breakout** | Price movement above a resistance level |
| **Backtesting** | Simulating trading strategy on historical data to validate edge |
| **P&L** | Profit and Loss |
| **Sharpe Ratio** | Risk-adjusted return metric (higher is better) |
| **Max Drawdown** | Largest peak-to-trough decline in portfolio value |
| **Profit Factor** | Gross profit / Gross loss (> 1.0 indicates profitability) |
| **MFA** | Multi-Factor Authentication |
| **GDPR** | General Data Protection Regulation (EU privacy law) |

---

## Appendix B: Acceptance Criteria Sign-Off Checklist

Before marking FRD as complete, verify:

- [x] All 6 trading workflows have detailed functional requirements
- [x] User management and admin features included
- [x] All functional requirements have corresponding acceptance criteria
- [x] All NFRs have measurable targets (latency, uptime, coverage, etc.)
- [x] Data entity requirements defined (actual schemas in TSD)
- [x] State machine workflows defined (implementation patterns in ADD)
- [x] MCP server integrations specified
- [x] HITL approval workflow covers all critical actions
- [x] Security requirements include encryption, audit, compliance
- [x] Traceability matrix maps 100% FRD → BRD
- [x] Test scenarios cover happy paths and edge cases
- [x] Cost projections aligned with BRD budget
- [x] Deployment requirements specified (vendors in ADD)
- [x] Monitoring/observability requirements defined
- [x] Document boundaries enforced (no SQL schemas, no code, no vendor-specific details)

---

**End of Functional Requirements Document (v4.0 - BRD Alignment Update)**

**Document Boundaries Maintained**:
- This FRD defines WHAT the system must do
- Application Design Document (ADD) will define HOW (architecture, patterns, component design)
- Technical Specification Document (TSD) will define HOW EXACTLY (database schemas, API specifications, deployment procedures)

**Next Steps**:
1. User reviews and approves updated FRD
2. Review Application Design Document (ADD) - System architecture, implementation patterns, component design
3. Review Technical Specification Document (TSD) - Database schemas, API specifications, deployment procedures
