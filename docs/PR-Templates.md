# PR-Specific Document Templates

This document provides a comprehensive guide to the PR-specific document templates implemented in Chroniclr.

## Overview

Chroniclr now supports 5 specialized PR document templates designed to provide comprehensive documentation and analysis for pull requests:

1. **PR Summary** - Concise overview of PR changes and status
2. **PR Change Impact Assessment** - Detailed analysis of change risks and impacts
3. **PR Review Report** - Comprehensive review analysis and feedback summary
4. **PR Validation Checklist** - Structured checklist for PR validation
5. **PR Release Notes** - Release-focused documentation for merged PRs

## Template Types

### 1. PR Summary (`pr-summary`)

**Purpose**: Provides a concise overview of PR changes, impact areas, and current status.

**Key Features**:
- PR metadata (number, title, author, status)
- Change statistics (files, lines added/deleted)
- Impact area analysis
- Review status summary
- Related issues and Jira links

**Use Cases**:
- Quick PR overviews for stakeholders
- Status reports for management
- Change communication

**Template Variables**: ~30 variables with full coverage

### 2. PR Change Impact Assessment (`pr-change-impact-assessment`)

**Purpose**: Comprehensive analysis of change risks, impacts, and recommendations.

**Key Features**:
- Detailed risk assessment (high/medium/low risk factors)
- Impact analysis across all system areas
- Breaking changes analysis
- Testing requirements
- Deployment considerations
- Stakeholder notification requirements

**Use Cases**:
- Pre-deployment risk assessment
- Technical impact analysis
- Change planning and coordination

**Template Variables**: ~60 variables (32 require AI/detailed analysis)

### 3. PR Review Report (`pr-review-report`)

**Purpose**: Detailed analysis of the review process, feedback, and approval status.

**Key Features**:
- Individual reviewer analysis
- Comment categorization (security, performance, design)
- Review timeline and efficiency metrics
- Code quality assessment
- Merge readiness evaluation

**Use Cases**:
- Review process analysis
- Team performance metrics
- Code quality tracking

**Template Variables**: ~70 variables (51 require detailed review analysis)

### 4. PR Validation Checklist (`pr-validation-checklist`)

**Purpose**: Comprehensive checklist covering all aspects of PR validation.

**Key Features**:
- Pre-review validation (title, description, conflicts)
- Code quality validation (style, security, performance)
- Testing validation (coverage, quality, reliability)
- Documentation validation
- Compatibility validation
- Infrastructure readiness

**Use Cases**:
- Automated PR validation
- Manual review guidance
- Quality assurance processes

**Template Variables**: ~100 variables (90 require validation analysis)

### 5. PR Release Notes (`pr-release-notes`)

**Purpose**: Release-focused documentation for merged PRs.

**Key Features**:
- Release-ready change descriptions
- Technical change summaries
- Migration notes and upgrade instructions
- Performance metrics
- Team contribution tracking

**Use Cases**:
- Automated release note generation
- Customer-facing change communication
- Release documentation

**Template Variables**: ~90 variables (78 require release analysis)

## Configuration

### Template Registration

Templates are registered in `chroniclr.config.json`:

```json
{
  "documents": {
    "templates": {
      "pr-summary": "src/templates/pr-summary.md",
      "pr-change-impact-assessment": "src/templates/pr-change-impact-assessment.md",
      "pr-review-report": "src/templates/pr-review-report.md",
      "pr-validation-checklist": "src/templates/pr-validation-checklist.md",
      "pr-release-notes": "src/templates/pr-release-notes.md"
    }
  },
  "github": {
    "discussionLabels": {
      "pr-summary": ["pr-summary"],
      "pr-impact": ["pr-change-impact-assessment"],
      "pr-review": ["pr-review-report"],
      "pr-validation": ["pr-validation-checklist"],
      "pr-release": ["pr-release-notes"]
    }
  }
}
```

## Template Variables

### Core PR Variables (Always Available)

These variables are automatically extracted from PR data:

```markdown
{prNumber}         # PR number
{prTitle}          # PR title  
{prAuthor}         # PR author username
{prStatus}         # PR status (open/closed/merged)
{prCreatedAt}      # Creation timestamp
{prUpdatedAt}      # Last update timestamp
{mergedDate}       # Merge timestamp (if merged)
{prUrl}            # PR URL
{baseBranch}       # Base branch name
{headBranch}       # Head branch name
{totalFiles}       # Number of files changed
{linesAdded}       # Lines added count
{linesDeleted}     # Lines deleted count  
{netChange}        # Net change (added - deleted)
{requiredReviewers} # List of required reviewers
{approvedBy}       # List of approvers
{reviewStatus}     # Overall review status
{relatedIssues}    # Related GitHub issues
{jiraLinks}        # Related Jira issue links
```

### Analysis Variables (Require Processing)

These variables are populated by file analysis and AI processing:

```markdown
{impactAreas}      # Affected system areas
{riskLevel}        # Risk level (HIGH/MEDIUM/LOW)
{riskFactors}      # Specific risk factors
{breakingChanges}  # Breaking change analysis
{technologies}     # Technologies/frameworks used
{testingStatus}    # Testing recommendations
{keyFeatures}      # Key feature changes
{deploymentNotes}  # Deployment considerations
```

