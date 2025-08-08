# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Chroniclr** is an AI-powered documentation automation system that generates project documentation from GitHub discussions. The system uses GitHub Actions, GitHub Models API (GPT-4o), and JavaScript-based document generation to automatically create summaries, initiative briefs, changelogs, and meeting notes.

## Core Architecture

### AI-Powered Document Generation  
The system processes GitHub discussions (including all comments and reactions) using GitHub's built-in AI models:
- **AI Engine**: GitHub Models API (`https://models.github.ai/inference`) using GPT-4o
- **Authentication**: Built-in `GITHUB_TOKEN` with `models: read` permission  
- **Content Processing**: Analyzes full discussion threads (main post + all comments + emoji reactions)
- **Rate Limiting**: Intelligent retry logic with exponential backoff for 429 errors
- **Community Engagement**: Prioritizes content based on reaction patterns (👍, ❤️, 🚀, 👎)
- **Template System**: Combines AI-generated content with markdown templates

### Label-Based Document Routing
The system maps GitHub discussion labels to document types via `chroniclr.config.json`:
- `documentation` → summary + meeting-notes
- `initiative` → initiative-brief
- `feature` → initiative-brief + summary  
- `release` → changelog
- `planning` → meeting-notes + summary

### Workflow Architecture
Document generation follows this pipeline:
1. **GitHub Actions** triggers on discussion events (created/edited)
2. **Discussion Extraction** fetches discussion + comments via REST API and GraphQL
3. **Label Processing** (`npm run process-labels`) determines document types from labels
4. **AI Generation** (`npm run generate-document`) processes full content with GitHub Models API
5. **PR Creation** automatically creates PRs with branch naming: `docs/chroniclr-{discussion-number}`

### Content Processing Pipeline
The AI document generator (`src/generators/ai-document-generator.js`):
- Fetches discussion main post and all comments via REST API and GraphQL
- **NEW**: Analyzes emoji reactions and engagement patterns (`src/utils/github-reactions.js`)
- **NEW**: Prioritizes content based on community reaction data (👍, ❤️, 🚀, 👎)
- **NEW**: Uses request queue (`src/utils/request-queue.js`) to prevent rate limiting
- **NEW**: Implements exponential backoff retry logic for 429 errors
- Combines all data into comprehensive content for AI analysis with engagement context
- Uses structured prompts to extract stakeholders, action items, decisions, controversial points
- Applies document templates with intelligent fallback only after retry exhaustion
- Enhanced logging with rate limiting and engagement metrics

## Development Commands

```bash
# Install dependencies and setup
npm install                    # Install Node.js dependencies
npm ci                        # Install exact versions from package-lock.json

# Core testing utilities (used by GitHub Actions)
npm run validate-discussion   # Test discussion validation logic
npm run process-labels       # Test label-to-document-type mapping  
npm run generate-document    # Test AI document generation (requires env vars)
npm run create-action-items  # Test action item parsing and GitHub issue creation

# Run tests (if available)
npm test                      # Run Jest test suite

# Manual workflow testing
gh workflow run chroniclr.yml -f discussion_number=123

# Test locally with environment variables (now includes reaction analysis)
DOC_TYPE=summary \
DISCUSSION_NUMBER=123 \
DISCUSSION_TITLE="Test Discussion" \
DISCUSSION_BODY="Discussion content with comments..." \
DISCUSSION_AUTHOR="username" \
DISCUSSION_URL="https://github.com/owner/repo/discussions/123" \
GITHUB_REPOSITORY="owner/repo" \
GITHUB_TOKEN="your_token" \
npm run generate-document

# Test individual components
node -e "
const { GitHubReactionsClient } = require('./src/utils/github-reactions');
const client = new GitHubReactionsClient();
client.getDiscussionEngagementData('owner', 'repo', 123).then(console.log);
"

# Test rate limiting queue
node -e "
const { globalRequestQueue } = require('./src/utils/request-queue');
console.log('Queue status:', globalRequestQueue.getStatus());
"
```

## GitHub Actions Integration

### Required Permissions
The workflow requires these permissions in `.github/workflows/chroniclr.yml`:
```yaml
permissions:
  contents: write      # For creating files and commits
  discussions: read    # For reading discussion data
  pull-requests: write # For creating PRs
  issues: write       # For managing labels
  models: read        # For GitHub Models API access
```

### Workflow Steps
1. **Discussion Extraction**: Fetches discussion details + comments via REST API and GraphQL
2. **Validation**: (`npm run validate-discussion`) ensures discussion has required fields
3. **Label Processing**: (`npm run process-labels`) maps labels to document types
4. **AI Generation**: (`npm run generate-document`) processes content with GitHub Models API
5. **Action Item Processing**: (`npm run create-action-items`) parses action items and creates assigned GitHub issues
6. **PR Creation**: Uses `peter-evans/create-pull-request` with branch naming `docs/chroniclr-{discussion-number}`

### Generated Output
- **Documentation**: Files saved to `docs/{doc-type}-{discussion-number}.md`
- **GitHub Issues**: Automatically created for action items with proper assignment and due dates
- **Pull Requests**: Automatic PR creation with labels: `documentation`, `automated`, `chroniclr`
- **Branch naming**: Pattern `docs/chroniclr-{discussion-number}`
- **Issue Labels**: `action-item`, `chroniclr-generated`, `priority-high/medium/low` based on due dates

