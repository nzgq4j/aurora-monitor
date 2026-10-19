"""Builds the Polar Lights Supabase Auth email templates in this folder.

Run `python3 supabase/templates/build.py` after editing, then paste each .html into Supabase →
Authentication → Emails, with the subject from subjects/ (see README.md). Five languages, chosen per user (#28).
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
E, NE, OE, P, OP, PR, FT = (W(v) for v in ('{{ .Email }}', '{{ .NewEmail }}', '{{ .OldEmail }}', '{{ .Phone }}', '{{ .OldPhone }}', '{{ .Provider }}', '{{ .FactorType }}'))

# Languages, in the app's order; English is the fallback for anyone without a saved language (#28).
LANGS = ['en', 'es', 'fr', 'de', 'nl']

# Shared text per language.
SHARED = {
  'en': dict(notice='SECURITY NOTICE', wasnt='Wasn’t you?', fallback='Button not working? Copy this link into your browser:',
    tagline='Live aurora forecasts and alerts for your sky', dash='Go to your dashboard',
    secure='Sign in and change your password right away, then check the sign-in and verification methods on your account.',
    notice_footer='We send this security notice whenever important details on your Polar Lights account change. It was sent automatically; replies aren’t monitored.'),
  'es': dict(notice='AVISO DE SEGURIDAD', wasnt='¿No fuiste tú?', fallback='¿El botón no funciona? Copia este enlace en tu navegador:',
    tagline='Previsiones y alertas de auroras en directo para tu cielo', dash='Ir a tu panel',
    secure='Inicia sesión y cambia tu contraseña de inmediato; después revisa los métodos de inicio de sesión y verificación de tu cuenta.',
    notice_footer='Enviamos este aviso de seguridad cada vez que cambian datos importantes de tu cuenta de Polar Lights. Se ha enviado automáticamente; las respuestas no se leen.'),
  'fr': dict(notice='AVIS DE SÉCURITÉ', wasnt='Ce n’était pas vous ?', fallback='Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :',
    tagline='Prévisions et alertes d’aurores en direct pour votre ciel', dash='Aller au tableau de bord',
    secure='Connectez-vous et changez votre mot de passe sans attendre, puis vérifiez les méthodes de connexion et de vérification de votre compte.',
    notice_footer='Nous envoyons cet avis de sécurité chaque fois que des informations importantes de votre compte Polar Lights changent. Il a été envoyé automatiquement ; les réponses ne sont pas lues.'),
  'de': dict(notice='SICHERHEITSHINWEIS', wasnt='Das waren nicht Sie?', fallback='Schaltfläche funktioniert nicht? Kopieren Sie diesen Link in Ihren Browser:',
    tagline='Polarlicht-Vorhersagen und -Alarme live für Ihren Himmel', dash='Zum Dashboard',
    secure='Melden Sie sich an und ändern Sie sofort Ihr Passwort; prüfen Sie danach die Anmelde- und Bestätigungsmethoden Ihres Kontos.',
    notice_footer='Wir senden diesen Sicherheitshinweis, wenn sich wichtige Angaben in Ihrem Polar-Lights-Konto ändern. Er wurde automatisch versendet; Antworten werden nicht gelesen.'),
  'nl': dict(notice='BEVEILIGINGSMELDING', wasnt='Was jij dit niet?', fallback='Werkt de knop niet? Kopieer deze link naar je browser:',
    tagline='Live noorderlichtverwachtingen en -meldingen voor jouw hemel', dash='Naar je dashboard',
    secure='Log in en wijzig meteen je wachtwoord; controleer daarna de aanmeld- en verificatiemethoden van je account.',
    notice_footer='We sturen deze beveiligingsmelding wanneer belangrijke gegevens van je Polar Lights-account veranderen. Hij is automatisch verstuurd; antwoorden worden niet gelezen.'),
}

# (file, dashboard name, {lang: fields}). Security notices have `advice` (what to do if it wasn't the owner).
TEMPLATES = [
  ('confirmation', 'Confirm sign up', {
    'en': dict(subject='Confirm your Polar Lights account', title='Confirm your email', preheader='One tap to finish setting up your Polar Lights account.',
      kicker='WELCOME', heading=f'Confirm your {G("email")}',
      body='Thanks for joining Polar Lights. Confirm this address to finish setting up your account and start getting aurora forecasts and alerts for your sky.',
      button='Confirm email address',
      footer='You received this because someone signed up for Polar Lights with {{ .Email }}. If that wasn’t you, you can ignore this email and no account will be created.'),
    'es': dict(subject='Confirma tu cuenta de Polar Lights', title='Confirma tu correo', preheader='Un toque para terminar de configurar tu cuenta de Polar Lights.',
      kicker='BIENVENIDA', heading=f'Confirma tu {G("correo")}',
      body='Gracias por unirte a Polar Lights. Confirma esta dirección para terminar de configurar tu cuenta y empezar a recibir previsiones y alertas de auroras para tu cielo.',
      button='Confirmar correo',
      footer='Has recibido este correo porque alguien se registró en Polar Lights con {{ .Email }}. Si no fuiste tú, ignora este correo y no se creará ninguna cuenta.'),
    'fr': dict(subject='Confirmez votre compte Polar Lights', title='Confirmez votre e-mail', preheader='Un geste pour finir de configurer votre compte Polar Lights.',
      kicker='BIENVENUE', heading=f'Confirmez votre {G("e-mail")}',
      body='Merci de rejoindre Polar Lights. Confirmez cette adresse pour finir de configurer votre compte et recevoir les prévisions et alertes d’aurores pour votre ciel.',
      button='Confirmer l’adresse e-mail',
      footer='Vous recevez cet e-mail car quelqu’un s’est inscrit à Polar Lights avec {{ .Email }}. Si ce n’était pas vous, ignorez cet e-mail : aucun compte ne sera créé.'),
    'de': dict(subject='Bestätigen Sie Ihr Polar-Lights-Konto', title='Bestätigen Sie Ihre E-Mail-Adresse', preheader='Ein Tipp, um Ihr Polar-Lights-Konto fertig einzurichten.',
      kicker='WILLKOMMEN', heading=f'E-Mail {G("bestätigen")}',
      body='Danke, dass Sie Polar Lights nutzen. Bestätigen Sie diese Adresse, um Ihr Konto fertig einzurichten und Polarlicht-Vorhersagen und -Alarme für Ihren Himmel zu erhalten.',
      button='E-Mail-Adresse bestätigen',
      footer='Sie erhalten diese E-Mail, weil sich jemand mit {{ .Email }} bei Polar Lights registriert hat. Wenn Sie das nicht waren, ignorieren Sie diese E-Mail; es wird kein Konto angelegt.'),
    'nl': dict(subject='Bevestig je Polar Lights-account', title='Bevestig je e-mailadres', preheader='Eén tik om je Polar Lights-account af te ronden.',
      kicker='WELKOM', heading=f'Bevestig je {G("e-mail")}',
      body='Bedankt dat je Polar Lights gebruikt. Bevestig dit adres om je account af te ronden en noorderlichtverwachtingen en -meldingen voor jouw hemel te ontvangen.',
      button='E-mailadres bevestigen',
      footer='Je ontvangt deze e-mail omdat iemand zich met {{ .Email }} heeft aangemeld bij Polar Lights. Was jij dat niet, negeer deze e-mail dan; er wordt geen account aangemaakt.'),
  }),
  ('recovery', 'Reset password', {
    'en': dict(subject='Reset your Polar Lights password', title='Reset your password', preheader='Choose a new password for your Polar Lights account.',
      kicker='PASSWORD RESET', heading=f'Reset your {G("password")}',
      body='We received a request to reset the password for your Polar Lights account. Use the button below to choose a new one. For your security, the link works only once.',
      button='Choose a new password',
      footer='This was requested for {{ .Email }}. If you didn’t ask to reset your password, you can ignore this email; your password won’t change.'),
    'es': dict(subject='Restablece tu contraseña de Polar Lights', title='Restablece tu contraseña', preheader='Elige una contraseña nueva para tu cuenta de Polar Lights.',
      kicker='RESTABLECER CONTRASEÑA', heading=f'Restablece tu {G("contraseña")}',
      body='Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de Polar Lights. Usa el botón de abajo para elegir una nueva. Por seguridad, el enlace solo funciona una vez.',
      button='Elegir una contraseña nueva',
      footer='Se solicitó para {{ .Email }}. Si no pediste restablecer tu contraseña, ignora este correo; tu contraseña no cambiará.'),
    'fr': dict(subject='Réinitialisez votre mot de passe Polar Lights', title='Réinitialisez votre mot de passe', preheader='Choisissez un nouveau mot de passe pour votre compte Polar Lights.',
      kicker='MOT DE PASSE', heading=f'Nouveau {G("mot de passe")}',
      body='Nous avons reçu une demande de réinitialisation du mot de passe de votre compte Polar Lights. Utilisez le bouton ci-dessous pour en choisir un nouveau. Par sécurité, le lien ne fonctionne qu’une fois.',
      button='Choisir un nouveau mot de passe',
      footer='Demande faite pour {{ .Email }}. Si vous n’avez pas demandé de réinitialisation, ignorez cet e-mail ; votre mot de passe ne changera pas.'),
    'de': dict(subject='Setzen Sie Ihr Polar-Lights-Passwort zurück', title='Passwort zurücksetzen', preheader='Wählen Sie ein neues Passwort für Ihr Polar-Lights-Konto.',
      kicker='PASSWORT ZURÜCKSETZEN', heading=f'Neues {G("Passwort")}',
      body='Wir haben eine Anfrage erhalten, das Passwort Ihres Polar-Lights-Kontos zurückzusetzen. Wählen Sie mit der Schaltfläche unten ein neues. Aus Sicherheitsgründen funktioniert der Link nur einmal.',
      button='Neues Passwort wählen',
      footer='Angefordert für {{ .Email }}. Wenn Sie das Zurücksetzen nicht angefordert haben, ignorieren Sie diese E-Mail; Ihr Passwort bleibt unverändert.'),
    'nl': dict(subject='Stel je Polar Lights-wachtwoord opnieuw in', title='Stel je wachtwoord opnieuw in', preheader='Kies een nieuw wachtwoord voor je Polar Lights-account.',
      kicker='WACHTWOORD HERSTELLEN', heading=f'Nieuw {G("wachtwoord")}',
      body='We hebben een verzoek ontvangen om het wachtwoord van je Polar Lights-account opnieuw in te stellen. Kies met de knop hieronder een nieuw wachtwoord. Voor je veiligheid werkt de link maar één keer.',
      button='Nieuw wachtwoord kiezen',
      footer='Aangevraagd voor {{ .Email }}. Heb jij dit niet aangevraagd, negeer deze e-mail dan; je wachtwoord blijft hetzelfde.'),
  }),
  ('magic_link', 'Magic link', {
    'en': dict(subject='Your Polar Lights sign-in link', title='Sign in to Polar Lights', preheader='Your one-time link to sign in to Polar Lights.',
      kicker='SIGN IN', heading=f'Sign in to {G("Polar Lights")}',
      body='Use the button below to sign in. The link works once and expires shortly, so use it soon.', button='Sign in',
      footer='This link was requested for {{ .Email }}. If you didn’t try to sign in, you can ignore this email.'),
    'es': dict(subject='Tu enlace para entrar en Polar Lights', title='Entra en Polar Lights', preheader='Tu enlace de un solo uso para entrar en Polar Lights.',
      kicker='INICIAR SESIÓN', heading=f'Entra en {G("Polar Lights")}',
      body='Usa el botón de abajo para iniciar sesión. El enlace funciona una vez y caduca pronto, así que úsalo enseguida.', button='Iniciar sesión',
      footer='Este enlace se solicitó para {{ .Email }}. Si no intentaste iniciar sesión, ignora este correo.'),
    'fr': dict(subject='Votre lien de connexion Polar Lights', title='Connexion à Polar Lights', preheader='Votre lien à usage unique pour vous connecter à Polar Lights.',
      kicker='CONNEXION', heading=f'Connexion à {G("Polar Lights")}',
      body='Utilisez le bouton ci-dessous pour vous connecter. Le lien ne fonctionne qu’une fois et expire rapidement : utilisez-le sans tarder.', button='Se connecter',
      footer='Ce lien a été demandé pour {{ .Email }}. Si vous n’avez pas essayé de vous connecter, ignorez cet e-mail.'),
    'de': dict(subject='Ihr Anmeldelink für Polar Lights', title='Bei Polar Lights anmelden', preheader='Ihr einmaliger Link zur Anmeldung bei Polar Lights.',
      kicker='ANMELDEN', heading=f'Anmelden bei {G("Polar Lights")}',
      body='Melden Sie sich mit der Schaltfläche unten an. Der Link funktioniert einmal und läuft bald ab, nutzen Sie ihn also zeitnah.', button='Anmelden',
      footer='Dieser Link wurde für {{ .Email }} angefordert. Wenn Sie sich nicht anmelden wollten, ignorieren Sie diese E-Mail.'),
    'nl': dict(subject='Je inloglink voor Polar Lights', title='Inloggen bij Polar Lights', preheader='Je eenmalige link om in te loggen bij Polar Lights.',
      kicker='INLOGGEN', heading=f'Inloggen bij {G("Polar Lights")}',
      body='Log in met de knop hieronder. De link werkt één keer en verloopt snel, dus gebruik hem meteen.', button='Inloggen',
      footer='Deze link is aangevraagd voor {{ .Email }}. Probeerde jij niet in te loggen, negeer deze e-mail dan.'),
  }),
  ('email_change', 'Change email address', {
    'en': dict(subject='Confirm your new email address', title='Confirm your new email', preheader='Confirm the new email address for your Polar Lights account.',
      kicker='EMAIL CHANGE', heading=f'Confirm your {G("new email")}',
      body=f'Confirm that you want to change the email address on your Polar Lights account from {E} to {NE}.', button='Confirm new email',
      footer='If you didn’t request this change, ignore this email and your address will stay the same.'),
    'es': dict(subject='Confirma tu nuevo correo', title='Confirma tu nuevo correo', preheader='Confirma la nueva dirección de correo de tu cuenta de Polar Lights.',
      kicker='CAMBIO DE CORREO', heading=f'Confirma tu {G("nuevo correo")}',
      body=f'Confirma que quieres cambiar la dirección de correo de tu cuenta de Polar Lights de {E} a {NE}.', button='Confirmar nuevo correo',
      footer='Si no solicitaste este cambio, ignora este correo y tu dirección seguirá siendo la misma.'),
    'fr': dict(subject='Confirmez votre nouvelle adresse e-mail', title='Confirmez votre nouvel e-mail', preheader='Confirmez la nouvelle adresse e-mail de votre compte Polar Lights.',
      kicker='CHANGEMENT D’E-MAIL', heading=f'Confirmez votre {G("nouvel e-mail")}',
      body=f'Confirmez que vous voulez remplacer l’adresse e-mail de votre compte Polar Lights {E} par {NE}.', button='Confirmer le nouvel e-mail',
      footer='Si vous n’avez pas demandé ce changement, ignorez cet e-mail ; votre adresse restera la même.'),
    'de': dict(subject='Bestätigen Sie Ihre neue E-Mail-Adresse', title='Neue E-Mail-Adresse bestätigen', preheader='Bestätigen Sie die neue E-Mail-Adresse Ihres Polar-Lights-Kontos.',
      kicker='E-MAIL-ÄNDERUNG', heading=f'Neue {G("E-Mail")} bestätigen',
      body=f'Bestätigen Sie, dass Sie die E-Mail-Adresse Ihres Polar-Lights-Kontos von {E} in {NE} ändern möchten.', button='Neue E-Mail bestätigen',
      footer='Wenn Sie diese Änderung nicht angefordert haben, ignorieren Sie diese E-Mail; Ihre Adresse bleibt unverändert.'),
    'nl': dict(subject='Bevestig je nieuwe e-mailadres', title='Bevestig je nieuwe e-mailadres', preheader='Bevestig het nieuwe e-mailadres van je Polar Lights-account.',
      kicker='E-MAIL WIJZIGEN', heading=f'Bevestig je {G("nieuwe e-mail")}',
      body=f'Bevestig dat je het e-mailadres van je Polar Lights-account wilt wijzigen van {E} naar {NE}.', button='Nieuw e-mailadres bevestigen',
      footer='Heb jij deze wijziging niet aangevraagd, negeer deze e-mail dan; je adres blijft hetzelfde.'),
  }),
  # Security notifications (no one-time link)
  ('password_changed', 'Password changed', {
    'en': dict(subject='Your Polar Lights password was changed', title='Your password was changed', preheader='The password on your Polar Lights account was just changed.',
      heading=f'Password {G("changed")}', body=f'The password for your Polar Lights account ({E}) was just changed. If you made this change, there’s nothing else to do.',
      advice='Reset your password right away using “Forgot your password?” on the sign-in page, then check the sign-in and verification methods on your account.'),
    'es': dict(subject='Se ha cambiado tu contraseña de Polar Lights', title='Se ha cambiado tu contraseña', preheader='Se acaba de cambiar la contraseña de tu cuenta de Polar Lights.',
      heading=f'Contraseña {G("cambiada")}', body=f'Se acaba de cambiar la contraseña de tu cuenta de Polar Lights ({E}). Si fuiste tú, no tienes que hacer nada más.',
      advice='Restablece tu contraseña de inmediato con «¿Olvidaste tu contraseña?» en la página de inicio de sesión y revisa después los métodos de inicio de sesión y verificación de tu cuenta.'),
    'fr': dict(subject='Le mot de passe de votre compte Polar Lights a été modifié', title='Votre mot de passe a été modifié', preheader='Le mot de passe de votre compte Polar Lights vient d’être modifié.',
      heading=f'Mot de passe {G("modifié")}', body=f'Le mot de passe de votre compte Polar Lights ({E}) vient d’être modifié. Si c’est vous, vous n’avez rien d’autre à faire.',
      advice='Réinitialisez votre mot de passe sans attendre avec « Mot de passe oublié ? » sur la page de connexion, puis vérifiez les méthodes de connexion et de vérification de votre compte.'),
    'de': dict(subject='Ihr Polar-Lights-Passwort wurde geändert', title='Ihr Passwort wurde geändert', preheader='Das Passwort Ihres Polar-Lights-Kontos wurde soeben geändert.',
      heading=f'Passwort {G("geändert")}', body=f'Das Passwort Ihres Polar-Lights-Kontos ({E}) wurde soeben geändert. Wenn Sie das waren, ist nichts weiter zu tun.',
      advice='Setzen Sie Ihr Passwort sofort über „Passwort vergessen?“ auf der Anmeldeseite zurück und prüfen Sie danach die Anmelde- und Bestätigungsmethoden Ihres Kontos.'),
    'nl': dict(subject='Je Polar Lights-wachtwoord is gewijzigd', title='Je wachtwoord is gewijzigd', preheader='Het wachtwoord van je Polar Lights-account is zojuist gewijzigd.',
      heading=f'Wachtwoord {G("gewijzigd")}', body=f'Het wachtwoord van je Polar Lights-account ({E}) is zojuist gewijzigd. Heb je dit zelf gedaan, dan hoef je verder niets te doen.',
      advice='Stel je wachtwoord meteen opnieuw in via “Wachtwoord vergeten?” op de inlogpagina en controleer daarna de aanmeld- en verificatiemethoden van je account.'),
  }),
  ('email_changed', 'Email address changed', {
    'en': dict(subject='Your Polar Lights email address was changed', title='Your email address was changed', preheader='The email address on your Polar Lights account was changed.',
      heading=f'Email address {G("changed")}', body=f'The email address on your Polar Lights account was changed from {OE} to {E}. Sign-in and alert emails now go to the new address.',
      advice='Reset your password from the sign-in page right away and change the email address back under Dashboard.'),
    'es': dict(subject='Se ha cambiado tu correo de Polar Lights', title='Se ha cambiado tu correo', preheader='Se ha cambiado la dirección de correo de tu cuenta de Polar Lights.',
      heading=f'Correo {G("cambiado")}', body=f'La dirección de correo de tu cuenta de Polar Lights ha cambiado de {OE} a {E}. Los correos de inicio de sesión y de alertas llegan ahora a la nueva dirección.',
      advice='Restablece tu contraseña desde la página de inicio de sesión de inmediato y vuelve a poner tu dirección en el Panel.'),
    'fr': dict(subject='L’adresse e-mail de votre compte Polar Lights a été modifiée', title='Votre adresse e-mail a été modifiée', preheader='L’adresse e-mail de votre compte Polar Lights a été modifiée.',
      heading=f'E-mail {G("modifié")}', body=f'L’adresse e-mail de votre compte Polar Lights est passée de {OE} à {E}. Les e-mails de connexion et d’alerte arrivent désormais à la nouvelle adresse.',
      advice='Réinitialisez votre mot de passe depuis la page de connexion sans attendre, puis rétablissez votre adresse dans le tableau de bord.'),
    'de': dict(subject='Die E-Mail-Adresse Ihres Polar-Lights-Kontos wurde geändert', title='Ihre E-Mail-Adresse wurde geändert', preheader='Die E-Mail-Adresse Ihres Polar-Lights-Kontos wurde geändert.',
      heading=f'E-Mail-Adresse {G("geändert")}', body=f'Die E-Mail-Adresse Ihres Polar-Lights-Kontos wurde von {OE} in {E} geändert. Anmelde- und Alarm-E-Mails gehen jetzt an die neue Adresse.',
      advice='Setzen Sie Ihr Passwort sofort über die Anmeldeseite zurück und ändern Sie die E-Mail-Adresse im Dashboard wieder zurück.'),
    'nl': dict(subject='Het e-mailadres van je Polar Lights-account is gewijzigd', title='Je e-mailadres is gewijzigd', preheader='Het e-mailadres van je Polar Lights-account is gewijzigd.',
      heading=f'E-mailadres {G("gewijzigd")}', body=f'Het e-mailadres van je Polar Lights-account is gewijzigd van {OE} naar {E}. Inlog- en meldingsmails gaan nu naar het nieuwe adres.',
      advice='Stel je wachtwoord meteen opnieuw in via de inlogpagina en zet je e-mailadres terug in het Dashboard.'),
  }),
  ('phone_changed', 'Phone number changed', {
    'en': dict(subject='Your Polar Lights phone number was changed', title='Your phone number was changed', preheader='The phone number on your Polar Lights account was changed.',
      heading=f'Phone number {G("changed")}', body=f'The phone number on your Polar Lights account was changed from {OP} to {P}.'),
    'es': dict(subject='Se ha cambiado tu teléfono de Polar Lights', title='Se ha cambiado tu teléfono', preheader='Se ha cambiado el número de teléfono de tu cuenta de Polar Lights.',
      heading=f'Teléfono {G("cambiado")}', body=f'El número de teléfono de tu cuenta de Polar Lights ha cambiado de {OP} a {P}.'),
    'fr': dict(subject='Le numéro de téléphone de votre compte Polar Lights a été modifié', title='Votre numéro de téléphone a été modifié', preheader='Le numéro de téléphone de votre compte Polar Lights a été modifié.',
      heading=f'Téléphone {G("modifié")}', body=f'Le numéro de téléphone de votre compte Polar Lights est passé de {OP} à {P}.'),
    'de': dict(subject='Die Telefonnummer Ihres Polar-Lights-Kontos wurde geändert', title='Ihre Telefonnummer wurde geändert', preheader='Die Telefonnummer Ihres Polar-Lights-Kontos wurde geändert.',
      heading=f'Telefonnummer {G("geändert")}', body=f'Die Telefonnummer Ihres Polar-Lights-Kontos wurde von {OP} in {P} geändert.'),
    'nl': dict(subject='Het telefoonnummer van je Polar Lights-account is gewijzigd', title='Je telefoonnummer is gewijzigd', preheader='Het telefoonnummer van je Polar Lights-account is gewijzigd.',
      heading=f'Telefoonnummer {G("gewijzigd")}', body=f'Het telefoonnummer van je Polar Lights-account is gewijzigd van {OP} naar {P}.'),
  }),
  ('identity_linked', 'Sign-in method linked', {
    'en': dict(subject='A sign-in method was linked to your Polar Lights account', title='New sign-in method linked', preheader='A new way to sign in was added to your Polar Lights account.',
      heading=f'Sign-in method {G("linked")}', body=f'You can now sign in to your Polar Lights account ({E}) with {PR}.'),
    'es': dict(subject='Se ha vinculado un método de inicio de sesión a tu cuenta de Polar Lights', title='Nuevo método de inicio de sesión', preheader='Se ha añadido una nueva forma de entrar en tu cuenta de Polar Lights.',
      heading=f'Método de acceso {G("vinculado")}', body=f'Ahora puedes iniciar sesión en tu cuenta de Polar Lights ({E}) con {PR}.'),
    'fr': dict(subject='Une méthode de connexion a été associée à votre compte Polar Lights', title='Nouvelle méthode de connexion', preheader='Une nouvelle façon de vous connecter a été ajoutée à votre compte Polar Lights.',
      heading=f'Connexion {G("associée")}', body=f'Vous pouvez désormais vous connecter à votre compte Polar Lights ({E}) avec {PR}.'),
    'de': dict(subject='Eine Anmeldemethode wurde mit Ihrem Polar-Lights-Konto verknüpft', title='Neue Anmeldemethode verknüpft', preheader='Ihrem Polar-Lights-Konto wurde eine neue Anmeldemöglichkeit hinzugefügt.',
      heading=f'Anmeldemethode {G("verknüpft")}', body=f'Sie können sich jetzt mit {PR} bei Ihrem Polar-Lights-Konto ({E}) anmelden.'),
    'nl': dict(subject='Er is een aanmeldmethode gekoppeld aan je Polar Lights-account', title='Nieuwe aanmeldmethode gekoppeld', preheader='Er is een nieuwe manier om in te loggen toegevoegd aan je Polar Lights-account.',
      heading=f'Aanmeldmethode {G("gekoppeld")}', body=f'Je kunt nu met {PR} inloggen op je Polar Lights-account ({E}).'),
  }),
  ('identity_unlinked', 'Sign-in method removed', {
    'en': dict(subject='A sign-in method was removed from your Polar Lights account', title='Sign-in method removed', preheader='A way to sign in was removed from your Polar Lights account.',
      heading=f'Sign-in method {G("removed")}', body=f'{PR} can no longer be used to sign in to your Polar Lights account ({E}).'),
    'es': dict(subject='Se ha quitado un método de inicio de sesión de tu cuenta de Polar Lights', title='Método de inicio de sesión quitado', preheader='Se ha quitado una forma de entrar en tu cuenta de Polar Lights.',
      heading=f'Método de acceso {G("quitado")}', body=f'Ya no se puede usar {PR} para iniciar sesión en tu cuenta de Polar Lights ({E}).'),
    'fr': dict(subject='Une méthode de connexion a été retirée de votre compte Polar Lights', title='Méthode de connexion retirée', preheader='Une façon de vous connecter a été retirée de votre compte Polar Lights.',
      heading=f'Connexion {G("retirée")}', body=f'{PR} ne permet plus de vous connecter à votre compte Polar Lights ({E}).'),
    'de': dict(subject='Eine Anmeldemethode wurde von Ihrem Polar-Lights-Konto entfernt', title='Anmeldemethode entfernt', preheader='Von Ihrem Polar-Lights-Konto wurde eine Anmeldemöglichkeit entfernt.',
      heading=f'Anmeldemethode {G("entfernt")}', body=f'{PR} kann nicht mehr zur Anmeldung bei Ihrem Polar-Lights-Konto ({E}) verwendet werden.'),
    'nl': dict(subject='Er is een aanmeldmethode verwijderd van je Polar Lights-account', title='Aanmeldmethode verwijderd', preheader='Er is een manier om in te loggen verwijderd van je Polar Lights-account.',
      heading=f'Aanmeldmethode {G("verwijderd")}', body=f'{PR} kan niet meer worden gebruikt om in te loggen op je Polar Lights-account ({E}).'),
  }),
  ('mfa_factor_enrolled', 'MFA method added', {
    'en': dict(subject='A verification method was added to your Polar Lights account', title='Verification method added', preheader='A new two-step verification method was added to your account.',
      heading=f'Verification method {G("added")}', body=f'A new {FT} verification method was added to your Polar Lights account ({E}). It will be asked for when you sign in.'),
    'es': dict(subject='Se ha añadido un método de verificación a tu cuenta de Polar Lights', title='Método de verificación añadido', preheader='Se ha añadido un nuevo método de verificación en dos pasos a tu cuenta.',
      heading=f'Verificación {G("añadida")}', body=f'Se ha añadido un nuevo método de verificación {FT} a tu cuenta de Polar Lights ({E}). Se te pedirá al iniciar sesión.'),
    'fr': dict(subject='Une méthode de vérification a été ajoutée à votre compte Polar Lights', title='Méthode de vérification ajoutée', preheader='Une nouvelle méthode de vérification en deux étapes a été ajoutée à votre compte.',
      heading=f'Vérification {G("ajoutée")}', body=f'Une nouvelle méthode de vérification {FT} a été ajoutée à votre compte Polar Lights ({E}). Elle vous sera demandée à la connexion.'),
    'de': dict(subject='Ihrem Polar-Lights-Konto wurde eine Bestätigungsmethode hinzugefügt', title='Bestätigungsmethode hinzugefügt', preheader='Ihrem Konto wurde eine neue Zwei-Schritt-Bestätigung hinzugefügt.',
      heading=f'Bestätigung {G("hinzugefügt")}', body=f'Ihrem Polar-Lights-Konto ({E}) wurde eine neue Bestätigungsmethode ({FT}) hinzugefügt. Sie wird bei der Anmeldung abgefragt.'),
    'nl': dict(subject='Er is een verificatiemethode toegevoegd aan je Polar Lights-account', title='Verificatiemethode toegevoegd', preheader='Er is een nieuwe verificatie in twee stappen toegevoegd aan je account.',
      heading=f'Verificatie {G("toegevoegd")}', body=f'Er is een nieuwe {FT}-verificatiemethode toegevoegd aan je Polar Lights-account ({E}). Die wordt gevraagd wanneer je inlogt.'),
  }),
  ('mfa_factor_unenrolled', 'MFA method removed', {
    'en': dict(subject='A verification method was removed from your Polar Lights account', title='Verification method removed', preheader='A two-step verification method was removed from your account.',
      heading=f'Verification method {G("removed")}', body=f'A {FT} verification method was removed from your Polar Lights account ({E}).'),
    'es': dict(subject='Se ha quitado un método de verificación de tu cuenta de Polar Lights', title='Método de verificación quitado', preheader='Se ha quitado un método de verificación en dos pasos de tu cuenta.',
      heading=f'Verificación {G("quitada")}', body=f'Se ha quitado un método de verificación {FT} de tu cuenta de Polar Lights ({E}).'),
    'fr': dict(subject='Une méthode de vérification a été retirée de votre compte Polar Lights', title='Méthode de vérification retirée', preheader='Une méthode de vérification en deux étapes a été retirée de votre compte.',
      heading=f'Vérification {G("retirée")}', body=f'Une méthode de vérification {FT} a été retirée de votre compte Polar Lights ({E}).'),
    'de': dict(subject='Von Ihrem Polar-Lights-Konto wurde eine Bestätigungsmethode entfernt', title='Bestätigungsmethode entfernt', preheader='Von Ihrem Konto wurde eine Zwei-Schritt-Bestätigung entfernt.',
      heading=f'Bestätigung {G("entfernt")}', body=f'Von Ihrem Polar-Lights-Konto ({E}) wurde eine Bestätigungsmethode ({FT}) entfernt.'),
    'nl': dict(subject='Er is een verificatiemethode verwijderd van je Polar Lights-account', title='Verificatiemethode verwijderd', preheader='Er is een verificatie in twee stappen verwijderd van je account.',
      heading=f'Verificatie {G("verwijderd")}', body=f'Er is een {FT}-verificatiemethode verwijderd van je Polar Lights-account ({E}).'),
  }),
]

# The user's saved language (user metadata `locale`, set at sign-up and by the app). printf turns a missing
# value into "<nil>", so `eq` always compares two strings and anyone without a language gets English.
PICK = '{{ $l := printf "%v" .Data.locale }}'

def choose(by_lang):
    """One Go-template conditional that picks the text for the user's language (English otherwise)."""
    out = ''
    for i, lang in enumerate(LANGS[1:]):
        out += ('{{ if' if i == 0 else '{{ else if') + f' eq $l "{lang}" }}}}{by_lang[lang]}'
    return out + '{{ else }}' + by_lang['en'] + '{{ end }}'

