import { NextResponse } from "next/server";
import { checkPasswordPolicy } from "../../../../lib/password-policy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a valid JSON request." }, { status: 400 });
  }

  const password = typeof body === "object" && body !== null && "password" in body
    ? (body as { password?: unknown }).password
    : undefined;

  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  try {
    const result = await checkPasswordPolicy(password);
    if (!result.allowed) {
      return NextResponse.json(
        { error: "This password has appeared in known breaches. Choose a different password." },
        { status: 422 },
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json(
      { error: "Password security verification is temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }
}
