# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Chroniclr** is a GitHub Actions-driven documentation automation system that processes multiple data sources (GitHub discussions, issues, PRs, and Jira) to generate comprehensive project documentation using AI. The system is designed for zero-maintenance operation through GitHub's built-in automation capabilities.

## Core Architecture

### Multi-Source Data Processing Pipeline
The system operates through a sophisticated pipeline that processes different data sources independently or in combination:

1. **Configuration Loading** (`src/utils/config-loader.js`) - Supports both workflow parameters and YAML/JSON config files
2. **Discovery Engine** (`src/utils/discovery-engine.js`) - 4-phase discovery process with cross-platform correlation  
3. **AI Document Generation** (`src/generators/ai-document-generator.js`) - Uses GitHub Models API with rate limiting
4. **Output Management** (`src/utils/output-manager.js`) - AI-generated folder organization with session tracking
5. **Action Item Processing** (`src/utils/issue-creator.js`) - Automatic GitHub issue creation

### Data Source Architecture

**Primary Sources:**
- `discussion` - GitHub Discussions (main post + comments + community engagement)
- `issues` - GitHub Issues with milestone/label correlation
- `pr` - Pull Requests with JIRA key extraction and file analysis  
- `jira` - Jira integration via `.env` configuration

**Discovery Strategy System:**
Each data source implements multiple discovery strategies with confidence scoring:
- **PR Client** (`src/utils/pr-client.js`) - 6 strategies including branch analysis, commit scanning
- **Issues Client** (`src/utils/issues-client.js`) - 7 strategies including label matching, assignee correlation
- **Discovery Engine** orchestrates cross-platform correlation between all sources

## Development Commands

### Core Testing (Required for GitHub Actions)
```bash
# Install dependencies
npm install

# Test core workflow components
npm run validate-discussion   # Validates discussion data format
npm run process-labels       # Tests label-to-document-type mapping
npm run generate-document    # Tests AI document generation (requires env vars)
npm run create-action-items  # Tests action item extraction and GitHub issue creation
```

### Discovery System Testing
```bash
# Test individual discovery engines
npm run test-pr-discovery      # Tests PR discovery strategies (6 strategies)
npm run test-issues-discovery  # Tests GitHub Issues discovery (7 strategies)
npm run test-discovery-engine  # Tests unified discovery orchestration

# Test production infrastructure
npm run test-rate-limiter      # Tests rate limiting and request queuing
npm run generate-config        # Generates sample YAML/JSON configuration files
npm run list-sessions          # Views output session history and metadata
```

### Workflow Testing
```bash
# Single source processing
gh workflow run chroniclr.yml -f discussion_number=123 -f source=discussion
gh workflow run chroniclr.yml -f issue_numbers=456,789 -f source=issues
gh workflow run chroniclr.yml -f pr_numbers=101,102 -f source=pr
gh workflow run chroniclr.yml -f jira_keys=PROJ-123,FEAT-456 -f source=jira

# Multi-source processing with discovery
gh workflow run chroniclr.yml -f source=jira,pr -f discovery_keywords=auth,security
gh workflow run chroniclr.yml -f config_file=.chroniclr/config.yml
```

## Environment Configuration

### .env File Structure
Required for Jira integration:
```bash
JIRA_BASE_URL=https://company.atlassian.net
JIRA_USER_EMAIL=bot@company.com
JIRA_API_TOKEN=your-jira-token
JIRA_PROJECT=PROJ
```

### GitHub Actions Workflow Parameters
The workflow supports extensive parameterization:
- **source** - Comma-separated data sources (discussion,issues,pr,jira)
- **discussion_number** - Required only if source includes 'discussion'
- **pr_numbers/jira_keys/issue_numbers** - Specific items to process
- **discovery_keywords** - Keywords for cross-source discovery
- **config_file** - Path to YAML/JSON configuration (overrides individual parameters)
- **discovery_scope** - Scope for automated searches (recent/sprint/milestone/all)
- **dry_run** - Preview mode without generating documents

## Core Architecture Components

### AI Document Generation Pipeline
The AI generator (`src/generators/ai-document-generator.js`) implements:
- **GitHub Models API Integration** using GPT-4o (no external API keys required)
- **Request Queue Management** with exponential backoff retry logic
- **Template Variable Substitution** with fallback to structured content
- **Rate Limit Handling** with automatic retry and queue management

