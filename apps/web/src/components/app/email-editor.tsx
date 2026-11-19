"use client";

import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extensions";
import {
  type Editor,
  EditorContent,
  useEditor,
  useEditorState,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Braces,
  Code2,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  TextQuote,
  Type,
  Underline,
  Undo2,
} from "lucide-react";
import { Popover } from "radix-ui";
import { type ReactNode, type Ref, useImperativeHandle, useState } from "react";

import { popoverClass } from "@/components/ui/styles";
import { EMAIL_VARIABLES, htmlToText, textToHtml } from "@/lib/email-content";
import { cn } from "@/lib/utils";

export type EditorFormat = "rich" | "html" | "text";

export type EmailEditorHandle = {
  /** The message as HTML and as plain text, in whatever format is being edited. */
  getContent(): { html: string; text: string };
  /** Replaces the message (e.g. with a template). */
  setContent(html: string): void;
  /** Empties the editor (after sending). */
  clear(): void;
  focus(): void;
};

const FONTS = [
  { value: "", label: "Default font" },
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: "Helvetica, Arial, sans-serif", label: "Helvetica" },
  { value: "Verdana, Geneva, sans-serif", label: "Verdana" },
  { value: "Tahoma, Geneva, sans-serif", label: "Tahoma" },
  { value: "'Trebuchet MS', sans-serif", label: "Trebuchet MS" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "'Times New Roman', Times, serif", label: "Times New Roman" },
  { value: "'Courier New', Courier, monospace", label: "Courier New" },
];

const SIZES = ["", "12px", "14px", "16px", "18px", "20px", "24px", "32px"];

const COLORS = [
  "#000000",
  "#434343",
  "#666666",
  "#999999",
  "#ffffff",
  "#e03131",
  "#f76707",
  "#f59f00",
  "#2f9e44",
  "#1971c2",
  "#3b5bdb",
  "#7048e8",
  "#c2255c",
  "#0c8599",
];

const HIGHLIGHTS = [
  "#fff3bf",
  "#ffe8cc",
  "#ffe3e3",
  "#d3f9d8",
  "#d0ebff",
  "#e5dbff",
];

/**
 * Rich email editor, modelled on Instantly's: fonts and sizes, bold / italic /
 * underline / strikethrough, text and highlight colors, alignment, lists, quotes,
 * links, images, dividers, clear formatting and personalization variables.
 * The message can also be written as raw HTML or as plain text.
 */
export function EmailEditor({
  editorRef,
  initialHtml = "",
  placeholder = "Write your reply…",
  onSubmit,
  disabled,
}: {
  editorRef?: Ref<EmailEditorHandle>;
  initialHtml?: string;
  placeholder?: string;
  /** Ctrl+Enter / ⌘+Enter. */
  onSubmit?: () => void;
  disabled?: boolean;
}) {
  const [format, setFormat] = useState<EditorFormat>("rich");
  const [source, setSource] = useState(""); // HTML or plain text being edited

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        codeBlock: false,
        code: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
        },
      }),
      TextStyleKit,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ inline: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        class:
          "email-content min-h-40 max-h-[50vh] overflow-y-auto px-3 py-2.5 text-sm outline-none",
        "aria-label": "Message",
      },
    },
  });

  const switchTo = (next: EditorFormat) => {
    if (!editor || next === format) return;
    if (format === "rich") {
      setSource(
        next === "html"
          ? editor.getHTML()
          : editor.getText({ blockSeparator: "\n" }),
      );
    } else if (next === "rich") {
      editor.commands.setContent(
        format === "html" ? source : textToHtml(source),
      );
    } else {
      // between HTML and plain text
      setSource(next === "text" ? htmlToText(source) : textToHtml(source));
    }
    setFormat(next);
  };

  useImperativeHandle(
    editorRef,
    () => ({
      getContent() {
        if (format === "html")
          return { html: source, text: htmlToText(source) };
        if (format === "text")
          return { html: textToHtml(source), text: source.trim() };
        if (!editor || editor.isEmpty) return { html: "", text: "" };
        return {
          html: editor.getHTML(),
          text: editor.getText({ blockSeparator: "\n\n" }).trim(),
        };
      },
      setContent(html: string) {
        if (format === "rich") editor?.commands.setContent(html);
        else setSource(format === "html" ? html : htmlToText(html));
      },
      clear() {
        editor?.commands.clearContent();
        setSource("");
      },
      focus() {
        editor?.commands.focus();
      },
    }),
    [editor, format, source],
  );

  return (
    <div
      className="overflow-hidden rounded-md border border-input bg-card focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/20"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          onSubmit?.();
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-1.5 py-1">
        {format === "rich" && editor ? (
          <RichToolbar editor={editor} />
        ) : (
          <span className="px-2 text-xs text-muted-foreground">
            {format === "html"
              ? "Editing the HTML source"
              : "Plain text: no formatting"}
          </span>
        )}
        <div className="ml-auto flex items-center gap-0.5 rounded-md border bg-card p-0.5">
          <FormatTab
            active={format === "rich"}
            onClick={() => switchTo("rich")}
            icon={<Pilcrow />}
            label="Rich text"
          />
          <FormatTab
            active={format === "html"}
            onClick={() => switchTo("html")}
            icon={<Code2 />}
            label="HTML"
          />
          <FormatTab
            active={format === "text"}
            onClick={() => switchTo("text")}
            icon={<Type />}
            label="Plain text"
          />
        </div>
      </div>
      {format === "rich" ? (
        <EditorContent editor={editor} />
      ) : (
        <textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          disabled={disabled}
          spellCheck={format === "text"}
          aria-label={format === "html" ? "HTML source" : "Message"}
          placeholder={
            format === "html" ? "<p>Hello {{firstName}},</p>" : placeholder
          }
          className={cn(
            "block min-h-40 w-full resize-y bg-transparent px-3 py-2.5 text-sm outline-none",
            format === "html" && "font-mono text-[13px]",
          )}
          rows={10}
        />
      )}
    </div>
  );
}

function FormatTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded px-1.5 text-xs font-medium transition-colors [&_svg]:size-3.5",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the text selection in the editor while clicking.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 [&_svg]:size-4",
        active && "bg-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />;
}

function ToolPopover({
  label,
  icon,
  active,
  children,
}: {
  label: string;
  icon: ReactNode;
  active?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        title={label}
        aria-label={label}
        onMouseDown={(e) => e.preventDefault()}
        className={cn(
          "inline-flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent [&_svg]:size-4",
          active && "text-foreground",
        )}
      >
        {icon}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="start"
          className={cn(popoverClass, "p-2")}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {children(() => setOpen(false))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const selectClass =
  "h-7 rounded border-0 bg-transparent px-1.5 text-xs text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40";

function RichToolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      align: (["left", "center", "right", "justify"] as const).find((a) =>
        e.isActive({ textAlign: a }),
      ),
      font: (e.getAttributes("textStyle").fontFamily as string) ?? "",
      size: (e.getAttributes("textStyle").fontSize as string) ?? "",
      color: (e.getAttributes("textStyle").color as string) ?? "",
      href: (e.getAttributes("link").href as string) ?? "",
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();

  return (
    <>
      <ToolButton
        label="Undo"
        disabled={!state.canUndo}
        onClick={() => chain().undo().run()}
      >
        <Undo2 />
      </ToolButton>
      <ToolButton
        label="Redo"
        disabled={!state.canRedo}
        onClick={() => chain().redo().run()}
      >
        <Redo2 />
      </ToolButton>
      <Divider />
      <select
        aria-label="Font"
        title="Font"
        className={cn(selectClass, "w-28")}
        value={FONTS.some((f) => f.value === state.font) ? state.font : ""}
        onChange={(e) =>
          e.target.value
            ? chain().setFontFamily(e.target.value).run()
            : chain().unsetFontFamily().run()
        }
      >
        {FONTS.map((f) => (
          <option key={f.label} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Font size"
        title="Font size"
        className={cn(selectClass, "w-16")}
        value={SIZES.includes(state.size) ? state.size : ""}
        onChange={(e) =>
          e.target.value
            ? chain().setFontSize(e.target.value).run()
            : chain().unsetFontSize().run()
        }
      >
        {SIZES.map((s) => (
          <option key={s || "default"} value={s}>
            {s ? s.replace("px", "") : "Size"}
          </option>
        ))}
      </select>
      <Divider />
      <ToolButton
        label="Bold (Ctrl+B)"
        active={state.bold}
        onClick={() => chain().toggleBold().run()}
      >
        <Bold />
      </ToolButton>
      <ToolButton
        label="Italic (Ctrl+I)"
        active={state.italic}
        onClick={() => chain().toggleItalic().run()}
      >
        <Italic />
      </ToolButton>
      <ToolButton
        label="Underline (Ctrl+U)"
        active={state.underline}
        onClick={() => chain().toggleUnderline().run()}
      >
        <Underline />
      </ToolButton>
      <ToolButton
        label="Strikethrough"
        active={state.strike}
        onClick={() => chain().toggleStrike().run()}
      >
        <Strikethrough />
      </ToolButton>
      <ToolPopover
        label="Text color"
        icon={
          <Baseline style={state.color ? { color: state.color } : undefined} />
        }
      >
        {(close) => (
          <Swatches
            colors={COLORS}
            onPick={(c) => {
              chain().setColor(c).run();
              close();
            }}
            onClear={() => {
              chain().unsetColor().run();
              close();
            }}
          />
        )}
      </ToolPopover>
      <ToolPopover label="Highlight" icon={<Highlighter />}>
        {(close) => (
          <Swatches
            colors={HIGHLIGHTS}
            onPick={(c) => {
              chain().setHighlight({ color: c }).run();
              close();
            }}
            onClear={() => {
              chain().unsetHighlight().run();
              close();
            }}
          />
        )}
      </ToolPopover>
      <Divider />
      <ToolButton
        label="Align left"
        active={state.align === "left"}
        onClick={() => chain().setTextAlign("left").run()}
      >
        <AlignLeft />
      </ToolButton>
      <ToolButton
        label="Align center"
        active={state.align === "center"}
        onClick={() => chain().setTextAlign("center").run()}
      >
        <AlignCenter />
      </ToolButton>
      <ToolButton
        label="Align right"
        active={state.align === "right"}
        onClick={() => chain().setTextAlign("right").run()}
      >
        <AlignRight />
      </ToolButton>
      <ToolButton
        label="Justify"
        active={state.align === "justify"}
        onClick={() => chain().setTextAlign("justify").run()}
      >
        <AlignJustify />
      </ToolButton>
      <Divider />
      <ToolButton
        label="Bulleted list"
        active={state.bullet}
        onClick={() => chain().toggleBulletList().run()}
      >
        <List />
      </ToolButton>
      <ToolButton
        label="Numbered list"
        active={state.ordered}
        onClick={() => chain().toggleOrderedList().run()}
      >
        <ListOrdered />
      </ToolButton>
      <ToolButton
        label="Quote"
        active={state.quote}
        onClick={() => chain().toggleBlockquote().run()}
      >
        <TextQuote />
      </ToolButton>
      <Divider />
      <ToolPopover label="Link" icon={<Link2 />} active={state.link}>
        {(close) => (
          <UrlForm
            label="Link address"
            initial={state.href}
            submitLabel={state.link ? "Update" : "Add link"}
            onSubmit={(url) => {
              if (editor.state.selection.empty && !state.link) {
                chain()
                  .insertContent({
                    type: "text",
                    text: url,
                    marks: [{ type: "link", attrs: { href: url } }],
                  })
                  .run();
              } else {
                chain().extendMarkRange("link").setLink({ href: url }).run();
              }
              close();
            }}
            onRemove={
              state.link
                ? () => {
                    chain().extendMarkRange("link").unsetLink().run();
                    close();
                  }
                : undefined
            }
          />
        )}
      </ToolPopover>
      <ToolPopover label="Image" icon={<ImagePlus />}>
        {(close) => (
          <UrlForm
            label="Image address (https://…)"
            submitLabel="Insert image"
            onSubmit={(url) => {
              chain().setImage({ src: url }).run();
              close();
            }}
          />
        )}
      </ToolPopover>
      <ToolButton
        label="Divider line"
        onClick={() => chain().setHorizontalRule().run()}
      >
        <Minus />
      </ToolButton>
      <ToolButton
        label="Clear formatting"
        onClick={() => chain().unsetAllMarks().clearNodes().run()}
      >
        <RemoveFormatting />
      </ToolButton>
      <Divider />
      <ToolPopover label="Insert variable" icon={<Braces />}>
        {(close) => (
          <div className="w-56">
            <p className="px-2 pt-1 pb-2 text-xs text-muted-foreground">
              Filled in for each lead when the email is sent.
            </p>
            {EMAIL_VARIABLES.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => {
                  chain().insertContent(`{{${v.key}}}`).run();
                  close();
                }}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                {v.label}
                <code className="text-xs text-muted-foreground">{`{{${v.key}}}`}</code>
              </button>
            ))}
          </div>
        )}
      </ToolPopover>
    </>
  );
}

function Swatches({
  colors,
  onPick,
  onClear,
}: {
  colors: string[];
  onPick: (color: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="w-44">
      <div className="grid grid-cols-7 gap-1">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            aria-label={`Color ${c}`}
            onClick={() => onPick(c)}
            className="size-5 rounded border border-border transition-transform hover:scale-110"
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="mt-2 w-full rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        Remove color
      </button>
    </div>
  );
}

function UrlForm({
  label,
  initial = "",
  submitLabel,
  onSubmit,
  onRemove,
}: {
  label: string;
  initial?: string;
  submitLabel: string;
  onSubmit: (url: string) => void;
  onRemove?: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState(false);
  const submit = () => {
    const url = value.trim();
    const withProtocol =
      /^(https?:|mailto:|tel:)/i.test(url) || !url ? url : `https://${url}`;
    try {
      const parsed = new URL(withProtocol);
      if (!["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol))
        throw new Error("protocol");
      onSubmit(withProtocol);
    } catch {
      setError(true);
    }
  };
  return (
    <form
      className="w-72"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="text-xs text-muted-foreground">
        {label}
        <input
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          className={cn(
            "mt-1 h-8 w-full rounded-md border border-input bg-muted px-2 text-sm text-foreground outline-none focus-visible:border-primary",
            error && "border-destructive",
          )}
          placeholder="https://"
        />
      </label>
      {error && (
        <p className="mt-1 text-xs text-destructive">
          Please enter a valid address.
        </p>
      )}
      <div className="mt-2 flex justify-end gap-1.5">
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="h-7 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Remove
          </button>
        )}
        <button
          type="submit"
          className="h-7 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
