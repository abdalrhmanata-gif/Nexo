# ZAVQERA Web API Contract

This is the minimal future API surface for replacing the local Web repository.
It is a design contract only; no routes or production API are implemented.

All endpoints require a valid authenticated session. The server derives the
user and account/workspace scope from that session. Client-supplied ownership,
tenant, authority, or security fields are ignored or rejected.

## Common shapes

Mission responses contain:

```json
{
  "id": "mission-id",
  "objective": "Renew my passport",
  "state": "WAITING",
  "actions": [
    { "id": "action-id", "description": "Collect documents", "order": 1, "completed": false }
  ],
  "progress": { "completed": 0, "total": 1 },
  "followUpAt": "2026-10-01T09:00:00Z",
  "verification": null,
  "outcome": null,
  "updatedAt": "2026-09-21T17:00:00Z"
}
```

Create requests contain only the initial user-authored objective and ordered
Actions:

```json
{
  "objective": "Renew my passport",
  "actions": [{ "description": "Collect documents", "order": 1 }]
}
```

Patch requests contain only explicitly changed editable fields, such as
`objective`, `actions`, `state`, or `followUpAt`. The server validates every
state transition and derives progress.

## Endpoints

| Method and path | Request | Success |
| --- | --- | --- |
| `GET /api/missions` | optional server-supported pagination | `200` with `{ "missions": [...] }` |
| `POST /api/missions` | create request above | `201` with one Mission |
| `GET /api/missions/:id` | none | `200` with one Mission |
| `PATCH /api/missions/:id` | patch request above | `200` with updated Mission |
| `DELETE /api/missions/:id` | none | `204` |

## Errors

Use a stable envelope:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

Expected statuses are `400` for malformed or invalid input, `401` for a
missing/invalid session, `403` for an authenticated user without ownership
or account access, `404` for an unavailable Mission, `409` for a stale
revision or conflicting state change, and `500` for an unexpected server
failure. Error messages must not disclose protected data.

The future API repository will implement `MissionRepository` and translate
these responses into the Web view-model boundary. The current local mock
repository remains the only implementation until authenticated server access
is intentionally introduced.
