"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/** Where the quoted earlier conversation starts in a plain-text email. */
const TEXT_QUOTE =
  /\n(?:On .{5,200}wrote:|Le .{5,200}a écrit\s?:|Am .{5,200}schrieb .{0,80}:|El .{5,200}escribió:|-{2,}\s*Original Message\s*-{2,}|From: .+\nSent: )/i;

/** Quoted history in an HTML email (Gmail, Outlook, Apple Mail). */
const HTML_QUOTE =
  /class="gmail_quote|<blockquote|id="divRplyFwdMsg"|id="appendonsend"|class="moz-cite-prefix/i;

/**
 * One email of a conversation. HTML from outside (what a lead sent) is shown in a
 * sandboxed frame: no scripts can run and it cannot touch the page. The earlier
 * conversation that emails quote is folded away, as in an email client.
 */
export function EmailBody({
  html,
  text,
}: {
  html: string | null;
  text: string | null;
}) {
  const [showQuoted, setShowQuoted] = useState(false);

  if (html && html.trim()) {
    return (
      <HtmlBody
        html={html}
        showQuoted={showQuoted}
        onToggle={() => setShowQuoted((v) => !v)}
      />
    );
  }

  const body = (text ?? "").replace(/\r\n/g, "\n").trim();
  const match = TEXT_QUOTE.exec(body);
  const main = match ? body.slice(0, match.index).trim() : body;
  const quoted = match ? body.slice(match.index).trim() : "";
  return (
    <div className="text-sm leading-relaxed whitespace-pre-wrap">
      {main || <span className="text-muted-foreground">(empty message)</span>}
      {quoted && (
        <>
          <QuoteToggle
            open={showQuoted}
            onClick={() => setShowQuoted((v) => !v)}
          />
          {showQuoted && (
            <div className="mt-2 border-l-2 pl-3 text-muted-foreground">
              {quoted}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function QuoteToggle({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={open ? "Hide the earlier messages" : "Show the earlier messages"}
      className="mt-2 block rounded-md bg-muted px-2 text-xs leading-5 font-semibold tracking-widest text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {open ? "Hide quoted text" : "•••"}
    </button>
  );
}

function HtmlBody({
  html,
  showQuoted,
  onToggle,
}: {
  html: string;
  showQuoted: boolean;
  onToggle: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(80);
  const hasQuote = HTML_QUOTE.test(html);

  const doc = useMemo(
    () => `<!doctype html><html><head><meta charset="utf-8">
<base target="_blank">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data: cid:; style-src 'unsafe-inline'; font-src https: data:">
<style>
  html,body{margin:0;padding:0;background:#fff;color:#1f2328;}
  body{font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;padding:14px 16px;overflow-wrap:anywhere;}
  img{max-width:100%;height:auto;}
  table{max-width:100%;}
  a{color:#2563eb;}
  blockquote{margin:0 0 0 4px;padding-left:10px;border-left:2px solid #d0d7de;color:#57606a;}
  body.hide-quotes .gmail_quote, body.hide-quotes blockquote, body.hide-quotes #divRplyFwdMsg,
  body.hide-quotes #divRplyFwdMsg ~ *, body.hide-quotes #appendonsend ~ *, body.hide-quotes .moz-cite-prefix{display:none!important;}
</style></head><body class="${hasQuote ? "hide-quotes" : ""}">${html}</body></html>`,
    [html, hasQuote],
  );

  // Fit the frame to its content (the frame shares no scripts with the email).
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const body = el.contentDocument?.body;
    if (!body) return;
    body.classList.toggle("hide-quotes", hasQuote && !showQuoted);
    setHeight(Math.min(body.scrollHeight + 4, 4000));
  }, [showQuoted, hasQuote]);

  const fit = () => {
    const body = frame.current?.contentDocument?.body;
    if (!body) return;
    body.classList.toggle("hide-quotes", hasQuote && !showQuoted);
    setHeight(Math.min(body.scrollHeight + 4, 4000));
    // Images load later and change the height.
    for (const img of Array.from(body.querySelectorAll("img"))) {
      if (!img.complete)
        img.addEventListener("load", () =>
          setHeight(Math.min(body.scrollHeight + 4, 4000)),
        );
    }
  };

  return (
    <div>
      <iframe
        ref={frame}
        title="Email"
        srcDoc={doc}
        // No allow-scripts: nothing in the email can run. allow-same-origin only
        // lets this page measure the height.
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        onLoad={fit}
        style={{ height }}
        className={cn("block w-full rounded-md border bg-white")}
      />
      {hasQuote && <QuoteToggle open={showQuoted} onClick={onToggle} />}
    </div>
  );
}
