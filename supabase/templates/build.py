"""Builds the Polar Lights Supabase Auth email templates in this folder.

Run `python3 supabase/templates/build.py` after editing, then paste each .html into
Supabase → Authentication → Emails (subjects are listed in README.md).
"""
from pathlib import Path

HERE = Path(__file__).parent
SITE = 'https://www.polarlights.io'

LAYOUT = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>{title}</title>
</head>
<body style="margin:0;padding:0;background-color:#000000;">
<!-- Inbox preview text -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">{preheader}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#000000" style="background-color:#000000;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <!-- Wordmark -->
        <tr>
          <td style="padding:0 4px 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:12px;vertical-align:middle;">
                  <img src="https://www.polarlights.io/icons/icon-192.png" width="40" height="40" alt="" style="display:block;border:0;border-radius:10px;">
                </td>
                <td style="vertical-align:middle;font-family:'Arial Black',Arial,Helvetica,sans-serif;font-size:22px;font-weight:900;letter-spacing:1px;color:#ffffff;">
                  POLAR <span style="color:#6CFF2B;">LIGHTS</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Card -->
        <tr>
          <td bgcolor="#0B0D0C" style="background-color:#0B0D0C;border:1px solid #2A302C;border-radius:16px;">
            <!-- Kp colour strip (green, yellow, orange, red) -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td height="4" bgcolor="#2FA84A" style="height:4px;line-height:4px;font-size:0;border-top-left-radius:16px;">&nbsp;</td>
                <td height="4" bgcolor="#E6B800" style="height:4px;line-height:4px;font-size:0;">&nbsp;</td>
                <td height="4" bgcolor="#FF9A3C" style="height:4px;line-height:4px;font-size:0;">&nbsp;</td>
                <td height="4" bgcolor="#F06A6A" style="height:4px;line-height:4px;font-size:0;border-top-right-radius:16px;">&nbsp;</td>
              </tr>
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:32px 32px 8px;font-family:'Courier New',Courier,monospace;font-size:12px;letter-spacing:2px;color:{kicker_color};">{kicker}</td>
              </tr>
              <tr>
                <td style="padding:0 32px 16px;font-family:'Arial Black',Arial,Helvetica,sans-serif;font-size:30px;line-height:34px;font-weight:900;color:#ffffff;text-transform:uppercase;">{heading}</td>
              </tr>
              <tr>
                <td style="padding:0 32px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#C9D0CB;">{body}</td>
              </tr>
              <tr>
                <td style="padding:0 32px {button_pad}px;">
                  <!-- Button -->
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" bgcolor="#6CFF2B" style="background-color:#6CFF2B;border-radius:999px;">
                        <a href="{href}" target="_blank" style="display:inline-block;padding:15px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#000000;text-decoration:none;border-radius:999px;">{button}</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
{after_button}            </table>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:24px 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#7D857F;">
            {footer}<br><br>
            <a href="https://www.polarlights.io" target="_blank" style="color:#6CFF2B;text-decoration:none;font-weight:700;">polarlights.io</a>
            <span style="color:#4A504C;">&nbsp;·&nbsp;</span>Live aurora forecasts and alerts for your sky
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
"""

# Plain-link fallback under the button for emails that carry a one-time link.
LINK_FALLBACK = """              <tr>
                <td style="padding:0 32px 32px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#9AA39D;">
                  Button not working? Copy this link into your browser:<br>
                  <a href="{{ .ConfirmationURL }}" target="_blank" style="color:#6CFF2B;word-break:break-all;">{{ .ConfirmationURL }}</a>
                </td>
              </tr>
"""

# Security notices end with what to do if the change wasn't the account owner.
NOT_YOU = """              <tr>
                <td style="padding:0 32px 32px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#9AA39D;">
                  <strong style="color:#F06A6A;">Wasn’t you?</strong> {advice}
                </td>
              </tr>
