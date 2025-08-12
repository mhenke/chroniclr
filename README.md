# Chroniclr - Complete Project Intelligence System

> AI-powered documentation generation from multiple data sources: GitHub discussions, Jira projects, and pull requests. Modular architecture with runtime source selection for targeted documentation.

## Overview

Chroniclr is a comprehensive project intelligence system that generates documentation from multiple data sources with runtime source selection:

### 📊 **Data Sources**
- **GitHub Discussions** - Discussion content, comments, community engagement analysis
- **Jira Projects** - Sprint data, epics, issues, project metrics, team workload  
- **Pull Requests** - Code changes, file analysis, commit history, release documentation
- **Action Items** - Extract and manage action items from any source content

### 🤖 **Core Intelligence Functions**
- **AI Document Generation** - Uses GitHub Models API (GPT-4o) to process selected data sources
- **Cross-Platform Correlation** - Automatically links related artifacts when using multiple sources
- **Community Engagement Analysis** - Prioritizes content based on emoji reactions and engagement
- **Smart Task Management** - Creates GitHub issues with assignments, priorities, and due dates

### 📚 **Generated Documentation Types**
**From Discussions:** Project summaries, initiative briefs, meeting notes, changelogs
**From Jira:** Sprint reports, epic summaries, project dashboards  
**From PRs:** Release notes, change impact reports
**Multi-Source:** Feature completion tracking, cross-platform correlation reports

## Quick Start

### 1. Setup Repository

```bash
# Fork or use this repository as a template
git clone <your-chroniclr-repo>
cd chroniclr

# Install dependencies for GitHub Actions
npm install
```

### 2. Configure Repository Permissions

Enable GitHub Models API access by ensuring your workflow has these permissions:
```yaml
permissions:
  contents: write      # For creating files and commits
  discussions: read    # For reading discussion data
  pull-requests: write # For creating PRs
  issues: write       # For creating action item issues
  models: read        # For GitHub Models API access
```

**No API keys required** - Uses built-in `GITHUB_TOKEN` and GitHub Models API!

### 3. Test the System

1. Create a GitHub discussion with labels like `documentation`, `initiative`, or `planning`
2. Add action items in comments using format: `- [ ] @username: Task description (Due: Aug 10)`
3. Watch as Chroniclr automatically:
   - Generates comprehensive documentation from full discussion thread
   - Creates assigned GitHub issues for all action items
   - Opens PR with summary of generated docs and created issues

### 4. Choose Data Sources and Generate Documentation

The workflow supports runtime data source selection:
```bash
# Traditional discussion processing
gh workflow run chroniclr.yml -f discussion_number=123 -f source=discussion

# Jira project documentation  
gh workflow run chroniclr.yml -f discussion_number=123 -f source=jira

# Pull request analysis
gh workflow run chroniclr.yml -f discussion_number=123 -f source=pr

# Multi-source intelligence
gh workflow run chroniclr.yml -f discussion_number=123 -f source=jira,pr

# All data sources
gh workflow run chroniclr.yml -f discussion_number=123 -f source=discussion,jira,pr,issues
```

## How It Works

### 🏷️ **Label-Based Document Routing**
Discussion labels determine which document types are generated:
- `documentation` → Project summary + meeting notes
- `initiative` → Initiative brief 
- `feature` → Initiative brief + summary
- `release` → Changelog
- `planning` → Meeting notes + summary

### ⚙️ **Complete Automation Pipeline**
1. **GitHub Actions** triggers on discussion events (created/edited)
2. **Discussion Processing** fetches main post + all comments via REST API & GraphQL
3. **Label Processing** maps labels to document types using `chroniclr.config.json`
4. **AI Generation** uses GitHub Models API (GPT-4o) to analyze full conversation
5. **Action Item Processing** parses action items and creates assigned GitHub issues
6. **Documentation Creation** generates structured documents using templates
7. **PR Creation** opens pull request with all generated content and issue summaries

### 🤖 **AI-Powered Analysis**
- **GitHub Models API**: Uses GPT-4o via GitHub's built-in AI service with intelligent rate limiting
- **Full Thread Processing**: Analyzes main discussion + all comments for comprehensive context
- **Community Engagement Analysis**: Processes emoji reactions and comment engagement for content prioritization
- **Smart Extraction**: Identifies stakeholders, decisions, action items, technical details
- **Template Application**: Combines AI insights with structured markdown templates
- **Robust Error Handling**: Exponential backoff retry logic prevents API failures

