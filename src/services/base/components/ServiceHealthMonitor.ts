
import { ServiceHealthStatus } from '../../interfaces';
import { ServiceLifecycleManager, ServiceState } from './ServiceLifecycleManager';
import { ServiceTimerManager } from './ServiceTimerManager';
import { ResourceManager } from '../../../utils/ResourceManager';

export class ServiceHealthMonitor {
    constructor(
        private readonly serviceName: string,
        private readonly lifecycleManager: ServiceLifecycleManager,
        private readonly timerManager: ServiceTimerManager,
        private readonly resources: ResourceManager
    ) { }

    public buildHealthStatus(
        customIsHealthy: boolean = true,
        customErrors: string[] = [],
        serviceMetrics?: Record<string, unknown>
    ): ServiceHealthStatus {
        return {
            healthy: this.isOverallHealthy() && customIsHealthy,
            name: this.serviceName,
            errors: [...this.getLifecycleErrors(), ...customErrors],
            metrics: this.getAggregatedMetrics(serviceMetrics)
        };
    }

    private isOverallHealthy(): boolean {
        // Basic check: initialized and not shutting down
        const state = this.lifecycleManager.state;
        return (state === ServiceState.READY || state === ServiceState.INITIALIZING) && !this.lifecycleManager.shuttingDown;
    }

    private getLifecycleErrors(): string[] {
        const errors: string[] = [];
        if (!this.lifecycleManager.initialized) {
            errors.push('Service not initialized');
        }
        if (this.lifecycleManager.shuttingDown) {
            errors.push('Service is shutting down');
        }
        if (this.lifecycleManager.state === ServiceState.FAILED) {
            errors.push('Service in FAILED state');
        }
        return errors;
    }

    private getAggregatedMetrics(serviceMetrics?: Record<string, unknown>): Record<string, unknown> | undefined {
        const timerMetrics = this.timerManager.getMetrics();
        const lifecycleMetrics = this.getLifecycleMetrics();
        const resourceMetrics = this.getResourceMetrics();

        if (!timerMetrics && !serviceMetrics && !lifecycleMetrics && !resourceMetrics) {
            return undefined;
        }

        return {
            ...lifecycleMetrics,
            timers: timerMetrics,
            resources: resourceMetrics,
            ...serviceMetrics
        };
    }

    private getLifecycleMetrics(): Record<string, unknown> {
        return {
            lifecycle: {
                state: this.lifecycleManager.state,
                acceptingWork: this.lifecycleManager.accepting,
                ongoingOperations: this.lifecycleManager.ongoingOpsCount,
                ...this.lifecycleManager.getTimingMetrics()
            }
        };
    }

    private getResourceMetrics(): Record<string, unknown> | undefined {
        const stats = this.resources.getResourceStats();

        if (stats.total === 0) {
            return undefined;
        }

        return {
            total: stats.total,
            byType: stats.byType,
            byPriority: stats.byPriority,
            averageAge: stats.averageAge,
            failedCleanups: stats.failedCleanups,
            leakDetected: stats.leakDetected,
            pendingCleanup: stats.pendingCleanup
        };
    }
}
