# Phase 3 Roadmap — Multi-Model Review

**Date**: 2026-03-17
**Reviewers**: Claude Opus 4.6 (Lead), Codex/GPT (via Codex MCP)
**Scope**: Phase 3 roadmap creation from consolidated Phase 2 deferrals + domain FRDs
**Verdict**: 8 epics, ~127 SP, 5 sprints (Sprints 15-19)

---

## Consensus

Both models agree on:
1. Production deployment must be Sprint 15 (gates everything else)
2. ML injection classifier and streaming filter are high priority
3. Case tracking (CT-1..CT-4) is the highest-value build track
4. Buy integrations should follow interface contract validation
5. CT-5 (customer portal) and PM-3 (resource planning) are Phase 4

## Key Decision: Sprint Count

| Model | Sprints | SP/Sprint | Rationale |
|-------|---------|-----------|-----------|
| Codex | 6 | ~21 | Conservative for integration + vendor work |
| Claude | 5 | ~25 | Phase 2 velocity was 29; integration slows ~15% |

**Verdict**: 5 sprints at ~25 SP/sprint. Phase 2 proved the team can sustain 27-30 SP/sprint for pure development. Phase 3 has more vendor integration (slower) but less greenfield design (faster). 25 SP/sprint is a reasonable blend.
