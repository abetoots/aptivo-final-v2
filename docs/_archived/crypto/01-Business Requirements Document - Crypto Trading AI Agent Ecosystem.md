# Business Requirements Document (BRD)
## Crypto Trading AI Agent Ecosystem

**Document Version:** 2.3
**Date:** January 14, 2026
**Project Owner:** [Your Name]
**Status:** Final (Multi-Model Consensus Review + Sign-Off Approved)

---

## Executive Summary

### Project Overview
A semi-autonomous, LLM-agnostic AI agent ecosystem designed to transform crypto trading through systematic information edge and disciplined execution. The system reduces trader time commitment from 40+ hours/week to 10-20 hours/week while targeting 30-300% ROI over 12 months on $5K starting capital.

### Business Value Proposition
**Problem:** 70-90% of retail crypto traders lose money due to lack of systematic edge, emotional decision-making, information disadvantage versus institutions, and overtrading.

**Solution:** AI-augmented trading ecosystem that provides institutional-grade information intelligence (smart money tracking, narrative scouting) with semi-autonomous execution and human oversight for regulatory compliance and capital preservation.

### Target ROI (12-Month Projection)
- **Conservative Scenario:** $5K → $6.5K-$10K (30-100% return)
- **Optimistic Scenario:** $5K → $10K-$20K (100-300% return)

> **Note (v2.0):** ROI targets revised based on multi-model consensus review. Original targets (140-1500%) were inconsistent with systematic trading strategies at this capital level. Professional algorithmic traders typically target 20-50% annually with institutional resources.

### MVP Timeline
**Months 1-3:** Core intelligence infrastructure delivering information edge for manual trading (Smart Money Tracking + Narrative Scouting + Security)

**Months 4-6:** Semi-autonomous execution with human approval gates (Systematic Breakout Trading + Portfolio Management)

---

## 1. Business Objectives & Success Criteria

### 1.1 Primary Objectives

#### Objective 1: Achieve Measurable Trading Alpha
**Target:** 30-100%+ ROI within 12 months on $5K starting capital
**Success Metrics:**
- Conservative target: $6.5K-$10K (30-100% return)
- Optimistic target: $10K-$20K (100-300% return)
- Win rate: 35-45% minimum
- Risk:Reward ratio: 1:2 minimum maintained
- Positive mathematical expectancy: (Win Rate × Avg Win) - (Loss Rate × Avg Loss) > 0

#### Objective 2: Reduce Time Commitment
**Target:** 50-75% reduction in active trading time  
**Success Metrics:**
- Manual baseline: 40+ hours/week
- Target: 10-20 hours/week with AI augmentation
- Agent-driven research/analysis: 80% automated
- Human decision time: <2 hours/day for trade approval and monitoring

#### Objective 3: Maintain Capital Preservation
**Target:** Zero losses from preventable security incidents  
**Success Metrics:**
- Zero phishing/scam losses
- Zero honeypot contract interactions
- 100% smart contract verification before execution
- Security module prevents 1+ potential loss event in first 6 months

### 1.2 Workflow-Specific Success Metrics

#### On-Chain Smart Money Tracking (A+ Priority)
- **Alerts:** 10+ actionable whale movement alerts per month
- **Latency:** <30 seconds from on-chain event to notification (via WebSocket subscriptions)
- **Accuracy:** 70%+ of alerts correctly predict directional bias with 1:2 R:R setups
- **False Positives:** <20% of alerts

> **Note (v2.0):** Latency tightened from 5 minutes to 30 seconds. MEV bots and copy-trading software operate in sub-10-second ranges; 5-minute delays render smart money data useless.

#### Narrative Scouting (A Priority)
- **Early Detection:** Identify 2-3 emerging narratives before mainstream awareness (defined as trending on CT/CoinDesk)
- **Win Rate:** 50%+ of narrative-driven positions achieve profitable R:R outcomes
- **Lifecycle Tracking:** Successfully track narrative from emergence → mainstream → decline

> **Note (v2.0):** Data sources pivoted from Twitter/X API (now $42K+/year for enterprise access) to DEX Screener volume velocity, Farcaster/Lens social graphs, and on-chain flow analysis. These provide more reliable, cost-effective signals.

#### Security & Scam Detection (A- Priority)
- **Prevention:** Block 100% of known phishing attempts
- **Contract Analysis:** Flag 90%+ of honeypot/malicious contracts
- **Risk Scoring:** Provide actionable risk assessment for 100% of new protocols before interaction

#### Systematic Breakout Trading (Phase 3)
- **Win Rate:** 35-45% (mathematical expectancy remains positive with 1:2 R:R)
- **R:R Ratio:** 1:2 minimum enforced (stop-loss:take-profit)
- **Trade Frequency:** Max 1-2 trades per session (prevent overtrading)
- **Expectancy:** Positive over rolling 20-trade sample

