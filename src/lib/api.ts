import { NextResponse } from "next/server";

export const json = <T>(data: T, status = 200) =>
  NextResponse.json(data, { status });

export const badRequest = (message: string) =>
  NextResponse.json({ error: message }, { status: 400 });

export const notFound = (message = "not found") =>
  NextResponse.json({ error: message }, { status: 404 });

/** Wrap a handler so an unexpected throw becomes a 500 with a message, not a crash. */
export function handler<T extends unknown[]>(
  fn: (...args: T) => Promise<Response>,
) {
  return async (...args: T): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error(err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "internal error" },
        { status: 500 },
      );
    }
  };
}
