/**
 * Request Queue Manager for Chroniclr
 * Prevents concurrent API requests that trigger rate limits
 */

const core = require('@actions/core');

class RequestQueue {
  constructor(concurrency = 1, delayBetweenRequests = 500) {
    this.queue = [];
    this.processing = false;
    this.concurrency = concurrency; // Max concurrent requests
    this.active = 0;
    this.delayBetweenRequests = delayBetweenRequests; // Min delay between requests
    this.lastRequestTime = 0;
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

      // Ensure minimum delay between requests
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < this.delayBetweenRequests) {
        const waitTime = this.delayBetweenRequests - timeSinceLastRequest;
        core.info(`Rate limiting: waiting ${waitTime}ms before next request`);
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
    } catch (error) {
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
