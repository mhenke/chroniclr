# Chroniclr API Documentation

## GitHub Reactions API Integration

### GitHubReactionsClient Class

Located in `src/utils/github-reactions.js`, this class handles community engagement analysis.

#### Constructor
```javascript
const client = new GitHubReactionsClient(token);
```

**Parameters:**
- `token` (string, optional): GitHub token. Defaults to `process.env.GITHUB_TOKEN`

#### Methods

##### getDiscussionEngagementData(owner, repo, discussionNumber)

Fetches comprehensive engagement data for a discussion.

**Parameters:**
- `owner` (string): Repository owner
- `repo` (string): Repository name  
- `discussionNumber` (number): Discussion number

**Returns:** Promise resolving to engagement data object:

```javascript
{
  mainDiscussion: {
    totalReactions: 5,
    reactionBreakdown: { "THUMBS_UP": 4, "HEART": 1 },
    engagementScore: 10,        // 0-10 scale
    sentiment: "positive",      // "positive" | "negative" | "neutral"
    controversy: 0,             // 0-1 scale for mixed reactions
    positive: 5,
    negative: 0
  },
  comments: [
    {
      id: "comment_id",
      author: "username",
      body: "Comment text preview...",
      totalReactions: 8,
      engagementScore: 9,
      sentiment: "positive",
      reactionBreakdown: { "THUMBS_UP": 6, "HEART": 2 },
      replies: [/* reply objects */]
    }
  ],
  summary: {
    totalEngagement: 23,         // Total reactions across all content
    averageEngagement: 4.6,      // Average reactions per item
    topComments: [/* most reacted comments */],
    controversialContent: [/* mixed reaction content */],
    overallSentiment: "positive",
    participationLevel: "high"   // "high" | "medium" | "low" | "none"
  }
}
```

##### processReactionData(reactions)

Processes raw reaction data into engagement metrics.

**Parameters:**
- `reactions` (object): Raw GitHub API reaction data

**Returns:** Processed engagement object:

```javascript
{
  totalReactions: 10,
  reactionBreakdown: {
    "THUMBS_UP": 7,
    "HEART": 2, 
    "THUMBS_DOWN": 1
  },
  engagementScore: 8.5,         // Normalized 0-10 score
  sentiment: "positive",
  controversy: 0.14,            // Mixed reaction indicator
  positive: 9,
  negative: 1
}
```

## Request Queue API

### RequestQueue Class

Located in `src/utils/request-queue.js`, manages API rate limiting.

#### Constructor
```javascript
const queue = new RequestQueue(concurrency = 1, delayBetweenRequests = 500);
```

**Parameters:**
- `concurrency` (number): Maximum concurrent requests (default: 1)
- `delayBetweenRequests` (number): Minimum delay between requests in ms (default: 500)

#### Methods

##### add(requestFunction)

Adds a request to the processing queue.

**Parameters:**
- `requestFunction` (function): Async function that makes the API request

**Returns:** Promise that resolves with the request result

**Example:**
```javascript
const result = await globalRequestQueue.add(async () => {
  return await fetch('/api/endpoint');
});
```

##### getStatus()

Returns current queue status.

**Returns:**
```javascript
{
  queueLength: 3,        // Number of pending requests
  activeRequests: 1,     // Number of currently processing requests
  processing: true       // Whether queue is actively processing
}
```

## AI Document Generator API

### AIDocumentGenerator Class

Located in `src/generators/ai-document-generator.js`, handles AI-powered document generation.

#### Methods

##### generateCompletion(prompt, retryCount = 0)

Generates AI completion with intelligent retry logic.

**Parameters:**
- `prompt` (string): AI prompt for document generation
- `retryCount` (number): Current retry attempt (used internally)

**Returns:** Promise resolving to generated content string

**Retry Behavior:**
- Maximum 3 retry attempts
- Exponential backoff: 1s → 2s → 4s delays
- Respects `Retry-After` headers
- Falls back to template generation after retries exhausted

##### generateDocument(docType, discussionData)

Generates complete document with engagement analysis.

**Parameters:**
- `docType` (string): Document type ("summary", "initiative-brief", etc.)
- `discussionData` (object): Discussion metadata including:
  ```javascript
  {
    number: 123,
    title: "Discussion Title",
    body: "Full discussion content with comments",
    author: "username",
    url: "https://github.com/owner/repo/discussions/123",
    owner: "owner",           // Required for engagement analysis
    repo: "repo"             // Required for engagement analysis
  }
  ```

**Returns:** Promise resolving to generated document content

## GraphQL Queries

### Discussion Reactions Query

Fetches main discussion reactions:

