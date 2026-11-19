/**
 * Email text helpers shared by the reply editor (browser) and the sender (server):
 * personalization variables, and plain text <-> HTML.
 */

/** Variables a reply can contain; filled in from our data when it is sent. */
export const EMAIL_VARIABLES = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "fullName", label: "Full name" },
  { key: "companyName", label: "Company name" },
  { key: "email", label: "Lead email" },
  { key: "senderEmail", label: "Our sending account" },
] as const;

const HONORIFIC =
  /^(mr|mrs|ms|miss|dr|prof|sir|mme|mlle|m|herr|frau|sr|sra|srta|sig|sig\.ra|dott)\.?$/i;

/** "Dr. Jane van Dijk" -> ["Jane", "van Dijk"]. */
export function splitName(fullName: string | null): [string, string] {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && HONORIFIC.test(parts[0]!)) parts.shift();
  return [parts[0] ?? "", parts.slice(1).join(" ")];
}

export function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Replaces {{firstName}} etc. Unknown values become empty (never a raw "{{…}}" in a
 * sent email). In HTML the values are escaped.
 */
export function fillVariables(
  content: string,
  values: {
    fullName: string;
    companyName: string;
    email: string;
    senderEmail: string;
  },
  { html }: { html: boolean },
) {
  const [firstName, lastName] = splitName(values.fullName);
  const map: Record<string, string> = {
    firstname: firstName,
    lastname: lastName,
    fullname: values.fullName.trim(),
    companyname: values.companyName,
    email: values.email,
    senderemail: values.senderEmail,
  };
  return content.replace(
    /\{\{\s*([a-zA-Z]+)\s*\}\}/g,
    (match, name: string) => {
      const value = map[name.toLowerCase()];
      if (value === undefined) return match;
      return html ? escapeHtml(value) : value;
    },
  );
}

/** Plain text typed by the user -> email HTML (line breaks kept). */
export function textToHtml(text: string) {
  return escapeHtml(text).split(/\r?\n/).join("<br/>");
}

/** Readable plain-text version of an HTML email (for the text part). */
export function htmlToText(html: string) {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
