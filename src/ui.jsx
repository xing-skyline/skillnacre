import React, { useEffect } from "react";
import { Blocks, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
const api = (method, args) => window.skilldock.call(method, args);
export const cn = (...s) => s.filter(Boolean).join(" ");
export function Btn({ children, icon: Icon, onClick, variant = "", ...rest }) {
  return (
    <button className={cn("btn", variant)} onClick={onClick} {...rest}>
      {Icon && <Icon size={16} />} {children}
    </button>
  );
}
export function Badge({ children, tone = "" }) {
  return <span className={cn("badge", tone)}>{children}</span>;
}
export function Empty({ title, children }) {
  return (
    <div className="empty">
      <Blocks size={38} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Logo() {
  return (
    <span className="logo">
      <Blocks size={23} />
    </span>
  );
}
export function ToolMark({ tool }) {
  return (
    <span
      className="tool-mark"
      style={{ background: tool.color + "18", color: tool.color }}
    >
      {tool.initials}
    </span>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  footer,
}) {
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="scrim">
      <section
        className={cn("modal", wide && "wide")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <X size={21} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>
  );
}
export function Markdown({ text }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: () => null,
          a: ({ href, children }) => (
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                if (/^https?:/.test(href || ""))
                  api("openExternal", { url: href });
              }}
            >
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
