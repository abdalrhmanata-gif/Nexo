import { NextResponse,type NextRequest } from "next/server";
import { MissionMutationRejectedError } from "../../../../../lib/mission-repository";
import { createSupabaseMissionRepository } from "../../../../../lib/supabase/mission-repository";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
 try {
  const {id}=await params; const body=await request.json() as Record<string,unknown>;
  if(body.actionId!==undefined && body.actionId!==null && typeof body.actionId!=="string") return NextResponse.json({error:"Invalid action."},{status:400});
  if(typeof body.scope!=="object" || body.scope===null || Array.isArray(body.scope)) return NextResponse.json({error:"Approval scope is required."},{status:400});
  const supabase=await createSupabaseServerClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const result=await supabase.rpc("request_mission_approval",{p_mission_id:id,p_action_id:body.actionId ?? null,p_scope:body.scope});
  if(result.error) throw result.error;
  return NextResponse.json(result.data,{status:201});
 } catch(error){ if(error instanceof MissionMutationRejectedError)return NextResponse.json({error:error.message},{status:422}); return NextResponse.json({error:"That approval request could not be created."},{status:403});}
}