---
id: TSD-CRYPTO-INDEX
title: Crypto Domain Technical Specifications
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-02-02'
parent: ../../03-architecture/platform-core-add.md
domain: crypto
---

# Crypto Domain Technical Specifications

**Aptivo Agentic Platform – Crypto Trading Domain**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1.0.0 | 2026-02-02 | Document Review | Initial creation from crypto temp files |

---

## 1. Overview

This document serves as the index for the Crypto Trading Domain technical specifications. These specifications extend the Platform Core with trading-specific functionality.

### 1.1 Related Documents

| Document | Description |
|----------|-------------|
| [Crypto Domain BRD](../../01-strategy/crypto-domain-addendum.md) | Business requirements |
| [Crypto Domain FRD](../../02-requirements/crypto-domain-frd.md) | Functional requirements |
| [Platform Core ADD](../../03-architecture/platform-core-add.md) | Core architecture (parent) |
| [Platform Core TSD](../index.md) | Core technical specifications |

---

## 2. Specification Documents

### 2.1 Domain-Specific Specs

| Document | Content |
|----------|---------|
| [database.md](database.md) | 8 crypto trading tables, indexes, Kysely types, DuckDB analytics |
| [api.md](api.md) | 21 REST endpoints, 5 WebSocket event types, Zod schemas |
| [mcp-servers.md](mcp-servers.md) | 13 MCP server integrations for blockchain/market data |
| [workflow-engine.md](workflow-engine.md) | 6 LangGraph.js trading workflows |

### 2.2 Inherited from Platform Core

The Crypto Domain inherits and uses these Platform Core specifications:

| Spec | Usage in Crypto Domain |
|------|------------------------|
| [../authentication.md](../authentication.md) | User authentication (WebAuthn, OAuth) |
| [../platform-core/hitl-gateway.md](../platform-core/hitl-gateway.md) | Trade signal approvals |
| [../platform-core/llm-gateway.md](../platform-core/llm-gateway.md) | AI reasoning generation |
| [../notification-bus.md](../notification-bus.md) | Trade alerts, signal notifications |
| [../common-patterns.md](../common-patterns.md) | Result types, error handling |
| [../observability.md](../observability.md) | Logging, metrics, tracing |

---

## 3. Technology Stack Extensions

### 3.1 Crypto-Specific Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@langchain/langgraph` | ^0.2.x | Workflow state machines |
| `@modelcontextprotocol/sdk` | ^1.0.x | MCP client connections |
| `duckdb-async` | ^1.0.x | Analytics storage (backtesting) |

### 3.2 MCP Server Packages

| Server | Package |
|--------|---------|
| The Graph | `@kukapay/thegraph-mcp` |
| CoinGecko | `coingecko-mcp` |
| GoPlus | `@anthropic/goplus-mcp` |
| DEX Screener | `dexscreener-mcp` |
| LunarCrush | `lunarcrush-mcp` |
| Tenderly | `tenderly-mcp` |
| CCXT | `ccxt-mcp` |

---

## 4. Database Schema Summary

### 4.1 Crypto Tables

| Table | Records | Purpose |
|-------|---------|---------|
| `smart_money_transactions` | Millions | Blockchain transaction tracking |
| `narratives` | Thousands | Market narrative identification |
| `social_posts` | Millions | Social media signal collection |
| `security_scans` | Thousands | Contract security analysis |
| `trade_signals` | Thousands | AI-generated trade signals |
| `trades` | Thousands | Executed trade records |
| `agent_runs` | Millions | Workflow execution audit trail |
| `wallet_watchlist` | Hundreds | User-configured wallet monitoring |

### 4.2 Analytics Tables (DuckDB)

| Table | Purpose |
|-------|---------|
| `candles` | Historical OHLCV data |
| `backtest_results` | Strategy performance metrics |
| `backtest_trades` | Simulated trade records |

---

## 5. API Endpoint Summary

### 5.1 By Category

| Category | Endpoints | Auth Required |
|----------|-----------|---------------|
| Smart Money | 3 | Yes |
| Narratives | 3 | Yes |
| Security | 3 | Yes |
| Trade Signals | 4 | Yes |
| Trades | 4 | Yes |
| Agent Runs | 2 | Yes |
| Watchlist | 3 | Yes |
| **Total** | **22** | |

### 5.2 WebSocket Events

| Event | Trigger |
|-------|---------|
| `smart_money_alert` | Significant whale transaction |
| `narrative_update` | Narrative strength change >20% |
| `trade_signal` | New signal requires approval |
| `trade_update` | Position opened/closed/stopped |
| `security_alert` | High-risk contract detected |

---

## 6. Workflow Summary

### 6.1 Trading Workflows

| Workflow | Cycle Time | Key Integration |
|----------|------------|-----------------|
| Smart Money Tracking | Continuous | The Graph, CoinGecko |
| Narrative Scouting | 15 minutes | LunarCrush, Farcaster |
| Security Detection | On-demand | GoPlus, Tenderly |
| Breakout Trading | Continuous | TradingView, CCXT |
| Backtesting | On-demand | DuckDB |
| Portfolio Management | Hourly | CoinGecko |

### 6.2 HITL Integration Points

| Workflow | HITL Trigger | Timeout |
|----------|--------------|---------|
| Smart Money | High-confidence signals only | 24 hours |
| Breakout Trading | All trade signals | 24 hours |
| Security Detection | Critical risk alerts | 1 hour |

---

## 7. Phase Implementation

### Phase 1: Core Trading (Months 1-3)
- Smart Money Tracking workflow
- Security Detection workflow
- Trade Signals + HITL approval
- Paper trading mode

### Phase 2: Advanced Features (Months 3-6)
- Narrative Scouting workflow
- Breakout Trading workflow
- Backtesting infrastructure
- Portfolio Management

### Phase 3: Production (Month 6+)
- Live trading with capital controls
- Multi-exchange support
- Advanced risk management