NOTICE_LINK = f'{SITE}/dashboard'

# English is the default for every template's own text; the conditionals pick another language when saved.
def page(name, by_lang):
    en = by_lang['en']
    notice = 'advice' in en or name in ('phone_changed', 'identity_linked', 'identity_unlinked', 'mfa_factor_enrolled', 'mfa_factor_unenrolled')
    field = lambda k, default=None: choose({l: by_lang[l].get(k, default(l) if default else '') for l in LANGS})
    # Fill the placeholders first: str.format would turn the {{ }} of Go templates into single braces.
    after = (NOT_YOU.format(advice=field('advice', lambda l: SHARED[l]['secure']))
             .replace('Wasn’t you?', choose({l: SHARED[l]['wasnt'] for l in LANGS}))) if notice else \
            LINK_FALLBACK.replace('Button not working? Copy this link into your browser:', choose({l: SHARED[l]['fallback'] for l in LANGS}))
    html = PICK + LAYOUT.format(
        title=field('title'), preheader=field('preheader'), heading=field('heading'), body=field('body'),
        button=choose({l: SHARED[l]['dash'] for l in LANGS}) if notice else field('button'),
        kicker=choose({l: SHARED[l]['notice'] for l in LANGS}) if notice else field('kicker'),
        kicker_color='#E6B800' if notice else '#6CFF2B',
        href=NOTICE_LINK if notice else '{{ .ConfirmationURL }}',
        button_pad=20 if notice else 28,
        after_button=after,
        footer=choose({l: SHARED[l]['notice_footer'] for l in LANGS}) if notice else field('footer'),
    )
    html = html.replace('<html lang="en">', '<html lang="' + choose({l: l for l in LANGS}) + '">')
    html = html.replace('Live aurora forecasts and alerts for your sky', choose({l: SHARED[l]['tagline'] for l in LANGS}))
    return html

