type ProductEventInsert = {
  user_id: string;
  event_type: "template_shared";
  template_id: string;
};

type ProductEventSupabaseClient = {
  auth: {
    getUser(): Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
  from(table: "product_growth_events"): {
    insert(record: ProductEventInsert): PromiseLike<{ error: { code?: string } | null }>;
  };
};

type JsonResponse = (
  body: unknown,
  init: { status: number; headers: Record<string, string> },
) => Response;

export declare function createProductEventHandler(dependencies: {
  isSupabaseConfigured(): boolean;
  createSupabaseServerClient(): Promise<ProductEventSupabaseClient>;
  isValidTemplateId(templateId: string): boolean;
  jsonResponse: JsonResponse;
}): (request: Request) => Promise<Response>;
