# Chroniclr Configuration Guide

## Rate Limiting Configuration

### Default Settings
The system includes intelligent rate limiting with these default configurations:

```javascript
// Default Rate Limiting Settings
const defaultConfig = {
  maxRetries: 3,                    // Number of retry attempts
  baseDelayMs: 1000,               // Initial delay (1 second)
  exponentialMultiplier: 2,        // Delay multiplier (1s → 2s → 4s)
  concurrentRequests: 1,           // Max simultaneous API calls
  delayBetweenRequests: 1000       // Minimum time between requests (1s)
};
```

### Customizing Rate Limiting

To modify rate limiting behavior, edit `src/generators/ai-document-generator.js`:

```javascript
async generateCompletion(prompt, retryCount = 0) {
  const maxRetries = 5;              // Increase from default 3
  const baseDelayMs = 2000;         // Start with 2 seconds instead of 1
  
  // Your custom retry logic here
}
```

Or modify the request queue in `src/utils/request-queue.js`:

```javascript
// More conservative settings for high-traffic repositories
const globalRequestQueue = new RequestQueue(1, 2000); // 1 concurrent, 2s delay
```

### Environment Variables

Configure rate limiting through environment variables:

```bash
# GitHub Actions workflow environment
CHRONICLR_MAX_RETRIES=5           # Override default retry count
CHRONICLR_BASE_DELAY=2000         # Override initial delay (ms)
CHRONICLR_CONCURRENT_LIMIT=1      # Max concurrent requests
CHRONICLR_REQUEST_DELAY=1500      # Min delay between requests (ms)
```

## Community Engagement Configuration

### Reaction Processing Settings

The engagement analysis can be customized in `src/utils/github-reactions.js`:

```javascript
// Engagement thresholds
const engagementConfig = {
  highEngagementThreshold: 10,     // Reactions needed for "high" engagement
  mediumEngagementThreshold: 3,    // Reactions needed for "medium" engagement
  controversyThreshold: 0.3,       // Ratio for controversial content
  maxReactionsToFetch: 100,        // GraphQL query limit
  maxCommentsToAnalyze: 100        // Comment processing limit
};
```

### Reaction Weights

Customize how different reaction types are weighted:

```javascript
// Custom reaction scoring
const reactionWeights = {
  THUMBS_UP: 2,      // Standard positive reaction
  HEART: 3,          // Strong positive reaction
  HOORAY: 3,         // Celebration reaction
  ROCKET: 4,         // Innovation/excitement reaction
  EYES: 1,           // Neutral attention reaction
  THUMBS_DOWN: -2,   // Negative reaction
  CONFUSED: -1       // Mild negative reaction
};
```

### Template Configuration

Enable engagement features by using enhanced templates:

```yaml
# chroniclr.config.json
{
  "templates": {
    "summary": "summary-enhanced.md",     # Use engagement-aware template
    "initiative": "initiative-brief.md",
    "meeting": "meeting-notes.md"
  },
  "engagement": {
    "enabled": true,                      # Enable reaction processing
    "includeControversial": true,         # Highlight mixed reactions
    "minReactionsForHighlight": 3         # Minimum reactions to feature content
  }
}
```

## API Configuration

### GitHub Models API Settings

Configure AI model parameters in `src/generators/ai-document-generator.js`:

```javascript
const requestBody = {
  model: "gpt-4o",                 # AI model to use
  max_tokens: 4000,               # Response length limit
  temperature: 0.3,               # Creativity vs consistency (0-1)
  top_p: 1.0,                     # Nucleus sampling parameter
  frequency_penalty: 0,           # Reduce repetition
  presence_penalty: 0             # Encourage topic diversity
};
```

### GraphQL Query Limits

Adjust data fetching limits in `src/utils/github-reactions.js`:

```javascript
const queryLimits = {
  maxReactions: 100,              # Reactions per discussion/comment
  maxComments: 100,               # Comments to analyze per discussion
  maxReplies: 50,                 # Replies per comment thread
  maxReactionsPerComment: 30      # Reactions per reply
};
```

## Workflow Configuration

### GitHub Actions Permissions

Ensure your workflow has these permissions for all features:

```yaml
# .github/workflows/chroniclr.yml
permissions:
  contents: write          # Create files and commits
  discussions: read        # Read discussion data and reactions
  pull-requests: write     # Create PRs with generated docs
  issues: write           # Create action item issues
  models: read            # Access GitHub Models API
```

### Workflow Triggers

Configure when Chroniclr runs:

```yaml
on:
  discussion:
    types: [created, edited, answered]
  workflow_dispatch:
    inputs:
      discussion_number:
        description: 'Discussion number to process'
        required: true
        type: string
```

## Performance Optimization

### High-Traffic Repositories

For repositories with many discussions and heavy API usage:

```javascript
// Conservative rate limiting
const globalRequestQueue = new RequestQueue(1, 3000); // 3 second delays

// Reduced data fetching
const queryConfig = {
  maxComments: 50,           # Process fewer comments
  maxReactions: 50,          # Analyze fewer reactions
  skipOldDiscussions: true   # Only process recent activity
};
```

### Concurrent Processing

For multiple simultaneous document generations:

```javascript
// Allow more concurrent requests (use cautiously)
const globalRequestQueue = new RequestQueue(2, 1500);

// Or separate queues for different operations
const documentQueue = new RequestQueue(1, 2000);
const reactionQueue = new RequestQueue(2, 500);
```

## Error Handling Configuration

### Custom Retry Strategies

Implement custom retry logic for specific error types:

```javascript
// Custom retry for network errors
if (error.code === 'ECONNRESET') {
  const networkRetryDelay = 5000; // 5 seconds for network issues
  await this.sleep(networkRetryDelay);
  return this.generateCompletion(prompt, retryCount + 1);
}
```

### Fallback Templates

Configure fallback behavior when AI processing fails:

```javascript
const fallbackConfig = {
  useBasicTemplate: true,         # Generate structured template
  includeErrorContext: false,     # Hide technical error details
  retryAfterFallback: false,      # Don't retry after using fallback
  logDetailedErrors: true         # Include full error logs
};
```

## Monitoring and Logging

### Enhanced Logging

Enable detailed logging for troubleshooting:

```javascript
const loggingConfig = {
  logRateLimit: true,             # Log all rate limit events
  logEngagementData: true,        # Log reaction analysis results
  logQueueStatus: true,           # Log request queue statistics
  logRetryAttempts: true,         # Log all retry attempts
  logPerformanceMetrics: true     # Log processing times
};
```

### Metrics Collection

Track system performance:

```javascript
const metricsConfig = {
  trackResponseTimes: true,       # Measure API response times
  trackRetryRates: true,          # Monitor retry frequency
  trackEngagementLevels: true,    # Analyze community participation
  trackFallbackUsage: true        # Monitor AI vs fallback usage
};
```

## Security Configuration

### Token Scoping

Ensure GitHub token has minimal required permissions:

```bash
# Required scopes for GITHUB_TOKEN
repo:status                      # Read repository status
public_repo                      # Access public repositories
read:discussion                  # Read discussion data
write:discussion                 # Post status updates (optional)
```

### Sensitive Data Handling

Configure sensitive information filtering:

```javascript
const securityConfig = {
  filterSecrets: true,            # Remove potential secrets from logs
  sanitizeUserData: true,         # Clean user-generated content
  validateInputs: true,           # Validate all inputs before processing
  auditApiCalls: true            # Log all API interactions
};
```

This configuration guide helps you customize Chroniclr's rate limiting, engagement analysis, and overall behavior to match your repository's specific needs.