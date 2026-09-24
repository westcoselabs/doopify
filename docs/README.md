# Documentation

Start with [Quickstart](quickstart.md). Developers configure infrastructure; store operators manage persistent business preferences.

| Task | Maintained guide |
| --- | --- |
| Understand current work | [Status](STATUS.md), [intent](PROJECT_INTENT.md), [roadmap](features-roadmap.md), [hardening](HARDENING.md) |
| Contribute | [Repository contributing guide](../CONTRIBUTING.md) |
| Configure infrastructure | [Environment reference](ENVIRONMENT_VARIABLE_REFERENCE.md), [local deployment](deployment/local.md), [Vercel](deployment/vercel.md), [workers](deployment/worker.md) |
| Configure the store | [Merchant launch guide](operations/merchant-launch-guide.md), [shipping](setup/shipping.md), [email](setup/email.md), [team](setup/team.md) |
| Understand the engine | [Environment architecture and Settings ownership](architecture/env-only-commerce.md), [checkout](architecture/checkout.md), [events](architecture/events.md), [promotions](smart-promotions-v1.md) |
| Operate and recover | [Production](PRODUCTION_RUNBOOK.md), [backup/restore](BACKUP_AND_RESTORE.md), [owner recovery](ADMIN_USER_RECOVERY_GUIDE.md), [troubleshooting](troubleshooting.md) |
| Upgrade safely | [Environment-only migration](ENV_ONLY_MIGRATION_RUNBOOK.md), [singleton migration](PROVIDER_STORE_SINGLETON_MIGRATION_RUNBOOK.md), [sessions](SESSION_TOKEN_MIGRATION_RUNBOOK.md), [rotation](SECRET_ROTATION_RUNBOOK.md) |
| Verify acceptance | [Performance evidence](performance/env-only-acceptance.md), [pilot checks](operations/pilot-validation-runbook.md), [deployment checklist](deployment/checklist.md) |

Keep current behavior in these guides. Superseded phase plans, design mockups and pre-remediation beta reports were removed from the working tree; retrieve them from Git history when historical context is needed. Migration runbooks and measured acceptance artifacts remain because they still support rollout and rollback decisions.
