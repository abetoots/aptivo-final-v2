---
id: BRD-CRYPTO-DOMAIN
title: Crypto Trading Domain - Business Requirements Addendum
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-02-02'
parent: platform-core-brd.md
---

# Crypto Trading Domain - Business Requirements Addendum

**Version**: 1.0.0
**Date**: February 2, 2026
**Status**: Draft
**Parent Document**: `platform-core-brd.md`

---

## Document Purpose

This addendum defines **crypto trading-specific** business requirements that extend the Aptivo Platform Core. It does NOT redefine shared infrastructure (workflow engine, HITL, audit, etc.) - those are inherited from the parent document.

**What this document covers**:
- Trading-specific business objectives
- Crypto domain data requirements
- Trading workflow definitions
- Financial compliance requirements
- Risk management rules

**What this document does NOT cover** (see Platform Core BRD):
- Workflow engine architecture
- HITL approval mechanism
- LLM gateway
- Notification system
- Identity/authentication
- Audit logging infrastructure

---

## 1. Domain Overview

### 1.1 Purpose

A semi-autonomous, LLM-agnostic AI agent ecosystem designed to transform crypto trading through systematic information edge and disciplined execution.

### 1.2 Target Users

| User | Role | Primary Needs |
|------|------|---------------|
| Lead Trader (Owner) | Primary trader, system operator | ROI, time savings, risk control |
| Future Team Members | Additional traders (2-5 scale) | Clear onboarding, collaborative tools |

### 1.3 Business Value

- Reduce trader time commitment from 40+ hours/week to 10-20 hours/week
- Provide institutional-grade information intelligence
- Maintain human oversight for regulatory compliance
- Enable systematic, risk-managed trading approach

> **Disclaimer**: This system provides decision support tools. Actual trading returns depend on market conditions, user decisions, and factors outside system control. No specific returns are guaranteed or promised.

---

## 2. Domain-Specific Objectives

### 2.1 Trading Objectives

#### BO-CRYPTO-001: Enable Systematic Trading Discipline
**Target**: System enforces risk management rules and provides decision support
**Success Metrics** (System Performance, not capital returns):
- Win rate tracking: System accurately logs all trades
- Risk:Reward enforcement: System blocks trades violating 1:2 minimum R:R
- Expectancy calculation: System provides real-time expectancy metrics
- Drawdown monitoring: System alerts when drawdown exceeds thresholds

#### BO-CRYPTO-002: Reduce Time Commitment
**Target**: 50-75% reduction in active trading time
**Success Metrics**:
- Manual baseline: 40+ hours/week
- Target: 10-20 hours/week with AI augmentation
- Agent-driven research: 80% automated

#### BO-CRYPTO-003: Zero Security Incidents
**Target**: Zero losses from preventable security incidents
**Success Metrics**:
- Zero phishing/scam losses
- Zero honeypot contract interactions
- 100% smart contract verification before execution

### 2.2 Platform Integration Points

| Platform Core Component | Crypto Domain Usage |
|------------------------|---------------------|
| Workflow Engine | Trade signal → Security → HITL → Execution workflows |
| HITL Gateway | Trade approval with reasoning, expiration, multi-channel |
| MCP Integration | Exchange APIs, blockchain explorers, market data |
| LLM Gateway | Sentiment analysis, narrative extraction |
| Notification Bus | Trade alerts via Telegram (urgent), email (digest) |
| Audit Service | Trade logs, HITL decisions, regulatory compliance |
| Identity Service | Trader accounts, future team member access |

---

## 3. Domain Data Requirements

### 3.1 Data Entities (Conceptual)

> **Note**: This section describes *what data must be stored* at the business level. Actual database schemas (tables, columns, types, indexes) are defined in the FRD/TSD. Domain data is isolated from other domains.

#### Core Business Entities

| Entity | Business Purpose |
|--------|------------------|
| Tracked Wallets | Monitor whale/smart money addresses across chains |
| Wallet Transactions | Historical record of monitored wallet activity |
| Market Narratives | Emerging themes detected from social/on-chain data |
| Security Assessments | Risk evaluations of tokens before trading |
| Trade Signals | System-generated trading opportunities |
| Trade Records | Executed positions with entry/exit and outcomes |
| Portfolio State | Current holdings and positions |

### 3.2 Data Retention

| Data Type | Retention | Rationale |
|-----------|-----------|-----------|
| Trades | 7 years | Tax compliance |
| Trade signals | 7 years | Audit trail |
| Transactions | Indefinite | Pattern analysis |
| Security scans | 1 year | Historical reference |
| Narratives | 1 year | Trend analysis |

---

## 4. Trading Workflows (Business Process Overview)

> **Scope Note**: This section describes business processes and outcomes at a high level. Detailed workflow specifications (state machines, transitions, acceptance criteria) are defined in the FRD.

