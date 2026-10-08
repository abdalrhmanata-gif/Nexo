import { NextResponse,type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
export async function POST(request:NextRequest,{params}:{params:Promise<{approvalId:string}>}) {
 try {
  const {approvalId}=await params; const body=await request.json() as Record<string,unknown>;
  if(body.decision!=="APPROVED"&&body.decision!=="REJECTED"&&body.decision!=="CANCELLED") return NextResponse.json({error:"Invalid approval decision."},{status:400});
  const supabase=await createSupabaseServerClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const result=await supabase.rpc("decide_mission_approval",{p_approval_id:approvalId,p_decision:body.decision,p_note:typeof body.note==="string"?body.note:null});
  if(result.error) return NextResponse.json({error:"Approval decision could not be recorded."},{status:403});
  return NextResponse.json(result.data);
 } catch { return NextResponse.json({error:"Approval decision could not be recorded."},{status:403});}
}