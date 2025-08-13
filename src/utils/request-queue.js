/**
 * Request Queue Manager for Chroniclr
 * Prevents concurrent API requests that trigger rate limits
 */

const core = require('@actions/core');

class RequestQueue {
  constructor(concurrency = 1, delayBetweenRequests = 3000) {
    // Increased delay to 3 seconds
    this.queue = [];
    this.processing = false;
    this.concurrency = concurrency; // Max concurrent requests
    this.active = 0;
    this.delayBetweenRequests = delayBetweenRequests; // Min delay between requests
    this.lastRequestTime = 0;
    this.consecutiveFailures = 0; // Track consecutive 429 failures
    this.backoffMultiplier = 1; // Dynamic backoff multiplier
  }

  async add(requestFunction) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        fn: requestFunction,
        resolve,
        reject,
      });

      if (!this.processing) {
        this.process();
      }
    });
  }

  async process() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0 && this.active < this.concurrency) {
      const request = this.queue.shift();
      this.active++;

      // Ensure minimum delay between requests with dynamic backoff
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      const dynamicDelay = this.delayBetweenRequests * this.backoffMultiplier;

      if (timeSinceLastRequest < dynamicDelay) {
        const waitTime = dynamicDelay - timeSinceLastRequest;
        core.info(
          `⏱️  Enhanced rate limiting: waiting ${Math.round(
            waitTime
          )}ms before next request (backoff: ${this.backoffMultiplier}x)`
        );
        await this.sleep(waitTime);
      }

      this.lastRequestTime = Date.now();

      // Execute request
      this.executeRequest(request).then(() => {
        this.active--;
        if (this.queue.length > 0) {
          this.process(); // Process next items
        } else if (this.active === 0) {
          this.processing = false;
        }
      });
    }

    if (this.active === 0) {
      this.processing = false;
    }
  }

  async executeRequest(request) {
    try {
      const result = await request.fn();
      request.resolve(result);
      this.consecutiveFailures = 0; // Reset on success
      this.backoffMultiplier = Math.max(1, this.backoffMultiplier * 0.8); // Gradually reduce backoff
    } catch (error) {
      // Check if it's a rate limit error
      if (
        error.message &&
        (error.message.includes('429') ||
          error.message.includes('Too Many Requests'))
      ) {
        this.consecutiveFailures++;
        this.backoffMultiplier = Math.min(10, this.backoffMultiplier * 1.8); // Increase backoff more aggressively
        core.warning(
          `🚨 Rate limit detected. Consecutive failures: ${this.consecutiveFailures}, New backoff: ${this.backoffMultiplier}x`
        );
      }
      request.reject(error);
    }
  }

  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getStatus() {
    return {
      queueLength: this.queue.length,
      activeRequests: this.active,
      processing: this.processing,
    };
  }
}

// Singleton instance for global use
const globalRequestQueue = new RequestQueue(1, 1000); // 1 concurrent, 1s delay

module.exports = { RequestQueue, globalRequestQueue };
