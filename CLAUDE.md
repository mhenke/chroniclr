# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Chroniclr** is an AI-powered documentation and communication automation system that generates project documentation and stakeholder communications from GitHub discussions, issues, pull requests, and Jira. The system operates **exclusively through GitHub Actions** with AI-powered generation using GitHub Models API.

## Core Principles

**Keep Solutions Simple**
- This project operates ONLY through GitHub Actions - no CLI tools, no local execution
- Avoid over-complexity and over-engineering at all costs  
- Use GitHub Secrets for all configuration (no .env files in production)
- Focus on essential functionality only
- Prefer simple, direct implementations over abstract frameworks

## Core Architecture

### Multi-Source Data Processing
The system processes 4 data sources:
- `discussion` - GitHub Discussions (default source)
- `issues` - GitHub Issues with labels and milestones
- `pr` - Pull Requests with file analysis and Jira key extraction  
- `jira` - Jira integration via GitHub Secrets

### AI-Powered Document & Communication Generation
- **GitHub Models API** (GPT-4o) for content generation - no external API keys required
- **Simple API clients** for data fetching (no complex discovery engines)
- **Template-based generation** with AI enhancement for documentation and communications
- **Request queuing** with retry logic for reliability
- **Stakeholder communications** for releases, updates, and notifications

### AI-Powered Output Organization  
Generated documents are organized in `generated/` folder with AI-generated date-topic structure:
- Format: `YYYY-MM-DD-topic` (e.g., `2025-01-13-database-performance`)
- **AI topic generation** analyzes content to create specific 1-3 word topics
- **Automatic versioning** for same-day conflicts (e.g., `-2`, `-3`)
- **Content-based topics** not source-based (auth-system, mobile-ui, bug-fixes)

## Development Commands

```bash
# Node.js utilities (used by GitHub Actions)
npm install                    # Install dependencies
npm run validate-discussion    # Test discussion validation
npm run process-labels        # Test label-to-document-type mapping
npm run generate-document     # Test document and communication generation (requires env vars)

# Test GitHub Actions workflow
gh workflow run chroniclr.yml -f discussion_number=123
gh workflow run chroniclr.yml -f issue_numbers=456,789  
gh workflow run chroniclr.yml -f pr_numbers=101,102
gh workflow run chroniclr.yml -f jira_keys=PROJ-123,FEAT-456

# Multi-source processing
gh workflow run chroniclr.yml -f discussion_number=123 -f pr_numbers=456 -f jira_keys=PROJ-789
```

## GitHub Actions Integration

The workflow in `.github/workflows/chroniclr.yml` expects these secrets:
- `GITHUB_TOKEN` (auto-provided)
- `JIRA_BASE_URL`, `JIRA_USER_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT` (optional, for Jira integration)

### Simple Workflow Architecture
1. **Validation** - Ensure required parameters are provided
2. **Data Collection** - Simple API clients fetch data from specified sources  
3. **AI Generation** - GitHub Models API generates documents and communications using templates
4. **AI Organization** - Content analyzed to generate topic-based folder structure
5. **PR Creation** - Documents committed with branch naming `docs/chroniclr-{run-number}`

Generated files follow pattern: `docs/{doc-type}-{source-id}.md` in AI-organized folders

## File Structure (Simplified)

```
chroniclr/
├── .github/workflows/
│   └── chroniclr.yml           # GitHub Actions automation
├── src/
│   ├── generators/
│   │   └── ai-document-generator.js  # Main AI generation logic
│   ├── templates/              # Document templates  
│   └── utils/                  # Simple API clients
│       ├── pr-client.js        # GitHub PR API client
│       ├── issues-client.js    # GitHub Issues API client  
│       ├── jira-client.js      # Jira API client
│       └── request-queue.js    # Rate limiting
├── docs/                       # Chroniclr project documentation
├── generated/                  # AI-organized generated documentation  
│   ├── 2025-01-13-auth-system/ # AI topic folders
│   ├── 2025-01-14-mobile-ui/
│   └── README.md               # Organization guide
├── chroniclr.config.json       # Label mappings
└── package.json               # 4 essential npm scripts only
```

## Template Development

When modifying templates in `src/templates/`:
1. Maintain the variable naming convention `{variableName}`
2. Include generation metadata footer with discussion number
3. Test variable substitution with the document-generator
4. Keep templates simple - avoid complex logic

## Adding New Document Types

1. **Create template** in `src/templates/{type}.md` using `{variable}` syntax
2. **Update label mapping** in `chroniclr.config.json` 
3. **Test locally** with GitHub Actions workflow
4. Keep implementation simple - no complex abstractions

## Debugging

### GitHub Actions Issues  
- Check GitHub Actions logs for detailed error information
- Verify GitHub Secrets are configured correctly
- Ensure discussion/PR/issue numbers are valid
- Check API rate limits and retry logic

### Document Generation Issues
- AI generation failures fall back to structured templates automatically
- Missing labels default to "summary" document type
- File conflicts are handled with automatic versioning
- All errors logged in GitHub Actions output

## Key Implementation Guidelines

**Simplicity First**
- No complex discovery engines or abstract frameworks
- Direct API calls with simple error handling
- Minimal configuration - use GitHub Secrets
- Focus on GitHub Actions automation only

**AI Enhancement**  
- Use AI to improve content quality, not create complexity
- Always provide fallback to structured templates
- AI-powered folder organization for better UX
- Smart topic generation from content analysis

**Production Ready**
- Rate limiting with request queuing
- Comprehensive retry logic with exponential backoff  
- Graceful error handling and logging
- GitHub Actions native integration

Remember: If you find yourself adding complexity, step back and find the simpler solution that works within GitHub Actions.