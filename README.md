# Chroniclr - AI-Powered Documentation & Communication Automation

> GitHub Actions-driven documentation and stakeholder communication generation from discussions, issues, PRs, and Jira. Simple setup, zero maintenance, focused on essential project communication.

## Overview

Chroniclr automates project documentation and stakeholder communications using GitHub Actions and AI. It processes GitHub discussions, issues, pull requests, and Jira data to generate comprehensive project documentation and communication materials automatically.

### 🤖 **AI-Powered Generation**

- Uses GitHub Models API (GPT-4o) - **no API keys required**
- Processes full threads and cross-references related content
- Smart content prioritization based on engagement
- Automatic action item extraction and GitHub issue creation

### 📊 **Data Sources**

- **GitHub Discussions** - Community conversations and decisions
- **GitHub Issues** - Bug reports, feature requests, project tracking
- **Pull Requests** - Code changes, releases, technical documentation
- **Jira Integration** - Sprint data, epics, project metrics

### 📚 **Generated Documents & Communications**

- Project summaries and meeting notes
- Initiative briefs and technical documentation
- Release notes and change impact assessments
- Stakeholder communications and team notifications
- Release communications and status updates

## Quick Start

### 1. Setup Repository

```bash
# Fork or use this repository as a template
git clone <your-chroniclr-repo>
cd chroniclr

# Install dependencies
npm install
```

### 2. (Optional) Configure Jira Environment Variables

If you want to enable Jira integration, create or update a `.env` file with the following:

```bash
# Only required for Jira integration
JIRA_BASE_URL=https://yourcompany.atlassian.net
JIRA_USER_EMAIL=bot@yourcompany.com
JIRA_API_TOKEN=your-jira-token
JIRA_PROJECT=PROJ
```

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

The system works automatically with GitHub Actions. The main workflow file is `update-docs.yml`:

```bash
# Process specific discussion
gh workflow run update-docs.yml -f discussion_number=123

# Process specific issues
gh workflow run update-docs.yml -f issue_numbers=456,789

# Process pull requests
gh workflow run update-docs.yml -f pr_numbers=101,102

# Include Jira data
gh workflow run update-docs.yml -f jira_keys=PROJ-123,FEAT-456

# Multi-source processing
gh workflow run update-docs.yml -f discussion_number=123 -f pr_numbers=456 -f jira_keys=PROJ-789
```

## How It Works

### Automated Pipeline

1. **GitHub Actions** triggers on discussion/PR events or manual dispatch
2. **Content Collection** gathers data from specified sources
3. **AI Processing** analyzes content using GitHub Models API
4. **Document Generation** creates structured documentation
5. **Action Item Processing** creates GitHub issues for tasks
6. **PR Creation** opens pull request with generated content

### Document Types by Source

- **Discussions**: Project summaries, initiative briefs, meeting notes
- **Issues**: Bug analysis, feature tracking, milestone reports
- **Pull Requests**: Release notes, change impact assessments
- **Jira**: Sprint reports, epic summaries, project dashboards
- **Multi-Source**: Cross-platform correlation and comprehensive intelligence

## Configuration

### Label-Based Document Routing

Discussion labels determine document types via `chroniclr.config.json`:

- `documentation` → Summary + meeting notes
- `initiative` → Initiative brief
- `release` → Changelog
- `planning` → Meeting notes

### Jira Integration (Optional)

To enable Jira integration, add the following secrets to your GitHub repository (Settings → Secrets and variables → Actions):

- `JIRA_BASE_URL` (e.g. `https://yourcompany.atlassian.net`)
- `JIRA_USER_EMAIL` (e.g. `bot@yourcompany.com`)
- `JIRA_API_TOKEN` (your Jira API token)
- `JIRA_PROJECT` (your Jira project key, e.g. `PROJ`)

If these secrets are not set, Chroniclr will skip Jira integration automatically. No changes to the workflow are needed—just add or remove the secrets as needed.

**What Jira integration enables:**

- Sprint reports, epic summaries, and project dashboards from Jira
- Cross-referenced documentation with GitHub issues, PRs, and discussions

**Note:** You do not need a `.env` file for production; all configuration should be done via GitHub Actions secrets.

## Communication Types

Chroniclr generates various types of communications based on discussion labels:

### Available Communication Types

- **release-communication** - Stakeholder notifications for releases
- **stakeholder-update** - Progress updates for project stakeholders
- **team-notification** - Team-specific announcements and updates
- **meeting-notes** - Structured meeting summaries
- **initiative-brief** - Project initiative documentation

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

### 🚀 **Zero Configuration**

- Works with GitHub's built-in permissions and Models API
- No external API keys required (except optional Jira)
- Automatic setup with minimal configuration

### 🤖 **AI-Powered Intelligence**

- Full content analysis across all sources
- Smart communication generation for different stakeholder groups
- Cross-platform correlation and relationship detection

### 📋 **Production Ready**

- Robust error handling and retry logic
- Rate limiting and API compliance
- Comprehensive logging and monitoring

---

**Transform your GitHub repository into a comprehensive documentation and communication system with zero maintenance required!**
