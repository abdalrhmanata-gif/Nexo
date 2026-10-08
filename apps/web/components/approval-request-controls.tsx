"use client";
import { useState } from "react";
export function ApprovalRequestControls({missionId,actionId}:{missionId:string;actionId?:string}) {
 const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
 async function request() {
  setBusy(true); setMessage("");
  const response=await fetch(`/api/missions/${missionId}/approval`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({actionId:actionId??null,scope:{type:"bounded_action",requires_approval:true,action_id:actionId??null}})});
  const payload=await response.json().catch(()=>({})); setBusy(false);
  setMessage(response.ok?"Approval requested.":"Approval could not be requested.");
 }
 return <span className="approval-inline"><button className="button button-small button-quiet" type="button" onClick={request} disabled={busy}>{busy?"Requesting…":"Request approval"}</button>{message&&<small className="action-hint">{message}</small>}</span>;
}