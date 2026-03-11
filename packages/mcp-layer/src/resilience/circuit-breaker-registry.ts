/**
 * MCP-04: Per-server circuit breaker registry
 * @task MCP-04
 *
 * Maintains isolated circuit breaker instances keyed by serverId,
 * so failures in one MCP server don't affect others.
 */

import { CircuitBreaker } from './circuit-breaker.js';
import type { CircuitBreakerConfig } from './circuit-breaker.js';

export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly config: Partial<CircuitBreakerConfig>;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = config ?? {};
  }

  /** get or create a breaker for the given server */
  getBreaker(serverId: string): CircuitBreaker {
    let breaker = this.breakers.get(serverId);
    if (!breaker) {
      breaker = new CircuitBreaker(this.config);
      this.breakers.set(serverId, breaker);
    }
    return breaker;
  }

  /** reset all breakers (useful for testing) */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /** number of tracked servers */
  get size(): number {
    return this.breakers.size;
  }
}
