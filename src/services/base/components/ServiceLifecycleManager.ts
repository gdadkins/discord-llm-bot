
import { logger } from '../../../utils/logger';
import { enrichError, SystemError } from '../../../utils/ErrorHandlingUtils';

/**
 * Service lifecycle states
 */
export enum ServiceState {
    CREATED = 'created',
    INITIALIZING = 'initializing',
    READY = 'ready',
    SHUTTING_DOWN = 'shutting_down',
    SHUTDOWN = 'shutdown',
    FAILED = 'failed'
}

/**
 * Service lifecycle events
 */
export interface ServiceLifecycleEvents {
    'state-changed': (oldState: ServiceState, newState: ServiceState) => void;
    'initialization-started': () => void;
    'initialization-completed': (duration: number) => void;
    'initialization-failed': (error: Error) => void;
    'shutdown-started': () => void;
    'shutdown-completed': (duration: number) => void;
    'shutdown-failed': (error: Error) => void;
    'resource-registered': (type: string, id: string) => void;
    'resource-cleanup-failed': (type: string, id: string, error: Error) => void;
}

/**
 * Manages the lifecycle state and events for a service
 */
export class ServiceLifecycleManager {
    private serviceState: ServiceState = ServiceState.CREATED;
    private initPromise?: Promise<void>;
    private shutdownPromise?: Promise<void>;
    private readonly ongoingOperations = new Set<Promise<any>>();
    private acceptingWork = true;
    private isInitialized = false;
    private isShuttingDown = false;

    // Timing tracking
    private initStartTime?: number;
    private shutdownStartTime?: number;

    private readonly lifecycleEvents: ServiceLifecycleEvents = {
        'state-changed': () => { },
        'initialization-started': () => { },
        'initialization-completed': () => { },
        'initialization-failed': () => { },
        'shutdown-started': () => { },
        'shutdown-completed': () => { },
        'shutdown-failed': () => { },
        'resource-registered': () => { },
        'resource-cleanup-failed': () => { }
    };

    constructor(private readonly serviceName: string) { }

    public get state(): ServiceState {
        return this.serviceState;
    }

    public get initialized(): boolean {
        return this.isInitialized;
    }

    public get shuttingDown(): boolean {
        return this.isShuttingDown;
    }

    public get accepting(): boolean {
        return this.acceptingWork;
    }

    public get ongoingOpsCount(): number {
        return this.ongoingOperations.size;
    }

    /**
     * Set service state and emit events
     */
    public setState(newState: ServiceState): void {
        const oldState = this.serviceState;
        this.serviceState = newState;

        if (newState === ServiceState.READY) {
            this.isInitialized = true;
        }

        if (newState === ServiceState.SHUTTING_DOWN) {
            this.isShuttingDown = true;
        }

        if (newState === ServiceState.SHUTDOWN || newState === ServiceState.FAILED) {
            this.isInitialized = false;
            this.isShuttingDown = false;
        }

        if (oldState !== newState) {
            logger.debug('Service state changed', {
                service: this.serviceName,
                from: oldState,
                to: newState
            });

            this.emit('state-changed', oldState, newState);
        }
    }

    /**
     * Event emitter for lifecycle events
     */
    public emit<K extends keyof ServiceLifecycleEvents>(
        event: K,
        ...args: Parameters<ServiceLifecycleEvents[K]>
    ): void {
        try {
            const handler = this.lifecycleEvents[event];
            if (handler) {
                (handler as Function)(...args);
            }
        } catch (error) {
            logger.error(`Error in lifecycle event handler: ${event}`, {
                service: this.serviceName,
                error
            });
        }
    }

    /**
     * Register lifecycle event handler
     */
    public on<K extends keyof ServiceLifecycleEvents>(
        event: K,
        handler: ServiceLifecycleEvents[K]
    ): void {
        this.lifecycleEvents[event] = handler;
    }

    public async handleInitialization(initFn: () => Promise<void>): Promise<void> {
        if (this.serviceState !== ServiceState.CREATED) {
            if (this.serviceState === ServiceState.READY) {
                logger.warn(`${this.serviceName} is already initialized`);
                return;
            }

            if (this.serviceState === ServiceState.INITIALIZING) {
                return this.initPromise;
            }

            throw new SystemError(
                `Cannot initialize service in state ${this.serviceState}`,
                'INVALID_STATE',
                { service: this.serviceName, currentState: this.serviceState }
            );
        }

        this.setState(ServiceState.INITIALIZING);
        this.initStartTime = Date.now();
        this.emit('initialization-started');

        try {
            logger.info(`Initializing ${this.serviceName}...`);

            this.initPromise = initFn();
            await this.initPromise;

            this.setState(ServiceState.READY);

            const duration = Date.now() - this.initStartTime!;
            logger.info(`${this.serviceName} initialized successfully`, { duration });
            this.emit('initialization-completed', duration);

        } catch (error) {
            this.setState(ServiceState.FAILED);

            const enrichedError = enrichError(error as Error, {
                service: this.serviceName,
                phase: 'initialization',
                duration: this.initStartTime ? Date.now() - this.initStartTime : 0
            });

            logger.error(`Failed to initialize ${this.serviceName}`, enrichedError);
            this.emit('initialization-failed', enrichedError);

            throw enrichedError;
        }
    }

