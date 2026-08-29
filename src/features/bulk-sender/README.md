# Bulk Sender setup

Bulk Sender creates Outlook drafts through Microsoft Graph. It never sends email. Gmail remains a
legacy fallback when Outlook credentials are not configured.

Configure these server-only environment variables:

```text
OUTLOOK_TENANT_ID=
OUTLOOK_CLIENT_ID=
OUTLOOK_CLIENT_SECRET=
OUTLOOK_MAILBOX=
OUTLOOK_SIGNATURE_HTML=
```

In Microsoft Entra, grant the app the Microsoft Graph `Mail.ReadWrite` application permission and
approve tenant admin consent. The app uses the client credentials flow and creates drafts in the
mailbox supplied by `OUTLOOK_MAILBOX`.

Microsoft Graph does not expose the signature saved in Outlook. If a signature is required, put its
HTML in the optional `OUTLOOK_SIGNATURE_HTML` environment variable. Otherwise, Outlook drafts are
created without an automatic signature.

For the legacy Gmail fallback, configure:

```text
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
```

The refresh token must include both OAuth scopes:

```text
https://www.googleapis.com/auth/gmail.compose
https://www.googleapis.com/auth/gmail.settings.basic
```

The app reads the default Gmail send-as signature with `gmail.settings.basic`, preserves its HTML,
and appends it to the HTML part of every multipart draft. `gmail.compose` is used only to create
drafts.

## Storage and access

This app currently has shared password authentication rather than member accounts. Bulk Sender
therefore creates a stable ID in each browser and saves that browser's unfinished grid and template
to local storage. Clearing that browser's site data removes its workspace snapshot.

Queue state, row results, the ten-second user cooldown, idempotency records, and 24-hour duplicate
fingerprints are stored server-side in the existing shared Google Sheets `AppSettings` worksheet.
Writable queue requests require the current shared app password. Outlook and Gmail credentials
remain on the server and are never returned to the browser or written to logs.
