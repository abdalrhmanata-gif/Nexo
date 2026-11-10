"use client";

import { useState } from "react";
import { LocalizedText, fill, useTranslate } from "./localized-text";

export function DeleteMissionForm({ missionId, missionName }: { missionId: string; missionName?: string }) {
  const t = useTranslate();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return <div className="danger-zone">
      <p className="eyebrow"><LocalizedText en="Danger zone" /></p>
      <button className="button button-danger" type="button" onClick={() => setConfirming(true)}>
        <LocalizedText en="Delete mission" />{missionName ? <span className="visually-hidden">: {missionName}</span> : null}
      </button>
    </div>;
  }

  return <form className="danger-zone" action={`/api/missions/${missionId}`} method="post">
    <p className="eyebrow"><LocalizedText en="Danger zone" /></p>
    <p className="danger-copy">{missionName
      ? fill(t("Deleting “{name}” permanently removes it and its actions from your workspace. This cannot be undone."), { name: missionName })
      : t("Deleting this mission permanently removes it and its actions from your workspace. This cannot be undone.")}</p>
    <input type="hidden" name="_method" value="DELETE" />
    <div className="action-control">
      <button className="button button-danger" type="submit"><LocalizedText en="Yes, delete permanently" /></button>
      <button className="button button-small" type="button" onClick={() => setConfirming(false)}><LocalizedText en="Cancel" /></button>
    </div>
  </form>;
}
