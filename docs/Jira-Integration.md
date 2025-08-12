# Jira Integration Guide

Chroniclr supports optional integration with Jira to enrich documentation with real project data, metrics, and work item details.

## Overview

When enabled, Jira integration automatically:
- Fetches current sprint status and active issues
- Includes completed epics and recent progress
- Identifies blocked issues and project risks  
- Enriches AI-generated documents with actual project metrics
- Cross-references discussion topics with real Jira issues

## Configuration

### 1. Enable Jira Integration

Edit `chroniclr.config.json`:

```json
{
  "jira": {
    "enabled": true,
    "baseUrl": "https://yourcompany.atlassian.net",
    "defaultProject": "PROJ",
    "authentication": {
      "userEmail": "bot@company.com",
      "apiTokenSecret": "JIRA_API_TOKEN"
    }
  }
}
```

### 2. Set GitHub Secrets

Configure these secrets in your repository settings:

```bash
JIRA_BASE_URL=https://yourcompany.atlassian.net
JIRA_USER_EMAIL=bot@company.com  
JIRA_API_TOKEN=your_jira_api_token_here
```

### 3. Generate Jira API Token

1. Go to [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click "Create API token"
3. Label it "Chroniclr GitHub Actions"
4. Copy the token and add it to GitHub Secrets as `JIRA_API_TOKEN`

## Document Type Mappings

Configure which discussion labels trigger Jira-enhanced documents:

```json
{
  "jira": {
    "documentTypes": {
      "sprint-report": ["sprint", "development"],
      "epic-summary": ["epic", "initiative"], 
      "project-dashboard": ["dashboard", "management"],
      "release-notes": ["release", "deployment"]
    }
  }
}
```

## JQL Query Customization

Customize the Jira queries used for data extraction:

```json
{
  "jira": {
    "queries": {
      "currentSprint": "project = '{project}' AND sprint in openSprints() ORDER BY priority DESC",
      "completedEpic": "project = '{project}' AND type = Epic AND status = Done AND updatedDate >= -{days}d",
      "blockedIssues": "project = '{project}' AND status = Blocked ORDER BY priority DESC",
      "recentlyCompleted": "project = '{project}' AND status = Done AND updatedDate >= -{days}d ORDER BY updatedDate DESC"
    }
  }
}
```

## Rate Limiting Configuration

Configure API rate limiting to prevent overwhelming your Jira instance:

```json
{
  "jira": {
    "rateLimiting": {
      "requestsPerMinute": 100,
      "retryAttempts": 3,
      "backoffMultiplier": 2
    },
    "caching": {
      "enabled": true,
      "ttlMinutes": 15
    }
  }
}
```

## Usage Examples

### Sprint Report Generation

Label a discussion with `sprint` or `development` to automatically generate a comprehensive sprint report:

```markdown
# Sprint Planning Discussion

## Sprint Goals
- Complete user authentication feature
- Fix critical performance bugs
- Implement API rate limiting

## Team Capacity
- 5 developers available
- 2-week sprint duration
- Planned velocity: 40 story points
```

The generated sprint report will include:
- Actual Jira sprint data and current progress
- Real story point totals and velocity metrics
- Specific issues in progress with assignees
- Blocked issues requiring attention

### Epic Documentation

Label discussions with `epic` or `initiative` for detailed epic summaries:

```markdown
# User Authentication Epic

## Requirements
- OAuth 2.0 integration
- Multi-factor authentication
- Role-based permissions
```

The generated epic summary will include:
- All user stories linked to the epic in Jira
- Current completion percentage and timeline
- Team member assignments and progress
- Dependencies and blocking issues

### Project Dashboard

Use `dashboard` or `management` labels for executive summaries:

```markdown
# Q4 Project Status Update

## Key Objectives
- Launch mobile app beta
- Migrate to new infrastructure
- Improve system performance by 50%
```

The project dashboard will include:
- Real-time project health metrics from Jira
- Team velocity and capacity utilization
- Risk assessment based on blocked issues
- Quantified progress against objectives

## Jira Data Enrichment

When Jira integration is enabled, documents are enhanced with:

### Sprint Data
- Active sprint issues and their current status
- Story point planning vs actual completion
- Team member workload distribution
- Sprint goal achievement metrics

### Epic Information  
- Epic progress and completion percentage
- Linked user stories and their status
- Epic timeline and milestone progress
- Resource allocation and dependencies

### Risk Assessment
- Currently blocked issues and their impact
- High-priority items aging without progress
- Overdue issues and timeline risks
- Unassigned critical work items

### Team Metrics
- Individual contributor progress
- Cross-team collaboration indicators
- Velocity trends and capacity planning
- Technical debt and quality metrics

## Troubleshooting

### Authentication Issues

**Error:** `Jira authentication credentials not found`

**Solution:** Ensure `JIRA_API_TOKEN` and `JIRA_USER_EMAIL` are set in GitHub Secrets and match your configuration.

### Rate Limit Exceeded

**Error:** `Rate limited by Jira API`

**Solution:** Reduce `requestsPerMinute` in configuration or enable caching to reduce API calls.

### Project Not Found

**Error:** `Jira API error: 404`  

**Solution:** Verify the `defaultProject` key exists in your Jira instance and the API user has access.

### Missing Issues

**Symptom:** Jira data appears empty or incomplete

**Solution:** Check JQL query syntax and ensure the project key and field names match your Jira configuration.

## Best Practices

### Security
- Use dedicated service account for Jira API access
- Limit API token permissions to read-only
- Rotate API tokens regularly
- Store all credentials in GitHub Secrets, never in code

### Performance
- Enable caching to reduce API calls
- Set appropriate rate limits for your Jira instance
- Use specific JQL queries to minimize data transfer
- Monitor API usage to avoid quota exhaustion

### Data Quality
- Validate Jira field mappings match your configuration
- Test queries in Jira before adding to configuration
- Use consistent project naming and labeling
- Regular clean up of test/demo issues that may skew metrics

## Advanced Configuration

### Custom Fields

Map custom Jira fields for enhanced reporting:

```json
{
  "jira": {
    "customFields": {
      "storyPoints": "customfield_10016",
      "epicLink": "customfield_10014", 
      "businessValue": "customfield_12345"
    }
  }
}
```

### Multi-Project Support

Configure multiple projects:

```json
{
  "jira": {
    "projects": {
      "frontend": "FRONT",
      "backend": "BACK",
      "mobile": "MOB"
    }
  }
}
```

### Webhook Integration

For real-time updates, configure Jira webhooks to trigger documentation updates:

1. Go to Jira Settings → System → WebHooks
2. Create webhook pointing to GitHub Actions workflow URL
3. Configure triggers for issue updates, sprint changes, epic completion

This enables automatic documentation updates when project status changes in Jira, keeping documentation always current with minimal manual intervention.