### AI-Generated Variables (Complex Analysis)

These variables require AI analysis for proper content:

```markdown
{impactSummary}           # Executive summary of changes
{reviewSummary}          # Summary of review feedback
{validationStatus}       # Validation result summary
{securityImpact}         # Security implications
{performanceImpact}      # Performance implications
{migrationGuideNeeds}    # Migration requirements
{stakeholderUpdates}     # Stakeholder communication needs
```

## Usage

### Testing Templates

Generate test documents to validate template functionality:

```bash
# Test all PR templates
npm run test-pr-templates

# Test specific template
npm run test-pr-template pr-summary

# Test with direct script
node src/utils/pr-document-generator.js test pr-change-impact-assessment
```

### Integration with Document Generator

PR templates integrate with the existing AI document generator:

```javascript
const { AIDocumentGenerator } = require('./src/generators/ai-document-generator');
const { PRTemplateMapper } = require('./src/utils/pr-template-mapper');

const generator = new AIDocumentGenerator();
const mapper = new PRTemplateMapper();

// Map PR data to template variables
const variables = mapper.mapAllVariables(prData, fileAnalysis);

// Generate document
const template = await generator.loadTemplate('pr-summary');
const document = substituteVariables(template, variables);
```

### Workflow Integration

PR templates can be triggered through GitHub Actions workflows:

```yaml
- name: Generate PR Documentation
  run: |
    DOC_TYPE=pr-summary \
    PR_NUMBER=${{ github.event.pull_request.number }} \
    npm run generate-document
```

## Variable Coverage

### Complete Coverage Templates

- **pr-summary**: 100% variable coverage with basic PR data

### Partial Coverage Templates  

- **pr-change-impact-assessment**: ~50% coverage (requires detailed analysis)
- **pr-review-report**: ~30% coverage (requires review analysis)
- **pr-validation-checklist**: ~10% coverage (requires validation results)
- **pr-release-notes**: ~20% coverage (requires release analysis)

### Fallback Behavior

For unprocessed variables:
1. **Default values** are provided for common variables
2. **AI processing** can fill complex analysis variables
3. **Manual substitution** is available for specific use cases
4. **Template fallback** provides basic structure when AI is unavailable

## Advanced Features

### File Analysis Integration

PR templates integrate with the file analyzer for impact assessment:

```javascript
const { FileAnalyzer } = require('./src/utils/file-analyzer');

const analyzer = new FileAnalyzer();
const analysis = analyzer.analyzeChanges(prData.files, prData);
// Analysis provides: risk levels, impact areas, testing needs, etc.
```

### Jira Integration

Automatic Jira key extraction and linking:

```markdown
# Automatically extracts PROJ-123, AUTH-456 from PR body
{jiraLinks}        # - [PROJ-123](https://jira.company.com/browse/PROJ-123)
{jiraReferences}   # - [AUTH-456](https://jira.company.com/browse/AUTH-456)
```

### Review Analysis

Comprehensive review data extraction:

```javascript
// Extracts from PR reviews:
// - Individual review states
// - Review timeline
// - Comment categorization
// - Approval status
```

## Best Practices

### Template Usage

1. **Start with pr-summary** for basic PR documentation needs
2. **Use pr-change-impact-assessment** for high-risk changes
3. **Generate pr-validation-checklist** for process compliance
4. **Create pr-release-notes** for customer-facing releases
5. **Generate pr-review-report** for process improvement

### Variable Handling

1. **Provide defaults** for all template variables
2. **Use AI processing** for complex analysis variables
3. **Validate data** before template processing
4. **Handle missing data** gracefully with fallbacks

### Integration

1. **Configure labels** to trigger appropriate templates
2. **Set up workflows** for automated generation
3. **Customize variables** based on team needs
4. **Monitor coverage** and improve over time

## Troubleshooting

### Common Issues

**Issue**: Many unprocessed variables in generated documents
**Solution**: This is expected for complex templates. Use AI processing or provide additional data sources.

**Issue**: Template not found
**Solution**: Ensure template is registered in `chroniclr.config.json` and file exists.

**Issue**: Variables not substituting
**Solution**: Check variable names match exactly between template and mapper.

### Debugging

Use the test utilities to debug template issues:

```bash
# Generate test document with debug output
node src/utils/pr-document-generator.js test pr-summary

# Check variable mapping
node -e "
const { PRTemplateMapper } = require('./src/utils/pr-template-mapper');
const mapper = new PRTemplateMapper();
const vars = mapper.mapAllVariables(testData);
console.log(Object.keys(vars));
"
```

## Future Enhancements

- [ ] AI-powered variable analysis for complex templates
- [ ] Custom variable definitions per repository
- [ ] Template customization through configuration
- [ ] Real-time PR analysis integration
- [ ] Advanced Jira and external system integration

---

*This documentation covers the comprehensive PR template system implemented in Chroniclr v1.0.0*