## Template Development

Templates in `src/templates/` use `{variableName}` syntax for AI variable substitution:

### Template Structure
- **Headers**: Use `# {title}` for main title
- **Metadata**: Include `{date}`, `{discussionNumber}`, `{participants}`
- **Content Sections**: `{objectives}`, `{actionItems}`, `{decisions}`, etc.
- **Footer**: Always include generation metadata

### Built-in Templates
- `summary.md`: Project overviews, objectives, current status
- `summary-enhanced.md`: **NEW** - Includes community engagement metrics and reaction analysis
- `initiative-brief.md`: Problem statements, solutions, timelines  
- `meeting-notes.md`: Agendas, decisions, action items
- `changelog.md`: Version history, features, fixes

### Fallback Generation
If AI processing fails, the generator uses templates with `[AI processing unavailable]` placeholders for complex variables while still populating basic fields like `{title}` and `{discussionNumber}`.

## Adding New Document Types

1. **Create template** in `src/templates/{type}.md` using `{variable}` syntax
2. **Update label mapping** in `chroniclr.config.json` under `github.discussionLabels`
3. **Add template path** to `documents.templates` section in `chroniclr.config.json`
4. **Test locally** using environment variables:
   ```bash
   DOC_TYPE={type} DISCUSSION_NUMBER=123 npm run generate-document
   ```
5. **Update workflow** if new permissions or processing logic needed

## Key Files and Architecture

### Core Processing Files
- `src/generators/ai-document-generator.js`: Main AI processing logic using GitHub Models API with rate limiting
- `src/utils/github-reactions.js`: **NEW** - Community engagement analysis via GraphQL reactions API
- `src/utils/request-queue.js`: **NEW** - API rate limiting and request queue management
- `src/utils/validate-discussion.js`: Validates required discussion fields
- `src/utils/process-labels.js`: Maps discussion labels to document types
- `chroniclr.config.json`: Central configuration for label mappings and templates

### GitHub Actions Workflow
- `.github/workflows/chroniclr.yml`: Complete automation pipeline
- Processes discussion events (created/edited) automatically
- Fetches discussion + comments, generates docs, creates PRs

### Content Processing
The system processes full discussion threads (main post + all comments) for comprehensive document generation. Comments are formatted as:
```
--- DISCUSSION COMMENTS ---

**Comment 1 by @username (timestamp):**
[comment content]
```

## Action Item Processing

Chroniclr automatically detects action items in discussions and creates assigned GitHub issues.

### Supported Action Item Formats
- `- [ ] @username: Task description (Due: Aug 10)`
- `- [ ] Task description @username (Due: Aug 15)`  
- `- @assignee: Description (Due: date)` (in Action Items sections)

### GitHub Issue Creation
- **Automatic Assignment**: Issues assigned to mentioned users (if they exist)
- **Priority Labels**: Based on due dates (high: ≤3 days, medium: ≤7 days, low: >7 days)
- **Standard Labels**: `action-item`, `chroniclr-generated`, `needs-triage`
- **Issue Title**: `[Action Item] {description}`
- **Issue Body**: Includes source discussion link, due date, and context

### Action Item Processing Pipeline
1. **Parsing**: Extract action items from discussion content using regex patterns
2. **Validation**: Check if assignee username exists and has repo access
3. **Issue Creation**: Create GitHub issue with proper labels and assignment
4. **Summary**: Report created issues in workflow logs and PR description

## Debugging Common Issues

### AI Generation Failures
- Check GitHub Actions logs for API endpoint errors
- Verify `models: read` permission is set in workflow
- AI falls back to structured templates if generation fails
- Look for "AI processing unavailable" in generated documents

### Workflow Failures  
- **Missing discussion data**: Check GraphQL/REST API access
- **Label processing errors**: Verify `chroniclr.config.json` syntax
- **Permission issues**: Ensure all required permissions are set
- **Rate limiting**: GitHub API limits are now automatically handled with retry logic
  - Look for: "Rate limit hit. Waiting Xms before retry Y/3..."
  - System uses exponential backoff: 1s → 2s → 4s delays
  - Only falls back to templates after 3 retry attempts

### Document Output Issues
- Generated files appear in `docs/` directory
- Missing labels default to "summary" document type  
- Check PR creation logs if documents aren't appearing in PRs

### Community Engagement Issues
- **No reaction data**: Check if GraphQL API permissions include discussions
- **Empty engagement metrics**: Discussion may have no reactions/comments
- **Authentication errors**: Ensure GITHUB_TOKEN has proper scopes
- **Missing engagement sections**: Use `summary-enhanced.md` template for engagement features

### Rate Limiting Debug Logs
```
# Successful rate limit handling:
"Making AI API request... (attempt 1/4)"
"Queue status: 0 pending, 1 active"
"Rate limit hit. Waiting 1000ms before retry 1/3..."
"Making AI API request... (attempt 2/4)"
"AI response received successfully"

# Fallback only after retries exhausted:
"Rate limit hit. Waiting 4000ms before retry 3/3..."
"All 4 attempts failed. Using fallback document generation."
```