# 📚 Intelligent Document Update System

A comprehensive, AI-powered system for automatically updating and managing documentation based on code changes, with advanced conflict resolution and smart merging capabilities.

## 🚀 Key Features

### 🔍 Enhanced Document Metadata & Versioning
- **Comprehensive Tracking**: Creation dates, update history, dependencies, and quality metrics
- **Version Management**: Automatic version incrementing with detailed change logs
- **Document Relationships**: Dependency mapping and cross-reference management
- **Quality Assessment**: Completeness, freshness, and accuracy scoring
- **Smart Preservation**: Automatic detection and preservation of manual edits

### 🤝 Advanced Smart Merge Algorithm
- **Intelligent Conflict Detection**: Multiple conflict types with priority-based resolution
- **Manual Edit Preservation**: Always preserves sections marked with `<!-- manual-edit -->`
- **Smart Content Merging**: Preserves formatting while updating content
- **Conflict Resolution**: Automatic resolution with detailed logging and user control
- **Merge Analysis**: Comprehensive reporting of all merge decisions

### 🎯 Interactive CLI Experience
- **Progress Reporting**: Real-time progress bars and detailed status updates
- **Interactive Mode**: User confirmation prompts for each major operation
- **Dry-Run Capabilities**: Preview changes before applying them
- **Batch Operations**: Automated processing for CI/CD environments
- **Verbose Output**: Detailed logging for debugging and monitoring

### 📊 GitHub Workflow Automation
- **Intelligent Triggers**: Risk-based assessment of when updates are needed
- **Multi-Job Architecture**: Separate analysis and update phases
- **PR Integration**: Automatic comments with risk assessment and change summaries
- **Conditional Execution**: Only runs when documentation updates are actually needed
- **Enhanced Reporting**: Comprehensive workflow summaries and recommendations

## 📋 Quick Start

### Basic Usage

```bash
# Update documents based on a specific PR
npm run update-documents -- --pr=123

# Interactive mode with verbose output
npm run update-documents -- --interactive --verbose

# Dry-run to see what would be updated
npm run update-documents -- --dry-run

# Force update all documents
npm run update-documents -- --force --batch
```

### GitHub Workflow Integration

The system automatically triggers on:
- **Pull Requests**: Analyzes changes and updates related documentation
- **Push to Main**: Updates documentation for merged changes
- **Manual Dispatch**: On-demand updates with custom parameters

```yaml
# Trigger manual update
gh workflow run update-docs.yml -f force=true -f interactive=false
```

## 🔧 Configuration

### Document Update Settings (`chroniclr.config.json`)

```json
{
  "documents": {
    "updateSystem": {
      "enabled": true,
      "updateThreshold": 30,
      "createPRForUpdates": true,
      "preserveMarkers": [
        "<!-- manual-edit -->",
        "<!-- preserve -->",
        "<!-- do not update -->",
        "<!-- custom content -->"
      ],
      "documentTypes": {
        "api": ["API.md", "api-reference.md"],
        "userGuide": ["README.md", "user-guide.md"],
        "technical": ["ARCHITECTURE.md", "deployment.md"]
      }
    }
  }
}
```

### CLI Options

| Option | Short | Description |
|--------|--------|-------------|
| `--force` | `-f` | Force update all documents regardless of age |
| `--dry-run` | | Preview changes without applying them |
| `--interactive` | `-i` | Interactive mode with user prompts |
| `--verbose` | `-v` | Detailed progress and debug information |
| `--batch` | `-b` | Automated batch mode (no prompts) |
| `--pr=<number>` | | Update based on specific PR analysis |
| `--since=<date>` | | Update documents changed since date |
| `--no-report` | | Skip generating update reports |

## 🎨 Manual Edit Preservation

The system automatically preserves sections marked with special HTML comments:

```markdown
<!-- manual-edit -->
## Custom Section
This content will always be preserved during updates.
Custom formatting and manual changes are maintained.
<!-- manual-edit -->

## Auto-Generated Section
This content will be updated automatically.
```

### Supported Preservation Markers

- `<!-- manual-edit -->` - Preserves entire sections
- `<!-- preserve -->` - Alternative preservation marker
- `<!-- do not update -->` - Explicit no-update instruction
- `<!-- custom content -->` - Marks custom user content

## 📈 Document Analysis & Intelligence

### Risk Assessment
The system automatically assesses update risk based on:
- **File Count**: Number of files changed
- **Change Magnitude**: Lines added/deleted
- **Impact Areas**: Frontend, backend, API, security changes
- **Breaking Changes**: Detection through commit messages and labels

### Documentation Needs Detection
Automatically identifies required documentation types:
- **API Documentation**: For endpoint and service changes
- **User Guides**: For UI and feature changes
- **Technical Documentation**: For architecture and infrastructure changes
- **Migration Guides**: For breaking changes
- **Security Documentation**: For auth and security changes

