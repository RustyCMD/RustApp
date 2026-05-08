import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";

type Tone = "ok" | "error" | "info";
interface ToastMsg { id: number; tone: Tone; text: string }

interface Ctx {
  push: (text: string, tone?: Tone) => void;
}

const ToastCtx = createContext<Ctx | null>(null);

const ICON: Record<Tone, typeof CheckCircle2> = {
  ok: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const push = useCallback((text: string, tone: Tone = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  // Memoise the context object so consumers don't get a fresh reference on
  // every provider render. Otherwise useEffects that list `toast` in their
  // deps (PluginStoreBrowser, ConfigFileEditor, Players, …) re-fire on
  // every toast push and every auto-dismiss tick — that's why the Plugin
  // Store was reloading after each install.
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => {
          const Icon = ICON[t.tone];
          return (
            <div key={t.id} className={`toast ${t.tone}`}>
              <Icon size={18} />
              <span>{renderToast(t.text)}</span>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): Ctx {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast outside ToastProvider");
  return ctx;
}

/** Renders trailing `[CODE]` from `formatError` output as monospace, so a
 *  user can read the code at a glance and copy it cleanly. */
function renderToast(text: string): ReactNode {
  const m = text.match(/^(.*)\s\[([A-Z]+-\d+)\]$/);
  if (!m) return text;
  return (
    <>
      {m[1]}
      <code style={{ marginLeft: 6, fontSize: 11, opacity: 0.75 }}>{m[2]}</code>
    </>
  );
}