### 4.1 Smart Money Tracking

**Business Outcome**: Detect and alert on significant whale wallet activity to inform trading decisions.

**Process Summary**:
- Monitor configured whale wallets across blockchains
- Analyze transactions for significance
- Generate alerts with AI-powered reasoning
- Track patterns for historical analysis

**Platform Components Used**: Workflow Engine, MCP Integration, LLM Gateway, Notification Bus, Audit Service

### 4.2 Narrative Scouting

**Business Outcome**: Identify emerging market narratives before mainstream awareness.

**Process Summary**:
- Scan social/on-chain data sources periodically
- Cluster and score narratives by strength
- Map narratives to relevant tokens
- Surface top narratives on dashboard

### 4.3 Security Detection

**Business Outcome**: Prevent interaction with malicious tokens/contracts.

**Process Summary**:
- Analyze contracts before any trade proceeds
- Verify liquidity and team credentials
- Calculate risk score
- Auto-block high-risk tokens

### 4.4 Systematic Trading

**Business Outcome**: Execute disciplined, rule-based trades with human oversight.

**Process Summary**:
- Detect trading opportunities via defined criteria
- Run security validation
- Present to human for HITL approval
- Execute approved trades with automated risk management

---

## 5. Risk Management Rules

### 5.1 Position Limits

| Rule | Value | Enforcement |
|------|-------|-------------|
| Max position size | 2-3% of portfolio | Hard-coded limit |
| Max concurrent positions | 5 | System enforced |
| Max exposure per token | 10% | System enforced |
| Daily trade limit | 2 trades | Cooldown enforced |

### 5.2 Automated Safeguards

- **Stop Loss**: Mandatory on all positions
- **Take Profit**: Minimum 1:2 R:R ratio
- **Overtrading Prevention**: Session limits
- **Security Gate**: All trades pass security check

---

## 6. Financial Compliance

### 6.1 Regulatory Requirements

- **Semi-Autonomous Only**: Human approval required for all trades
- **Tax Compliance**: 7-year trade history retention
- **KYC/AML**: Handled by exchange integrations
- **Audit Trail**: Full HITL decision logging (via Platform Core)

### 6.2 Compliance Milestones

- [ ] Legal review before Phase 3 deployment
- [ ] Exchange API terms compliance verification
- [ ] Kill switch implementation
- [ ] Audit trail format validation

---

## 7. MCP Tool Requirements

### 7.1 Required MCP Integrations

| Category | Tools | Priority |
|----------|-------|----------|
| Blockchain Data | Etherscan, Basescan, Arbiscan | A+ |
| Market Data | CoinGecko, DEX Screener | A+ |
| Exchange | Binance, Coinbase | A |
| Security | GoPlus, Honeypot.is | A |
| Social | Farcaster, on-chain volume | B |

### 7.2 Data Source Strategy

- **L2-First**: Prioritize Base, Arbitrum, Optimism (low gas)
- **Twitter/X Replacement**: Use DEX volume velocity, on-chain flows (API cost prohibitive)

---

## 8. Non-Functional Requirements (Business Constraints)

> **Scope Note**: Detailed NFR targets and acceptance criteria are defined in the FRD. This section captures business-critical constraints only.

### 8.1 Critical Business Constraints

| Constraint | Rationale |
|------------|-----------|
| Real-time alerting | Information edge requires timely notification |
| Security-first | Capital preservation is non-negotiable |
| Cost-conscious | Self-funded project with budget limits |

### 8.2 Budget Constraints

| Category | Monthly Limit |
|----------|---------------|
| LLM API | $300-500 |
| Infrastructure | $100-200 |
| Data providers | $50-100 |

---

## 9. Success Metrics (Domain-Specific)

### 9.1 System Performance KPIs

> **Note**: These metrics measure system behavior and rule enforcement, not capital returns. Actual trading outcomes depend on market conditions and user decisions.

| KPI | Month 4 | Month 8 | Month 12 |
|-----|---------|---------|----------|
| Trade Logging Accuracy | 100% | 100% | 100% |
| Risk Rule Enforcement | N/A | 100% compliance | 100% compliance |
| Signal Generation Uptime | 95% | 99% | 99.5% |
| HITL Response Rate | N/A | >90% within 15min | >95% within 15min |

### 9.2 Operational KPIs

| KPI | Target |
|-----|--------|
| Smart Money Alerts | 10+/month actionable |
| Narratives Identified | 2-3 before mainstream |
| Security Incidents | Zero |

---

## 10. Phase Alignment

### Phase 2A: Crypto Stress Test (Months 3-5)

**Purpose**: Validate platform core under high-pressure conditions WITHOUT real money.

