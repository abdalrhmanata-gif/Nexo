const responseHeaders = { "Cache-Control": "no-store" };

export function createProductEventHandler({
  isSupabaseConfigured,
  createSupabaseServerClient,
  isValidTemplateId,
  jsonResponse,
}) {
  return async function handleProductEvent(request) {
    const json = (body, status = 200) =>
      jsonResponse(body, { status, headers: responseHeaders });

    if (!isSupabaseConfigured()) return json({ recorded: false });

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: "Invalid event payload." }, 400);
    }
    if (!payload || typeof payload !== "object") {
      return json({ error: "Invalid event payload." }, 400);
    }

    const input = payload;
    if (
      input.event_type !== "template_shared" ||
      typeof input.template_id !== "string" ||
      !isValidTemplateId(input.template_id)
    ) {
      return json({ error: "Unsupported product event." }, 400);
    }

    try {
      const supabase = await createSupabaseServerClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) return json({ error: "Authentication is required." }, 401);

      const { error } = await supabase.from("product_growth_events").insert({
        user_id: user.id,
        event_type: "template_shared",
        template_id: input.template_id,
      });
      if (error?.code === "23505") return json({ recorded: true, duplicate: true });
      if (error) return json({ error: "Product metrics are temporarily unavailable." }, 503);
      return json({ recorded: true });
    } catch {
      return json({ error: "Product metrics are temporarily unavailable." }, 503);
    }
  };
}
