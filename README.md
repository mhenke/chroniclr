# Chroniclr - AI-Powered Documentation Automation

> Automatically generate project documentation from GitHub discussions using Claude Code and GitHub Actions.

## Overview

Chroniclr transforms GitHub discussions into comprehensive documentation including:
- **Project Summaries** - Overview, objectives, current status
- **Initiative Briefs** - Problem statements, solutions, timelines  
- **Changelogs** - Version history, feature additions, bug fixes
- **Meeting Notes** - Action items, decisions, next steps

## Quick Start

### 1. Setup Repository

```bash
# Fork or use this repository as a template
git clone <your-chroniclr-repo>
cd chroniclr

# Install dependencies for GitHub Actions
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys
```

### 2. Configure GitHub Secrets

Add these secrets to your GitHub repository:
- `CLAUDE_API_KEY` - Your Anthropic API key
- `GITHUB_TOKEN` - Auto-provided by GitHub Actions

### 3. Customize Configuration

Edit `chroniclr.config.json` to match your repository:
```json
{
  "github": {
    "repository": "your-repo",
    "owner": "your-username"
  }
}
```

### 4. Test the System

1. Create a GitHub discussion with labels like `documentation`, `initiative`, or `release`
2. Watch as Chroniclr automatically generates documentation
3. Review and merge the auto-created PR

## How It Works

### Label-Based Routing
Discussion labels determine document types:
- `documentation` → Project summary + meeting notes
- `initiative` → Initiative brief + summary  
- `release` → Changelog
- `planning` → Meeting notes + summary

### Generation Pipeline
1. **GitHub Actions** triggers on discussion events
2. **Node.js utilities** validate data and process labels
3. **Claude Code agents** analyze content and generate documents
4. **Git integration** creates PRs with generated documentation

### Templates & Variables
Documents use consistent variable substitution:
- `{title}`, `{date}`, `{status}`, `{participants}`
- `{objectives}`, `{actionItems}`, `{timeline}`
- `{problemStatement}`, `{proposedSolution}`

## Manual Commands

Use Claude Code for manual document generation:

```bash
# Generate from discussion URL
claude-code /generate-summary https://github.com/owner/repo/discussions/123

# Create initiative brief
claude-code /create-brief https://github.com/owner/repo/discussions/456

# Update changelog
claude-code /update-changelog v1.2.0

# Sync all documentation
claude-code /sync-docs
```

## File Structure

```
chroniclr/
├── .claude/
│   ├── agents/           # Claude Code document generators
│   └── commands/         # Slash command definitions
├── .github/workflows/    # GitHub Actions automation
├── src/
│   ├── templates/        # Document templates
│   └── utils/            # GitHub Actions utilities
├── docs/                 # Generated documentation
└── config/               # Project configuration
```

## Customization

### Add Document Types
1. Create template in `src/templates/{type}.md`
2. Update `chroniclr.config.json` label mappings
3. Add processing logic to agents if needed

### Modify Templates
Edit files in `src/templates/` following the `{variable}` syntax.

### Custom Agents  
Create specialized Claude Code agents in `.claude/agents/` for complex document types.

## Debugging

Common issues:
- **Missing labels** → Defaults to summary document
- **API rate limits** → Check GitHub Actions logs for 403/429 errors  
- **Template variables** → Ensure agents output matches template expectations
- **Claude API** → Verify `CLAUDE_API_KEY` secret is set

## Development

```bash
# Test utilities locally
npm run validate-discussion
npm run process-labels

# Test agent execution
claude-code run .claude/agents/document-generator.md --doc-type=summary

# Test GitHub Actions workflow
gh workflow run chroniclr.yml -f discussion_number=123
```

## Contributing

1. Fork the repository
2. Create feature branch
3. Test with sample discussions  
4. Submit PR with documentation updates

## License

MIT - See LICENSE file for details.