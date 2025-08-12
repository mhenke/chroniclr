#!/usr/bin/env node

/**
 * Rate Limiting and API Request Queue Manager for Chroniclr
 * Handles GitHub API rate limits and optimizes request patterns
 */

const core = require('@actions/core');

class RateLimiter {
  constructor(options = {}) {
    this.requests = new Map(); // Track requests per endpoint
    this.queues = new Map(); // Request queues per endpoint type
    this.config = {
      github: {
        primary: { limit: 5000, window: 3600000 }, // 5000 requests per hour
        search: { limit: 30, window: 60000 }, // 30 search requests per minute
        secondary: { limit: 100, window: 60000 } // 100 secondary requests per minute
      },
      jira: {
        standard: { limit: 200, window: 60000 }, // 200 requests per minute (configurable)
        bulk: { limit: 50, window: 60000 } // 50 bulk operations per minute
      },
      ...options
    };
    
    // Initialize queues
    this.initializeQueues();
  }

  initializeQueues() {
    const endpointTypes = [
      'github-primary', 'github-search', 'github-secondary',
      'jira-standard', 'jira-bulk'
    ];
    
    endpointTypes.forEach(type => {
      this.queues.set(type, []);
      this.requests.set(type, []);
    });
  }

  /**
   * Add a request to the appropriate queue
   */
  async queueRequest(endpointType, requestFn, priority = 'normal') {
    return new Promise((resolve, reject) => {
      const request = {
        fn: requestFn,
        resolve,
        reject,
        priority,
        timestamp: Date.now(),
        retries: 0,
        maxRetries: 3
      };

      const queue = this.queues.get(endpointType);
      if (!queue) {
        reject(new Error(`Unknown endpoint type: ${endpointType}`));
        return;
      }

      // Insert based on priority
      if (priority === 'high') {
        queue.unshift(request);
      } else {
        queue.push(request);
      }

      // Process queue
      this.processQueue(endpointType);
    });
  }

  /**
   * Process requests in queue with rate limiting
   */
  async processQueue(endpointType) {
    const queue = this.queues.get(endpointType);
    const requests = this.requests.get(endpointType);
    
    if (queue.length === 0) {
      return;
    }

    // Check if we can make a request
    if (!this.canMakeRequest(endpointType)) {
      // Schedule retry
      const delay = this.getRetryDelay(endpointType);
      core.info(`⏳ Rate limit reached for ${endpointType}. Waiting ${delay}ms...`);
      
      setTimeout(() => {
        this.processQueue(endpointType);
      }, delay);
      return;
    }

    // Get next request
    const request = queue.shift();
    if (!request) {
      return;
    }

    try {
      // Track the request
      requests.push({
        timestamp: Date.now(),
        endpointType
      });

      // Execute the request
      core.debug(`🔄 Executing ${endpointType} request (queue: ${queue.length} remaining)`);
      const result = await request.fn();
      request.resolve(result);
      
      // Process next request after small delay
      setTimeout(() => {
        this.processQueue(endpointType);
      }, this.getRequestDelay(endpointType));
      
    } catch (error) {
      // Handle retry logic
      if (this.shouldRetry(error, request)) {
        request.retries++;
        const retryDelay = this.getExponentialBackoff(request.retries);
        
        core.warning(`🔄 Retrying ${endpointType} request (${request.retries}/${request.maxRetries}) after ${retryDelay}ms: ${error.message}`);
        
        setTimeout(() => {
          queue.unshift(request); // Put back at front for retry
          this.processQueue(endpointType);
        }, retryDelay);
      } else {
        core.error(`❌ ${endpointType} request failed permanently: ${error.message}`);
        request.reject(error);
        
        // Continue processing other requests
        setTimeout(() => {
          this.processQueue(endpointType);
        }, 1000);
      }
    }
  }

  /**
   * Check if we can make a request based on rate limits
   */
  canMakeRequest(endpointType) {
    const requests = this.requests.get(endpointType);
    const config = this.getEndpointConfig(endpointType);
    
    if (!config) {
      return true; // No limits configured
    }

    const now = Date.now();
    const windowStart = now - config.window;
    
    // Clean old requests
    const recentRequests = requests.filter(req => req.timestamp > windowStart);
    this.requests.set(endpointType, recentRequests);
    
    return recentRequests.length < config.limit;
  }

  /**
   * Get configuration for endpoint type
   */
  getEndpointConfig(endpointType) {
    const [service, type] = endpointType.split('-');
    return this.config[service]?.[type];
  }