## 🎭 Community Engagement Analysis

### Reaction-Based Content Prioritization
Chroniclr analyzes emoji reactions on discussions and comments to prioritize content in generated documents:

**Engagement Metrics:**
- **👍 High Priority**: Comments with many thumbs up reactions get featured prominently
- **❤️ Community Love**: Heart reactions indicate strong positive sentiment
- **🚀 Innovation**: Rocket reactions highlight exciting technical ideas
- **👎 Concerns**: Thumbs down reactions flag potential issues for discussion
- **Mixed Reactions**: Content with both positive and negative reactions is marked as controversial

**Intelligence Features:**
```markdown
# Generated sections include:
## Community Insights
**Participation Level:** high • 23 reactions
**Overall Sentiment:** positive
**Most Discussed Topics:** Security concerns, Mobile responsiveness

## High-Engagement Content (prioritize these):
- @alex-pm: Great metrics! 4.2 hours/week saved... (8 reactions, sentiment: positive)
- @sarah-dev: Security review process needed... (6 reactions, sentiment: mixed)

## Controversial Points (mixed reactions - highlight for discussion):
- Security: Auto-documentation of sensitive data (4 👍 vs 2 👎)
```

**Benefits:**
- Documents reflect what the community actually cares about
- Controversial topics are highlighted for team discussion
- Popular suggestions get emphasized in action plans
- Team consensus is captured through reaction patterns

## 🎯 Action Item Management

### Supported Action Item Formats
Chroniclr automatically detects and processes these action item formats:

```markdown
# Checkbox format with assignment and due date
- [ ] @username: Task description (Due: Aug 10)
- [ ] @sarah-dev: Set up monitoring dashboard (Due: Aug 15)

# Alternative format  
- [ ] Complete API documentation @mike-torres (Due: Aug 12)

# In Action Items sections
## Action Items
- @alex-pm: Survey team members on documentation needs (Due: Aug 18)
- @jamie-design: Create mobile-responsive templates (Due: Aug 20)
```

### Automatic GitHub Issue Creation
For each action item, Chroniclr:
- ✅ **Creates GitHub Issue** with descriptive title: `[Action Item] {description}`
- 👤 **Assigns to User** (validates user exists first)  
- 🏷️ **Applies Labels**: `action-item`, `chroniclr-generated`, `needs-triage`
- ⏰ **Priority Labels**: Based on due dates (high ≤3 days, medium ≤7 days, low >7 days)
- 🔗 **Links to Source**: Full context and link back to original discussion
- 📝 **Rich Description**: Includes due date, discussion context, and metadata

## 🛠️ Development Commands

### Testing Utilities
```bash
# Install dependencies
npm install

# Test core functionality
npm run validate-discussion   # Test discussion validation
npm run process-labels       # Test label-to-document mapping
npm run generate-document    # Test AI document generation
npm run create-action-items  # Test action item processing

# Manual workflow testing
gh workflow run chroniclr.yml -f discussion_number=123
```

### Local Testing with Environment Variables
```bash
# Test document generation locally
DOC_TYPE=summary \
DISCUSSION_NUMBER=123 \
DISCUSSION_TITLE="Test Discussion" \
DISCUSSION_BODY="Discussion content with comments..." \
DISCUSSION_AUTHOR="username" \
DISCUSSION_URL="https://github.com/owner/repo/discussions/123" \
GITHUB_TOKEN="your_token" \
npm run generate-document
```

## 📁 File Structure

```
chroniclr/
├── .github/workflows/
│   └── chroniclr.yml               # Main automation workflow
├── src/
│   ├── generators/
│   │   └── ai-document-generator.js # AI-powered document generation with rate limiting
│   ├── templates/
│   │   ├── summary.md              # Project summary template
│   │   ├── summary-enhanced.md     # Enhanced template with engagement metrics
│   │   ├── initiative-brief.md     # Initiative brief template  
│   │   ├── meeting-notes.md        # Meeting notes template
│   │   └── changelog.md            # Changelog template
│   └── utils/
│       ├── validate-discussion.js  # Discussion data validation
│       ├── process-labels.js       # Label-to-document-type mapping
│       ├── issue-creator.js        # Action item → GitHub issue creation
│       ├── github-reactions.js     # Community engagement analysis
│       └── request-queue.js        # API rate limiting and queue management
├── docs/                           # Generated documentation output
├── chroniclr.config.json           # Label mappings and configuration
└── package.json                    # Node.js dependencies and scripts
```

