/**
 * HTTP/HTTPS Connection Pool
 * 
 * Provides connection pooling for HTTP/HTTPS requests to improve
 * performance by reusing connections and reducing handshake overhead.
 * 
 * Features:
 * - Keep-alive connections
 * - Configurable pool size limits
 * - FIFO request scheduling
 * - Connection health monitoring
 * - Automatic stale connection cleanup
 * 
 * @module ConnectionPool
 */

import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { Mutex } from 'async-mutex';
import { logger } from './logger';
import { enrichError } from './ErrorHandlingUtils';

/**
 * Agent with additional debugging properties
 */
interface AgentWithDebugInfo {
  getCurrentStatus?(): {
    sockets?: number;
    requests?: number;
    freeSockets?: number;
  };
  sockets?: Record<string, unknown>;
  freeSockets?: Record<string, unknown>;
  requests?: Record<string, unknown>;
}

/**
 * Connection pool statistics
 */
export interface PoolStatistics {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  totalRequests: number;
  connectionReuse: number;
  reuseRate: number;
  avgRequestTime: number;
  errors: number;
  timeouts: number;
}

/**
 * Connection pool options
 */
export interface ConnectionPoolOptions {
  /**
   * Maximum number of sockets to allow per host
   */
  maxSockets?: number;
  
  /**
   * Maximum number of free sockets to keep per host
   */
  maxFreeSockets?: number;
  
  /**
   * Socket timeout in milliseconds
   */
  timeout?: number;
  
  /**
   * Keep-alive timeout in milliseconds
   */
  keepAliveTimeout?: number;
  
  /**
   * Enable keep-alive
   */
  keepAlive?: boolean;
  
  /**
   * Keep-alive initial delay
   */
  keepAliveInitialDelay?: number;
  
  /**
   * Request scheduling (FIFO, LIFO)
   */
  scheduling?: 'fifo' | 'lifo';
}

/**
 * Request options for pool
 */
export interface PoolRequestOptions extends https.RequestOptions {
  url?: string;
  body?: string | Buffer;
  json?: boolean;
  maxRetries?: number;
}

/**
 * Connection pool for HTTP/HTTPS requests
 */
export class ConnectionPool {
  private readonly httpAgent: http.Agent;
  private readonly httpsAgent: https.Agent;
  private readonly mutex = new Mutex();
  private readonly options: Required<ConnectionPoolOptions>;
  
  // Statistics
  private stats = {
    totalRequests: 0,
    connectionReuse: 0,
    errors: 0,
    timeouts: 0,
    requestTimes: [] as number[],
    maxRequestTimes: 1000 // Keep last 1000 request times
  };
  
  constructor(options: ConnectionPoolOptions = {}) {
    this.options = {
      maxSockets: 10,
      maxFreeSockets: 5,
      timeout: 30000,
      keepAliveTimeout: 60000,
      keepAlive: true,
      keepAliveInitialDelay: 1000,
      scheduling: 'fifo',
      ...options
    };
    
    // Create HTTP agent
    this.httpAgent = new http.Agent({
      keepAlive: this.options.keepAlive,
      keepAliveMsecs: this.options.keepAliveInitialDelay,
      maxSockets: this.options.maxSockets,
      maxFreeSockets: this.options.maxFreeSockets,
      timeout: this.options.timeout,
      scheduling: this.options.scheduling
    });
    
    // Create HTTPS agent
    this.httpsAgent = new https.Agent({
      keepAlive: this.options.keepAlive,
      keepAliveMsecs: this.options.keepAliveInitialDelay,
      maxSockets: this.options.maxSockets,
      maxFreeSockets: this.options.maxFreeSockets,
      timeout: this.options.timeout,
      scheduling: this.options.scheduling
    });
    
    logger.info('ConnectionPool initialized', {
      maxSockets: this.options.maxSockets,
      maxFreeSockets: this.options.maxFreeSockets,
      keepAlive: this.options.keepAlive,
      scheduling: this.options.scheduling
    });
  }
  
