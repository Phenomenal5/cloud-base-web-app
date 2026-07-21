import { Fragment, type ReactNode } from "react";

// ─── Minimal Markdown renderer ────────────────────────
//
// The assistant answers in light Markdown (**bold**, short "-"/"1." lists, plain
// paragraphs — see the system prompt in server/services/llmService.ts). The chat
// used to print message.content as raw text, so that Markdown showed up as
// literal "**" and "---" noise. This renders just that subset to real elements.
//
// Deliberately NOT react-markdown: the model's output is a tiny, known subset, so
// a ~60-line renderer keeps the bundle lean and avoids a new dependency. It builds
// React nodes (never dangerouslySetInnerHTML), so retrieved report text rendered
// here can't inject HTML. Anything unsupported falls back to readable plain text.

// Inline: **bold**, *italic* / _italic_, `code`. Splits on the first match and
// recurses so nesting-free combinations in one line all render.
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*|_([^_]+)_)/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[2] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-${key++}`}>{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      nodes.push(
        <code
          key={`${keyPrefix}-${key++}`}
          className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em]"
        >
          {match[3]}
        </code>,
      );
    } else if (match[4] !== undefined) {
      nodes.push(<em key={`${keyPrefix}-${key++}`}>{match[4]}</em>);
    } else if (match[5] !== undefined) {
      nodes.push(<em key={`${keyPrefix}-${key++}`}>{match[5]}</em>);
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

const BULLET = /^\s*[-*]\s+/;
const ORDERED = /^\s*\d+\.\s+/;
// A line that's only dashes/asterisks/underscores — a Markdown horizontal rule.
// The prompt forbids these, but strip any that slip through rather than show "---".
const RULE = /^\s*([-*_])\1{2,}\s*$/;
const HEADING = /^\s*#{1,6}\s+/;

function renderBlock(block: string, blockKey: string): ReactNode {
  const lines = block.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return null;

  // Bulleted list — every line is a bullet.
  if (lines.every((line) => BULLET.test(line))) {
    return (
      <ul key={blockKey} className="ml-4 flex list-disc flex-col gap-1">
        {lines.map((line, index) => (
          <li key={index}>{renderInline(line.replace(BULLET, ""), `${blockKey}-${index}`)}</li>
        ))}
      </ul>
    );
  }

  // Numbered list — every line is "1." style.
  if (lines.every((line) => ORDERED.test(line))) {
    return (
      <ol key={blockKey} className="ml-4 flex list-decimal flex-col gap-1">
        {lines.map((line, index) => (
          <li key={index}>{renderInline(line.replace(ORDERED, ""), `${blockKey}-${index}`)}</li>
        ))}
      </ol>
    );
  }

  // Paragraph: keep intentional line breaks; render stray headings as bold lines
  // and drop horizontal rules so no raw "##"/"---" leaks through.
  return (
    <p key={blockKey} className="whitespace-pre-wrap">
      {lines.map((line, index) => {
        if (RULE.test(line)) return null;
        const isHeading = HEADING.test(line);
        const clean = line.replace(HEADING, "");
        const content = renderInline(clean, `${blockKey}-${index}`);
        return (
          <Fragment key={index}>
            {index > 0 && <br />}
            {isHeading ? <strong>{content}</strong> : content}
          </Fragment>
        );
      })}
    </p>
  );
}

export function Markdown({ children }: { children: string }) {
  // Blocks are separated by blank lines.
  const blocks = children.split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed">
      {blocks.map((block, index) => renderBlock(block, `b${index}`))}
    </div>
  );
}