#### Portfolio Management (Phase 4)
- **Tracking Accuracy:** >99% portfolio sync across exchanges/chains
- **Tax Optimization:** Identify $1K-$5K in tax savings opportunities annually
- **Rebalancing:** Execute during optimal (low-gas) windows 90%+ of time

---

## 2. Stakeholder Analysis

### 2.1 Primary Stakeholders

#### Owner/Lead Trader (You)
**Role:** Project owner, lead developer, primary trader  
**Priorities:**
1. Maximize risk-adjusted returns (ROI with capital preservation)
2. Minimize active time commitment (10-20h/week)
3. Maintain full control over capital deployment decisions
4. Ensure regulatory compliance (semi-autonomous only)

**Success Criteria:**
- Achieve conservative ROI target (30-100%) in Year 1
- Reduce trading time from 40h → 10-20h/week
- Zero regulatory issues from automated trading
- System scales to small team without rewrite

#### Future Team Members (Months 6-12)
**Role:** Additional traders/developers (2-5 person scale)  
**Priorities:**
1. Clear system documentation and onboarding
2. Modular workflows allowing parallel work
3. Collaborative tools (shared dashboards, alerts)
4. Independent workspace (multi-account support)

**Success Criteria:**
- New team member productive within 2 weeks
- Can contribute to 1+ workflows without breaking others
- Shared infrastructure (data layer, security) works multi-tenant

### 2.2 Implicit Stakeholders

#### Regulatory Bodies
**Concern:** Automated trading systems must comply with local financial regulations  
**Requirement:** Semi-autonomous design (human approval gate) prevents full automation violations  
**Risk Mitigation:** All trade executions require explicit human approval via HITL checkpoints

#### Crypto Exchanges
**Concern:** API rate limits, terms of service compliance  
**Requirement:** Respect rate limits, implement caching, avoid abusive patterns  
**Risk Mitigation:** Request queuing in cache layer, aggressive caching strategy, API key rotation plan

---

## 3. Scope & Requirements

### 3.1 In-Scope (MVP - Months 1-3)

#### Core Infrastructure
- Multi-chain data aggregation service
- State machine orchestration for agent workflows
- Persistence layer (relational database + in-memory cache)
- Basic web dashboard for alerts/monitoring

#### Workflows (MVP)
1. **On-Chain Smart Money Tracking:** Track 20+ whale wallets, detect accumulation/distribution patterns, generate real-time alerts
2. **Narrative Scouting:** Monitor social (Twitter/X, Reddit) and news (CoinDesk, etc.) for emerging trends, theme extraction via LLM
3. **Security & Scam Detection:** Contract verification, phishing URL detection, honeypot analysis, transaction simulation

#### MVP Deliverables
- 20+ tracked whale wallets with live monitoring
- 10+ actionable alerts from smart money/narrative agents
- Zero security incidents during MVP period
- Dashboard displaying unified alerts with context

### 3.2 In-Scope (Post-MVP - Months 4-6)

#### Phase 2.5: Backtesting & Simulation (NEW - Expert Recommendation)
**Critical Addition:** Validate trading strategies against historical data before deploying live capital  
**Deliverables:**
- Historical price data pipeline (exchange APIs)
- Simulation environment running Breakout Trading agent against past data
- Performance report: Sharpe Ratio, Max Drawdown, Win Rate, Expectancy
- **Gate:** Strategy only promoted to live trading after meeting predefined targets in backtest

#### Phase 3: Systematic Breakout Trading
- Macro/Narrative Bias Agent (Phase 1: sentiment analysis)
- Technical Scanning Agent (Phase 2: screener for HTF setups)
- Order Flow Analysis Integration (Phase 3: real-time confirmation)
- Human-in-the-Loop approval workflow (checkpoints with explainability)
- Trade execution via exchange APIs
- Automated trade journal with full audit trail

#### Phase 4: Portfolio Management
- Multi-exchange aggregation (Binance, Coinbase, etc.)
- DeFi position tracking (LP tokens, staking, lending)
- Tax optimization module (FIFO/LIFO cost basis, tax loss harvesting)
- Real-time P&L dashboard
- Rebalancing recommendations

### 3.3 Out of Scope

#### Workflows Deferred to Year 2+
- **Airdrop Farming:** Requires $500-$2K gas capital, deferred until portfolio >$20K
- **DeFi Yield Optimization:** High smart contract risk, requires $50K+ portfolio for worthwhile returns
- **Advanced Trade Execution (TWAP/VWAP):** Only valuable for $10K+ position sizes
- **MEV Opportunities:** Extremely high technical bar, $50K+ capital requirement, ethical concerns

