# Compliance headers (`spec-v1.0.0`)

These headers are produced by `getComplianceHeaders(sha256Hash, verificationId)` in `src/core/marking.ts`.

## Header contract

| Header | Value format | Source |
| --- | --- | --- |
| `X-AI-Generated` | Literal string `true` | Constant |
| `X-EU-AI-Act-Article` | Literal string `50(2)` | Constant |
| `X-ClauseKit-Verification-ID` | `ck_live_` + 24 lowercase hex characters (`^ck_live_[0-9a-f]{24}$`) | `wrapOpenAI` generates from `randomUUID()` |
| `X-ClauseKit-Payload-Hash` | 64 lowercase hex characters (`^[0-9a-f]{64}$`) | SHA-256 of output text as defined in `spec/hashing.md` |

## When headers are sent

- Ledger ingest (`POST` to `ledgerEndpoint` in `wrapOpenAI`) **does not** send these headers; it sends JSON body fields (`client_id`, `sha256_hash`, `model`, `timestamp`, `compliance_version`).
- Wrapped SDK responses include `_compliance_headers` by default.
- If `wrapOpenAI(..., { includeHeadersInResponse: false })` is set, `_compliance_headers` is omitted from the returned response object.