### Discovery Engine Architecture
The discovery system (`src/utils/discovery-engine.js`) orchestrates:
- **4-Phase Discovery Process**: Identifier → Keyword → Cross-reference → Semantic correlation
- **Confidence Scoring System** ranking discovered items by relevance (0.0-1.0)
- **Cross-Platform Correlation** automatically linking related content across GitHub and Jira
- **Session Management** with detailed discovery reporting and metadata tracking

### Output Management System  
The output manager (`src/utils/output-manager.js`) provides:
- **AI-Generated Folder Names** using GPT-4o for contextual naming based on content
- **Session-Based Organization** in `_output/` directory with metadata tracking
- **File Deduplication** and conflict resolution for document updates
- **Session History** management in `.chroniclr/sessions/`

### Template System Architecture
Templates in `src/templates/` use `{variableName}` syntax with enhanced discovery variables:
- **Core Variables**: `{title}`, `{date}`, `{participants}`, `{actionItems}`
- **Discovery Variables**: `{discoveredContent}`, `{correlatedItems}`, `{crossPlatformLinks}`
- **Multi-Source Variables**: `{githubIssues}`, `{pullRequests}`, `{jiraItems}`, `{semanticConnections}`

## Configuration Architecture

### Multi-Level Configuration System
1. **Workflow Parameters** - Direct GitHub Actions inputs
2. **Configuration Files** - YAML/JSON files in `.chroniclr/` directory  
3. **Environment Variables** - `.env` file for credentials
4. **System Configuration** - `chroniclr.config.json` for label mappings and templates

### Label-Based Document Routing
The system maps discussion labels to document types via `chroniclr.config.json`:
```json
{
  "github": {
    "discussionLabels": {
      "documentation": ["summary", "meeting-notes"],
      "initiative": ["initiative-brief"],
      "pr-summary": ["pr-summary"],
      "pr-impact": ["pr-change-impact-assessment"]
    }
  }
}
```

## Key Implementation Patterns

### Modular Source Processing
Each data source operates independently with graceful degradation:
- **Module Enable/Disable Logic** based on runtime parameters
- **Independent Error Handling** - failures in one source don't affect others
- **Cross-Module Correlation** when multiple sources are processed together

### Production Infrastructure Patterns
- **Rate Limiting Strategy**: Request queuing with exponential backoff and jitter
- **Retry Logic**: 3 automatic retries before fallback to structured templates
- **Error Recovery**: Partial failure handling with detailed reporting
- **Session Management**: AI-powered organization with metadata tracking

### GitHub Actions Integration Patterns
The workflow implements sophisticated orchestration:
- **Dynamic Parameter Processing** with validation and fallback logic
- **Multi-Step Discovery Phase** with cross-platform correlation
- **Intelligent Output Organization** with AI-generated folder structures  
- **Comprehensive Reporting** in PR descriptions and GitHub Actions summaries

## Development Guidelines

### GitHub Actions First Architecture
- All functionality must operate in GitHub Actions environment
- No local CLI dependencies or complex development setup
- Environment variables managed through `.env` and GitHub secrets
- Focus on workflow dispatch and automatic triggers

### AI Processing Reliability
- Always implement fallback to structured templates if AI processing fails
- Use request queuing to prevent rate limiting violations
- Implement comprehensive retry logic with exponential backoff
- Log detailed information for debugging in GitHub Actions logs

### Multi-Source Data Handling
- Design components to work with individual or combined data sources
- Implement confidence scoring for discovered content
- Use cross-platform correlation to link related items
- Support both manual specification and automated discovery of content

### Output Organization Strategy  
- **Organized by Source**: Generated documents are organized in `generated/` folder by data source
  - `generated/discussions/` - Discussion-based documents
  - `generated/prs/` - Pull request analysis documents
  - `generated/issues/` - GitHub Issues reports
  - `generated/jira/` - Jira integration reports
  - `generated/multi-source/` - Cross-platform correlation reports
- **Clear Separation**: Project documentation stays in `docs/`, generated content in `generated/`
- **Logical File Naming**: Documents named based on source IDs (e.g., `summary-123.md`, `pr-456-789.md`)

This architecture enables Chroniclr to operate as a comprehensive project intelligence system while maintaining simplicity for end users who only need to configure basic GitHub Actions workflow parameters.