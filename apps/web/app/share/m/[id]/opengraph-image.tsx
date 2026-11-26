import { ImageResponse } from "next/og";
import { shareIdOrNull, type MissionShareSnapshot } from "../../../../lib/mission-share.mjs";
import { isSupabaseConfigured } from "../../../../lib/supabase/config";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const alt = "A shared ZAVQERA checklist";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The picture a shared Mission link shows in a chat or a feed. It is drawn
// from the same stored copy as the page, and does not count as a view.
// The built-in font covers Latin text only, so a name in another script is
// left out and the card shows the brand line alone.

const LATIN = /^[ -ɏ‐-‧]+$/;

async function readShare(id: string): Promise<MissionShareSnapshot | null> {
  const shareId = shareIdOrNull(id);
  if (!shareId || !isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const found = await supabase.rpc("get_mission_share", { p_id: shareId });
  return found.error ? null : found.data as MissionShareSnapshot | null;
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const snapshot = await readShare((await params).id);
  const name = snapshot && LATIN.test(snapshot.name) ? snapshot.name.slice(0, 70) : "";
  const done = snapshot ? snapshot.completedSteps.length : 0;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#0b4f4b", color: "#f8fafc" }}>
        <div style={{ display: "flex", fontSize: 34, letterSpacing: 8, color: "#9fe3da" }}>ZAVQERA</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: name.length > 40 ? 60 : 76, fontWeight: 700, lineHeight: 1.1 }}>{name || "A checklist with an owner and proof on every step"}</div>
          {snapshot && (
            <div style={{ display: "flex", marginTop: 28, fontSize: 34, color: "#cbd5e1" }}>
              {`${snapshot.progress}% complete · ${done} ${done === 1 ? "step" : "steps"} done`}
            </div>
          )}
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#9fe3da" }}>Checklists for small teams · zavqera.com</div>
      </div>
    ),
    size,
  );
}
