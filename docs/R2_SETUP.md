# Cloudflare R2 setup

R2 is optional during early hot-data development but required before production archival
or deletion verification can be considered ready. The browser must never call R2.

## Manual Cloudflare setup

1. Enable R2 for the intended Cloudflare account.
2. Create a dedicated private bucket, for example `tubemilestones-history`.
3. Choose the jurisdiction or location hint that matches the project's data policy.
4. Keep Standard storage class initially; do not add lifecycle deletion rules that can
   race the application manifest lifecycle.
5. Create an R2 API token scoped to **Object Read & Write** for this bucket only.
6. Record the generated Access Key ID.
7. Record the generated Secret Access Key once and protect it as a credential.
8. Record the Cloudflare account ID.
9. Build or copy the correct S3 endpoint:
   `https://ACCOUNT_ID.r2.cloudflarestorage.com`.
10. Add these Supabase Edge secrets:

    ```text
    R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
    R2_BUCKET=tubemilestones-history
    R2_ACCESS_KEY_ID=...
    R2_SECRET_ACCESS_KEY=...
    ```

11. In a non-production user/channel, test upload, HEAD metadata, download, decrypt,
    checksum/row-count verification, delete, and verified absence.
12. Keep public access, custom public domains, and unauthenticated bucket listing off.

Do not put these values in GitHub repository variables, Vite files, logs, screenshots,
or the browser. Rotate the token if it is ever exposed.

## Object design

```text
archive/{user_uuid}/{channel_uuid}/{YYYY}/{MM}.tmar
```

Each object contains one complete older calendar month for one user and channel. The
payload contains canonical JSON analytics/snapshot rows, gzip-compressed before
application-level encryption. R2 therefore stores only ciphertext, even though the bucket
is also private.

## Encryption envelope

- Cipher: AES-256-GCM
- Compression: gzip before encryption
- Per-user key: HKDF-SHA-256 from the archive master key
- HKDF salt: exact user UUID bytes/text encoding defined in code
- HKDF info: the versioned TubeMilestones archive context defined in code
- Nonce: fresh random 96-bit IV per object
- Envelope: `TMAR` magic, format version, key version, IV, ciphertext, GCM tag
- Integrity: GCM authentication plus manifest SHA-256 and row-count verification

An R2 object is not trusted merely because upload succeeded. Archive maintenance must
HEAD it, validate metadata, download it, verify checksum, decrypt, parse, and compare row
counts before setting its manifest to `READY`. Hot rows are deleted only after that state.

## Failure and recovery

- Upload failure leaves hot rows untouched and a retryable manifest state.
- Verification failure leaves hot rows untouched and marks the object/manifest for retry.
- A `READY` manifest followed by hot-delete failure is safe: later reads merge by date and
  hot rows win; maintenance retries deletion.
- Non-`READY` manifests are recovery candidates on later maintenance runs.
- Corruption or R2 outage returns recent hot history with a typed partial warning when
  possible; corrupt bytes are never sent to the browser.

## Key rotation

`key_version` is stored in the envelope and manifest. To rotate, add a new Supabase
secret such as `ARCHIVE_MASTER_KEY_V2`, switch new writes deliberately, re-encrypt old
objects with full verification, then retire V1 only after no V1 manifests remain. Losing
an old master key makes corresponding archives unrecoverable.
