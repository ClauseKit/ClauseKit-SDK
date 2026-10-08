# Hashing contract (`spec-v1.0.0`)

## 1) Output payload hash (`sha256_hash`)

1. Take the output text.
2. Normalize text to Unicode NFC.
3. Encode normalized text as UTF-8 bytes.
4. Compute SHA-256 over those bytes.
5. Serialize digest as **lowercase** hexadecimal (64 chars).

### Notes

- No BOM is added.
- NFC normalization is required before hashing.
- Equivalent strings that differ only by canonical composition (for example `e` + combining accent vs `é`) must hash identically.

## 2) Ledger entry hash (`entry_sha256`)

`entry_sha256` is the SHA-256 digest (lowercase hex) of a UTF-8 preimage built from:

1. `prev_hash`
2. `client_id`
3. `sha256_hash`
4. `model`
5. `timestamp`
6. `compliance_version`

### Canonical field serialization

Each field is serialized as:

`<utf8_byte_length_of_nfc_value>:<nfc_value>`

Concatenate serialized fields in the exact order above **with no extra separators**.

### Determinism requirements

- All fields are treated as strings.
- `null` is invalid (must not be coerced).
- `timestamp` must be the exact RFC 3339 string stored in the ledger entry (SDK uses `Date.toISOString()` UTC form).
- All text fields are NFC-normalized before byte-length and concatenation.
- UTF-8 is always the byte encoding.
- Hash hex output is always lowercase.
