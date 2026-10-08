"use client";
import { useState } from "react";

type Role = "owner" | "admin" | "member" | "viewer";
export function MemberManagementControls({ memberId, currentRole }: { memberId: string; currentRole: Role }) {
  const [role, setRole] = useState<Role>(currentRole);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const changeRole = async (nextRole: Role) => {
    setBusy(true); setMessage("");
    const response = await fetch("/api/business/members/role", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ memberId, role: nextRole }) });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setMessage(data.error || "Could not change role."); return; }
    setRole(nextRole); setMessage("Role updated");
  };
  const remove = async () => {
    if (!window.confirm("Remove this member from the workspace?")) return;
    setBusy(true); setMessage("");
    const response = await fetch("/api/business/members/remove", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ memberId }) });
    const data = await response.json().catch(() => ({}));
    const data2 = data;
    if (!response.ok) { setBusy(false); setMessage(data2.error || "Could not remove member."); return; }
    window.location.reload();
  };
  if (currentRole === "owner") return <span className="status status-active">Owner protected</span>;
  return <div className="member-controls">
    <select aria-label="Member role" value={role} disabled={busy} onChange={(event) => void changeRole(event.target.value as Role)}>
      <option value="admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option>
    </select>
    <button className="button button-small button-quiet" type="button" disabled={busy} onClick={remove}>Remove</button>
    {message && <span className="action-hint">{message}</span>}
  </div>;
}