## 🔧 Customization

### Adding New Document Types
1. **Create template** in `src/templates/{type}.md` using `{variable}` syntax
2. **Update label mapping** in `chroniclr.config.json`:
   ```json
   {
     "github": {
       "discussionLabels": {
         "your-label": ["your-document-type"]
       }
     }
   }
   ```
3. **Test locally**: `DOC_TYPE=your-type npm run generate-document`

### Customizing Templates
Templates use `{variableName}` syntax that gets replaced by AI-generated content:
- `{title}`, `{date}`, `{discussionNumber}` - Basic metadata
- `{participants}`, `{stakeholders}` - People involved
- `{objectives}`, `{decisions}`, `{actionItems}` - Content sections
- `{timeline}`, `{nextSteps}` - Planning elements

### Modifying Action Item Detection
Edit `src/utils/issue-creator.js` to:
- Add new regex patterns for action item formats
- Customize issue creation logic
- Modify label assignment rules
- Change priority calculation

## 🐛 Debugging & Troubleshooting

### Common Issues & Solutions

**GitHub Models API Failures**
- Check `models: read` permission in workflow
- **Rate Limiting**: System automatically handles 429 errors with exponential backoff (1s → 2s → 4s delays)
- **Request Queue**: Prevents concurrent API calls that trigger rate limits
- **Retry Logic**: 3 automatic retries before fallback to structured templates
- View logs for: "Rate limit hit. Waiting Xms before retry Y/3..."

**Action Item Issues Not Created**  
- Ensure action items follow supported formats: `- [ ] @username: task (Due: date)`
- Check if mentioned users exist in repository
- Verify `issues: write` permission in workflow

**Workflow Failures**
- **Discussion not found**: Check discussion number and repository access
- **Label processing errors**: Validate `chroniclr.config.json` syntax
- **Permission issues**: Ensure all required permissions are configured

**Generated Documents Issues**
- Files appear in `docs/` directory
- Missing labels default to "summary" document type  
- Check PR creation logs if documents aren't appearing

### Debug Commands
```bash
# Test individual components
npm run validate-discussion  # Check discussion data validation
npm run process-labels      # Test label mapping logic  
npm run generate-document   # Test AI document generation
npm run create-action-items # Test action item processing

# View workflow logs
gh run list --workflow=chroniclr.yml
gh run view [run-id] --log
```

## ✨ Features Summary

### 🤖 **AI-Powered Generation**
- Uses GitHub's built-in Models API (GPT-4o) - **no API keys required**
- Processes full discussion threads (main post + all comments + reactions)
- **Community Engagement**: Prioritizes content based on emoji reactions (👍, ❤️, 🚀)
- **Sentiment Analysis**: Identifies controversial points with mixed reactions
- **Rate Limiting**: Intelligent retry logic handles API constraints gracefully
- Fallback generation only after exhausting all retry attempts

### 📋 **Smart Task Management**  
- Automatically detects action items in multiple formats
- Creates assigned GitHub issues with due dates and priorities
- Validates user assignments and handles missing users gracefully
- Links issues back to source discussions for full context

### 🔄 **Complete Automation**
- Triggers on discussion creation/editing or manual workflow dispatch
- Zero configuration required - works with GitHub's built-in permissions
- Comprehensive error handling and logging
- Reports generation summary in pull request descriptions

### 🎯 **Production Ready**
- Handles large repositories and complex discussions  
- Robust error handling with fallback mechanisms
- Comprehensive logging for debugging and monitoring
- Battle-tested with realistic discussion scenarios

## 🤝 Contributing

1. **Fork the repository** and create a feature branch
2. **Test thoroughly** with sample discussions containing action items
3. **Run the test suite**: `npm run validate-discussion && npm run process-labels`
4. **Submit PR** with updated documentation and test examples

### Development Setup
```bash
git clone https://github.com/your-username/chroniclr.git
cd chroniclr
npm install
```

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details.

---

**🚀 Transform your GitHub discussions into comprehensive documentation and organized task management with zero setup required!**