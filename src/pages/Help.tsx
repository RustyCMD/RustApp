import {
  AlertTriangle,
  Check,
  Cloud,
  HelpCircle,
  Lightbulb,
  MonitorSmartphone,
  X as XIcon,
} from "lucide-react";

/**
 * Plain-language setup + help page. Aimed at a non-technical Rust server
 * admin who just wants to know "will this work for me, and what do I do
 * if it doesn't?"
 *
 * No invokes, no state — pure content. Lives at /help.
 */
export default function HelpPage() {
  return (
    <>
      <div className="page-header">
        <h2>Setup &amp; help</h2>
      </div>
      <p className="muted" style={{ maxWidth: 720, marginTop: -8 }}>
        Most things in RustApp work the same whether your server runs on this
        computer or somewhere far away. A couple of features need a small
        extra step for remote servers — this page explains what and why.
      </p>

      {/* ─── Choose your setup ─── */}
      <h3 style={{ marginTop: 24 }}>Where does your Rust server run?</h3>
      <div className="grid-2">
        <SetupCard
          icon={MonitorSmartphone}
          title="On this same computer"
          tone="ok"
          tag="Everything just works"
        >
          <p>
            If <strong>RustDedicated.exe</strong> is running on the same PC as
            RustApp, you're done. When you add a server in{" "}
            <strong>Settings</strong>, click <strong>Browse</strong> next to{" "}
            <em>Server directory</em> and pick the folder that contains{" "}
            <code>RustDedicated.exe</code>.
          </p>
        </SetupCard>

        <SetupCard
          icon={Cloud}
          title="On a different machine"
          tone="warn"
          tag="Live tools work · plugin tools need 1 extra step"
        >
          <p>
            Includes a <strong>VPS</strong>, a dedicated server, or a hosted
            game-server provider. Live tools (chat, kicks, bans, RCON, server
            status) work right away. Plugin install / config editing needs a
            quick one-time setup — see{" "}
            <a href="#vps-setup">My server is on another machine</a> below.
          </p>
        </SetupCard>
      </div>

      {/* ─── Quick reference ─── */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3>What works where?</h3>
        <table className="works-table">
          <thead>
            <tr>
              <th>Feature</th>
              <th>Same PC</th>
              <th>Remote server</th>
              <th>Remote + folder share</th>
            </tr>
          </thead>
          <tbody>
            {([
              ["Live status (players, map, FPS)", true, true, true],
              ["RCON Console", true, true, true],
              ["Players online · kick · ban", true, true, true],
              ["Bans manager (unban)", true, true, true],
              ["Wipe schedule countdown", true, true, true],
              ["Server profile import / export", true, true, true],
              ["Activity log", true, true, true],
              ["Installed plugins list", true, false, true],
              ["Enable / disable / reload plugins", true, false, true],
              ["Plugin Store (install)", true, false, true],
              ["Local .cs file install", true, false, true],
              ["Plugin config editor + backups", true, false, true],
              ["Dependency check (DLLs)", true, false, true],
            ] as const).map(([label, a, b, c]) => (
              <tr key={label}>
                <td>{label}</td>
                <Cell ok={a} />
                <Cell ok={b} />
                <Cell ok={c} />
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small" style={{ marginTop: 12, marginBottom: 0 }}>
          The features that need a folder share are the ones that read or
          write actual files inside your server's <code>oxide/</code> folder.
          The ones that work everywhere only send commands to the server and
          don't need access to its files.
        </p>
      </div>

      {/* ─── VPS setup ─── */}
      <div id="vps-setup" className="card">
        <h3>My server is on another machine — what do I do?</h3>
        <p>
          The friendly version: your server's plugin folder lives on the
          remote machine, but RustApp needs to see those files on this
          computer to manage them. Pick the path that fits you.
        </p>

        <h4 style={{ marginTop: 20 }}>
          Option A — Use RustApp for live ops only
        </h4>
        <p>
          If you only need chat, kicks, bans, RCON commands and live stats,
          you can ignore the plugin features here and use your host's web
          file manager (or FTP) when you need to install or change plugins.
          Nothing extra to set up.
        </p>

        <h4 style={{ marginTop: 20 }}>
          Option B — Map your server's folder as a drive (recommended)
        </h4>
        <p>
          This makes the server's <code>oxide/</code> folder show up like a
          regular folder on your PC. Once that's done, RustApp treats it
          exactly like a local server — every feature works.
        </p>

        <details className="os-block">
          <summary>
            <strong>Windows</strong> — map a network drive
          </summary>
          <ol>
            <li>
              Open <strong>File Explorer</strong> → right-click <em>This PC</em>{" "}
              → <em>Map network drive…</em>
            </li>
            <li>
              Pick a drive letter (e.g. <code>Z:</code>).
            </li>
            <li>
              In <em>Folder</em>, paste the share path your host gave you (it
              starts with <code>\\</code>). Tick{" "}
              <em>Reconnect at sign-in</em>.
            </li>
            <li>
              Click <em>Finish</em> and enter the username/password if asked.
            </li>
            <li>
              In RustApp <strong>Settings</strong>, click <strong>Browse</strong>{" "}
              next to <em>Server directory</em> and pick the new drive (e.g.{" "}
              <code>Z:\rust</code>).
            </li>
          </ol>
          <p className="muted small">
            No share path from your host? Ask their support for{" "}
            <strong>SMB / network share access</strong>. Most providers offer
            it on request.
          </p>
        </details>

        <details className="os-block">
          <summary>
            <strong>macOS</strong> — connect to server
          </summary>
          <ol>
            <li>
              In <strong>Finder</strong>, press <kbd>⌘</kbd>+<kbd>K</kbd> (Go →
              Connect to Server).
            </li>
            <li>
              Enter the server URL your host gave you (looks like{" "}
              <code>smb://your-server</code>).
            </li>
            <li>
              Sign in. The share will appear under <em>Locations</em> in
              Finder.
            </li>
            <li>
              In RustApp <strong>Settings</strong>, click <strong>Browse</strong>{" "}
              and pick the share (typically under{" "}
              <code>/Volumes/&lt;name&gt;</code>).
            </li>
          </ol>
        </details>

        <details className="os-block">
          <summary>
            <strong>Linux</strong> — mount via SSHFS (advanced)
          </summary>
          <ol>
            <li>
              Install <code>sshfs</code> with your package manager (e.g.{" "}
              <code>sudo apt install sshfs</code>).
            </li>
            <li>
              Make a mount point: <code>mkdir -p ~/rust-server</code>
            </li>
            <li>
              Mount it:{" "}
              <code>sshfs user@your-server:/srv/rust ~/rust-server</code>
            </li>
            <li>
              In RustApp <strong>Settings</strong>, set{" "}
              <em>Server directory</em> to <code>~/rust-server</code>.
            </li>
          </ol>
        </details>

        <Callout tone="info" icon={Lightbulb}>
          <strong>Working with a hosted gameserver provider?</strong> Ask
          their support whether they offer a{" "}
          <strong>direct file share (SMB)</strong>. Most major providers
          (Pingperfect, Survival Servers, GTXGaming, etc.) do — they'll send
          you a path you can paste into the steps above.
        </Callout>
      </div>

      {/* ─── Errors ─── */}
      <div className="card">
        <h3>Common errors and what they mean</h3>
        <p className="muted small" style={{ marginTop: -4 }}>
          When something goes wrong, the toast in the corner shows a code in{" "}
          <code>[BRACKETS]</code>. Match it here.
        </p>
        <table className="works-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Means</th>
              <th>What to do</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>RCON-001</code>
              </td>
              <td>Couldn't reach your server in time.</td>
              <td>
                Double-check the IP and RCON port. Make sure RCON is enabled
                in your <code>server.cfg</code> (set <code>rcon.web 1</code>).
              </td>
            </tr>
            <tr>
              <td>
                <code>RCON-003</code>
              </td>
              <td>The server kicked us — usually a wrong password.</td>
              <td>
                Compare the RCON password in your profile with the{" "}
                <code>+rcon.password</code> on the server's command line.
              </td>
            </tr>
            <tr>
              <td>
                <code>FS-001</code>
              </td>
              <td>The folder or file isn't there.</td>
              <td>
                For VPS servers: see <em>Option B</em> above. For local
                servers: make sure <em>Server directory</em> points at the
                folder containing <code>RustDedicated.exe</code>.
              </td>
            </tr>
            <tr>
              <td>
                <code>FS-002</code>
              </td>
              <td>Permission denied reading or writing files.</td>
              <td>
                Run RustApp from an account that has access to the server
                folder. On Windows, "Run as administrator" if your server is
                in <code>C:\Program Files\</code>.
              </td>
            </tr>
            <tr>
              <td>
                <code>STORE-001</code>
              </td>
              <td>Couldn't reach the uMod plugin store.</td>
              <td>
                Check your internet connection. uMod is occasionally briefly
                offline — try again in a minute.
              </td>
            </tr>
            <tr>
              <td>
                <code>CONFIG-001</code>
              </td>
              <td>The JSON config you tried to save isn't valid.</td>
              <td>
                The save was refused on purpose so your server keeps working.
                Look for missing commas / brackets and try again.
              </td>
            </tr>
          </tbody>
        </table>
        <p className="muted small" style={{ marginTop: 12, marginBottom: 0 }}>
          Full reference: <code>ERROR_CODES.md</code> in the GitHub repo.
        </p>
      </div>

      {/* ─── Tips ─── */}
      <div className="card">
        <h3>Tips for a smooth setup</h3>
        <ul className="tips">
          <li>
            <strong>Test before you trust.</strong> After adding a server, hit
            the plug icon to test RCON. A green toast means everything is
            wired up right.
          </li>
          <li>
            <strong>One profile per server.</strong> Even a small "test" box
            deserves its own profile so you can switch between them in the
            top bar without retyping anything.
          </li>
          <li>
            <strong>Use Notes.</strong> The Notes field on a profile shows up
            on the Dashboard — perfect for "force-wipe Thursday" or "ports
            opened on the firewall: …".
          </li>
          <li>
            <strong>Star common commands.</strong> In the RCON Console, hit{" "}
            <em>Save current</em> to keep frequent commands one click away
            (e.g. <code>save.all</code>, <code>oxide.reload *</code>).
          </li>
          <li>
            <strong>Back up before big edits.</strong> The config editor
            already snapshots your old config before saving — visit the
            "Backups" tab in the editor to roll back.
          </li>
        </ul>
      </div>
    </>
  );
}

function SetupCard({
  icon: Icon,
  title,
  tone,
  tag,
  children,
}: {
  icon: typeof MonitorSmartphone;
  title: string;
  tone: "ok" | "warn";
  tag: string;
  children: React.ReactNode;
}) {
  return (
    <div className="setup-card card">
      <div className="setup-icon">
        <Icon size={26} />
      </div>
      <h4 style={{ margin: "0 0 6px" }}>{title}</h4>
      <span className={`pill ${tone === "ok" ? "on" : "warn"}`}>{tag}</span>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

function Cell({ ok }: { ok: boolean }) {
  return (
    <td className="works-cell">
      {ok ? (
        <Check size={16} color="var(--ok)" />
      ) : (
        <XIcon size={16} color="var(--text-faint)" />
      )}
    </td>
  );
}

function Callout({
  tone,
  icon: Icon,
  children,
}: {
  tone: "info" | "warn";
  icon: typeof Lightbulb;
  children: React.ReactNode;
}) {
  return (
    <div className={`callout callout-${tone}`}>
      <Icon size={18} />
      <div>{children}</div>
    </div>
  );
}

// Re-export the icon so the sidebar can pull from a single source if it wants.
export { HelpCircle, AlertTriangle };
