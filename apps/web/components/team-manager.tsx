"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LocalizedDateTime, LocalizedFill, LocalizedText, useTranslate } from "./localized-text";
import type { TeamOverview } from "../lib/supabase/team-repository";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Can edit and invite",
  member: "Can edit",
  viewer: "Can view",
};

const roleLabel = (role: string) => ROLE_LABELS[role] ?? ROLE_LABELS.viewer;

async function send(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { ok: response.ok, data };
}

type Sent = { email: string; link?: string };

export function TeamManager({ overview }: { overview: TeamOverview }) {
  const t = useTranslate();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<Sent | null>(null);
  const [copied, setCopied] = useState(false);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setSent(null); setCopied(false);
    const { ok, data } = await send("/api/team/invitations", "POST", { email, role });
    setBusy(false);
    if (!ok) { setError(typeof data.error === "string" ? data.error : "The invitation could not be created. Try again."); return; }
    setSent({ email: email.trim().toLowerCase(), link: typeof data.link === "string" ? data.link : undefined });
    setEmail("");
    router.refresh();
  }

  async function act(url: string, method: string, body?: unknown, then?: string) {
    setError("");
    const { ok, data } = await send(url, method, body);
    if (!ok) { setError(typeof data.error === "string" ? data.error : "Something went wrong. Try again."); return; }
    if (then) router.push(then);
    router.refresh();
  }

  async function copy(link: string) {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); }
  }

  return <div className="team-manager">
    <section className="card team-panel" aria-labelledby="team-invite-heading">
      <h2 id="team-invite-heading"><LocalizedText en="Invite someone" /></h2>
      <p className="muted"><LocalizedText en="The people you invite work on the missions in your workspace. Your opportunity analyses stay private to you." /></p>
      <form className="team-invite-form" onSubmit={invite}>
        <div className="field">
          <label htmlFor="team-invite-email"><LocalizedText en="Email address" /></label>
          <input id="team-invite-email" type="email" required autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("colleague@company.com")} />
        </div>
        <div className="field">
          <label htmlFor="team-invite-role"><LocalizedText en="Access" /></label>
          <select id="team-invite-role" value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="member">{t("Can edit")}</option>
            <option value="viewer">{t("Can view")}</option>
          </select>
        </div>
        <button className="button" type="submit" disabled={busy}>{busy ? <LocalizedText en="Sending…" /> : <LocalizedText en="Send invitation" />}</button>
      </form>
      {error && <div className="field-error" role="alert"><LocalizedText en={error} /></div>}
      {sent && !sent.link && <div className="success-state" role="status"><LocalizedFill en="Invitation sent to {email}." values={{ email: sent.email }} /></div>}
      {sent?.link && <div className="success-state team-link" role="status">
        <p><LocalizedFill en="The email could not be sent. Copy this link and send it to {email} yourself. It can be used once and expires in 7 days." values={{ email: sent.email }} /></p>
        <div className="team-link-row">
          <input readOnly value={sent.link} aria-label={t("Invitation link")} onFocus={(event) => event.currentTarget.select()} />
          <button className="button button-small" type="button" onClick={() => copy(sent.link as string)}>{copied ? <LocalizedText en="Copied" /> : <LocalizedText en="Copy link" />}</button>
        </div>
      </div>}
    </section>

    <section className="card team-panel" aria-labelledby="team-members-heading">
      <h2 id="team-members-heading"><LocalizedText en="People in your workspace" /></h2>
      <ul className="team-list">
        {overview.members.map((member) => <li key={member.id}>
          <span className="team-person"><strong>{member.email}</strong>{member.isYou && <small> · <LocalizedText en="You" /></small>}</span>
          <span className="team-role"><LocalizedText en={roleLabel(member.role)} /></span>
          {member.role !== "owner" && <button className="button button-small button-quiet" type="button" onClick={() => act(`/api/team/members/${member.id}`, "DELETE")}>
            <LocalizedText en="Remove" /><span className="visually-hidden">: {member.email}</span>
          </button>}
        </li>)}
      </ul>
      <h3><LocalizedText en="Waiting for an answer" /></h3>
      {overview.pending.length
        ? <ul className="team-list">
          {overview.pending.map((invitation) => <li key={invitation.id}>
            <span className="team-person"><strong>{invitation.email}</strong><small><LocalizedText en="Expires" /> <LocalizedDateTime value={invitation.expiresAt} /></small></span>
            <span className="team-role"><LocalizedText en={roleLabel(invitation.role)} /></span>
            <button className="button button-small button-quiet" type="button" onClick={() => act(`/api/team/invitations/${invitation.id}`, "DELETE")}>
              <LocalizedText en="Revoke" /><span className="visually-hidden">: {invitation.email}</span>
            </button>
          </li>)}
        </ul>
        : <p className="muted"><LocalizedText en="No invitations are waiting." /></p>}
    </section>

    <section className="card team-panel" aria-labelledby="team-workspaces-heading">
      <h2 id="team-workspaces-heading"><LocalizedText en="Your workspaces" /></h2>
      <ul className="team-list">
        <li>
          <span className="team-person"><strong><LocalizedText en="Your own workspace" /></strong></span>
          <span className="team-role"><LocalizedText en="Owner" /></span>
          {overview.ownOpen
            ? <span className="team-open"><LocalizedText en="Open now" /></span>
            : <button className="button button-small" type="button" onClick={() => act("/api/team/workspace", "POST", { workspaceId: null }, "/app")}><LocalizedText en="Open" /></button>}
        </li>
        {overview.shared.map((workspace) => <li key={workspace.workspaceId}>
          <span className="team-person"><strong><LocalizedFill en="Shared by {email}" values={{ email: workspace.ownerEmail }} /></strong></span>
          <span className="team-role"><LocalizedText en={roleLabel(workspace.role)} /></span>
          <span className="team-actions">
            {workspace.open
              ? <span className="team-open"><LocalizedText en="Open now" /></span>
              : <button className="button button-small" type="button" onClick={() => act("/api/team/workspace", "POST", { workspaceId: workspace.workspaceId }, "/app")}><LocalizedText en="Open" /></button>}
            <button className="button button-small button-quiet" type="button" onClick={() => act(`/api/team/members/${workspace.memberId}`, "DELETE", undefined, workspace.open ? "/app/team" : undefined)}><LocalizedText en="Leave" /></button>
          </span>
        </li>)}
      </ul>
    </section>
  </div>;
}

export function InvitationAccept({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function accept() {
    setBusy(true); setError("");
    const { ok, data } = await send("/api/team/invitations/accept", "POST", { token });
    if (!ok) { setBusy(false); setError(typeof data.error === "string" ? data.error : "The invitation could not be accepted. Try again."); return; }
    router.push("/app");
    router.refresh();
  }

  return <div className="team-accept">
    <button className="button" type="button" disabled={busy} onClick={accept}>{busy ? <LocalizedText en="Accepting…" /> : <LocalizedText en="Accept invitation" />}</button>
    {error && <div className="field-error" role="alert"><LocalizedText en={error} /></div>}
  </div>;
}
