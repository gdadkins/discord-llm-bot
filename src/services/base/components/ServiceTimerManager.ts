
import { logger } from '../../../utils/logger';

/**
 * Timer management interface
 */
export interface ManagedTimer {
    id: string;
    type: 'interval' | 'timeout';
    timer: NodeJS.Timeout;
    callback: () => void;
    intervalMs?: number;
    delayMs?: number;
    createdAt: number;
    lastExecuted?: number;
    errorCount: number;
    // Timer coalescing properties
    originalInterval?: number;
    coalescedInterval?: number;
    coalescingGroup?: string;
}

/**
 * Timer coalescing group for efficient timer management
 */
interface TimerCoalescingGroup {
    interval: number;
    timer: NodeJS.Timeout;
    callbacks: Map<string, () => void>;
    lastExecuted: number;
}

/**
 * Manages timers for a service including coalescing and cleanup
 */
export class ServiceTimerManager {
    private readonly timers = new Map<string, ManagedTimer>();
    private readonly coalescingGroups = new Map<number, TimerCoalescingGroup>();
    private timerIdCounter = 0;
    private readonly serviceName: string;

    private readonly COALESCING_INTERVAL = 10000; // 10 seconds
    private readonly MIN_COALESCING_INTERVAL = 5000; // Don't coalesce timers under 5s

    constructor(serviceName: string) {
        this.serviceName = serviceName;
    }

    /**
     * Generates unique timer ID with service prefix
     */
    private generateTimerId(name: string): string {
        const sanitizedName = name.replace(/[^a-zA-Z0-9-_]/g, '_');
        const safeServiceName = this.serviceName.replace(/[^a-zA-Z0-9-_]/g, '_');
        return `${safeServiceName}_${sanitizedName}_${++this.timerIdCounter}_${Date.now()}`;
    }

    /**
     * Wraps timer callback with error handling and metrics tracking
     */
    private wrapTimerCallback(timerId: string, originalCallback: () => void): () => void {
        return () => {
            const managedTimer = this.timers.get(timerId);
            if (!managedTimer) {
                logger.warn(`Timer callback executed for unknown timer: ${timerId}`, {
                    service: this.serviceName,
                    timerId
                });
                return;
            }

            try {
                managedTimer.lastExecuted = Date.now();
                originalCallback();
            } catch (error) {
                managedTimer.errorCount++;
                logger.error(`Timer callback error: ${timerId}`, {
                    service: this.serviceName,
                    timerId,
                    errorCount: managedTimer.errorCount,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    stack: error instanceof Error ? error.stack : undefined
                });
            } finally {
                // If this is a timeout, remove it since it won't run again
                if (managedTimer.type === 'timeout') {
                    this.timers.delete(timerId);
                }
            }
        };
    }

