# Chroniclr - Development Guide

## Project Status ✅

The Chroniclr system is fully implemented with:
- GitHub Actions automation workflow
- GitHub Models API integration (GPT-4o)
- JavaScript-based AI document generation
- Automatic action item → GitHub issue creation
- Comprehensive error handling and fallback systems
- Complete documentation and testing utilities

## 🚀 Current Features (Completed)

### ✅ **AI-Powered Document Generation**
- **GitHub Models API Integration**: Uses GPT-4o via GitHub's built-in AI service
- **Full Thread Processing**: Analyzes main discussion + all comments for comprehensive context
- **Template System**: Combines AI insights with structured markdown templates
- **Fallback Generation**: Structured documents if AI processing fails

### ✅ **Automatic Task Management**
- **Action Item Detection**: Multi-format regex parsing of action items
- **GitHub Issue Creation**: Automatic assignment with due dates and priority labels  
- **User Validation**: Checks if assigned users exist before creating issues
- **Smart Labeling**: Priority based on due dates, standard tracking labels

### ✅ **Production-Ready Automation**
- **GitHub Actions Workflow**: Complete automation triggered by discussion events
- **Error Handling**: Comprehensive logging, graceful fallbacks, retry mechanisms
- **Permission Management**: Uses built-in GITHUB_TOKEN, no API keys required
- **PR Integration**: Automatic PRs with generation summaries

## 🔧 Enhancement Ideas

### Advanced AI Features
```
Enhance the AI processing with:
1. Sentiment analysis for urgency detection
2. Topic modeling for automatic categorization
3. Multi-language support for international teams
4. Custom AI prompts per document type
5. Learning from user feedback to improve quality
```

### Extended Integrations
```
Add integrations with:
1. Slack notifications for generated documents
2. Jira/Linear for action item sync
3. Confluence for documentation publishing
4. Teams/Discord for collaboration updates
5. Calendar integration for deadline tracking
```

### Advanced Template System
```
Create intelligent templates that:
1. Adapt based on repository size and type
2. Include interactive elements (checkboxes, forms)
3. Generate diagrams and flowcharts automatically
4. Support multiple output formats (PDF, HTML, Confluence)
5. Version control template evolution
```

### Analytics & Insights
```
Build analytics features:
1. Documentation generation metrics dashboard
2. Action item completion tracking
3. Stakeholder engagement analysis
4. Template effectiveness scoring
5. Repository documentation health reports
```

## 🛠️ Development Commands

### Testing & Debugging
```bash
# Install dependencies
npm install

# Test individual components
npm run validate-discussion   # Test discussion validation
npm run process-labels       # Test label mapping
npm run generate-document    # Test AI generation (requires env vars)
npm run create-action-items  # Test action item processing

# Manual workflow testing
gh workflow run chroniclr.yml -f discussion_number=123

# View workflow logs
gh run list --workflow=chroniclr.yml
gh run view [run-id] --log
```

### Local Development
```bash
# Test document generation locally with environment variables
DOC_TYPE=summary \
DISCUSSION_NUMBER=123 \
DISCUSSION_TITLE="Test Discussion" \
DISCUSSION_BODY="Discussion content with comments..." \
DISCUSSION_AUTHOR="username" \
DISCUSSION_URL="https://github.com/owner/repo/discussions/123" \
GITHUB_TOKEN="your_token" \
npm run generate-document

# Test action item processing
DISCUSSION_BODY="- [ ] @username: Task (Due: Aug 10)" \
npm run create-action-items
```

### Workflow Configuration
```yaml
# Required permissions in .github/workflows/chroniclr.yml
permissions:
  contents: write      # For creating files and commits
  discussions: read    # For reading discussion data
  pull-requests: write # For creating PRs
  issues: write       # For creating action item issues
  models: read        # For GitHub Models API access
```

## 📝 Development Tips

1. **Test with Real Data**: Use actual discussions with comments and action items
2. **Monitor AI Quality**: Check generated documents for accuracy and completeness
3. **Validate Action Items**: Ensure action item formats are recognized correctly
4. **Review Error Logs**: GitHub Actions logs provide detailed debugging information
5. **Iterate Templates**: Customize templates in `src/templates/` for your needs

## 🔄 Workflow Integration

The system automatically triggers on:
- **Discussion created** events
- **Discussion edited** events
- **Manual workflow dispatch** with discussion number

Each run:
1. Extracts discussion + comments
2. Generates comprehensive documentation
3. Creates GitHub issues for action items
4. Opens PR with summaries and links

The system is **production-ready** with comprehensive error handling, fallback mechanisms, and detailed logging!
