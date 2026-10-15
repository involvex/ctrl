import type { ReactNode } from 'react';

/** Minimal Markdown renderer for chat (fences, inline code, bold, italic, links). */
export function Markdown({ text }: { text: string }) {
  const blocks = splitBlocks(text);
  return (
    <div className="md">
      {blocks.map((block) =>
        block.kind === 'code' ? (
          <pre key={`c-${block.id}`} className="md-code">
            <code>{block.value}</code>
          </pre>
        ) : (
          <p key={`t-${block.id}`} className="md-p">
            {renderInline(block.value)}
          </p>
        )
      )}
    </div>
  );
}

type Block = { id: string; kind: 'code' | 'text'; value: string };

function splitBlocks(text: string): Block[] {
  const parts = text.split(/```(?:[\w-]+)?\n?([\s\S]*?)```/g);
  const blocks: Block[] = [];
  for (let i = 0; i < parts.length; i++) {
    const value = parts[i] ?? '';
    if (value.length === 0) {
      continue;
    }
    blocks.push({
      id: `${i}-${value.slice(0, 24)}`,
      kind: i % 2 === 1 ? 'code' : 'text',
      value,
    });
  }
  return blocks.length > 0
    ? blocks
    : [{ id: 'empty', kind: 'text', value: text }];
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*')) {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={key++} className="md-inline">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('[')) {
      const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (m) {
        nodes.push(
          <a key={key++} href={m[2]} target="_blank" rel="noreferrer">
            {m[1]}
          </a>
        );
      } else {
        nodes.push(token);
      }
    }
    last = match.index + token.length;
  }
  if (last < text.length) {
    nodes.push(text.slice(last));
  }
  return nodes;
}