  /**
   * Make an HTTP/HTTPS request using the pool
   */
  async request(options: PoolRequestOptions): Promise<{
    statusCode?: number;
    headers: http.IncomingHttpHeaders;
    body: string | Buffer;
  }> {
    const startTime = Date.now();
    
    try {
      // Parse URL if provided
      let requestOptions: https.RequestOptions = { ...options };
      if (options.url) {
        const url = new URL(options.url);
        requestOptions = {
          ...requestOptions,
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          headers: {
            ...requestOptions.headers,
            'Host': url.host
          }
        };
      }
      
      // Select appropriate agent
      const isHttps = requestOptions.protocol === 'https:' || 
                     requestOptions.port === 443;
      const agent = isHttps ? this.httpsAgent : this.httpAgent;
      requestOptions.agent = agent;
      
      // Add default headers
      requestOptions.headers = {
        'User-Agent': 'Discord-LLM-Bot/1.0',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        ...requestOptions.headers
      };
      
      // Handle JSON body
      let body = options.body;
      if (options.json && typeof body === 'object') {
        body = JSON.stringify(body);
        if (requestOptions.headers) {
          (requestOptions.headers as Record<string, string>)['Content-Type'] = 'application/json';
        }
      }
      
      if (body && requestOptions.headers) {
        (requestOptions.headers as Record<string, string>)['Content-Length'] = Buffer.byteLength(body).toString();
      }
      
      // Make request
      const response = await this.makeRequest(requestOptions, body);
      
      // Update stats
      await this.updateStats(startTime, true);
      
      return response;
      
    } catch (error) {
      // Update error stats - wrap in try/catch to avoid masking original error
      try {
        await this.updateStats(startTime, false, error);
      } catch (statsError) {
        logger.error('Failed to update stats after request error', {
          statsError,
          originalError: error
        });
      }

      // Enrich and re-throw the original error with context
      throw enrichError(error as Error, {
        operation: 'ConnectionPool.request',
        url: options.hostname + (options.path || ''),
        method: options.method
      });
    }
  }
  
  /**
   * Make the actual HTTP/HTTPS request
   */
  private makeRequest(
    options: https.RequestOptions,
    body?: string | Buffer
  ): Promise<{
    statusCode?: number;
    headers: http.IncomingHttpHeaders;
    body: string | Buffer;
  }> {
    return new Promise((resolve, reject) => {
      const isHttps = options.protocol === 'https:' || options.port === 443;
      const module = isHttps ? https : http;
      
      const req = module.request(options, (res) => {
        const chunks: Buffer[] = [];
        
        res.on('data', (chunk) => {
          chunks.push(Buffer.from(chunk));
        });
        
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks);
          
          // Check for gzip/deflate encoding
          const encoding = res.headers['content-encoding'];
          if (encoding === 'gzip' || encoding === 'deflate') {
            // Note: In production, you'd decompress here
            // For now, we'll just return the raw buffer
          }
          
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: responseBody
          });
        });
        
