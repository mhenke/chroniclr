# Chroniclr - AI-Powered Documentation Automation

> GitHub Actions-driven documentation generation from discussions, issues, PRs, and Jira. Simple setup, zero maintenance, comprehensive project intelligence.

## Overview

Chroniclr automates project documentation using GitHub Actions and AI. It processes GitHub discussions, issues, pull requests, and Jira data to generate comprehensive project documentation automatically.

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

### 📚 **Generated Documents**
- Project summaries and meeting notes
- Initiative briefs and technical documentation
- Release notes and change impact assessments
- Cross-platform correlation reports

## Quick Start

### 1. Setup Repository

```bash
# Fork or use this repository as a template
git clone <your-chroniclr-repo>
cd chroniclr

# Install dependencies
npm install
```

### 2. Configure Environment Variables

Create or update `.env` file:
```bash
# For Jira integration (optional)
JIRA_BASE_URL=https://yourcompany.atlassian.net
JIRA_USER_EMAIL=bot@yourcompany.com
JIRA_API_TOKEN=your-jira-token
JIRA_PROJECT=PROJ
```

### 3. Configure Repository Permissions

The GitHub Actions workflow requires these permissions:
```yaml
permissions:
  contents: write      # For creating files and commits
  discussions: read    # For reading discussion data
  issues: write        # For creating action item issues
  pull-requests: read  # For PR analysis
  models: read         # For GitHub Models API access
```

### 4. Run Documentation Generation

The system works automatically with GitHub Actions:

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

### Jira Integration
Configure Jira settings in `.env`:
- Set `JIRA_BASE_URL`, `JIRA_USER_EMAIL`, `JIRA_API_TOKEN`
- Update `JIRA_PROJECT` for your project key
- System will automatically discover related Jira items

## Action Item Management

Chroniclr automatically creates GitHub issues for action items found in any source:

### Supported Formats
```markdown
- [ ] @username: Task description (Due: Aug 10)
- [ ] Complete API documentation @developer (Due: Aug 15)
- @assignee: Review security implementation (Due: Aug 20)
```

### Automatic Issue Creation
- ✅ Creates GitHub issues with descriptive titles
- 👤 Assigns to mentioned users
- 🏷️ Applies priority labels based on due dates
- 🔗 Links back to source content

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
├── generated/                  # Generated documentation (organized by source)
│   ├── discussions/            # Discussion-based documents
│   ├── prs/                   # Pull request analysis
│   ├── issues/                # GitHub Issues reports  
│   ├── jira/                  # Jira integration reports
│   └── multi-source/          # Cross-platform reports
├── chroniclr.config.json       # System configuration
└── package.json
```

## Debugging

### Common Issues
- **No documents generated**: Check discussion labels and permissions
- **Action items not created**: Verify issue creation permissions
- **Jira integration fails**: Check `.env` file configuration
- **AI generation errors**: Review GitHub Actions logs

### Test Commands
```bash
# Test discussion processing
npm run validate-discussion

# Test label mapping
npm run process-labels

# Test action item processing  
npm run create-action-items
```

## Features Summary

### 🚀 **Zero Configuration**
- Works with GitHub's built-in permissions and Models API
- No external API keys required (except optional Jira)
- Automatic setup with minimal configuration

### 🤖 **AI-Powered Intelligence**
- Full content analysis across all sources
- Smart action item detection and GitHub issue creation
- Cross-platform correlation and relationship detection

### 📋 **Production Ready**
- Robust error handling and retry logic
- Rate limiting and API compliance
- Comprehensive logging and monitoring

---

**Transform your GitHub repository into a comprehensive documentation and task management system with zero maintenance required!**