#### Explicitly Excluded
- Fully autonomous trading (regulatory risk)
- NFT trading/sniping (market conditions weak, high time commitment)
- DAO governance participation (low ROI, high time commitment)
- Customer support agents (not building public product)

---

## 4. Constraints & Assumptions

### 4.1 Financial Constraints
- **Starting Capital:** $5,000 (limits position sizing to $100-$150 per trade at 2-3% risk)
- **Monthly Budget:** $300-$500 for LLM API costs (OpenAI, Anthropic, Google)
- **Infrastructure Costs:** $50-$100/month (cloud hosting, database, monitoring, data providers)

> **Note (v2.0):** LLM budget increased from $50-$200 to $300-$500. Multi-agent narrative analysis, explainability, and backtesting typically consume 5-10M tokens/month. Original budget was insufficient for production workloads.

### 4.2 Technical Constraints
- **Technology Stack:** Typed backend language, component-based UI framework, state-machine orchestration - Initial choices (not locked, defined in TSD)
- **Deployment Model:** Hybrid (local development, cloud production)
- **Database Requirements:** Relational database for persistent state, in-memory cache for queuing, analytical store for backtesting (specific technologies defined in TSD)
- **LLM Strategy:** Standardize on one provider for MVP (reduce prompt engineering overhead); add router pattern post-profitability
- **Chain Strategy:** L2-first (Base, Arbitrum, Optimism) - Ethereum L1 deprioritized due to gas costs incompatible with $5K capital
- **Secrets Management:** Dedicated secrets management solution required for API keys and exchange credentials (protects against credential exposure)
- **Wallet Architecture:** Multi-signature or hardware wallet signing required for on-chain operations (protects against single point of compromise)

> **Note (v2.0):** Added L2-first strategy, secrets management, and wallet security requirements. These are non-negotiable for capital preservation. Specific tooling choices deferred to TSD.

### 4.3 Regulatory Constraints
- **Trading Automation:** Semi-autonomous only (human approval required for execution)
- **Tax Compliance:** Comprehensive logging required for tax reporting
- **KYC/AML:** Compliance handled by exchange integrations (Binance, Coinbase, etc.)
- **Geographic:** [Specify your jurisdiction - affects regulations]
- **Compliance Milestones:** Legal review, exchange certifications, penetration testing, DPIA

> **Note (v2.0):** Added explicit compliance milestones. EU MiCA, UK FM Bill, and US SAFER frameworks require registration for copy-trading services, model governance documentation, kill switches, and audit trails. Schedule legal consultation before Phase 3 deployment.

### 4.4 Operational Constraints
- **Development Capacity:** Solo developer initially, scaling to 2-5 person team by Month 6-12
- **Time Budget:** 10-20 hours/week ongoing post-build for active trading/monitoring
- **Team Scalability:** Architecture must support multi-user without rewrite

### 4.5 Key Assumptions
1. **Market Conditions:** Crypto markets remain accessible and liquid
2. **Exchange APIs:** Binance/major exchanges maintain stable API access
3. **LLM Availability:** OpenAI/Anthropic/Google maintain API service levels
4. **Data Sources:** Blockchain explorers, social APIs (Twitter/X), news sources remain accessible
5. **Regulatory Stability:** Semi-autonomous trading remains compliant in target jurisdiction
6. **Capital Growth:** Conservative ROI scenario (30-100%) is achievable with disciplined execution

---

## 5. Risk Analysis & Mitigation

### 5.1 Market Risks

#### Risk: Crypto Market Volatility
**Impact:** High (could wipe out capital without proper risk management)  
**Probability:** High (inherent to crypto)  
**Mitigation:**
- Enforce 2-3% position sizing maximum (hard-coded limit)
- Mandatory stop-losses on all trades
- Max 1-2 trades per session (prevent revenge trading)
- Diversification across multiple setups/narratives

#### Risk: Bear Market Conditions
**Impact:** Medium (reduces trading opportunities)  
**Probability:** Medium (market cycles)  
**Mitigation:**
- Smart Money Tracking works in all market conditions (whales trade bears too)
- Narrative Scouting identifies counter-trend opportunities
- System designed for information edge, not directional betting

#### Risk: Black Swan Events
**Impact:** Critical (unexpected crash/regulation)  
**Probability:** Low  
**Mitigation:**
- Position sizing prevents total loss (max 3% per trade)
- Stop-losses limit downside
- Human oversight prevents catastrophic algorithmic errors

### 5.2 Technical Risks

#### Risk: MCP Integration Layer Complexity (Expert-Identified)
**Impact:** High (blocks all data-dependent features)  
**Probability:** Medium (custom integration required)  
**Mitigation:**
- **Formalize as separate DataService layer** (decoupled from orchestration framework)
- **Define data schemas first** (database models before agent logic)
- **Implement request queuing/caching early** (in-memory cache for rate limiting/retries)
- Phase 1 scope: Focus on 2-3 key API categories (blockchain explorer, price data, exchange)