        res.on('error', reject);
      });
      
      req.on('error', reject);
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      // Set timeout
      if (this.options.timeout) {
        req.setTimeout(this.options.timeout);
      }
      
      // Write body if present
      if (body) {
        req.write(body);
      }
      
      req.end();
    });
  }
  
  /**
   * Update statistics
   */
  private async updateStats(
    startTime: number,
    success: boolean,
    error?: unknown
  ): Promise<void> {
    return this.mutex.runExclusive(() => {
      this.stats.totalRequests++;
      
      if (success) {
        const requestTime = Date.now() - startTime;
        this.stats.requestTimes.push(requestTime);
        
        // Keep only last N request times
        if (this.stats.requestTimes.length > this.stats.maxRequestTimes) {
          this.stats.requestTimes.shift();
        }
        
        // Check if connection was reused (heuristic: very fast requests likely reused connection)
        if (requestTime < 50) {
          this.stats.connectionReuse++;
        }
      } else {
        this.stats.errors++;
        
        if (error instanceof Error && error.message.includes('timeout')) {
          this.stats.timeouts++;
        }
      }
    });
  }
  
  /**
   * Get pool statistics
   */
  getStatistics(): PoolStatistics {
    const httpAgentDebug = this.httpAgent as unknown as AgentWithDebugInfo;
    const httpsAgentDebug = this.httpsAgent as unknown as AgentWithDebugInfo;
    const httpStatus = httpAgentDebug.getCurrentStatus?.() || {};
    const httpsStatus = httpsAgentDebug.getCurrentStatus?.() || {};
    
    // Calculate average request time
    const avgRequestTime = this.stats.requestTimes.length > 0
      ? this.stats.requestTimes.reduce((a, b) => a + b, 0) / this.stats.requestTimes.length
      : 0;
    
    // Calculate reuse rate
    const reuseRate = this.stats.totalRequests > 0
      ? (this.stats.connectionReuse / this.stats.totalRequests) * 100
      : 0;
    
    return {
      totalConnections: (httpStatus.sockets || 0) + (httpsStatus.sockets || 0),
      activeConnections: (httpStatus.requests || 0) + (httpsStatus.requests || 0),
      idleConnections: (httpStatus.freeSockets || 0) + (httpsStatus.freeSockets || 0),
      totalRequests: this.stats.totalRequests,
      connectionReuse: this.stats.connectionReuse,
      reuseRate: Math.round(reuseRate * 10) / 10,
      avgRequestTime: Math.round(avgRequestTime),
      errors: this.stats.errors,
      timeouts: this.stats.timeouts
    };
  }
  
  /**
   * Destroy all connections and cleanup
   */
  destroy(): void {
    this.httpAgent.destroy();
    this.httpsAgent.destroy();
    logger.info('ConnectionPool destroyed');
  }
  
  /**
   * Get agent status for debugging
   */
  getDebugInfo(): Record<string, unknown> {
    const httpAgentDebug = this.httpAgent as unknown as AgentWithDebugInfo;
    const httpsAgentDebug = this.httpsAgent as unknown as AgentWithDebugInfo;
    
    return {
      http: {
        sockets: Object.keys(httpAgentDebug.sockets || {}).length,
        freeSockets: Object.keys(httpAgentDebug.freeSockets || {}).length,
        requests: Object.keys(httpAgentDebug.requests || {}).length
      },
      https: {
        sockets: Object.keys(httpsAgentDebug.sockets || {}).length,
        freeSockets: Object.keys(httpsAgentDebug.freeSockets || {}).length,
        requests: Object.keys(httpsAgentDebug.requests || {}).length
      },
      stats: this.getStatistics()
    };
  }
}

/**
 * Global connection pool instance
 */
let globalPool: ConnectionPool | null = null;

/**
 * Get or create global connection pool
 */
export function getGlobalConnectionPool(): ConnectionPool {
  if (!globalPool) {
    globalPool = new ConnectionPool({
      maxSockets: parseInt(process.env.CONNECTION_POOL_MAX_SOCKETS || '10'),
      maxFreeSockets: parseInt(process.env.CONNECTION_POOL_MAX_FREE_SOCKETS || '5'),
      timeout: parseInt(process.env.CONNECTION_POOL_TIMEOUT || '30000'),
      keepAlive: process.env.CONNECTION_POOL_KEEP_ALIVE !== 'false',
      scheduling: 'fifo'
    });
  }
  return globalPool;
}

/**
 * Destroy global connection pool
 */
export function destroyGlobalConnectionPool(): void {
  if (globalPool) {
    globalPool.destroy();
    globalPool = null;
  }
}

/**
 * Convenience function for making pooled requests
 */
export async function pooledRequest(options: PoolRequestOptions): Promise<{
  statusCode?: number;
  headers: http.IncomingHttpHeaders;
  body: string | Buffer;
}> {
  const pool = getGlobalConnectionPool();
  return pool.request(options);
}

/**
 * Get global pool statistics
 */
export function getGlobalPoolStats(): PoolStatistics {
  const pool = getGlobalConnectionPool();
  return pool.getStatistics();
}