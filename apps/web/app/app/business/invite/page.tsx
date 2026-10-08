"use client";
import { useState } from "react";

export default function BusinessInvitePage() {
  const [email,setEmail]=useState("");
  const [role,setRole]=useState("member");
  const [status,setStatus]=useState("");
  const submit=async(e:React.FormEvent)=>{e.preventDefault();setStatus("Creating invitation…");
    const token=crypto.randomUUID()+crypto.randomUUID();
    const tokenHash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
    const hash=Array.from(new Uint8Array(tokenHash)).map((b)=>b.toString(16).padStart(2,"0")).join("");
    const response=await fetch("/api/business/invitations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,role,tokenHash,expiresInDays:7})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){setStatus(data.error||"Invitation could not be created.");return;}
    setStatus("Invitation created. The secure invitation link is ready to share.");
    setEmail("");
  };
  return <div className="container"><p className="eyebrow">Business workspace</p><h1>Invite a teammate</h1><p className="detail-intent">Choose the least privilege role they need. Invitations expire after 7 days.</p>
    <form className="card" onSubmit={submit}><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.com"/></label><label>Role<select value={role} onChange={e=>setRole(e.target.value)}><option value="member">Member</option><option value="viewer">Viewer</option><option value="admin">Admin</option></select></label><button className="button" type="submit">Create invitation</button>{status&&<p role="status">{status}</p>}</form></div>;
}