    public async handleShutdown(shutdownFn: () => Promise<void>): Promise<void> {
        if (this.serviceState === ServiceState.SHUTDOWN) {
            return this.shutdownPromise!;
        }

        if (this.serviceState === ServiceState.SHUTTING_DOWN) {
            return this.shutdownPromise!;
        }

        if (this.serviceState !== ServiceState.READY && this.serviceState !== ServiceState.FAILED) {
            logger.warn(`Shutting down service in unexpected state: ${this.serviceState}`, {
                service: this.serviceName,
                currentState: this.serviceState
            });
        }

        this.setState(ServiceState.SHUTTING_DOWN);
        this.shutdownStartTime = Date.now();
        this.emit('shutdown-started');

        this.shutdownPromise = (async () => {
            // Execute shutdown logic
            await shutdownFn();
        })();

        try {
            await this.shutdownPromise;
            this.setState(ServiceState.SHUTDOWN);

            const duration = Date.now() - this.shutdownStartTime!;
            logger.info(`${this.serviceName} shutdown complete`, { duration });
            this.emit('shutdown-completed', duration);

        } catch (error) {
            const enrichedError = enrichError(error as Error, {
                service: this.serviceName,
                phase: 'shutdown',
                duration: this.shutdownStartTime ? Date.now() - this.shutdownStartTime : 0
            });

            logger.error(`Error during ${this.serviceName} shutdown`, enrichedError);
            this.emit('shutdown-failed', enrichedError);

            throw enrichedError;
        }
    }

    public stopAcceptingWork(): void {
        this.acceptingWork = false;
    }

    public isAcceptingWork(): boolean {
        return this.acceptingWork && this.serviceState === ServiceState.READY;
    }

    /**
     * Register an ongoing operation
     */
    public registerOperation<T>(operation: Promise<T>): Promise<T> {
        if (!this.isAcceptingWork()) {
            throw new SystemError(
                'Service is not accepting new operations',
                'SERVICE_NOT_ACCEPTING_WORK',
                { service: this.serviceName, state: this.serviceState }
            );
        }

        this.ongoingOperations.add(operation);

        // Auto-remove when completed
        operation.finally(() => {
            this.ongoingOperations.delete(operation);
        });

        return operation;
    }

    public async waitForOngoingOperations(): Promise<void> {
        if (this.ongoingOperations.size === 0) {
            return;
        }

        logger.info(`Waiting for ${this.ongoingOperations.size} ongoing operations to complete`, {
            service: this.serviceName
        });

        try {
            await Promise.allSettled(Array.from(this.ongoingOperations));
        } catch (error) {
            logger.warn('Some ongoing operations failed during shutdown', {
                service: this.serviceName,
                error
            });
        }

        this.ongoingOperations.clear();
    }

    public getTimingMetrics(): Record<string, unknown> {
        const now = Date.now();
        const metrics: Record<string, unknown> = {
            uptime: this.initStartTime ? now - this.initStartTime : 0
        };

        if (this.initStartTime) {
            metrics.initDuration = this.serviceState === ServiceState.READY
                ? (this.shutdownStartTime || now) - this.initStartTime
                : now - this.initStartTime;
        }

        if (this.shutdownStartTime) {
            metrics.shutdownDuration = now - this.shutdownStartTime;
        }
        return metrics;
    }

    public emergencyCleanup(): void {
        this.ongoingOperations.clear();
    }

    public getLifecycleStatus(): {
        state: ServiceState;
        acceptingWork: boolean;
        ongoingOperations: number;
        uptime: number;
        initDuration?: number;
        shutdownDuration?: number;
    } {
        const now = Date.now();
        const uptime = this.initStartTime ? now - this.initStartTime : 0;

        return {
            state: this.serviceState,
            acceptingWork: this.acceptingWork,
            ongoingOperations: this.ongoingOperations.size,
            uptime,
            initDuration: this.initStartTime ?
                (this.serviceState === ServiceState.READY
                    ? (this.shutdownStartTime || now) - this.initStartTime
                    : now - this.initStartTime)
                : undefined,
            shutdownDuration: this.shutdownStartTime ? now - this.shutdownStartTime : undefined
        };
    }
}
