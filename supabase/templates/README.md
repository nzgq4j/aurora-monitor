# Auth email templates

Polar Lights–branded templates for Supabase Auth (black and green, LIGHTS wordmark, Kp colour strip,
bulletproof button, plain-link fallback). Table layout with inline styles so they render in Gmail,
Outlook and Apple Mail. The icon loads from `https://www.polarlights.io/icons/icon-192.png`.

Paste each into **Supabase → Authentication → Emails**, set the subject, and **Save changes**:

| Dashboard template | File | Subject |
| --- | --- | --- |
| Confirm sign up | `confirmation.html` | Confirm your Polar Lights account |
| Reset password | `recovery.html` | Reset your Polar Lights password |
| Magic link | `magic_link.html` | Your Polar Lights sign-in link |
| Change email address | `email_change.html` | Confirm your new email address |

Variables used: `{{ .ConfirmationURL }}`, `{{ .Email }}`, and `{{ .NewEmail }}` (change email only).