for name, _, by_lang in TEMPLATES:
    (HERE / f'{name}.html').write_text(page(name, by_lang))
    (HERE / 'subjects' / f'{name}.txt').write_text(PICK + choose({l: by_lang[l]['subject'] for l in LANGS}) + '\n')

rows = '\n'.join(f'| {dash} | `{name}.html` | `subjects/{name}.txt` | {by_lang["en"]["subject"]} |' for name, dash, by_lang in TEMPLATES)
(HERE / 'README.md').write_text(f"""# Auth email templates

Polar Lights–branded templates for Supabase Auth (black and green, LIGHTS wordmark, Kp colour strip,
bulletproof button). Table layout with inline styles so they render in Gmail, Outlook and Apple Mail.
The icon loads from `https://www.polarlights.io/icons/icon-192.png`.

**Languages (#28):** every template and subject holds English, Spanish, French, German and Dutch and picks
one with Go-template conditionals on the user's saved language (`{{{{ .Data.locale }}}}`, user metadata set at
sign-up and by the app). Anyone without a saved language gets English.

Edit `build.py` and run `python3 supabase/templates/build.py` to regenerate. Then, for each row, paste the
`.html` file into **Supabase → Authentication → Emails** as the message body and the matching
`subjects/*.txt` line as the **Subject**, and **Save changes**. Security notifications are only sent for the
notices switched on under Authentication → Emails → Security.

| Dashboard template | Body | Subject (paste the whole line) | English subject |
| --- | --- | --- | --- |
{rows}

Variables: `{{{{ .ConfirmationURL }}}}` (one-time links), `{{{{ .Email }}}}`, `{{{{ .NewEmail }}}}` (change email),
`{{{{ .OldEmail }}}}` (email changed), `{{{{ .Phone }}}}` / `{{{{ .OldPhone }}}}` (phone changed),
`{{{{ .Provider }}}}` (sign-in method linked/removed), `{{{{ .FactorType }}}}` (MFA added/removed), `{{{{ .Data.locale }}}}`.
Security notices link to {SITE}/dashboard and end with what to do if the change wasn't the account owner.
""")
print('built', len(TEMPLATES), 'templates in', len(LANGS), 'languages')
