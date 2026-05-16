/**
 * Layout email unifie TransitSoftServices
 * Couleurs alignees sur le dashboard :
 *   primary-900: #1B5E20 (header/footer)
 *   primary-500: #4CAF50 (boutons, accents)
 *   primary-50:  #E8F5E9 (fond highlight)
 *   gray-50:     #F9FAFB (fond body)
 *   gray-100:    #F3F4F6 (bordures)
 */

const STYLES = {
  wrapper: 'font-family:Inter,system-ui,-apple-system,sans-serif;margin:0;padding:0;background-color:#F9FAFB;',
  container: 'max-width:600px;margin:0 auto;padding:32px 16px;',
  card: 'background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);',
  header: 'background:#1B5E20;padding:28px 32px;',
  headerLogo: 'color:#FFFFFF;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.5px;',
  headerSub: 'color:#A5D6A7;margin:4px 0 0;font-size:13px;font-weight:400;',
  body: 'padding:32px;',
  title: 'margin:0 0 8px;font-size:18px;font-weight:600;color:#111827;',
  text: 'margin:0 0 16px;font-size:14px;line-height:1.6;color:#4B5563;',
  highlight: 'background:#E8F5E9;padding:20px;border-radius:12px;margin:20px 0;',
  highlightLabel: 'margin:0;font-size:12px;font-weight:500;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;',
  highlightValue: 'margin:6px 0 0;font-size:22px;font-weight:700;color:#1B5E20;',
  warningBox: 'background:#FFF3E0;padding:20px;border-radius:12px;margin:20px 0;border-left:4px solid #FF9800;',
  warningValue: 'margin:6px 0 0;font-size:22px;font-weight:700;color:#E65100;',
  successBox: 'background:#E8F5E9;padding:20px;border-radius:12px;margin:20px 0;border-left:4px solid #4CAF50;',
  successValue: 'margin:6px 0 0;font-size:22px;font-weight:700;color:#1B5E20;',
  button: 'display:inline-block;background:#4CAF50;color:#FFFFFF;padding:12px 28px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;',
  divider: 'border:none;border-top:1px solid #F3F4F6;margin:24px 0;',
  footer: 'background:#1B5E20;padding:24px 32px;',
  footerText: 'margin:0;font-size:12px;color:#A5D6A7;line-height:1.5;',
  footerLink: 'color:#C8E6C9;text-decoration:underline;',
  muted: 'font-size:12px;color:#9CA3AF;',
};

export function emailLayout(content: string, branding?: { logoUrl?: string | null; name?: string | null; tagline?: string | null }): string {
  const orgName = branding?.name?.trim() || 'TransitSoftServices';
  const tagline = branding?.tagline?.trim() || 'Gestion de transit aerien, maritime et terrestre';
  const logoBlock = branding?.logoUrl
    ? `<img src="${branding.logoUrl}" alt="${orgName}" style="height:40px;width:auto;display:block;margin-bottom:8px;border-radius:6px;background:#FFFFFF;padding:4px"/>`
    : '';
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${orgName}</title>
</head>
<body style="${STYLES.wrapper}">
  <div style="${STYLES.container}">
    <div style="${STYLES.card}">
      <!-- Header -->
      <div style="${STYLES.header}">
        ${logoBlock}
        <h1 style="${STYLES.headerLogo}">${orgName}</h1>
        <p style="${STYLES.headerSub}">${tagline}</p>
      </div>

      <!-- Body -->
      <div style="${STYLES.body}">
        ${content}
      </div>

      <!-- Footer -->
      <div style="${STYLES.footer}">
        <p style="${STYLES.footerText}">
          Cet email a ete envoye automatiquement par ${orgName}.<br>
          Pour toute question, contactez votre agence de reference.
        </p>
        <p style="${STYLES.footerText};margin-top:12px">
          &copy; ${new Date().getFullYear()} ${orgName}. Tous droits reserves.
        </p>
      </div>
    </div>

    <!-- Unsubscribe -->
    <p style="text-align:center;margin-top:16px;${STYLES.muted}">
      Vous recevez cet email car vous etes client chez ${orgName}.
    </p>
  </div>
</body>
</html>`;
}

export function highlightBlock(label: string, value: string, variant: 'success' | 'warning' = 'success'): string {
  const boxStyle = variant === 'warning' ? STYLES.warningBox : STYLES.successBox;
  const valueStyle = variant === 'warning' ? STYLES.warningValue : STYLES.successValue;
  return `<div style="${boxStyle}">
    <p style="${STYLES.highlightLabel}">${label}</p>
    <p style="${valueStyle}">${value}</p>
  </div>`;
}

export function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;font-size:14px;color:#6B7280;width:40%">${label}</td>
    <td style="padding:8px 0;font-size:14px;font-weight:500;color:#111827">${value}</td>
  </tr>`;
}

export function infoTable(rows: string): string {
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0">${rows}</table>`;
}

export function divider(): string {
  return `<hr style="${STYLES.divider}">`;
}

export function heading(text: string): string {
  return `<h2 style="${STYLES.title}">${text}</h2>`;
}

export function paragraph(text: string): string {
  return `<p style="${STYLES.text}">${text}</p>`;
}

export function actionButton(label: string, url: string): string {
  return `<div style="text-align:center;margin:24px 0">
    <a href="${url}" style="${STYLES.button}">${label}</a>
  </div>`;
}
