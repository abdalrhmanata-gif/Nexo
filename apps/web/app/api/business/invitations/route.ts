import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import crypto from "node:crypto";
export async function POST(request:NextRequest){
 try{
  const body=await request.json(); const email=typeof body.email==="string"?body.email.trim():""; const role=typeof body.role==="string"?body.role:"";
  if(!email||!["admin","member","viewer"].includes(role)) return NextResponse.json({error:"Provide a valid email and role."},{status:400});
  const supabase=await createSupabaseServerClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) return NextResponse.json({error:"Authentication required."},{status:401});
  const workspace=await supabase.from("workspaces").select("id").eq("owner_id",user.id).order("created_at").limit(1).maybeSingle(); if(workspace.error||!workspace.data)return NextResponse.json({error:"Workspace unavailable."},{status:403});
  const token=crypto.randomBytes(32).toString("hex"); const tokenHash=crypto.createHash("sha256").update(token).digest("hex"); const expires=new Date(Date.now()+7*86400000).toISOString();
  const result=await supabase.rpc("create_workspace_invitation",{p_workspace_id:workspace.data.id,p_email:email,p_role:role,p_token_hash:tokenHash,p_expires_at:expires});
  if(result.error)return NextResponse.json({error:"The invitation could not be created."},{status:400});
  return NextResponse.json({invitation:{id:result.data.id,email:result.data.email,role:result.data.role,status:result.data.status,expiresAt:result.data.expires_at},inviteToken:token});
 }catch{return NextResponse.json({error:"The invitation request could not be processed."},{status:400});}
}