# PR Validation Checklist: {prTitle}

**PR Number:** #{prNumber}  
**Author:** @{prAuthor}  
**Validation Date:** {date}  
**Status:** {validationStatus}

## Pre-Review Validation

### Basic Requirements
- [ ] **Title is descriptive** - {prTitleValidation}
- [ ] **Description provided** - {prDescriptionValidation}
- [ ] **Linked to issue/ticket** - {linkedIssueValidation}
- [ ] **Appropriate branch naming** - {branchNamingValidation}
- [ ] **No merge conflicts** - {mergeConflictValidation}

### Change Validation
- [ ] **Files changed are relevant** - {relevantFilesValidation}
- [ ] **No unintended file changes** - {unintendedChangesValidation}
- [ ] **Change scope is appropriate** - {changeScopeValidation}
- [ ] **Breaking changes documented** - {breakingChangesValidation}

## Code Quality Validation

### Code Standards
- [ ] **Code follows style guide** - {codeStyleValidation}
- [ ] **Proper error handling** - {errorHandlingValidation}
- [ ] **Logging appropriately implemented** - {loggingValidation}
- [ ] **Code complexity is reasonable** - {complexityValidation}
- [ ] **No code duplication** - {duplicationValidation}

### Security Validation
- [ ] **No hardcoded secrets** - {secretsValidation}
- [ ] **Input validation present** - {inputValidationValidation}
- [ ] **Authentication/authorization checked** - {authValidation}
- [ ] **SQL injection prevention** - {sqlInjectionValidation}
- [ ] **XSS prevention** - {xssValidation}

### Performance Validation
- [ ] **No obvious performance issues** - {performanceValidation}
- [ ] **Database queries optimized** - {databaseOptimizationValidation}
- [ ] **Caching implemented where needed** - {cachingValidation}
- [ ] **Resource usage reasonable** - {resourceUsageValidation}

## Testing Validation

### Test Coverage
- [ ] **Unit tests provided** - {unitTestValidation}
- [ ] **Integration tests included** - {integrationTestValidation}
- [ ] **Edge cases tested** - {edgeCaseValidation}
- [ ] **Error scenarios tested** - {errorScenarioValidation}
- [ ] **Test coverage meets requirements** - {coverageValidation}

### Test Quality
- [ ] **Tests are readable** - {testReadabilityValidation}
- [ ] **Tests are reliable** - {testReliabilityValidation}
- [ ] **Tests are fast** - {testPerformanceValidation}
- [ ] **Mock/stub usage appropriate** - {mockingValidation}

## Documentation Validation

### Code Documentation
- [ ] **Functions/methods documented** - {functionDocValidation}
- [ ] **Complex logic explained** - {logicDocValidation}
- [ ] **API changes documented** - {apiDocValidation}
- [ ] **Configuration changes documented** - {configDocValidation}

### External Documentation
- [ ] **README updated if needed** - {readmeValidation}
- [ ] **API docs updated** - {apiDocsValidation}
- [ ] **Migration guide provided** - {migrationGuideValidation}
- [ ] **Changelog updated** - {changelogValidation}

## Compatibility Validation

### Backward Compatibility
- [ ] **No breaking API changes** - {apiCompatibilityValidation}
- [ ] **Database migration safe** - {dbMigrationValidation}
- [ ] **Configuration backward compatible** - {configCompatibilityValidation}
- [ ] **Dependencies compatible** - {dependencyCompatibilityValidation}

### Cross-Platform Validation
- [ ] **Works across target environments** - {environmentValidation}
- [ ] **Browser compatibility maintained** - {browserCompatibilityValidation}
- [ ] **Mobile compatibility preserved** - {mobileCompatibilityValidation}

## Infrastructure Validation

### Deployment Readiness
- [ ] **Build scripts updated** - {buildScriptValidation}
- [ ] **Environment variables documented** - {envVarValidation}
- [ ] **Migration scripts provided** - {migrationScriptValidation}
- [ ] **Rollback procedure defined** - {rollbackValidation}

### Monitoring & Observability
- [ ] **Metrics/logging added** - {metricsValidation}
- [ ] **Health checks updated** - {healthCheckValidation}
- [ ] **Alerts configured** - {alertValidation}
- [ ] **Tracing implemented** - {tracingValidation}

## CI/CD Validation

### Automated Checks
- [ ] **All CI checks pass** - {ciValidation}
- [ ] **Automated tests pass** - {automatedTestValidation}
- [ ] **Static analysis clean** - {staticAnalysisValidation}
- [ ] **Security scans pass** - {securityScanValidation}
- [ ] **Performance tests pass** - {perfTestValidation}

### Build Validation
- [ ] **Build succeeds locally** - {localBuildValidation}
- [ ] **Build succeeds in CI** - {ciBuildValidation}
- [ ] **Artifacts generated correctly** - {artifactValidation}
- [ ] **Docker image builds** - {dockerValidation}

## Review Process Validation

### Review Requirements
- [ ] **Required reviewers assigned** - {reviewerAssignmentValidation}
- [ ] **Appropriate reviewers chosen** - {reviewerAppropriatenessValidation}
- [ ] **Domain experts consulted** - {expertConsultationValidation}
- [ ] **Security team notified if needed** - {securityNotificationValidation}

### Review Quality
- [ ] **All feedback addressed** - {feedbackAddressedValidation}
- [ ] **Discussions resolved** - {discussionsResolvedValidation}
- [ ] **Follow-up items documented** - {followupDocumentedValidation}

## Final Validation

### Merge Readiness
- [ ] **All validations complete** - {allValidationsValidation}
- [ ] **No outstanding blockers** - {blockersValidation}
- [ ] **Approval criteria met** - {approvalCriteriaValidation}
- [ ] **Merge strategy defined** - {mergeStrategyValidation}

### Post-Merge Planning
- [ ] **Deployment plan ready** - {deploymentPlanValidation}
- [ ] **Communication plan set** - {communicationPlanValidation}
- [ ] **Monitoring plan active** - {monitoringPlanValidation}
- [ ] **Rollback plan confirmed** - {rollbackPlanValidation}

## Validation Summary

### Passed Validations
{passedValidations}

### Failed Validations
{failedValidations}

### Warning Items
{warningItems}

### Manual Review Required
{manualReviewRequired}

## Risk Assessment

**Overall Risk Level:** {overallRiskLevel}

### Risk Factors
{riskFactors}

### Mitigation Strategies
{mitigationStrategies}

## Recommendations

### Before Merge
{beforeMergeRecommendations}

### After Merge
{afterMergeRecommendations}

### Process Improvements
{processImprovementRecommendations}

## Sign-off

- [ ] **Author Sign-off:** @{prAuthor} - {authorSignoffStatus}
- [ ] **Technical Lead Sign-off:** {techLeadSignoff}
- [ ] **Security Sign-off:** {securitySignoff}
- [ ] **QA Sign-off:** {qaSignoff}

**Validation Completed By:** Chroniclr  
**Validation Status:** {finalValidationStatus}  
**Next Steps:** {nextSteps}

---

## References

- [Original PR]({prUrl})
- [Related Issues]({relatedIssuesUrls})
- [Validation Criteria]({validationCriteriaUrl})
{additionalReferences}

---
*This validation checklist was automatically generated by Chroniclr on {date}*