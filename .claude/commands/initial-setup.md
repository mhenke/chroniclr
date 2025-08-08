# Initial Setup - Chroniclr

Create "Chroniclr" - an AI-powered documentation automation system inspired by GitHub's internal tool.

## Project Vision

Chroniclr should automatically generate project documentation when GitHub discussions are created, creating summaries, initiative briefs, change logs, and supporting documents. It centralizes context and automatically updates documents as projects evolve, saving teams hours of documentation work.

## Core Requirements

**FUNCTIONALITY:**
- Automatically generate project documentation from GitHub discussions
- Create summaries, initiative briefs, change logs, and supporting documents  
- Centralize context and automatically update documents as projects evolve
- Save teams hours of documentation work through automation

**TECHNICAL STACK:**
- GitHub Actions integration for automatic triggers
- Claude Code agents for specialized document generation
- Template-based document creation system
- Git workflow integration with automatic PR creation
- Support for multiple document formats (Markdown, JSON, YAML)

## Implementation Plan

Please create the following components:

### 1. Project Structure
```
chroniclr/
├── .claude/
│   ├── agents/           # Custom Claude Code agents
│   ├── commands/         # Slash commands
│   └── templates/        # Document templates
├── .github/
│   └── workflows/        # GitHub Actions
├── src/
│   ├── generators/       # Document generation logic
│   ├── templates/        # Source templates
│   └── utils/            # Helper utilities
├── docs/                 # Generated documentation
└── config/               # Configuration files
```

### 2. Document Templates
- **Summary Template**: Project overview, objectives, current status
- **Initiative Brief Template**: Problem statement, solution approach, timeline
- **Changelog Template**: Version history, feature additions, bug fixes
- **Meeting Notes Template**: Action items, decisions, next steps

### 3. GitHub Actions Workflow
- Trigger on discussion creation/updates
- Parse discussion content and metadata
- Generate appropriate documents based on discussion labels/type
- Create PR with generated documentation
- Auto-merge if approved or request review

### 4. Claude Code Agents
- **Document Generator Agent**: Creates documents from templates
- **Content Analyzer Agent**: Extracts key information from discussions
- **Template Manager Agent**: Manages and updates templates
- **Git Integration Agent**: Handles PR creation and workflow

### 5. Slash Commands
- `/generate-summary [discussion-url]` - Generate project summary
- `/create-brief [discussion-url]` - Create initiative brief  
- `/update-changelog [version]` - Update changelog
- `/sync-docs` - Sync all documentation

### 6. Configuration Files
- `chroniclr.config.json` - Main configuration
- `.env.example` - Environment variables template
- `CLAUDE.md` - Claude Code context and instructions

## Getting Started

1. Initialize the project structure
2. Set up basic configuration files
3. Create document templates
4. Implement GitHub Actions workflow
5. Configure Claude Code agents
6. Test with sample discussions

Start with the basic file structure and configuration, then iterate on the document generation logic based on real usage patterns.