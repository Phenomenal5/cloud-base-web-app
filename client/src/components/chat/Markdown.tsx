import { Fragment, type ReactNode } from "react";

// The assistant answers in light Markdown (see the system prompt in
// server/src/services/llmService.ts). Raw text rendering showed literal "**".
//
// Not react-markdown: the output is a small known subset, so this keeps the
// bundle lean. Builds React nodes, never dangerouslySetInnerHTML, so retrieved
// report text can't inject HTML.

const BULLET = /^\s*[-*]\s+/;
const ORDERED = /^\s*\d+\.\s+/;
const HEADING = /^\s*#{1,6}\s+/;
// A line of only dashes, asterisks or underscores. The prompt forbids horizontal
// rules, but strip any that slip through rather than render "---".
const RULE = /^\s*([-*_])\1{2,}\s*$/;

// **bold**, *italic* / _italic_, `code`. Splits on each match in turn, so several
// non-nested spans on one line all render.
const renderInline = (text: string, keyPrefix: string): ReactNode[] => {
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
    } else {
      // Both italic forms land here; only one group can have matched.
      nodes.push(<em key={`${keyPrefix}-${key++}`}>{match[4] ?? match[5]}</em>);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
};

const renderBlock = (block: string, blockKey: string): ReactNode => {
  const lines = block.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return null;

  if (lines.every((line) => BULLET.test(line))) {
    return (
      <ul key={blockKey} className="ml-4 flex list-disc flex-col gap-1">
        {lines.map((line, index) => (
          <li key={index}>{renderInline(line.replace(BULLET, ""), `${blockKey}-${index}`)}</li>
        ))}
      </ul>
    );
  }

  if (lines.every((line) => ORDERED.test(line))) {
    return (
      <ol key={blockKey} className="ml-4 flex list-decimal flex-col gap-1">
        {lines.map((line, index) => (
          <li key={index}>{renderInline(line.replace(ORDERED, ""), `${blockKey}-${index}`)}</li>
        ))}
      </ol>
    );
  }

  // Paragraph. Line breaks are kept, stray headings become bold lines, and
  // horizontal rules are dropped so no raw "##" or "---" leaks through.
  return (
    <p key={blockKey} className="whitespace-pre-wrap">
      {lines.map((line, index) => {
        if (RULE.test(line)) return null;
        const isHeading = HEADING.test(line);
        const content = renderInline(line.replace(HEADING, ""), `${blockKey}-${index}`);
        return (
          <Fragment key={index}>
            {index > 0 && <br />}
            {isHeading ? <strong>{content}</strong> : content}
          </Fragment>
        );
      })}
    </p>
  );
};

export const Markdown = ({ children }: { children: string }) => {
  // Blocks are separated by blank lines.
  const blocks = children.split(/\n{2,}/);

  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed">
      {blocks.map((block, index) => renderBlock(block, `b${index}`))}
    </div>
  );
};
