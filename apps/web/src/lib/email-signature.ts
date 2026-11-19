/**
 * Signature added automatically to the bottom of every reply sent from
 * Scrap&Mail (shown under the editor, so the team sees what the lead gets).
 */
export const SIGNATURE_HTML = `<div>Best,
	<br>--
	<br><strong style="color:#003366;">Serena Vally</strong>
	<br><span style="color:#777777;">Partnerships Team</span></div>
<div style="margin-top:18px;margin-bottom:8px;"><img src="https://ci3.googleusercontent.com/mail-sig/AIorK4ziBK5K7k6Ui2xMNPlp7P4ckDvI1fxIeY1LicPZAuNrSr2fcLSnuSDAujYC79MV7vyz0AJfVKnj4eWY" alt="SeatlaneB2B" width="195" style="width:195px;height:auto;border:0px;" class="fr-fil fr-dib"></div>
<div style="margin-top:8px;margin-bottom:5px;"><a href="https://seatlaneb2b.com/" style="color:#0563C1;text-decoration:underline;">&nbsp;Find out about our services&nbsp;</a></div>
<div style="font-size:9px;color:#777777;margin:5px 0;">COMPANY CONFIDENTIAL</div>
<div style="font-size:9px;color:#999999;line-height:1.4;margin-top:8px;">This e-mail and any attachments are confidential and intended solely for the addressee and may also be privileged or exempt from disclosure under applicable law. If you are not the addressee, or have received this e-mail in error, please notify the sender immediately, delete it from your system and do not copy, disclose or otherwise act upon any part of this e-mail or its attachments.</div>`;

/** The same signature for the plain-text part of the email. */
export const SIGNATURE_TEXT = `Best,
--
Serena Vally
Partnerships Team

Find out about our services: https://seatlaneb2b.com/

COMPANY CONFIDENTIAL
This e-mail and any attachments are confidential and intended solely for the addressee and may also be privileged or exempt from disclosure under applicable law. If you are not the addressee, or have received this e-mail in error, please notify the sender immediately, delete it from your system and do not copy, disclose or otherwise act upon any part of this e-mail or its attachments.`;

/** The message as sent: what the user wrote, then the signature. */
export function withSignature(html: string, text: string) {
  return {
    html: `${html}<br>${SIGNATURE_HTML}`,
    text: `${text.trimEnd()}\n\n${SIGNATURE_TEXT}`,
  };
}