```graphql
query {
  repository(owner: "owner", name: "repo") {
    discussion(number: 123) {
      id
      reactions(first: 100) {
        nodes {
          content
          user { login }
        }
        totalCount
      }
    }
  }
}
```

### Comments and Replies Query

Fetches comment reactions and threaded replies:

```graphql
query {
  repository(owner: "owner", name: "repo") {
    discussion(number: 123) {
      comments(first: 100) {
        nodes {
          id
          body
          author { login }
          reactions(first: 50) {
            nodes {
              content
              user { login }
            }
            totalCount
          }
          replies(first: 50) {
            nodes {
              id
              body
              author { login }
              reactions(first: 30) {
                nodes {
                  content
                  user { login }
                }
                totalCount
              }
            }
          }
        }
      }
    }
  }
}
```

## Reaction Types

### Supported GitHub Reaction Types

```javascript
const REACTION_TYPES = {
  THUMBS_UP: "👍",      // General approval
  THUMBS_DOWN: "👎",    // Disapproval
  LAUGH: "😄",          // Humor/amusement  
  HOORAY: "🎉",         // Celebration/excitement
  CONFUSED: "😕",       // Confusion/uncertainty
  HEART: "❤️",          // Strong positive sentiment
  ROCKET: "🚀",         // Innovation/momentum
  EYES: "👀"            // Attention/interest
};
```

### Sentiment Mapping

```javascript
const SENTIMENT_MAPPING = {
  positive: ["THUMBS_UP", "HEART", "HOORAY", "ROCKET"],
  negative: ["THUMBS_DOWN", "CONFUSED"],
  neutral: ["LAUGH", "EYES"]
};
```

## Error Handling

### Rate Limiting Errors

The system automatically handles these GitHub API errors:

```javascript
// 429 Too Many Requests
{
  status: 429,
  error: {
    code: "RateLimitReached",
    message: "Rate limit of 2 per 0s exceeded for UserConcurrentRequests",
    details: "Please wait 0 seconds before retrying."
  }
}
```

**Automatic Handling:**
1. Parse `Retry-After` header if present
2. Calculate exponential backoff delay
3. Wait appropriate time
4. Retry request (up to 3 attempts)
5. Use fallback generation if all retries fail

### GraphQL Errors

Common GraphQL errors and responses:

```javascript
// Invalid discussion number
{
  errors: [{
    type: "NOT_FOUND",
    path: ["repository", "discussion"],
    message: "Could not resolve to a node with the global id"
  }]
}

// Permission denied
{
  errors: [{
    type: "FORBIDDEN", 
    message: "Resource not accessible by integration"
  }]
}
```

## Performance Considerations

### Rate Limiting Guidelines

**GitHub API Limits:**
- REST API: 5,000 requests/hour for authenticated users
- GraphQL API: 5,000 points/hour (queries cost different amounts)
- Models API: Variable limits based on usage patterns

**Best Practices:**
- Use request queue to prevent concurrent requests
- Implement exponential backoff for retries
- Cache engagement data when possible
- Batch GraphQL queries to reduce API calls

### Memory Usage

**Engagement Data Size:**
- Small discussion (< 10 comments): ~5KB engagement data
- Medium discussion (50 comments): ~25KB engagement data  
- Large discussion (100+ comments): ~100KB+ engagement data

**Optimization Tips:**
- Limit comment fetching for very active discussions
- Process reactions in batches for large threads
- Use streaming for very large discussion analysis

## Integration Examples

### Basic Engagement Analysis

```javascript
const { GitHubReactionsClient } = require('./src/utils/github-reactions');

async function analyzeDiscussion(owner, repo, number) {
  const client = new GitHubReactionsClient();
  const engagement = await client.getDiscussionEngagementData(owner, repo, number);
  
  console.log(`Total engagement: ${engagement.summary.totalEngagement} reactions`);
  console.log(`Participation level: ${engagement.summary.participationLevel}`);
  console.log(`Overall sentiment: ${engagement.summary.overallSentiment}`);
  
  if (engagement.summary.controversialContent.length > 0) {
    console.log('Controversial topics found:', engagement.summary.controversialContent);
  }
  
  return engagement;
}
```

### Rate-Limited Document Generation

```javascript
const { AIDocumentGenerator } = require('./src/generators/ai-document-generator');
const { globalRequestQueue } = require('./src/utils/request-queue');

async function generateMultipleDocuments(discussions) {
  const generator = new AIDocumentGenerator();
  const results = [];
  
  for (const discussion of discussions) {
    // Automatically queued and rate-limited
    const content = await generator.generateDocument('summary', discussion);
    results.push(content);
  }
  
  console.log('Queue status:', globalRequestQueue.getStatus());
  return results;
}
```

This API documentation provides complete reference for integrating with Chroniclr's engagement analysis and rate limiting systems.