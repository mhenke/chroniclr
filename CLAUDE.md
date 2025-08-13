# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Chroniclr** is a comprehensive AI-powered project intelligence system with enhanced discovery capabilities that generates documentation from multiple data sources: GitHub discussions, issues, pull requests, and Jira. The system features a sophisticated discovery engine, intelligent output management, and production-ready infrastructure for enterprise-scale project intelligence.

## Core Architecture

### Modular Data Source System
Chroniclr operates as a modular system where data sources can be selected at runtime. The system has two core functions (AI processing and cross-platform correlation) that operate on the selected data sources:

**Data Sources:**
- `discussion` - GitHub discussion content, comments, and community engagement analysis
- `issues` - GitHub Issues discovery, tracking, and correlation across milestones and labels
- `jira` - Jira project data (sprints, epics, issues, metrics) with multi-strategy discovery
- `pr` - Pull request analysis, file change impact assessment, and JIRA key extraction

**Core Functions (always available):**
- **Enhanced Discovery Engine** - 20+ discovery strategies across all data sources with confidence scoring
- **AI Processing** - Uses GitHub Models API (GPT-4o) with sophisticated rate limiting and request queuing
- **Cross-Platform Correlation** - Automatically discovers and links related artifacts across all data sources
- **Intelligent Output Management** - AI-generated folder organization with session-based tracking

**Runtime Source Selection with Discovery:**
```bash
# Single source with specific IDs
gh workflow run chroniclr.yml -f discussion_number=123 -f source=discussion
gh workflow run chroniclr.yml -f issue_numbers=456,789 -f source=issues
gh workflow run chroniclr.yml -f jira_keys=PROJ-123,FEAT-456 -f source=jira
gh workflow run chroniclr.yml -f pr_numbers=101,102 -f source=pr

# Multi-source discovery with keywords
gh workflow run chroniclr.yml -f discovery_keywords=auth,security,mobile -f source=jira,pr,issues

# Configuration file approach (recommended)
gh workflow run chroniclr.yml -f config_file=.chroniclr/config.yml

# All sources with discovery
gh workflow run chroniclr.yml -f source=discussion,jira,pr,issues -f discovery_keywords=performance
```

### Enhanced Discovery Engine Architecture
The discovery engine is the core innovation of Chroniclr, providing comprehensive content discovery across all data sources:

**Discovery Orchestration (`src/utils/discovery-engine.js`):**
- **4-Phase Discovery Process**: Identifier → Keyword → Cross-reference → Semantic correlation
- **Confidence Scoring**: All discovered items ranked by relevance and confidence (0.0-1.0)
- **Cross-Platform Correlation**: Automatically links related content across GitHub and Jira
- **Session Management**: Tracks discovery sessions with detailed reporting

**Per-Source Discovery Strategies:**
- **GitHub Issues** (`src/utils/issues-client.js`): 7 strategies including label matching, milestone tracking, assignee correlation
- **Pull Requests** (`src/utils/pr-client.js`): 6 strategies including JIRA key extraction, branch analysis, commit scanning
- **Jira Integration** (`src/utils/jira-client.js`): Multi-strategy discovery with project correlation
- **Discussions**: Enhanced search with participant and reaction analysis

### AI-Powered Document Generation  
- **AI Engine**: GitHub Models API (`https://models.github.ai/inference`) using GPT-4o
- **Discovery-Enhanced Processing**: Incorporates discovered content from all sources
- **Community Engagement**: Prioritizes content based on emoji reaction patterns
- **Production Infrastructure**: Request queuing, exponential backoff, partial failure handling
- **Intelligent Output**: AI-generated folder names with session-based organization
- **Template System**: Enhanced templates with discovery variables and cross-platform correlation

### Document Type Generation by Source
Different data sources generate different document types:

**Discussion Source (`source=discussion`):**
- Maps labels to document types: `documentation` → summary, `initiative` → initiative-brief
- Uses traditional discussion + comments processing with community engagement analysis

**Jira Source (`source=jira`):**
- `sprint-report` - Current sprint status, velocity, team workload
- `epic-summary` - Epic completion, user stories, progress tracking  
- `project-dashboard` - Executive project health, metrics, risk assessment

**Pull Request Source (`source=pr`):**
- `release-notes` - Automated release documentation from merged PRs
- `change-impact-report` - Technical change analysis, testing recommendations

**Multi-Source Correlation (automatic when using multiple sources):**
- `feature-completion` - End-to-end feature tracking (Discussion → Jira → PR → Delivery)
- Cross-references and timeline generation across platforms

