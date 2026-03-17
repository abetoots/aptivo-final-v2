/**
 * OBS-05: Anomaly detection barrel export
 */

export {
  createAnomalyDetector,
  DEFAULT_ANOMALY_CONFIG,
} from './anomaly-detector.js';

export type {
  AccessPattern,
  BaselineStats,
  AnomalyResult,
  AnomalyDetectorConfig,
  AnomalyError,
  AnomalyDetectorDeps,
} from './anomaly-detector.js';
