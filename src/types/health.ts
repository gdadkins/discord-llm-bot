/**
 * Type definitions for health check system
 */

export interface HealthCheckResult {
  checkName: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  duration?: number;
  details?: Record<string, unknown>;
}