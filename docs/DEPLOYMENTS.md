# Deployment lifecycle API

The deployment module gives CI systems a small, idempotent API for recording
build and deployment health. Requests require an operator (or administrator)
role and a bearer token issued by the normal authentication flow.

## Record a deployment

```sh
curl -X POST "$API_URL/deployments" \
  -H "Authorization: Bearer $DEPLOYMENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "github-${GITHUB_RUN_ID}",
    "environment": "production",
    "version": "${GITHUB_SHA::12}",
    "commitSha": "'"$GITHUB_SHA"'",
    "metadata": {"workflow": "deploy", "runUrl": "'"$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"'"}
  }'
```

`externalId` is unique and makes retries safe: replaying the same CI event
returns the original deployment rather than creating a duplicate.

## Report status

Use `PATCH /deployments/:id/status` with `in_progress`, `succeeded`, or
`failed`. A failed event should include a useful `message`; it is stored as
the failure reason and in the immutable event history. Status transitions are
validated, so a completed deployment cannot silently move back to running.

## Rollbacks and history

`POST /deployments/:id/rollback` records an operator rollback request. The CI
rollback job should subsequently report `rolled_back` through the status
endpoint. `GET /deployments` supports `environment`, `status`, and `limit`
filters, while `GET /deployments/:id/history` provides the audit trail needed
for incident review and operator notifications.
