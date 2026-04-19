import { VideoItem } from "@/types/youtube";

type YouTubeSearchResponse = {
  items?: Array<{
    id?: {
      videoId?: string;
    };
    snippet?: {
      title?: string;
      channelTitle?: string;
      description?: string;
      publishedAt?: string;
      thumbnails?: {
        medium?: { url?: string };
        high?: { url?: string };
        default?: { url?: string };
      };
    };
  }>;
};

export async function searchYouTubeVideos(query: string): Promise<VideoItem[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error("Missing YOUTUBE_API_KEY.");
  }

  const params = new URLSearchParams({
    part: "snippet",
    maxResults: "12",
    q: query,
    type: "video",
    videoEmbeddable: "true",
    key: apiKey
  });

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
    {
      next: { revalidate: 0 }
    }
  );

  if (!response.ok) {
    throw new Error(`YouTube API request failed with status ${response.status}.`);
  }

  const data = (await response.json()) as YouTubeSearchResponse;

  return (data.items ?? [])
    .map((item) => {
      const videoId = item.id?.videoId;
      const snippet = item.snippet;

      if (!videoId || !snippet?.title) {
        return null;
      }

      return {
        id: videoId,
        title: snippet.title,
        channelTitle: snippet.channelTitle ?? "Unknown channel",
        description: snippet.description ?? "",
        thumbnailUrl:
          snippet.thumbnails?.high?.url ??
          snippet.thumbnails?.medium?.url ??
          snippet.thumbnails?.default?.url ??
          "",
        publishedAt: snippet.publishedAt ?? ""
      } satisfies VideoItem;
    })
    .filter((item): item is VideoItem => item !== null);
}