"""

G = lambda s: f'<span style="color:#6CFF2B;">{s}</span>'
W = lambda s: f'<strong style="color:#ffffff;">{s}</strong>'
SECURE = 'Sign in and change your password right away, then check the sign-in and verification methods on your account.'
NOTICE_FOOTER = 'We send this security notice whenever important details on your Polar Lights account change. It was sent automatically; replies aren’t monitored.'

# (file, dashboard name, subject, fields)
TEMPLATES = [
  # Authentication emails (one-time links)
  ('confirmation', 'Confirm sign up', 'Confirm your Polar Lights account', dict(
    title='Confirm your email', preheader='One tap to finish setting up your Polar Lights account.',
    kicker='WELCOME', heading=f'Confirm your {G("email")}',
    body='Thanks for joining Polar Lights. Confirm this address to finish setting up your account and start getting aurora forecasts and alerts for your sky.',
    button='Confirm email address',
    footer='You received this because someone signed up for Polar Lights with {{ .Email }}. If that wasn’t you, you can ignore this email and no account will be created.')),
  ('recovery', 'Reset password', 'Reset your Polar Lights password', dict(
    title='Reset your password', preheader='Choose a new password for your Polar Lights account.',
    kicker='PASSWORD RESET', heading=f'Reset your {G("password")}',
    body='We received a request to reset the password for your Polar Lights account. Use the button below to choose a new one. For your security, the link works only once.',
    button='Choose a new password',
    footer='This was requested for {{ .Email }}. If you didn’t ask to reset your password, you can ignore this email; your password won’t change.')),
  ('magic_link', 'Magic link', 'Your Polar Lights sign-in link', dict(
    title='Sign in to Polar Lights', preheader='Your one-time link to sign in to Polar Lights.',
    kicker='SIGN IN', heading=f'Sign in to {G("Polar Lights")}',
    body='Use the button below to sign in. The link works once and expires shortly, so use it soon.',
    button='Sign in',
    footer='This link was requested for {{ .Email }}. If you didn’t try to sign in, you can ignore this email.')),
  ('email_change', 'Change email address', 'Confirm your new email address', dict(
    title='Confirm your new email', preheader='Confirm the new email address for your Polar Lights account.',
    kicker='EMAIL CHANGE', heading=f'Confirm your {G("new email")}',
    body=f'Confirm that you want to change the email address on your Polar Lights account from {W("{{ .Email }}")} to {W("{{ .NewEmail }}")}.',
    button='Confirm new email',
    footer='If you didn’t request this change, ignore this email and your address will stay the same.')),
  # Security notifications (no one-time link)
  ('password_changed', 'Password changed', 'Your Polar Lights password was changed', dict(
    title='Your password was changed', preheader='The password on your Polar Lights account was just changed.',
    heading=f'Password {G("changed")}',
    body=f'The password for your Polar Lights account ({W("{{ .Email }}")}) was just changed. If you made this change, there’s nothing else to do.',
    button='Go to your dashboard', advice='Reset your password right away using “Forgot your password?” on the sign-in page, then check the sign-in and verification methods on your account.')),
  ('email_changed', 'Email address changed', 'Your Polar Lights email address was changed', dict(
    title='Your email address was changed', preheader='The email address on your Polar Lights account was changed.',
    heading=f'Email address {G("changed")}',
    body=f'The email address on your Polar Lights account was changed from {W("{{ .OldEmail }}")} to {W("{{ .Email }}")}. Sign-in and alert emails now go to the new address.',
    button='Go to your dashboard', advice='Reset your password from the sign-in page right away and change the email address back under Dashboard.')),
  ('phone_changed', 'Phone number changed', 'Your Polar Lights phone number was changed', dict(
    title='Your phone number was changed', preheader='The phone number on your Polar Lights account was changed.',
    heading=f'Phone number {G("changed")}',
    body=f'The phone number on your Polar Lights account was changed from {W("{{ .OldPhone }}")} to {W("{{ .Phone }}")}.',
    button='Go to your dashboard', advice=SECURE)),
  ('identity_linked', 'Sign-in method linked', 'A sign-in method was linked to your Polar Lights account', dict(
    title='New sign-in method linked', preheader='A new way to sign in was added to your Polar Lights account.',
    heading=f'Sign-in method {G("linked")}',
    body=f'You can now sign in to your Polar Lights account ({W("{{ .Email }}")}) with {W("{{ .Provider }}")}.',
    button='Go to your dashboard', advice=SECURE)),
  ('identity_unlinked', 'Sign-in method removed', 'A sign-in method was removed from your Polar Lights account', dict(
    title='Sign-in method removed', preheader='A way to sign in was removed from your Polar Lights account.',
    heading=f'Sign-in method {G("removed")}',
    body=f'{W("{{ .Provider }}")} can no longer be used to sign in to your Polar Lights account ({W("{{ .Email }}")}).',
    button='Go to your dashboard', advice=SECURE)),
  ('mfa_factor_enrolled', 'MFA method added', 'A verification method was added to your Polar Lights account', dict(
    title='Verification method added', preheader='A new two-step verification method was added to your account.',
    heading=f'Verification method {G("added")}',
    body=f'A new {W("{{ .FactorType }}")} verification method was added to your Polar Lights account ({W("{{ .Email }}")}). It will be asked for when you sign in.',
    button='Go to your dashboard', advice=SECURE)),
  ('mfa_factor_unenrolled', 'MFA method removed', 'A verification method was removed from your Polar Lights account', dict(
    title='Verification method removed', preheader='A two-step verification method was removed from your account.',
    heading=f'Verification method {G("removed")}',
    body=f'A {W("{{ .FactorType }}")} verification method was removed from your Polar Lights account ({W("{{ .Email }}")}).',
    button='Go to your dashboard', advice=SECURE)),
]

for name, _, _, f in TEMPLATES:
    notice = 'advice' in f
    html = LAYOUT.format(
        title=f['title'], preheader=f['preheader'], heading=f['heading'], body=f['body'], button=f['button'],
        kicker='SECURITY NOTICE' if notice else f['kicker'],
        kicker_color='#E6B800' if notice else '#6CFF2B',
        href=f'{SITE}/dashboard' if notice else '{{ .ConfirmationURL }}',
        button_pad=20 if notice else 28,
        after_button=NOT_YOU.format(advice=f['advice']) if notice else LINK_FALLBACK,
        footer=NOTICE_FOOTER if notice else f['footer'],
    )
    (HERE / f'{name}.html').write_text(html)

rows = '\n'.join(f'| {dash} | `{name}.html` | {subj} |' for name, dash, subj, _ in TEMPLATES)
(HERE / 'README.md').write_text(f"""# Auth email templates

Polar Lights–branded templates for Supabase Auth (black and green, LIGHTS wordmark, Kp colour strip,
bulletproof button). Table layout with inline styles so they render in Gmail, Outlook and Apple Mail.
The icon loads from `https://www.polarlights.io/icons/icon-192.png`.

Edit `build.py` and run `python3 supabase/templates/build.py` to regenerate. Then paste each file into
**Supabase → Authentication → Emails**, set the subject, and **Save changes**. Security notifications are
only sent for the notices switched on under Authentication → Emails → Security.

| Dashboard template | File | Subject |
| --- | --- | --- |
{rows}

Variables: `{{{{ .ConfirmationURL }}}}` (one-time links), `{{{{ .Email }}}}`, `{{{{ .NewEmail }}}}` (change email),
`{{{{ .OldEmail }}}}` (email changed), `{{{{ .Phone }}}}` / `{{{{ .OldPhone }}}}` (phone changed),
`{{{{ .Provider }}}}` (sign-in method linked/removed), `{{{{ .FactorType }}}}` (MFA added/removed).
Security notices link to {SITE}/dashboard and end with what to do if the change wasn't the account owner.
""")
print('built', len(TEMPLATES), 'templates')