### Smart Update Recommendations
- Suggests new documents based on code changes
- Identifies outdated content that needs attention
- Provides effort estimation for documentation updates
- Recommends testing strategies for changes

## 📊 Comprehensive Reporting

### Update Reports Include:
- **Executive Summary**: High-level statistics and success rates
- **Content Changes**: Lines added/deleted/modified with character counts
- **Merge Statistics**: Conflicts resolved, sections preserved/updated/added
- **Source Analysis**: Risk levels, breaking changes, impact areas
- **Document Details**: Version changes, merge conflicts, and resolutions
- **Recommendations**: Actionable advice for maintaining documentation quality

### Sample Report Structure:
```markdown
# Document Update Report

## Executive Summary
- Total documents processed: 15
- Successfully updated: 12
- Success rate: 80%

## Content Changes
- Lines added: 1,245
- Lines deleted: 456
- Lines modified: 789

## Merge Statistics
- Merge conflicts resolved: 3
- Sections preserved: 8
- Sections updated: 24
- New sections added: 6

## Recommendations
- Review merge conflicts in API.md
- Consider updating outdated security documentation
- High-risk changes detected - additional review recommended
```

## 🧪 Testing & Validation

### Run Comprehensive Tests
```bash
# Test the enhanced system
npm run test-enhanced-system

# Test specific document update scenarios
npm run test-document-update

# Test PR template processing
npm run test-pr-templates
```

### Test Coverage
The test suite validates:
- ✅ Enhanced metadata tracking and versioning
- ✅ Smart merge algorithm with conflict resolution
- ✅ Manual edit preservation
- ✅ Document analysis and relationship mapping
- ✅ Update report generation
- ✅ CLI interactive features
- ✅ Integration with existing file analysis

## 🔄 Integration with Existing Systems

### File Analyzer Integration
- Leverages existing `FileAnalyzer` for change analysis
- Maps code changes to documentation requirements
- Provides risk assessment and impact analysis

### AI Document Generator Integration
- Uses existing AI processing for content generation
- Maintains compatibility with template system
- Supports fallback generation when AI is unavailable

### PR Client Integration
- Analyzes pull request data for targeted updates
- Extracts file changes and impact assessment
- Coordinates with GitHub workflow automation

## 📚 Advanced Usage Examples

### Scenario 1: Large Feature PR
```bash
# Analyze a major feature PR with high risk
npm run update-documents -- --pr=456 --verbose --interactive

# This will:
# 1. Analyze 45 changed files
# 2. Identify 8 documents needing updates
# 3. Detect breaking changes requiring migration docs
# 4. Preserve 12 manually edited sections
# 5. Generate comprehensive update report
```

### Scenario 2: Security Update
```bash
# Force update security documentation
npm run update-documents -- --force --batch

# Focus on security-related documents:
# - SECURITY.md
# - auth-guide.md
# - api-security.md
```

### Scenario 3: Documentation Audit
```bash
# Comprehensive documentation health check
npm run update-documents -- --dry-run --verbose

# Provides:
# - Documentation health score
# - Outdated document identification
# - Missing documentation recommendations
```

## 🛠️ Troubleshooting

### Common Issues

**Manual edits not preserved:**
- Ensure proper `<!-- manual-edit -->` markers
- Check section heading matching (case-sensitive)
- Verify marker placement around entire sections

**Updates not triggering:**
- Check `updateThreshold` configuration
- Verify file change patterns in workflow triggers
- Review document registry for proper tracking

**Merge conflicts:**
- Review generated conflict markers
- Use interactive mode to resolve manually
- Check merge analysis in update reports

### Debug Mode
```bash
# Enable verbose logging for debugging
npm run update-documents -- --verbose --dry-run

# Check document registry state
cat docs/.document-metadata.json | jq
```

## 🎯 Best Practices

1. **Use Preservation Markers**: Always mark manual content with `<!-- manual-edit -->`
2. **Regular Updates**: Run updates frequently to avoid large conflicts
3. **Review Reports**: Check update reports for merge conflicts and recommendations
4. **Interactive Mode**: Use interactive mode for important updates
5. **Test First**: Always run dry-run before applying changes to critical documentation
6. **Monitor Quality**: Track documentation health scores and freshness metrics

## 📈 Roadmap

- [ ] Integration with additional version control systems
- [ ] Enhanced AI-powered content suggestions
- [ ] Real-time collaboration features
- [ ] Advanced analytics dashboard
- [ ] Multi-language documentation support
- [ ] Custom merge strategy plugins

---

*The Intelligent Document Update System is part of the Chroniclr documentation automation platform.*