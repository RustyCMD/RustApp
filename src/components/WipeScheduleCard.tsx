import { useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, Pencil, Trash2 } from "lucide-react";
import {
  deleteWipeSchedule,
  getWipeSchedule,
  markWipedNow,
  setWipeSchedule,
} from "@/api/tauriCommands";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { formatError } from "@/lib/errors";
import type { WipeSchedule } from "@/types/models";

const PRESETS: Array<{ label: string; days: number }> = [
  { label: "Weekly", days: 7 },
  { label: "Biweekly", days: 14 },
  { label: "Monthly", days: 28 },
];

export default function WipeScheduleCard({ profileId }: { profileId: string }) {
  const toast = useToast();
  const [schedule, setSchedule] = useState<WipeSchedule | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);

  function reload() {
    getWipeSchedule(profileId)
      .then(setSchedule)
      .catch((e) => {
        toast.push(formatError(e), "error");
        setSchedule(null);
      });
  }

  useEffect(reload, [profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onMarkNow() {
    try {
      const s = await markWipedNow(profileId);
      setSchedule(s);
      toast.push("Marked wiped now — countdown reset.", "ok");
    } catch (e) {
      toast.push(formatError(e), "error");
    }
  }

  async function onClear() {
    if (!confirm("Remove the wipe schedule for this server?")) return;
    try {
      await deleteWipeSchedule(profileId);
      setSchedule(null);
      toast.push("Wipe schedule cleared.", "ok");
    } catch (e) {
      toast.push(formatError(e), "error");
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>
          <CalendarClock size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
          Wipe schedule
        </h3>
        <div className="row" style={{ gap: 6 }}>
          <button onClick={() => setEditing(true)} className="ghost icon" title="Edit">
            <Pencil size={14} />
          </button>
          {schedule && (
            <button onClick={onClear} className="ghost icon" title="Clear">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {schedule === undefined ? (
        <div className="muted">Loading…</div>
      ) : !schedule ? (
        <>
          <p className="muted small" style={{ margin: "0 0 12px" }}>
            Track your wipe cadence so you (and your players) always know
            when the next reset is.
          </p>
          <button className="primary" onClick={() => setEditing(true)}>
            Set up
          </button>
        </>
      ) : (
        <ScheduleSummary schedule={schedule} onMarkNow={onMarkNow} />
      )}

      {editing && (
        <EditWipeModal
          profileId={profileId}
          schedule={schedule ?? null}
          onClose={() => setEditing(false)}
          onSaved={(s) => {
            setSchedule(s);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function ScheduleSummary({
  schedule,
  onMarkNow,
}: {
  schedule: WipeSchedule;
  onMarkNow: () => void;
}) {
  const next = schedule.nextWipeAt ? new Date(schedule.nextWipeAt) : null;
  const last = schedule.lastWipeAt ? new Date(schedule.lastWipeAt) : null;
  const now = Date.now();
  const daysToNext =
    next != null ? Math.round((next.getTime() - now) / 86_400_000) : null;
  const overdue = daysToNext != null && daysToNext < 0;

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span className="value" style={{ fontSize: 26, fontWeight: 600 }}>
          {next == null
            ? "—"
            : overdue
              ? `${Math.abs(daysToNext!)} days overdue`
              : daysToNext === 0
                ? "Today"
                : daysToNext === 1
                  ? "Tomorrow"
                  : `In ${daysToNext} days`}
        </span>
        {next && !overdue && daysToNext != null && daysToNext <= 1 && (
          <span className="pill warn">soon</span>
        )}
        {overdue && <span className="pill bad">overdue</span>}
      </div>
      <div className="muted small">
        Cadence: every {schedule.cadenceDays} day{schedule.cadenceDays === 1 ? "" : "s"}
        {last && (
          <>
            {" · last "}
            {last.toLocaleDateString([], { month: "short", day: "numeric" })}
          </>
        )}
      </div>
      {schedule.notes && (
        <div className="muted small" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
          {schedule.notes}
        </div>
      )}
      <div className="row" style={{ marginTop: 12, gap: 8 }}>
        <button className="primary" onClick={onMarkNow}>
          <CheckCircle2 size={14} /> Mark wiped now
        </button>
      </div>
    </>
  );
}

function EditWipeModal({
  profileId,
  schedule,
  onClose,
  onSaved,
}: {
  profileId: string;
  schedule: WipeSchedule | null;
  onClose: () => void;
  onSaved: (s: WipeSchedule) => void;
}) {
  const toast = useToast();
  const [cadence, setCadence] = useState<number>(schedule?.cadenceDays ?? 7);
  const [lastWipe, setLastWipe] = useState<string>(
    schedule?.lastWipeAt
      ? schedule.lastWipeAt.slice(0, 10) // YYYY-MM-DD
      : new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState<string>(schedule?.notes ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      // Convert YYYY-MM-DD → ISO at midnight UTC, so the countdown rounds to whole days.
      const iso = lastWipe ? new Date(`${lastWipe}T00:00:00Z`).toISOString() : null;
      const s = await setWipeSchedule(profileId, cadence, iso, notes || null);
      onSaved(s);
      toast.push("Wipe schedule saved.", "ok");
    } catch (e) {
      toast.push(formatError(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={schedule ? "Edit wipe schedule" : "Set up wipe schedule"}
      onClose={onClose}
      footer={
        <>
          <div style={{ flex: 1 }} />
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="stack-lg">
        <label className="field">
          <span>Cadence</span>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                className={cadence === p.days ? "primary" : "ghost"}
                style={{ borderRadius: 999, padding: "6px 12px" }}
                onClick={() => setCadence(p.days)}
              >
                {p.label}
              </button>
            ))}
            <input
              type="number"
              min={1}
              max={365}
              value={cadence}
              onChange={(e) => setCadence(Number(e.target.value))}
              style={{ width: 90 }}
            />
            <span className="muted small">days</span>
          </div>
        </label>

        <label className="field">
          <span>Last wipe</span>
          <input
            type="date"
            value={lastWipe}
            onChange={(e) => setLastWipe(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Notes (optional)</span>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Force wipe? BP wipe? Map seed for next wipe?"
          />
        </label>
      </div>
    </Modal>
  );
}
