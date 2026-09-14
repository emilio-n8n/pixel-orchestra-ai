import { memo } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  p: ({ children }) => <p className="leading-relaxed">{children}</p>,
  h1: ({ children }) => (
    <h1 className="text-[15px] font-semibold tracking-tight text-[var(--text)]">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-[14px] font-semibold tracking-tight text-[var(--text)]">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-[13.5px] font-semibold text-[var(--text)]">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-[13px] font-semibold text-[var(--text)]">{children}</h4>
  ),
  ul: ({ children }) => (
    <ul className="list-disc space-y-1 pl-5 marker:text-[var(--text-dim)]">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal space-y-1 pl-5 marker:text-[var(--text-dim)]">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed [&>p]:inline">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--text)]">{children}</strong>
  ),
  em: ({ children }) => <em>{children}</em>,
  del: ({ children }) => <del className="text-[var(--text-dim)]">{children}</del>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-[var(--accent-strong)] underline decoration-[var(--accent)]/50 underline-offset-2 hover:decoration-[var(--accent)]"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-[var(--accent)]/60 pl-3 text-[var(--text-muted)] [&>p]:my-1">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => {
    const block = /language-/.test(className ?? "");
    if (block) return <code className={className}>{children}</code>;
    return (
      <code className="mono rounded bg-[var(--surface-3)] px-1 py-px text-[12px] text-[var(--text)]">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mono overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--surface-3)] p-3 text-[12px] leading-relaxed">
      {children}
    </pre>
  ),
  hr: () => <hr className="border-[var(--line)]" />,
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
      <table className="w-full border-collapse text-[12.5px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-[var(--line)] bg-[var(--surface-3)] px-2 py-1.5 text-left font-semibold text-[var(--text)]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-[var(--line)]/60 px-2 py-1.5 align-top">{children}</td>
  ),
  input: (props) => <input {...props} disabled className="mr-1 accent-[var(--accent)]" />,
};

/**
 * Assistant markdown (GFM, no raw HTML — react-markdown escapes it by
 * default, so LLM output can never inject markup/scripts).
 */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-[13.5px] text-[var(--text-muted)] [&_strong]:text-[var(--text)]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
