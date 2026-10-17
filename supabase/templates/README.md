# Auth email templates

Polar Lights–branded templates for Supabase Auth (black and green, LIGHTS wordmark, Kp colour strip,
bulletproof button). Table layout with inline styles so they render in Gmail, Outlook and Apple Mail.
The icon loads from `https://www.polarlights.io/icons/icon-192.png`.

Edit `build.py` and run `python3 supabase/templates/build.py` to regenerate. Then paste each file into
**Supabase → Authentication → Emails**, set the subject, and **Save changes**. Security notifications are
only sent for the notices switched on under Authentication → Emails → Security.

| Dashboard template | File | Subject |
| --- | --- | --- |
| Confirm sign up | `confirmation.html` | Confirm your Polar Lights account |
| Reset password | `recovery.html` | Reset your Polar Lights password |
| Magic link | `magic_link.html` | Your Polar Lights sign-in link |
| Change email address | `email_change.html` | Confirm your new email address |
| Password changed | `password_changed.html` | Your Polar Lights password was changed |
| Email address changed | `email_changed.html` | Your Polar Lights email address was changed |
| Phone number changed | `phone_changed.html` | Your Polar Lights phone number was changed |
| Sign-in method linked | `identity_linked.html` | A sign-in method was linked to your Polar Lights account |
| Sign-in method removed | `identity_unlinked.html` | A sign-in method was removed from your Polar Lights account |
| MFA method added | `mfa_factor_enrolled.html` | A verification method was added to your Polar Lights account |
| MFA method removed | `mfa_factor_unenrolled.html` | A verification method was removed from your Polar Lights account |

Variables: `{{ .ConfirmationURL }}` (one-time links), `{{ .Email }}`, `{{ .NewEmail }}` (change email),
`{{ .OldEmail }}` (email changed), `{{ .Phone }}` / `{{ .OldPhone }}` (phone changed),
`{{ .Provider }}` (sign-in method linked/removed), `{{ .FactorType }}` (MFA added/removed).
Security notices link to https://www.polarlights.io/dashboard and end with what to do if the change wasn't the account owner.
