# Auth email templates

Polar Lights–branded templates for Supabase Auth (black and green, LIGHTS wordmark, Kp colour strip,
bulletproof button). Table layout with inline styles so they render in Gmail, Outlook and Apple Mail.
The icon loads from `https://www.polarlights.io/icons/icon-192.png`.

**Languages (#28):** every template and subject holds English, Spanish, French, German and Dutch and picks
one with Go-template conditionals on the user's saved language (`{{ .Data.locale }}`, user metadata set at
sign-up and by the app). Anyone without a saved language gets English.

Edit `build.py` and run `python3 supabase/templates/build.py` to regenerate. Then, for each row, paste the
`.html` file into **Supabase → Authentication → Emails** as the message body and the matching
`subjects/*.txt` line as the **Subject**, and **Save changes**. Security notifications are only sent for the
notices switched on under Authentication → Emails → Security.

| Dashboard template | Body | Subject (paste the whole line) | English subject |
| --- | --- | --- | --- |
| Confirm sign up | `confirmation.html` | `subjects/confirmation.txt` | Confirm your Polar Lights account |
| Reset password | `recovery.html` | `subjects/recovery.txt` | Reset your Polar Lights password |
| Magic link | `magic_link.html` | `subjects/magic_link.txt` | Your Polar Lights sign-in link |
| Change email address | `email_change.html` | `subjects/email_change.txt` | Confirm your new email address |
| Password changed | `password_changed.html` | `subjects/password_changed.txt` | Your Polar Lights password was changed |
| Email address changed | `email_changed.html` | `subjects/email_changed.txt` | Your Polar Lights email address was changed |
| Phone number changed | `phone_changed.html` | `subjects/phone_changed.txt` | Your Polar Lights phone number was changed |
| Sign-in method linked | `identity_linked.html` | `subjects/identity_linked.txt` | A sign-in method was linked to your Polar Lights account |
| Sign-in method removed | `identity_unlinked.html` | `subjects/identity_unlinked.txt` | A sign-in method was removed from your Polar Lights account |
| MFA method added | `mfa_factor_enrolled.html` | `subjects/mfa_factor_enrolled.txt` | A verification method was added to your Polar Lights account |
| MFA method removed | `mfa_factor_unenrolled.html` | `subjects/mfa_factor_unenrolled.txt` | A verification method was removed from your Polar Lights account |

Variables: `{{ .ConfirmationURL }}` (one-time links), `{{ .Email }}`, `{{ .NewEmail }}` (change email),
`{{ .OldEmail }}` (email changed), `{{ .Phone }}` / `{{ .OldPhone }}` (phone changed),
`{{ .Provider }}` (sign-in method linked/removed), `{{ .FactorType }}` (MFA added/removed), `{{ .Data.locale }}`.
Security notices link to https://www.polarlights.io/dashboard and end with what to do if the change wasn't the account owner.