### Modular Processing Pipeline
1. **Runtime Source Selection** - Parse `source` parameter from workflow input
2. **Data Source Initialization** - Enable only requested modules (`ModularController`)
3. **Multi-Source Data Gathering** - Fetch data from enabled sources (GitHub, Jira, PR APIs)
4. **Cross-Platform Correlation** - Link related artifacts across platforms when enabled
5. **AI Document Generation** - Process combined data with source-specific templates
6. **Independent Processing** - Each source operates independently with graceful degradation

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

### Core Testing
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
```

### Discovery System Testing
```bash
# Test individual discovery engines
npm run test-pr-discovery      # Test PR discovery strategies (6 strategies)
npm run test-issues-discovery  # Test GitHub Issues discovery (7 strategies)
npm run test-discovery-engine  # Test unified discovery orchestration

# Test production infrastructure
npm run test-rate-limiter      # Test rate limiting and request queuing
npm run generate-config        # Generate sample configuration files (YAML/JSON)
npm run list-sessions          # View output session history and metadata
npm run update-document        # Test document update system with conflict resolution
```

### Multi-Source Workflow Testing
```bash
# Single source testing with specific IDs
gh workflow run chroniclr.yml -f discussion_number=123 -f source=discussion
gh workflow run chroniclr.yml -f issue_numbers=456,789 -f source=issues
gh workflow run chroniclr.yml -f pr_numbers=101,102 -f source=pr
gh workflow run chroniclr.yml -f jira_keys=PROJ-123,FEAT-456 -f source=jira

# Multi-source discovery testing
gh workflow run chroniclr.yml -f source=jira,pr -f discovery_keywords=auth,security
gh workflow run chroniclr.yml -f source=discussion,issues,pr -f discovery_keywords=performance

# Configuration file approach (recommended for complex scenarios)
gh workflow run chroniclr.yml -f config_file=.chroniclr/config.yml
```

### Local Testing with Environment Variables
```bash
# Test discovery with specific sources
SOURCE_MODULES=jira,pr \
DISCOVERY_KEYWORDS=security,auth \
JIRA_KEYS=PROJ-123,FEAT-456 \
PR_NUMBERS=789,101 \
npm run test-discovery-engine

# Test with configuration file
CONFIG_FILE=.chroniclr/config.yml \
npm run generate-document

# Test traditional document generation (legacy)
DOC_TYPE=sprint-report \
DISCUSSION_NUMBER=123 \
JIRA_BASE_URL="https://company.atlassian.net" \
JIRA_API_TOKEN="token" \
JIRA_USER_EMAIL="bot@company.com" \
npm run generate-document
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

**Discussion-Source Templates:**
- `summary.md`: Project overviews, objectives, current status
- `initiative-brief.md`: Problem statements, solutions, timelines  
- `meeting-notes.md`: Agendas, decisions, action items
- `changelog.md`: Version history, features, fixes

**Jira-Source Templates:**
- `sprint-report.md`: Sprint metrics, velocity, team capacity, completion status
- `epic-summary.md`: Epic progress, user stories, timeline, stakeholder communication
- `project-dashboard.md`: Executive summary, project health, risk assessment
- `release-notes.md`: Release documentation with story points and delivery metrics

**PR-Source Templates:**
- `change-impact-report.md`: Technical change analysis, risk assessment, testing needs

**Multi-Source Templates (correlation):**
- `feature-completion.md`: Cross-platform correlation tracking (Discussion → Jira → PR)

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

**Main Controllers:**
- `src/utils/modular-controller.js`: Central orchestrator for all modules and data sources
- `src/utils/module-runner.js`: Independent module testing and execution utility

**Data Source Clients:**
- `src/generators/ai-document-generator.js`: Multi-source AI document generation with rate limiting
- `src/utils/pr-client.js`: Pull request analysis, file change detection, release note generation
- `src/utils/jira-client.js`: Jira project data extraction with comprehensive API access
- `src/utils/cross-platform-correlator.js`: Links discussions, Jira issues, and PRs intelligently

**Analysis Engines:**
- `src/utils/file-analyzer.js`: Code change impact analysis, risk assessment, testing recommendations
- `src/utils/github-reactions.js`: Community engagement analysis via GraphQL reactions API
- `src/utils/jira-query-builder.js`: JQL template system for different reporting scenarios

**Infrastructure:**
- `src/utils/request-queue.js`: API rate limiting and request queue management
- `src/utils/issue-creator.js`: Enhanced action item processing with deduplication and lifecycle management
- `chroniclr.config.json`: Modular configuration system with per-module settings

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