    /**
     * Creates a managed interval timer with optional coalescing
     */
    public createInterval(name: string, callback: () => void, interval: number, options?: { coalesce?: boolean }): string {
        // Check if we should coalesce this timer
        const shouldCoalesce = options?.coalesce !== false &&
            interval >= this.MIN_COALESCING_INTERVAL;

        if (shouldCoalesce) {
            return this.createCoalescedInterval(name, callback, interval);
        }

        // Create regular timer
        const timerId = this.generateTimerId(name);
        const wrappedCallback = this.wrapTimerCallback(timerId, callback);

        try {
            const timer = setInterval(wrappedCallback, interval);

            const managedTimer: ManagedTimer = {
                id: timerId,
                type: 'interval',
                timer,
                callback,
                intervalMs: interval,
                createdAt: Date.now(),
                errorCount: 0
            };

            this.timers.set(timerId, managedTimer);

            logger.debug(`Created interval timer: ${timerId} (${name}) - ${interval}ms`, {
                service: this.serviceName,
                timerId,
                name,
                interval
            });

            return timerId;
        } catch (error) {
            logger.error(`Failed to create interval timer: ${timerId} (${name})`, {
                service: this.serviceName,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error(`Failed to create interval timer '${name}': ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Creates a managed timeout timer
     */
    public createTimeout(name: string, callback: () => void, delay: number): string {
        const timerId = this.generateTimerId(name);
        const wrappedCallback = this.wrapTimerCallback(timerId, callback);

        try {
            const timer = setTimeout(wrappedCallback, delay);

            const managedTimer: ManagedTimer = {
                id: timerId,
                type: 'timeout',
                timer,
                callback,
                delayMs: delay,
                createdAt: Date.now(),
                errorCount: 0
            };

            this.timers.set(timerId, managedTimer);

            logger.debug(`Created timeout timer: ${timerId} (${name}) - ${delay}ms`, {
                service: this.serviceName,
                timerId,
                name,
                delay
            });

            return timerId;
        } catch (error) {
            logger.error(`Failed to create timeout timer: ${timerId} (${name})`, {
                service: this.serviceName,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error(`Failed to create timeout timer '${name}': ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Clears a specific managed timer
     */
    public clearTimer(timerId: string): boolean {
        const managedTimer = this.timers.get(timerId);
        if (!managedTimer) {
            logger.debug(`Timer not found for clearing: ${timerId}`, {
                service: this.serviceName,
                timerId
            });
            return false;
        }

        try {
            // Handle coalesced timers
            if (managedTimer.coalescedInterval) {
                const group = this.coalescingGroups.get(managedTimer.coalescedInterval);
                if (group) {
                    group.callbacks.delete(timerId);

                    // If this was the last callback in the group, clear the group timer
                    if (group.callbacks.size === 0) {
                        clearInterval(group.timer);
                        this.coalescingGroups.delete(managedTimer.coalescedInterval);

                        logger.info(`Removed empty coalescing group: ${managedTimer.coalescedInterval}ms`, {
                            service: this.serviceName
                        });
                    }
                }
            } else {
                // Regular timer
                if (managedTimer.type === 'interval') {
                    clearInterval(managedTimer.timer);
                } else {
                    clearTimeout(managedTimer.timer);
                }
            }

            this.timers.delete(timerId);

            logger.debug(`Cleared timer: ${timerId}`, {
                service: this.serviceName,
                timerId,
                type: managedTimer.type,
                wasCoalesced: !!managedTimer.coalescedInterval
            });

            return true;
        } catch (error) {
            logger.error(`Error clearing timer: ${timerId}`, {
                service: this.serviceName,
                timerId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return false;
        }
    }

    /**
     * Clears all managed timers
     */
    public clearAllTimers(): void {
        if (this.timers.size === 0 && this.coalescingGroups.size === 0) {
            return;
        }

        const timerIds = Array.from(this.timers.keys());
        let clearedCount = 0;
        let errorCount = 0;

        for (const timerId of timerIds) {
            try {
                if (this.clearTimer(timerId)) {
                    clearedCount++;
                }
            } catch (error) {
                errorCount++;
                logger.error(`Error clearing timer during shutdown: ${timerId}`, {
                    service: this.serviceName,
                    timerId,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        // Clear any remaining coalescing groups
        for (const [interval, group] of this.coalescingGroups) {
            try {
                clearInterval(group.timer);
                this.coalescingGroups.delete(interval);
            } catch (error) {
                errorCount++;
                logger.error(`Error clearing coalescing group: ${interval}ms`, {
                    service: this.serviceName,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        logger.info(`Timer cleanup completed`, {
            service: this.serviceName,
            clearedCount,
            errorCount,
            totalTimers: timerIds.length,
            coalescingGroupsCleared: this.coalescingGroups.size
        });
    }

    /**
     * Checks if a timer exists and is active
     */
    public hasTimer(timerId: string): boolean {
        return this.timers.has(timerId);
    }

    /**
     * Gets the count of active timers
     */
    public getTimerCount(): number {
        return this.timers.size;
    }

    /**
     * Gets information about a specific timer
     */
    public getTimerInfo(timerId: string): Omit<ManagedTimer, 'timer' | 'callback'> | undefined {
        const managedTimer = this.timers.get(timerId);
        if (!managedTimer) {
            return undefined;
        }

        return {
            id: managedTimer.id,
            type: managedTimer.type,
            intervalMs: managedTimer.intervalMs,
            delayMs: managedTimer.delayMs,
            createdAt: managedTimer.createdAt,
            lastExecuted: managedTimer.lastExecuted,
            errorCount: managedTimer.errorCount
        };
    }

    /**
     * Creates a coalesced interval timer that runs with other timers in the same time window
     */
    private createCoalescedInterval(name: string, callback: () => void, requestedInterval: number): string {
        // Round up to nearest coalescing interval
        const coalescedInterval = Math.ceil(requestedInterval / this.COALESCING_INTERVAL) * this.COALESCING_INTERVAL;

        const timerId = this.generateTimerId(name);
        const wrappedCallback = this.wrapTimerCallback(timerId, callback);

        // Get or create coalescing group
        let group = this.coalescingGroups.get(coalescedInterval);
        if (!group) {
            // Create new coalescing group
            const groupTimer = setInterval(() => {
                this.executeCoalescedCallbacks(coalescedInterval);
            }, coalescedInterval);

            group = {
                interval: coalescedInterval,
                timer: groupTimer,
                callbacks: new Map(),
                lastExecuted: Date.now()
            };

            this.coalescingGroups.set(coalescedInterval, group);

            logger.info(`Created timer coalescing group for ${coalescedInterval}ms interval`, {
                service: this.serviceName,
                coalescedInterval,
                originalInterval: requestedInterval
            });
        }

        // Add callback to group
        group.callbacks.set(timerId, wrappedCallback);

        // Create managed timer entry (without actual timer)
        const managedTimer: ManagedTimer = {
            id: timerId,
            type: 'interval',
            timer: group.timer, // Reference to group timer
            callback,
            intervalMs: requestedInterval,
            originalInterval: requestedInterval,
            coalescedInterval,
            coalescingGroup: `${coalescedInterval}ms`,
            createdAt: Date.now(),
            errorCount: 0
        };

        this.timers.set(timerId, managedTimer);

        logger.debug(`Created coalesced interval timer: ${timerId} (${name})`, {
            service: this.serviceName,
            timerId,
            name,
            requestedInterval,
            coalescedInterval,
            groupSize: group.callbacks.size
        });

        return timerId;
    }

    /**
     * Execute all callbacks in a coalescing group
     */
    private executeCoalescedCallbacks(interval: number): void {
        const group = this.coalescingGroups.get(interval);
        if (!group) return;

        const startTime = Date.now();
        group.lastExecuted = startTime;

        let executedCount = 0;
        let errorCount = 0;

        // Execute all callbacks in the group
        for (const [timerId, callback] of group.callbacks) {
            try {
                callback();
                executedCount++;
            } catch (error) {
                errorCount++;
                logger.error(`Error in coalesced timer callback: ${timerId}`, {
                    service: this.serviceName,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        const executionTime = Date.now() - startTime;

        if (executionTime > interval * 0.1) { // Warn if execution takes more than 10% of interval
            logger.warn(`Coalesced timer group execution took ${executionTime}ms`, {
                service: this.serviceName,
                interval,
                callbackCount: group.callbacks.size,
                executedCount,
                errorCount
            });
        }
    }

    /**
     * Generates timer metrics for health status
     */
    public getMetrics(): Record<string, unknown> | undefined {
        if (this.timers.size === 0) {
            return undefined;
        }

        const now = Date.now();
        const timerStats = {
            count: this.timers.size,
            byType: { interval: 0, timeout: 0 },
            totalErrors: 0,
            oldestTimer: now,
            newestTimer: 0,
            timersWithErrors: 0,
            coalescedTimers: 0,
            coalescingGroups: this.coalescingGroups.size,
            totalCallbacksInGroups: 0
        };

        for (const timer of this.timers.values()) {
            timerStats.byType[timer.type]++;
            timerStats.totalErrors += timer.errorCount;

            if (timer.errorCount > 0) {
                timerStats.timersWithErrors++;
            }

            if (timer.coalescedInterval) {
                timerStats.coalescedTimers++;
            }

            if (timer.createdAt < timerStats.oldestTimer) {
                timerStats.oldestTimer = timer.createdAt;
            }

            if (timer.createdAt > timerStats.newestTimer) {
                timerStats.newestTimer = timer.createdAt;
            }
        }

        // Count total callbacks in coalescing groups
        for (const group of this.coalescingGroups.values()) {
            timerStats.totalCallbacksInGroups += group.callbacks.size;
        }

        // Calculate timer efficiency
        const timerEfficiency = timerStats.count > 0 ?
            ((timerStats.coalescedTimers / timerStats.count) * 100).toFixed(1) : '0';

        return {
            ...timerStats,
            oldestTimerAgeMs: now - timerStats.oldestTimer,
            newestTimerAgeMs: now - timerStats.newestTimer,
            timerEfficiency: `${timerEfficiency}%`,
            overheadReduction: timerStats.coalescedTimers > 0 ?
                `${((1 - (this.coalescingGroups.size / timerStats.count)) * 100).toFixed(1)}%` : '0%'
        };
    }
}