  /**
   * Calculate delay before retry
   */
  getRetryDelay(endpointType) {
    const config = this.getEndpointConfig(endpointType);
    if (!config) {
      return 1000; // Default 1 second
    }

    // Calculate when the rate limit window resets
    const requests = this.requests.get(endpointType);
    if (requests.length === 0) {
      return 100; // Very short delay if no recent requests
    }

    const oldestRequest = Math.min(...requests.map(r => r.timestamp));
    const windowReset = oldestRequest + config.window;
    const delay = Math.max(100, windowReset - Date.now());
    
    return Math.min(delay, config.window); // Cap at window size
  }

  /**
   * Get delay between requests for pacing
   */
  getRequestDelay(endpointType) {
    if (endpointType.includes('search')) {
      return 2000; // 2 second delay for search requests
    }
    return 100; // 100ms delay for regular requests
  }

  /**
   * Determine if request should be retried
   */
  shouldRetry(error, request) {
    if (request.retries >= request.maxRetries) {
      return false;
    }

    // Retry on rate limits, timeouts, and 5xx errors
    const retryableErrors = [
      'rate limit',
      'timeout',
      'ECONNRESET',
      'ETIMEDOUT',
      'socket hang up'
    ];

    const isRetryable = retryableErrors.some(pattern => 
      error.message?.toLowerCase().includes(pattern) ||
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      (error.status >= 500 && error.status < 600) ||
      error.status === 429
    );

    return isRetryable;
  }

  /**
   * Calculate exponential backoff delay
   */
  getExponentialBackoff(retryCount) {
    const baseDelay = 1000; // 1 second base
    const maxDelay = 30000; // 30 seconds max
    const delay = baseDelay * Math.pow(2, retryCount - 1);
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    
    return Math.min(delay + jitter, maxDelay);
  }

  /**
   * Get queue statistics for monitoring
   */
  getQueueStats() {
    const stats = {};
    
    this.queues.forEach((queue, endpointType) => {
      const requests = this.requests.get(endpointType);
      const config = this.getEndpointConfig(endpointType);
      
      const now = Date.now();
      const windowStart = now - (config?.window || 3600000);
      const recentRequests = requests.filter(req => req.timestamp > windowStart);
      
      stats[endpointType] = {
        queueSize: queue.length,
        recentRequests: recentRequests.length,
        limit: config?.limit || 'unlimited',
        window: config?.window || 'unlimited',
        utilizationPercent: config ? Math.round((recentRequests.length / config.limit) * 100) : 0
      };
    });

    return stats;
  }

  /**
   * Log queue statistics
   */
  logQueueStats() {
    const stats = this.getQueueStats();
    
    core.info('\n📊 Rate Limiter Statistics:');
    Object.entries(stats).forEach(([endpointType, stat]) => {
      const utilizationIcon = stat.utilizationPercent > 80 ? '🔴' : 
                             stat.utilizationPercent > 60 ? '🟡' : '🟢';
      
      core.info(`  ${utilizationIcon} ${endpointType}:`);
      core.info(`    Queue: ${stat.queueSize} requests waiting`);
      core.info(`    Usage: ${stat.recentRequests}/${stat.limit} (${stat.utilizationPercent}%)`);
      
      if (stat.queueSize > 0) {
        core.warning(`    ⚠️ ${stat.queueSize} requests queued for ${endpointType}`);
      }
    });
  }

  /**
   * Wait for all queues to empty
   */
  async waitForQueues(timeout = 300000) { // 5 minute default timeout
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const totalQueued = Array.from(this.queues.values())
        .reduce((sum, queue) => sum + queue.length, 0);
      
      if (totalQueued === 0) {
        core.info('✅ All request queues are empty');
        return;
      }

      core.info(`⏳ Waiting for ${totalQueued} queued requests to complete...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    core.warning('⚠️ Timeout waiting for request queues to empty');
  }
}

// Global rate limiter instance
let globalRateLimiter = null;

/**
 * Get or create global rate limiter instance
 */
function getRateLimiter(options = {}) {
  if (!globalRateLimiter) {
    globalRateLimiter = new RateLimiter(options);
  }
  return globalRateLimiter;
}

/**
 * Convenience function to queue a GitHub API request
 */
async function queueGitHubRequest(requestFn, type = 'primary', priority = 'normal') {
  const rateLimiter = getRateLimiter();
  return rateLimiter.queueRequest(`github-${type}`, requestFn, priority);
}

/**
 * Convenience function to queue a Jira API request
 */
async function queueJiraRequest(requestFn, type = 'standard', priority = 'normal') {
  const rateLimiter = getRateLimiter();
  return rateLimiter.queueRequest(`jira-${type}`, requestFn, priority);
}

module.exports = {
  RateLimiter,
  getRateLimiter,
  queueGitHubRequest,
  queueJiraRequest
};