**Deliverables**:
1. Trading workflow requirements documented at business level
2. Exchange MCP tool integrations
3. Smart Money Tracking workflow
4. Paper trading simulation
5. Basic trading dashboard

**Validation Gate**: Paper trading meets business-level validation criteria (defined in FRD)

### Phase 3: Live Trading (Month 6+)

**Gated by**:
- [ ] Paper trading meets system KPIs (logging accuracy, rule enforcement, uptime)
- [ ] Platform core stable (HR domain also working)
- [ ] Legal review complete
- [ ] Phased capital deployment plan

---

## 11. References

| Document | Purpose |
|----------|---------|
| Platform Core BRD | Shared infrastructure requirements |
| Crypto Domain FRD | Functional requirements (detailed) |
| Original Crypto BRD v2.3 | Historical reference (`docs/temp/`) |

---

## 12. Re-validation 2026-05

**Verdict (May 2026)**: **NEEDS PIVOT** (not sunset) — confidence HIGH. The information-edge moat thesis (smart-money tracking + narrative scouting + L2-First + on-chain replacement of social) is materially obsolete by Q2 2026; the platform-engineering investment is intact, but the trading-edge framing must reposition. The crypto landscape has bifurcated into a clarified, institutional-friendly base layer (MiCA hard cutoff 2026-07-01; SEC interpretive release 2026-03-17 with 5-category taxonomy) plus a ferociously efficient retail-speculation layer (Solana 30.6% Q1 2026 DEX spot share; Hyperliquid ~70% on-chain perp share by April 2026 ≈ $2T annualized). The data-cost moat that justified the original information-edge thesis has narrowed in the wrong direction — Arkham free entity labels, Nansen $99/mo, Dune $75/mo make retail tooling parity higher than ever.

**Operator decision 2026-05-07**: all corrections below are APPROVED for implementation, alongside extending this domain into Stablecoin/PPSI compliance under the GENIUS Act NPRM as the "Crypto v2" personal track (see `market-revalidation-2026-05.md` §5.2 #2 and §6.5). The Feb-2026 baseline is preserved as historical record.

**Specific corrections approved** (doc-level + small MCP-tool extension):
- §1.3 / §2.1 BO-CRYPTO-001 — qualify the "40h → 10–20h via AI" claim as conditional on HITL-gated execution + venue automation, not raw screen-time substitution. AI-agent saturation has pushed arbitrage decay into seconds-not-minutes.
- §6 / §6.1 — add explicit MiCA + US-SEC + (if applicable) GENIUS Act NPRM compliance posture; do not rely solely on exchange KYC/AML. Verify USDT MiCA status before any EU-routed-pair work (one search snippet contradicted primary sources; treat as unverified).
- §7.1 — extend MCP venue coverage from `Etherscan/Basescan/Arbiscan + CoinGecko + Binance/Coinbase` to include Solana RPC + Helius (or equivalent) + Hyperliquid API + Jupiter/Raydium DEX data. Estimated ~5 SP for connector-only.
- §7.2 — replace "L2-First" thesis: Base/Arbitrum/Optimism remain leaders for *institutional* TVL, but speculation-heavy retail flow has migrated to Solana (Pump.fun crossed $1B revenue Feb 2026 with 11M+ tokens) and Hyperliquid for perps.
- §7.2 — replace "Twitter/X replacement: DEX volume + on-chain flows" sole-substitute framing. X went pay-per-use 2026-02-06 with 2M post-read/mo cap; URL-post surcharge reportedly +1,900% — comprehensive X ingestion is unaffordable on the budget. **But** decentralized social did NOT step in (Farcaster <20K DAU late 2025; founders stepped back Jan 2026; Lens transitioned ownership Jan 2026). Multi-source signal model required: third-party X aggregators (snippet-priced) + Telegram/Discord scrapers + on-chain whale-confirmation, with HITL gating any social-signal-driven decision.
- §9.1 — tighten phrasing from "information edge via smart-money tracking + narrative scouting" to "smart-money convergence and exchange-inflow as context indicators" — the durable 2026 patterns (3+ historically-profitable wallets converging on same token within a week; exchange-inflow-from-known-wallets → 24–72h selling pressure), not the obsolete ones.

**Full evidence + repositioning rationale**: see `docs/01-strategy/market-revalidation-2026-05.md` §4 (Crypto Domain Verdict) and §6.2 (recommended actions). The May-2026 doc also surfaces a "Crypto v2" adjacent niche — Stablecoin / PPSI compliance under GENIUS Act NPRM (NPRM 2026-04-08, comment closes 2026-06-09) — that extends this domain rather than competes with it.

**What this section is NOT**: a rewrite of the Feb-2026 baseline. Section history is preserved deliberately so the diff between Feb and May 2026 views remains readable.

---

**END OF CRYPTO DOMAIN ADDENDUM**
