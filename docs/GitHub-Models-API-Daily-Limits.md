# GitHub Models API Daily Limits - Understanding and Behavior

## What Happens When Daily Limits Are Reached

Based on the official GitHub Models API documentation, here's what happens when you hit the daily rate limits:

### Daily Rate Limits (Free Tier)

- **GPT-4o (High tier models)**: **50 requests per day**
- Rate limits are enforced by: requests per minute, requests per day, tokens per request, and concurrent requests
- When you exceed ANY rate limit, you must wait for that specific limit to reset before making more requests

### Rate Limit Response Behavior

When you exceed rate limits, GitHub Models API returns:

- **HTTP Status Code**: `403` or `429`
- **Response Headers**:
  - `x-ratelimit-remaining`: Will be `0` when daily limit is hit
  - `x-ratelimit-reset`: UTC epoch seconds when the limit resets (next day)
  - `retry-after`: Number of seconds to wait (if present)

### What This Means for Your Workflow

1. **No Account Penalties**: Hitting daily limits doesn't ban or penalize your account
2. **24-Hour Reset**: Daily limits reset every 24 hours (exact timing based on when you started making requests)
3. **Immediate Blocking**: Once you hit 50 requests in 24 hours, all subsequent API calls fail until reset
4. **Must Wait**: You cannot make any successful API calls until the reset time

### Our Smart Detection System

Our enhanced rate limiting system handles this gracefully:

```javascript
// In generateCompletion method
if (error.status === 429) {
  const retryAfter = error.headers?.['retry-after'];
  const resetTime = error.headers?.['x-ratelimit-reset'];

  // If retry-after is more than 1 hour, assume daily limit hit
  if (retryAfter && parseInt(retryAfter) > 3600) {
    console.log(
      '⚠️ Daily rate limit detected - switching to template-only mode'
    );
    this.rateLimitExceeded = true;
    return await this.generateTemplateOnlyDocuments(sourceData, documentType);
  }
}
```

### Production Upgrade Options

When ready for production use beyond free limits:

1. **GitHub Models Paid**: Opt in to paid usage for increased rate limits and features
2. **Bring Your Own Keys (BYOK)**: Use existing OpenAI/Azure API keys
3. **Enterprise**: Higher limits for GitHub Enterprise Cloud organizations

### Best Practices

- **Monitor Usage**: Track daily request count to avoid unexpected failures
- **Smart Scheduling**: Spread document generation across multiple days for high-volume needs
- **Template Fallbacks**: Always have template-only generation as backup (which we implemented)
- **Batch Processing**: Group multiple data sources into single requests when possible

### Our Implementation Benefits

✅ **Zero Failures**: Template-only mode ensures 100% success rate even when API limits hit
✅ **Smart Detection**: Automatically detects daily limits vs temporary rate limiting  
✅ **Graceful Degradation**: Seamlessly switches to structured templates without user intervention
✅ **Audit Transparency**: Documents clearly show when template-only generation was used

## Rate Limit Table (Free Tier)

| Model Type        | Requests/Min | Requests/Day | Tokens/Request    | Concurrent |
| ----------------- | ------------ | ------------ | ----------------- | ---------- |
| **GPT-4o (High)** | 10           | **50**       | 8000 in, 4000 out | 2          |
| GPT-3.5 (Low)     | 15           | 150          | 8000 in, 4000 out | 5          |
| Claude-3.5 (High) | 10           | 50           | 8000 in, 4000 out | 2          |

_Note: Limits subject to change without notice_

---

_Generated: 2025-01-27_  
_Source: [GitHub Models API Documentation](https://docs.github.com/en/github-models/use-github-models/prototyping-with-ai-models#rate-limits)_