#### Risk: Real-Time Data Latency
**Impact:** High (stale data leads to missed opportunities)  
**Probability:** Medium (WebSocket complexity)  
**Mitigation:**
- **Decouple real-time data processing** (dedicated service, not agent loop)
- Dedicated WebSocket service feeds structured events to agents
- Agent loop remains non-blocking
- Alert on latency >5 minutes

#### Risk: LLM Hallucinations on Trade Signals
**Impact:** Critical (bad trade recommendation)  
**Probability:** Medium (LLMs are probabilistic)  
**Mitigation:**
- **Human approval gate prevents bad trades** (HITL checkpoint)
- Multi-source validation (smart money + narrative + technical must align)
- Conservative thresholds (only trade highest-confidence setups)
- Comprehensive explainability (show reasoning chain to human)

#### Risk: API Rate Limits
**Impact:** Medium (service degradation)  
**Probability:** Medium (multiple data sources)  
**Mitigation:**
- Aggressive caching in in-memory store
- Request queuing with exponential backoff
- Fallback providers (e.g., multiple blockchain explorers)
- Monitoring and alerting on rate limit hits

### 5.3 Financial Risks

#### Risk: Overtrading
**Impact:** High (death by thousand cuts, typical retail mistake)  
**Probability:** Medium without enforcement  
**Mitigation:**
- **Hard-coded limit:** Max 1-2 trades per session (system enforced)
- Cooldown periods after losses
- Agent tracks "trades taken today" in state
- Dashboard shows trade count prominently

#### Risk: Emotional Trading Decisions
**Impact:** High (overrides systematic edge)  
**Probability:** Medium (human psychology)  
**Mitigation:**
- Semi-autonomous removes emotion from execution
- Agent presents objective reasoning, not just recommendation
- Trade journal forces review of decision quality
- Weekly performance review highlights emotional trades

#### Risk: Scams/Phishing/Honeypots
**Impact:** Critical (total capital loss possible)  
**Probability:** Medium (crypto ecosystem has many bad actors)  
**Mitigation:**
- **Security module as prerequisite** before live trading (Phase 1)
- 100% contract verification before interaction
- Phishing URL database (curated security lists)
- Transaction simulation before signing
- Wallet approval monitoring

#### Risk: LLM API Cost Overruns
**Impact:** Medium (reduces profitability)  
**Probability:** Medium (many LLM calls)  
**Mitigation:**
- Cost monitoring dashboard (per-query tracking)
- Use cheaper models where appropriate (GPT-4o-mini for simple tasks)
- Prompt caching (50-90% savings on repeated context)
- Budget alerts at 50%, 80%, 100% of monthly limit

### 5.4 Development Risks

#### Risk: Scope Creep
**Impact:** Medium (delays MVP, increases complexity)  
**Probability:** High (many possible workflows)  
**Mitigation:**
- **Phased roadmap with clear MVP** (Months 1-3 frozen)
- Prioritization matrix (only A/A+ priority in MVP)
- Post-MVP: Requires business case (ROI projection) for new workflows

#### Risk: Missing Backtesting Phase (Expert-Identified)
**Impact:** Critical (deploying unvalidated strategy risks capital loss)  
**Probability:** High (was missing from original plan)  
**Mitigation:**
- **Insert Phase 2.5: Backtesting & Simulation** (before Phase 3)
- Gate: Strategy only goes live after meeting performance targets in backtest
- Measure Sharpe Ratio, Max Drawdown, Win Rate, Expectancy against historical data

