import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

interface Props {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}

export default function Modal({ title, onClose, children, footer, size = "md" }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={size === "lg" ? { width: "min(960px, 94vw)" } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h3>{title}</h3>
          <button className="ghost icon" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}
