import { NextRequest, NextResponse } from "next/server";
import { searchYouTubeVideos } from "@/lib/youtube";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json(
      { error: "A search query is required." },
      { status: 400 }
    );
  }

  try {
    const items = await searchYouTubeVideos(query);
    return NextResponse.json({ items });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected search error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
