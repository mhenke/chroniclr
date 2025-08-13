# Chroniclr - AI-Powered Documentation Automation

> GitHub Actions-driven documentation generation from discussions, issues, PRs, and Jira. Simple setup, zero maintenance, focused on essential project documentation.

## Overview

Chroniclr automates project documentation using GitHub Actions and AI. It processes GitHub discussions, issues, pull requests, and Jira data to generate structured project documentation automatically.

### 🤖 **Simple AI Generation**

- Uses GitHub Models API (GPT-4o) - **no API keys required**
- Processes content from multiple sources
- Template-based generation with AI enhancement
- Fallback to structured templates when AI unavailable

### 📊 **Data Sources**

- **GitHub Discussions** - Community conversations and decisions
- **GitHub Issues** - Bug reports, feature requests, project tracking
- **Pull Requests** - Code changes, releases, technical documentation
- **Jira Integration** - Sprint data, epics, project metrics

### 📚 **Generated Documents**

- Project summaries and meeting notes
- Initiative briefs and technical documentation
- Release notes and changelogs

## Quick Start

### 1. Setup Repository

```bash
# Fork or use this repository as a template
git clone <your-chroniclr-repo>
cd chroniclr

# Install dependencies
npm install
```

### 2. Configure GitHub Secrets (Optional Jira Integration)

For Jira integration, add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

- `JIRA_BASE_URL` (e.g. `https://yourcompany.atlassian.net`)
- `JIRA_USER_EMAIL` (e.g. `bot@yourcompany.com`)
- `JIRA_API_TOKEN` (your Jira API token)

**Note:** No `.env` file needed - everything runs via GitHub Actions with secrets.

### 3. Configure Repository Permissions

The GitHub Actions workflow requires these permissions:

```yaml
permissions:
  contents: write # For creating files and commits
  discussions: read # For reading discussion data
  issues: write # For creating action item issues
  pull-requests: read # For PR analysis
  models: read # For GitHub Models API access
```

### 4. Run Documentation Generation

The system works automatically with GitHub Actions via `chroniclr.yml` workflow:

```bash
# Process specific discussion
gh workflow run chroniclr.yml -f discussion_number=123

# Process specific issues
gh workflow run chroniclr.yml -f issue_numbers=456,789

# Process pull requests
gh workflow run chroniclr.yml -f pr_numbers=101,102

# Include Jira data
gh workflow run chroniclr.yml -f jira_keys=PROJ-123,FEAT-456

# Multi-source processing
gh workflow run chroniclr.yml -f discussion_number=123 -f pr_numbers=456 -f jira_keys=PROJ-789
```

## How It Works

### Simple Pipeline

1. **GitHub Actions** triggers on discussion/PR events or manual dispatch
2. **Content Collection** gathers data from specified sources (discussion, issues, PRs, Jira)
3. **AI Processing** analyzes content using GitHub Models API with template fallbacks
4. **Document Generation** creates structured documentation in organized folders
5. **PR Creation** opens pull request with generated content

### Document Organization

Generated documents are organized in the `generated/` folder using AI-powered topic extraction:
- `generated/2025-01-13-auth-system/` - Authentication-related documentation
- `generated/2025-01-14-mobile-ui/` - Mobile UI improvements  
- `generated/2025-01-15-bug-fixes/` - Bug fixes and patches

### Document Types

- **Summary** - Project overviews and status updates
- **Initiative Brief** - Feature proposals and project plans  
- **Meeting Notes** - Discussion summaries and decisions
- **Changelog** - Release notes and version changes

## Configuration

### Label-Based Document Routing

Discussion labels determine document types via `chroniclr.config.json`:

- `documentation` → Summary + meeting notes
- `initiative` → Initiative brief
- `release` → Changelog
- `planning` → Meeting notes

### Jira Integration (Optional)

Jira integration is handled via GitHub Secrets - no local configuration needed:

- `JIRA_BASE_URL` - Your Atlassian instance URL
- `JIRA_USER_EMAIL` - Bot account email  
- `JIRA_API_TOKEN` - API token for authentication

If secrets are not configured, Jira integration is automatically skipped.

## Architecture Principles

Chroniclr follows these core principles to avoid over-complexity:

### GitHub Actions Only
- No local CLI tools or complex setup
- All processing happens in GitHub Actions
- Simple workflow triggers and manual dispatch

### Keep Solutions Simple  
- Avoid over-engineering and unnecessary abstractions
- Use template-based generation with AI enhancement
- Fallback to structured templates when AI fails
- Minimal dependencies and straightforward data flow

## File Structure

```
chroniclr/
├── .github/workflows/
│   └── chroniclr.yml           # GitHub Actions automation
├── src/
│   ├── generators/
│   │   └── ai-document-generator.js
│   ├── templates/              # Document templates
│   └── utils/                  # Processing utilities
├── docs/                       # Chroniclr project documentation
├── generated/                  # Generated documentation (AI-organized by date/topic)
│   ├── 2025-01-13-auth-system/ # AI-generated topic folders
│   ├── 2025-01-14-mobile-ui/   # Organized by date and content theme
│   ├── 2025-01-15-bug-fixes/   # Scannable and chronological
│   └── README.md               # Organization guide
├── chroniclr.config.json       # System configuration
└── package.json
```

## Debugging

### Common Issues

- **No documents generated**: Check discussion labels and permissions
- **Jira integration fails**: Check GitHub Secrets configuration
- **AI generation errors**: Review GitHub Actions logs
- **Communication not generated**: Verify discussion has appropriate labels

### Test Commands

```bash
# Test discussion processing
npm run validate-discussion

# Test label mapping
npm run process-labels

# Test document and communication generation
npm run generate-document
```

## Features Summary

### 🚀 **Simple Setup**

- Works with GitHub's built-in permissions and Models API
- No external API keys required (except optional Jira)
- GitHub Actions-only operation

### 🤖 **Reliable Generation**

- Template-based generation with AI enhancement
- Automatic fallback when AI unavailable
- Multi-source data processing

### 📋 **Organized Output**

- AI-powered topic extraction for folder organization
- Date-based chronological structure
- Clear document type separation

---

**Transform your GitHub repository into a simple, automated documentation system via GitHub Actions!**
