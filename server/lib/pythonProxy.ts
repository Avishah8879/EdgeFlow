/**
 * Python API Proxy with HTTP Connection Pooling
 *
 * Provides efficient connection reuse for high-concurrency scenarios.
 * Supports 10,000+ concurrent users with proper connection management.
 */

import axios, { AxiosError, AxiosInstance } from 'axios';
import http from 'http';
import https from 'https';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8100';

// =============================================================================
// Timeout and Retry Configuration
// =============================================================================
const PYTHON_API_TIMEOUT = parseInt(process.env.PYTHON_API_TIMEOUT || '15000', 10);
const PYTHON_API_MAX_RETRIES = parseInt(process.env.PYTHON_API_MAX_RETRIES || '3', 10);
const PYTHON_API_RETRY_BASE_DELAY = parseInt(process.env.PYTHON_API_RETRY_BASE_DELAY || '1000', 10);
const PYTHON_API_RETRY_MAX_DELAY = parseInt(process.env.PYTHON_API_RETRY_MAX_DELAY || '5000', 10);

// =============================================================================
// HTTP Agent Configuration with Connection Pooling
// =============================================================================

// HTTP Agent with keep-alive and connection pooling
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,      // Keep connections alive for 30 seconds
  maxSockets: 100,            // Max concurrent connections per host
  maxFreeSockets: 50,         // Max idle connections to keep
  timeout: 60000,             // Socket timeout
});

// HTTPS Agent with same configuration (if Python API uses HTTPS)
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 100,
  maxFreeSockets: 50,
  timeout: 60000,
});

// Singleton axios instance with connection pooling
const pythonClient: AxiosInstance = axios.create({
  baseURL: PYTHON_API_URL,
  timeout: PYTHON_API_TIMEOUT,
  httpAgent,
  httpsAgent,
  maxRedirects: 3,
});

// =============================================================================
// Retry Helper Functions
// =============================================================================

/**
 * Calculate exponential backoff delay with jitter
 * @param attempt Current retry attempt (0-indexed)
 * @returns Delay in milliseconds
 */
function calculateBackoffDelay(attempt: number): number {
  const exponentialDelay = PYTHON_API_RETRY_BASE_DELAY * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, PYTHON_API_RETRY_MAX_DELAY);
  // Add jitter (0-25% of delay) to prevent thundering herd
  const jitter = cappedDelay * Math.random() * 0.25;
  return Math.floor(cappedDelay + jitter);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is retryable (network errors, timeouts, 5xx errors)
 */
function isRetryableError(error: AxiosError): boolean {
  // Network errors (ECONNREFUSED, ECONNRESET, ETIMEDOUT, etc.)
  if (!error.response) {
    return true;
  }
  // Server errors (5xx) are retryable
  if (error.response.status >= 500) {
    return true;
  }
  // Timeout errors
  if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
    return true;
  }
  return false;
}

// =============================================================================
// Proxy Types and Functions
// =============================================================================

export type ProxyRequestOptions = {
  method?: string;
  data?: any;
  headers?: Record<string, string>;
  timeout?: number;
};

/**
 * Proxy request to Python FastAPI backend with connection pooling and retry logic
 * @param endpoint API endpoint path
 * @param methodOrOptions HTTP method string or advanced options
 * @param legacyData Request body (legacy signature)
 * @returns API response
 */
export async function proxyToPython(
  endpoint: string,
  methodOrOptions?: string | ProxyRequestOptions,
  legacyData?: any
): Promise<any> {
  let method = 'GET';
  let data = legacyData;
  let headers: Record<string, string> | undefined;
  let timeout = PYTHON_API_TIMEOUT;

  if (typeof methodOrOptions === 'string') {
    method = methodOrOptions;
    data = legacyData;
  } else if (typeof methodOrOptions === 'object' && methodOrOptions !== null) {
    method = methodOrOptions.method ?? 'GET';
    data = methodOrOptions.data;
    headers = methodOrOptions.headers;
    timeout = methodOrOptions.timeout ?? timeout;
  }

  const defaultHeaders =
    headers || (data ? { 'Content-Type': 'application/json' } : undefined);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= PYTHON_API_MAX_RETRIES; attempt++) {
    try {
      const response = await pythonClient({
        method,
        url: endpoint,
        data,
        timeout,
        ...(defaultHeaders ? { headers: defaultHeaders } : {}),
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;

        // If Python API returned error response (4xx), don't retry - pass through
        if (axiosError.response && axiosError.response.status < 500) {
          return axiosError.response.data;
        }

        // Check if error is retryable
        if (!isRetryableError(axiosError)) {
          console.error(`[PythonProxy] Non-retryable error: ${axiosError.message}`);
          throw new Error(`Python API error: ${axiosError.message}`);
        }

        lastError = new Error(`Python API unavailable: ${axiosError.message}`);

        // Log and retry if attempts remain
        if (attempt < PYTHON_API_MAX_RETRIES) {
          const delay = calculateBackoffDelay(attempt);
          console.warn(
            `[PythonProxy] Request to ${endpoint} failed (attempt ${attempt + 1}/${PYTHON_API_MAX_RETRIES + 1}), ` +
            `retrying in ${delay}ms: ${axiosError.message}`
          );
          await sleep(delay);
        } else {
          console.error(
            `[PythonProxy] All ${PYTHON_API_MAX_RETRIES + 1} attempts failed for ${endpoint}: ${axiosError.message}`
          );
        }
      } else {
        throw error;
      }
    }
  }

  throw lastError || new Error('Python API unavailable after all retries');
}

/**
 * Check if Python API is healthy
 */
export async function checkPythonAPIHealth(): Promise<boolean> {
  try {
    const response = await proxyToPython('/api/health');
    return response.success === true;
  } catch (error) {
    return false;
  }
}

/**
 * Get connection pool statistics
 */
export function getPoolStats(): {
  httpSockets: number;
  httpFreeSockets: number;
  httpsPendingRequests: number;
} {
  const httpSockets = Object.values(httpAgent.sockets).reduce(
    (sum, arr) => sum + (arr?.length || 0),
    0
  );
  const httpFreeSockets = Object.values(httpAgent.freeSockets).reduce(
    (sum, arr) => sum + (arr?.length || 0),
    0
  );
  const httpsPendingRequests = Object.values(httpAgent.requests).reduce(
    (sum, arr) => sum + (arr?.length || 0),
    0
  );

  return {
    httpSockets,
    httpFreeSockets,
    httpsPendingRequests,
  };
}

/**
 * Close all connections in the pool (for graceful shutdown)
 */
export function closePythonProxy(): void {
  httpAgent.destroy();
  httpsAgent.destroy();
  console.log('[PythonProxy] Connection pools destroyed');
}
