"use client";
import { useState } from "react";
export function ApprovalDecisionControls({approvalId}:{approvalId:string}) {
 const [busy,setBusy]=useState(false);
 async function decide(decision:"APPROVED"|"REJECTED") {
  setBusy(true);
  await fetch(`/api/missions/approval/${approvalId}/decision`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({decision})});
  window.location.reload();
 }
 return <div className="approval-actions"><button className="button button-small" type="button" onClick={()=>decide("APPROVED")} disabled={busy}>Approve</button><button className="button button-small button-quiet" type="button" onClick={()=>decide("REJECTED")} disabled={busy}>Reject</button></div>;
}