#### Risk: Inadequate HITL Explainability (Expert-Identified)
**Impact:** High (human can't make informed decision)  
**Probability:** Medium (requires intentional design)  
**Mitigation:**
- **Design audit trail schema** for persisting agent reasoning
- Persist entire agent reasoning chain at each checkpoint
- Dashboard shows: trigger, smart money check, narrative check, technical setup, recommendation with context
- Human sees "why", not just "what"

#### Risk: Team Scaling Challenges
**Impact:** Medium (reduces development velocity)  
**Probability:** Medium (onboarding complexity)  
**Mitigation:**
- Documentation-first culture
- Modular architecture (each workflow is independent)
- Code reviews and pair programming
- Clear ownership (one person per workflow)

---

## 6. Implementation Roadmap

> **Note (v2.0):** Roadmap restructured based on multi-model consensus. Backtesting moved to Phase 0 (validate strategy before building infrastructure). All time estimates doubled. Paper trading phase added before live capital deployment.

### 6.0 Phase 0: Strategy Validation & Backtesting (Month 0-1) [NEW]
**Goal:** Validate trading strategy yields positive expectancy before writing infrastructure code

#### Deliverables
1. **Historical Data Pipeline**
   - Access to historical price data (OHLCV) from major exchanges
   - L2 chain transaction history (Base, Arbitrum)
   - Analytical data store separated from operational database
   - Minimum 2 years historical data coverage

2. **Strategy Backtesting**
   - Established backtesting framework (specific tooling defined in TSD)
   - Test breakout trading logic against historical data
   - Paper trading mode simulation
   - Performance tracking: P&L, win rate, R:R, max drawdown, Sharpe ratio

3. **Validation Gate**
   - Positive expectancy over 100+ simulated trades
   - Win rate: 35-45% achieved
   - R:R ratio: 1:2 maintained
   - Max drawdown: <20%
   - Sharpe ratio: >1.0

#### Success Criteria (GATE for Phase 1)
- Strategy must pass validation gate before proceeding
- If strategy fails, iterate on parameters or pivot approach
- Do NOT proceed to infrastructure build without validated edge

#### Time Investment: 60-100 hours
#### Capital Required: $0 (research only)

---

### 6.1 Phase 1: Foundation + MVP (Months 1-3)
**Goal:** Core infrastructure + first alpha-generating workflow

#### Deliverables
1. **DataService Layer**
   - Multi-chain data aggregation (EVM chain explorers)
   - Real-time price data from market data providers
   - Data persistence strategy for tracking wallets, transactions, tokens, and narratives
   - Request queue with rate limiting and caching strategy
   
2. **Smart Money Tracking Agent**
   - Wallet tracking for 20+ addresses (VCs, known traders, whale wallets)
   - Transaction parsing and pattern recognition (accumulation/distribution)
   - Alert system for significant movements (threshold: >$100K or 5% of token supply)
   
3. **Basic Security Module**
   - Contract verification via blockchain explorer APIs
   - Phishing URL detection (curated security database integration)
   - Token approval monitoring
   
4. **Basic Dashboard (React)**
   - Unified alert feed (smart money + security)
   - Wallet watchlist management
   - Simple alert configuration

#### Success Criteria
- 20+ tracked whale wallets with live monitoring
- 10+ actionable alerts generated in Month 2
- Zero security incidents (no phishing, no scam contracts)
- Dashboard functional for single user

#### Time Investment: 80-120 hours
#### Capital Required: $0 (API costs minimal, <$50/month)

> **Note (v2.0):** Time estimate doubled from 40-60 hours. Building a production-grade DataService with proper caching, rate-limiting, and error handling requires more time than initially projected.

### 6.2 Phase 2: Intelligence Layer (Months 3-4)
**Goal:** Add narrative intelligence + enhanced security

#### Deliverables
1. **Narrative Scouting Agent**
   - On-chain volume analysis from DEX aggregators
   - Decentralized social graph monitoring (alternative to Twitter/X)
   - News aggregation from crypto news feeds
   - Theme extraction via LLM
   - Trending topic identification with momentum scoring
   - Historical narrative comparison (current vs past cycles)
   - Narrative lifecycle tracking (emergence → mainstream → decline)

   > **Note (v2.0):** Replaced Twitter/X API dependency (now $42K+/year for enterprise access) with on-chain volume tracking and decentralized social data. Specific data providers defined in TSD.
   
2. **Enhanced Security System**
   - Smart contract audit report analysis via LLM
   - Honeypot detection via specialized third-party security APIs (do not build from scratch)
   - Transaction simulation before execution
   - Risk scoring dashboard for protocols

   > **Note (v2.0):** Honeypot detection delegated to specialized third-party APIs. Building a home-grown security scanner is high-risk and likely to miss novel attack vectors. Specific providers defined in TSD.
   
3. **Unified Alert System**
   - Telegram bot integration
   - Priority-based routing (critical real-time vs daily digest)
   - Alert aggregation and deduplication

#### Success Criteria
- Identify 2-3 emerging narratives before mainstream awareness (CT/CoinDesk trending)
- <5 minute latency on critical whale movement alerts
- Security system prevents 1+ potential scam interaction
- Telegram alerts functional

#### Time Investment: 60-80 hours
#### Capital Required: $100/month (LLM API costs + data provider subscriptions)

> **Note (v2.0):** Time estimate doubled. Backtesting moved to Phase 0 (strategy validation before infrastructure).

### 6.3 Phase 2.5: Paper Trading & Shadow Mode (Month 4-5) [NEW]
**Goal:** Validate live system behavior without risking capital

#### Deliverables
1. **Paper Trading Environment**
   - Connect to live market data feeds
   - Execute simulated trades (no real capital)
   - Track theoretical P&L in real-time

2. **Shadow Mode Testing**
   - Run alongside manual trading for 4-6 weeks
   - Compare agent recommendations vs actual outcomes
   - Measure latency, accuracy, and false positive rates

3. **Statistical Validation**
   - Minimum 50+ paper trades before live deployment
   - Verify backtested edge holds in live conditions
   - Document any regime-shift sensitivities

#### Success Criteria (GATE for Phase 3)
- Paper trading positive expectancy maintained
- Alert latency <30 seconds consistently achieved
- Zero critical bugs or security incidents in shadow mode

#### Time Investment: 40-60 hours
#### Capital Required: $0 (paper trading only)

---

### 6.4 Phase 3: Systematic Breakout Trading (Months 5-7)
**Goal:** Semi-autonomous execution with human approval

#### Deliverables
1. **Macro/Narrative Bias Agent**
   - Aggregate sentiment from Phase 1-2 agents
   - Provide daily market bias (bullish/bearish/neutral)
   - Risk-on vs risk-off signal generation
   
2. **Technical Scanning Agent**
   - Implement Daily/4H trend detection (HH/HL vs LH/LL)
   - Order Block and FVG (Fair Value Gap) detection
   - Calculate proximity to HTF Points of Interest (POIs)
   - Output: Filtered watchlist of assets approaching high-probability zones
   
3. **Human-in-the-Loop Approval Workflow**
   - Checkpoint at trade recommendation requiring human approval
   - Persist full agent reasoning chain to audit trail
   - Dashboard UI: Show trigger, smart money signal, narrative signal, technical setup, recommendation
   - Human approves/denies via dashboard
   - If approved, agent executes via exchange API

4. **Trade Execution Integration**
   - Exchange API integration for order execution
   - Order placement (market/limit orders)
   - Stop-loss and take-profit automation
   - Position sizing calculator (2-3% risk per trade)
   
5. **Automated Trade Journal**
   - Log every trade: entry, exit, P&L, setup, reasoning
   - Screenshot of chart at time of entry
   - Emotional state logging (optional manual input)
   - Weekly performance review dashboard

#### Success Criteria
- 35-45% win rate achieved over 20+ trades
- 1:2 R:R minimum maintained (stop-loss:take-profit)
- Positive expectancy confirmed
- Max 1-2 trades per session enforced by system
- Zero unintended executions (HITL gate works correctly)

#### Time Investment: 120-160 hours
#### Capital Required: $5K trading capital deployed (phased: start with $1K, scale after validation)

> **Note (v2.0):** Time estimate doubled. Capital deployment phased - begin with $1K to validate live execution before scaling to full $5K.

### 6.5 Phase 4: Portfolio Management (Month 8+)
**Goal:** Consolidate gains, operational efficiency

#### Deliverables
1. **Portfolio Aggregation**
   - Exchange API integration (Binance, Coinbase, Kraken)
   - DeFi position tracking (LP tokens, staking, lending via portfolio aggregators)
   - Unified P&L dashboard (all positions, all chains)
   
2. **Tax Optimization Module**
   - Cost basis tracking (FIFO/LIFO/Specific ID)
   - Tax loss harvesting opportunity identification
   - Estimated tax liability calculator
   - Transaction export for accountants (CSV/JSON)
   
3. **Auto-Rebalancing System**
   - Target allocation definition (e.g., 60% BTC, 30% ETH, 10% alts)
   - Deviation threshold monitoring (alert at 10% drift)
   - Rebalancing recommendations with tax impact analysis
   - Optional: Automated execution during low-gas windows
   
4. **Performance Analytics**
   - ROI tracking vs targets (conservative vs optimistic)
   - Per-workflow contribution to alpha
   - Risk-adjusted returns (Sharpe ratio)
   - Trade quality metrics (win rate, R:R, expectancy over time)

#### Success Criteria
- >99% portfolio tracking accuracy across exchanges
- $1K-$5K tax savings identified annually
- Rebalancing executed during optimal windows 90%+ of time
- Real-time P&L visibility

#### Time Investment: 80-100 hours build + 2-5 hours/week ongoing
#### Capital Required: $0 (working with existing portfolio)

> **Note (v2.0):** Time estimate doubled.

### 6.6 Roadmap Summary (v2.0 - Revised)

| Phase | Timeline | Key Deliverable | Success Gate | Capital at Risk |
|-------|----------|-----------------|--------------|-----------------|
| **Phase 0** | Month 0-1 | Strategy Validation & Backtesting | Positive expectancy, Sharpe >1.0 | $0 (research) |
| **Phase 1** | Months 1-3 | Smart Money Tracking + Security | 20+ wallets tracked, 10+ alerts, 0 security incidents | $0 |
| **Phase 2** | Months 3-4 | Narrative Scouting + Enhanced Security | 2-3 narratives identified, security prevents 1+ scam | $0 |
| **Phase 2.5** | Months 4-5 | Paper Trading & Shadow Mode | Paper trading validates edge, <30s latency | $0 (paper) |
| **Phase 3** | Months 5-7 | Systematic Trading + HITL | 35-45% win rate live, 1:2 R:R, positive expectancy | $1K→$5K (phased) |
| **Phase 4** | Month 8+ | Portfolio Management + Tax Optimization | >99% tracking, $1K-$5K tax savings | $5K+ (growing) |

> **Note (v2.0):** Timeline extended from 6 months to 8+ months. Backtesting moved to Phase 0. Paper trading phase added. Capital deployment phased to reduce risk.

### 6.7 Critical Path Dependencies (v2.0 - Revised)
1. **Strategy Backtesting** → Blocks all infrastructure work (Phase 0 gate - validate edge first)
2. **Secrets Management (Vault/Doppler)** → Blocks any API integration (security prerequisite)
3. **DataService Layer** → Blocks all workflows (Phase 1 priority #1)
4. **L2 Chain Integration** → Blocks on-chain monitoring (Base/Arbitrum RPCs required)
5. **Security Module** → Blocks live capital deployment (Phase 1 priority #2)
6. **Paper Trading Validation** → Blocks Phase 3 go-live decision (Phase 2.5 gate)
7. **HITL Checkpoint Design** → Blocks semi-autonomous execution (Phase 3 blocker)
8. **Legal/Compliance Review** → Blocks public deployment (before Phase 3)

---

## 7. Success Measurement & KPIs

### 7.1 Financial KPIs (Primary) - v2.0 Revised

| KPI | Target (Month 4) | Target (Month 8) | Target (Month 12) |
|-----|------------------|------------------|-------------------|
| **Total Portfolio Value** | $5K (no change, backtesting/paper trading) | $5.5K-$6.5K (10-30% gain) | $6.5K-$10K (30-100% gain) |
| **Monthly ROI** | N/A (paper trading) | 2-5% | 3-8% sustained |
| **Win Rate** | N/A | 35-45% | 35-45% |
| **Risk:Reward Ratio** | N/A | 1:2 minimum | 1:2 minimum |
| **Mathematical Expectancy** | N/A | Positive (>0) | Positive (>0) |
| **Max Drawdown** | N/A | <15% | <20% |

> **Note (v2.0):** Targets revised to realistic expectations. Original 140-1500% ROI was inconsistent with systematic trading at $5K capital. New targets align with professional algorithmic trading benchmarks.

### 7.2 Operational KPIs (Secondary)

| KPI | Target (Month 3) | Target (Month 6) | Target (Month 12) |
|-----|------------------|------------------|-------------------|
| **Time Commitment** | 15-25 hours/week (build phase) | 10-20 hours/week (operational) | 10-20 hours/week (scaled) |
| **Smart Money Alerts** | 10+ actionable alerts/month | 15+ actionable alerts/month | 20+ actionable alerts/month |
| **Narrative Identifies** | 2-3 emerging narratives | 3-5 emerging narratives | 5-10 emerging narratives |
| **Security Incidents** | 0 | 0 | 0 |
| **Portfolio Tracking Accuracy** | N/A | N/A | >99% |
| **Tax Optimization Savings** | N/A | N/A | $1K-$5K identified |

### 7.3 Technical KPIs (Tertiary) - v2.0 Revised

| KPI | Target |
|-----|--------|
| **Alert Latency** | <30 seconds from on-chain event to notification (via WebSocket) |
| **System Uptime** | >99% (excluding planned maintenance) |
| **API Error Rate** | <1% (includes retries) |
| **Dashboard Load Time** | <2 seconds (initial page load) |
| **LLM API Cost** | <$500/month in operational phase |
| **Data Pipeline Lag** | <30 seconds for real-time data, <5 minutes for batch |
| **Secrets Rotation** | API keys rotated every 90 days |

> **Note (v2.0):** Alert latency tightened from 5 minutes to 30 seconds. LLM budget increased to realistic levels. Added secrets rotation requirement.

### 7.4 Review Cadence

#### Daily
- Active alerts review (smart money, narrative, security)
- P&L review (once trading live)
- Trade journal entry (if trades taken)

#### Weekly
- Portfolio performance vs targets
- Agent performance (alert quality, false positives)
- Cost tracking (LLM API, infrastructure)
- Trade quality review (was decision process followed?)

#### Monthly
- ROI vs targets (conservative/optimistic)
- Win rate and R:R verification
- Risk management audit (any violations of 2-3% rule?)
- Roadmap progress vs plan

#### Quarterly
- Strategic review: continue, pause, or pivot workflows
- Technology debt assessment
- Team scaling evaluation (if applicable)

---

## 8. Appendices

### 8.1 Glossary

**AI Agent:** Autonomous software system using LLM reasoning to achieve goals through iterative thought-action-observation loops.

**Airdrop:** Free token distribution by crypto projects to early users/testers.

**CHoCH (Change of Character):** Price action pattern indicating potential trend reversal.

**DeFi (Decentralized Finance):** Financial applications built on blockchain without intermediaries.

**EVM (Ethereum Virtual Machine):** Execution environment for Ethereum smart contracts, used by many chains (Arbitrum, Optimism, Base, Polygon, etc.).

**Fair Value Gap (FVG):** 3-candle pattern where price moves so fast it leaves a gap, indicating institutional activity.

**HITL (Human-in-the-Loop):** Design pattern requiring human approval for critical agent decisions.

**LLM (Large Language Model):** AI model trained on text data (GPT-4, Claude, Gemini, etc.).

**MCP (Model Context Protocol):** Open standard for connecting AI systems to external data sources and tools.

**Order Block:** Last opposing candle before strong directional move, indicating institutional positioning.

**POI (Point of Interest):** Key price level where institutional orders are likely to exist (support/resistance zone).

**R:R (Risk:Reward Ratio):** Ratio of potential profit to potential loss (e.g., 1:2 means risk $100 to make $200).

**Smart Money:** Institutional traders, VCs, whales with inside information or superior resources.

**State Machine:** Computational model explicitly defining states, transitions, and actions for workflow orchestration.

**Whale:** Crypto holder with large position capable of moving market prices.

### 8.2 Referenced Documents

1. **The Complete Professional Crypto Trading Framework.md** - Source for trading methodology, workflow prioritization, and ROI projections
2. **Building AI Agents: A Complete Technical Guide.md** - Source for agent architecture patterns, framework selection, and production best practices
3. **The Complete Guide to Cryptocurrency Trading APIs and Model Context Protocol for Algorithmic Trading (2025).md** - Source for MCP ecosystem, exchange APIs, and data source integration

### 8.3 Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | October 19, 2025 | [Your Name] | Initial BRD creation |
| 2.0 | January 14, 2026 | Multi-Model Consensus Review | Major revision: ROI targets revised (30-300% full range), timelines doubled, Phase 0 backtesting added, L2-first strategy, secrets management requirements, paper trading phase, Twitter/X replaced with on-chain data sources |
| 2.1 | January 14, 2026 | Sign-Off Review Fixes | Abstracted technology prescriptions to capability-level language (scope creep fix), harmonized all ROI references to revised targets |
| 2.2 | January 14, 2026 | Sign-Off Fixes Round 2 | Removed technology prescriptions from deliverables and scope sections |
| 2.3 | January 14, 2026 | Final Sign-Off | Abstracted all remaining technology mentions (Tech Stack, Risk Mitigations, Glossary), Sign-Off APPROVED by both reviewers |

#### v2.0 Review Panel
- **Lead Expert:** Claude Opus 4.5
- **Reviewer 1:** Gemini 3 Pro Preview (9/10 confidence)
- **Reviewer 2:** Gemini 2.5 Pro (9/10 confidence)
- **Reviewer 3:** OpenAI Codex

#### v2.0 Key Changes Summary
1. ROI targets revised from 140-1500% to 30-300% (realistic for $5K capital)
2. All time estimates doubled (80-120h for Phase 1, 120-160h for Phase 3)
3. Backtesting moved to Phase 0 (validate strategy before infrastructure)
4. Paper trading phase added before live capital deployment
5. L2-first chain strategy (Base/Arbitrum) - Ethereum L1 deprioritized
6. Alert latency tightened from 5 minutes to 30 seconds
7. LLM budget increased from $50-200 to $300-500/month
8. Secrets management (Vault/Doppler) required for all API keys
9. Wallet architecture (Safe multi-sig) for on-chain operations
10. Twitter/X API replaced with DEX Screener, Farcaster, on-chain volume
11. Regulatory compliance milestones added (MiCA, legal review)
12. Honeypot detection delegated to third-party APIs (GoPlus, HoneyPot.is)

---

## 9. Approval & Sign-Off

### Document Review

| Stakeholder | Role | Signature | Date |
|-------------|------|-----------|------|
| [Your Name] | Project Owner | _____________ | ______ |
| [Future CTO] | Technical Lead | _____________ | ______ |
| [Future PM] | Product Manager | _____________ | ______ |

### Next Steps
1. **Review & Feedback:** Stakeholder review (target: 1 week)
2. **BRD Approval:** Sign-off from project owner (target: 2 weeks)
3. **FRD Development:** Begin Functional Requirements Document (immediate)
4. **Technical Design:** Begin Application Design Document (parallel)

---

**END OF BUSINESS REQUIREMENTS DOCUMENT**