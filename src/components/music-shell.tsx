"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { VideoItem } from "@/types/youtube";
import styles from "./music-shell.module.css";

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        config: {
          height?: string;
          width?: string;
          videoId?: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: () => void;
            onStateChange?: (event: { data: number }) => void;
          };
        }
      ) => YouTubePlayer;
      PlayerState?: {
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type YouTubePlayer = {
  destroy: () => void;
  loadVideoById: (videoId: string) => void;
};

const starterQueue: VideoItem[] = [
  {
    id: "jfKfPfyJRdk",
    title: "lofi hip hop radio - beats to relax/study to",
    channelTitle: "Lofi Girl",
    description: "Fallback starter track while you wire in search results.",
    thumbnailUrl: "https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg",
    publishedAt: "2020-02-22T00:00:00Z"
  }
];

const moodFilters = [
  "Energize",
  "Focus",
  "Late Night",
  "Afrobeats",
  "R&B",
  "Amapiano",
  "Throwbacks"
];

const navItems = ["Home", "Explore", "Library"];
const SAVED_TRACKS_KEY = "smbamusic-saved-tracks";
const LIKED_TRACKS_KEY = "smbamusic-liked-track-ids";
const RECENT_TRACKS_KEY = "smbamusic-recent-tracks";

type SectionName = "Home" | "Explore" | "Library";

export function MusicShell() {
  const [query, setQuery] = useState("khruangbin");
  const [results, setResults] = useState<VideoItem[]>([]);
  const [queue, setQueue] = useState<VideoItem[]>(starterQueue);
  const [currentVideo, setCurrentVideo] = useState<VideoItem>(starterQueue[0]);
  const [savedTracks, setSavedTracks] = useState<VideoItem[]>([]);
  const [likedTrackIds, setLikedTrackIds] = useState<string[]>([]);
  const [recentTracks, setRecentTracks] = useState<VideoItem[]>([]);
  const [activeSection, setActiveSection] = useState<SectionName>("Home");
  const [isLibraryReady, setIsLibraryReady] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const searchRequestIdRef = useRef(0);
  const featuredTracks = results.length ? results.slice(0, 4) : queue.slice(0, 4);

  useEffect(() => {
    const existingScript = document.getElementById("youtube-iframe-api");

    window.onYouTubeIframeAPIReady = () => initializePlayer(currentVideo.id);

    if (existingScript) {
      initializePlayer(currentVideo.id);
      return;
    }

    const script = document.createElement("script");
    script.id = "youtube-iframe-api";
    script.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(script);

    return () => {
      window.onYouTubeIframeAPIReady = undefined;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.loadVideoById(currentVideo.id);
    }
  }, [currentVideo]);

  useEffect(() => {
    void runSearch(query);
  }, []);

  const queueIds = useMemo(() => new Set(queue.map((item) => item.id)), [queue]);
  const savedTrackIds = useMemo(
    () => new Set(savedTracks.map((item) => item.id)),
    [savedTracks]
  );
  const likedIdSet = useMemo(() => new Set(likedTrackIds), [likedTrackIds]);

  useEffect(() => {
    try {
      const savedTrackValue = window.localStorage.getItem(SAVED_TRACKS_KEY);
      const likedTrackValue = window.localStorage.getItem(LIKED_TRACKS_KEY);
      const recentTrackValue = window.localStorage.getItem(RECENT_TRACKS_KEY);

      if (savedTrackValue) {
        setSavedTracks(JSON.parse(savedTrackValue) as VideoItem[]);
      }

      if (likedTrackValue) {
        setLikedTrackIds(JSON.parse(likedTrackValue) as string[]);
      }

      if (recentTrackValue) {
        setRecentTracks(JSON.parse(recentTrackValue) as VideoItem[]);
      }
    } catch {
      setSavedTracks([]);
      setLikedTrackIds([]);
      setRecentTracks([]);
    } finally {
      setIsLibraryReady(true);
    }
  }, []);

  useEffect(() => {
    if (!isLibraryReady) {
      return;
    }

    window.localStorage.setItem(SAVED_TRACKS_KEY, JSON.stringify(savedTracks));
  }, [isLibraryReady, savedTracks]);

  useEffect(() => {
    if (!isLibraryReady) {
      return;
    }

    window.localStorage.setItem(LIKED_TRACKS_KEY, JSON.stringify(likedTrackIds));
  }, [isLibraryReady, likedTrackIds]);

  useEffect(() => {
    if (!isLibraryReady) {
      return;
    }

    window.localStorage.setItem(RECENT_TRACKS_KEY, JSON.stringify(recentTracks));
  }, [isLibraryReady, recentTracks]);

  function initializePlayer(videoId: string) {
    if (!window.YT?.Player) {
      return;
    }

    if (playerRef.current) {
      playerRef.current.loadVideoById(videoId);
      return;
    }

    playerRef.current = new window.YT.Player("youtube-player", {
      height: "100%",
      width: "100%",
      videoId,
      playerVars: {
        autoplay: 0,
        controls: 1,
        rel: 0,
        playsinline: 1
      },
      events: {
        onStateChange: (event) => {
          if (event.data === window.YT?.PlayerState?.ENDED) {
            playNext();
          }
        }
      }
    });
  }

  async function runSearch(searchTerm: string) {
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      return;
    }

    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    setIsSearching(true);
    setError(null);

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
      const data = (await response.json()) as {
        items?: VideoItem[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Search failed.");
      }

      if (searchRequestIdRef.current === requestId) {
        setResults(data.items ?? []);
      }
    } catch (searchError) {
      if (searchRequestIdRef.current === requestId) {
        setError(
          searchError instanceof Error ? searchError.message : "Search failed."
        );
      }
    } finally {
      if (searchRequestIdRef.current === requestId) {
        setIsSearching(false);
      }
    }
  }

  async function handleSearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    await runSearch(query);
  }

  function addToQueue(video: VideoItem) {
    if (queueIds.has(video.id)) {
      return;
    }

    setQueue((current) => [...current, video]);
  }

  function playNext() {
    setQueue((current) => {
      const currentIndex = current.findIndex((item) => item.id === currentVideo.id);
      const nextVideo =
        current[(currentIndex + 1) % current.length] ?? currentVideo;
      setCurrentVideo(nextVideo);
      return current;
    });
  }

  function playNow(video: VideoItem) {
    setCurrentVideo(video);
    setRecentTracks((current) => {
      const next = [video, ...current.filter((item) => item.id !== video.id)];
      return next.slice(0, 8);
    });

    if (!queueIds.has(video.id)) {
      setQueue((current) => [video, ...current]);
    }
  }

  function toggleSavedTrack(video: VideoItem) {
    setSavedTracks((current) => {
      if (current.some((item) => item.id === video.id)) {
        return current.filter((item) => item.id !== video.id);
      }

      return [video, ...current];
    });
  }

  function toggleLikedTrack(video: VideoItem) {
    setLikedTrackIds((current) => {
      if (current.includes(video.id)) {
        return current.filter((id) => id !== video.id);
      }

      return [video.id, ...current];
    });
  }

  const likedSavedTracks = savedTracks.filter((track) => likedIdSet.has(track.id));
  const visibleResults =
    activeSection === "Library"
      ? savedTracks
      : activeSection === "Explore"
        ? results
        : results;

  return (
    <main className={styles.page}>
      <div className={styles.appShell}>
        <aside className={styles.sidebar}>
          <div className={styles.brandBlock}>
            <div className={styles.brandGlyph}>S</div>
            <div>
              <p className={styles.brandEyebrow}>Now vibing</p>
              <h1 className={styles.brandName}>SmbaMusic</h1>
            </div>
          </div>

          <nav className={styles.nav}>
            {navItems.map((item) => (
              <button
                key={item}
                className={`${styles.navItem} ${
                  activeSection === item ? styles.navItemActive : ""
                }`}
                onClick={() => setActiveSection(item as SectionName)}
              >
                {item}
              </button>
            ))}
          </nav>

          <section className={styles.libraryCard}>
            <p className={styles.sectionEyebrow}>Your queue</p>
            <h2>Ready to play</h2>
            <div className={styles.queueList}>
              {queue.slice(0, 5).map((video, index) => (
                <button
                  key={`${video.id}-${index}`}
                  className={styles.queueItem}
                  onClick={() => playNow(video)}
                >
                  <span className={styles.queueIndex}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className={styles.queueText}>
                    <strong>{video.title}</strong>
                    <span>{video.channelTitle}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className={styles.libraryCard}>
            <p className={styles.sectionEyebrow}>Your library</p>
            <h2>Saved for later</h2>
            <div className={styles.libraryStats}>
              <div className={styles.statCard}>
                <strong>{savedTracks.length}</strong>
                <span>Saved tracks</span>
              </div>
              <div className={styles.statCard}>
                <strong>{likedSavedTracks.length}</strong>
                <span>Liked tracks</span>
              </div>
            </div>
            <div className={styles.savedList}>
              {savedTracks.slice(0, 4).map((video) => (
                <article key={video.id} className={styles.savedItem}>
                  <button
                    className={styles.savedPlayButton}
                    onClick={() => playNow(video)}
                  >
                    <span className={styles.queueText}>
                      <strong>{video.title}</strong>
                      <span>{video.channelTitle}</span>
                    </span>
                  </button>
                </article>
              ))}
              {!savedTracks.length ? (
                <p className={styles.emptyState}>Save a few tracks to build your library.</p>
              ) : null}
            </div>
          </section>

          <section className={styles.libraryCard}>
            <p className={styles.sectionEyebrow}>Recently played</p>
            <h2>Pick back up fast</h2>
            <div className={styles.savedList}>
              {recentTracks.slice(0, 4).map((video) => (
                <article key={`${video.id}-recent`} className={styles.savedItem}>
                  <button
                    className={styles.savedPlayButton}
                    onClick={() => playNow(video)}
                  >
                    <span className={styles.queueText}>
                      <strong>{video.title}</strong>
                      <span>{video.channelTitle}</span>
                    </span>
                  </button>
                </article>
              ))}
              {!recentTracks.length ? (
                <p className={styles.emptyState}>Tracks you play will show up here.</p>
              ) : null}
            </div>
          </section>
        </aside>

        <section className={styles.mainColumn}>
          <header className={styles.topbar}>
            <form className={styles.searchForm} onSubmit={handleSearch}>
              <input
                id="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search songs, artists, videos"
                className={styles.searchInput}
              />
              <button className={styles.searchButton} disabled={isSearching}>
                {isSearching ? "Searching..." : "Search"}
              </button>
            </form>

            <div className={styles.userPill}>Smba</div>
          </header>

          <section className={styles.hero}>
            <div className={styles.heroCopy}>
              <p className={styles.sectionEyebrow}>Made for your session</p>
              <h2>SmbaMusic brings the YouTube Music feel to your own player.</h2>
              <p className={styles.subcopy}>
                Search YouTube, queue tracks, and keep playback inside the official
                embedded player without stream ripping or downloads.
              </p>
              <div className={styles.heroActions}>
                <button
                  className={styles.primaryButton}
                  onClick={() => playNow(currentVideo)}
                >
                  Play now
                </button>
                <button className={styles.secondaryButton} onClick={playNext}>
                  Skip ahead
                </button>
              </div>
            </div>

            <div className={styles.heroSpotlight}>
              <div className={styles.spotlightArt}>
                {currentVideo.thumbnailUrl ? (
                  <Image
                    src={currentVideo.thumbnailUrl}
                    alt={currentVideo.title}
                    fill
                    sizes="240px"
                    className={styles.coverArt}
                  />
                ) : null}
              </div>
              <div className={styles.spotlightMeta}>
                <strong>{currentVideo.title}</strong>
                <span>{currentVideo.channelTitle}</span>
              </div>
            </div>
          </section>

          <div className={styles.chipRow}>
            {moodFilters.map((filter) => (
              <button
                key={filter}
                className={styles.chip}
                onClick={() => {
                  setQuery(filter);
                  void runSearch(filter);
                }}
              >
                {filter}
              </button>
            ))}
          </div>

          <section className={styles.contentSection}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Quick picks</p>
                <h3>Featured for SmbaMusic</h3>
              </div>
            </div>

            <div className={styles.featureGrid}>
              {featuredTracks.map((video) => (
                <article key={video.id} className={styles.featureCard}>
                  <button
                    className={styles.featurePlayButton}
                    onClick={() => playNow(video)}
                  >
                  <div className={styles.featureArt}>
                    <Image
                      src={video.thumbnailUrl}
                      alt={video.title}
                      fill
                      sizes="240px"
                      className={styles.coverArt}
                    />
                  </div>
                  <span className={styles.featureTitle}>{video.title}</span>
                  <span className={styles.featureMeta}>{video.channelTitle}</span>
                  </button>
                  <div className={styles.featureActions}>
                    <button
                      className={styles.secondaryButton}
                      onClick={() => toggleSavedTrack(video)}
                    >
                      {savedTrackIds.has(video.id) ? "Saved" : "Save"}
                    </button>
                    <button
                      className={styles.secondaryButton}
                      onClick={() => toggleLikedTrack(video)}
                    >
                      {likedIdSet.has(video.id) ? "Liked" : "Like"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.resultsSection}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionEyebrow}>
                  {activeSection === "Library" ? "Your library" : "Search results"}
                </p>
                <h3>
                  {activeSection === "Library"
                    ? "Saved tracks and favorites"
                    : "Playable on YouTube embed"}
                </h3>
              </div>
            </div>

            {error ? <p className={styles.error}>{error}</p> : null}

            <div className={styles.results}>
              {visibleResults.map((video) => (
                <article key={video.id} className={styles.resultItem}>
                  <div className={styles.resultMedia}>
                    <div className={styles.thumbWrap}>
                      <Image
                        src={video.thumbnailUrl}
                        alt={video.title}
                        fill
                        sizes="160px"
                        className={styles.coverArt}
                      />
                    </div>
                    <div className={styles.resultCopy}>
                      <strong>{video.title}</strong>
                      <span>{video.channelTitle}</span>
                    </div>
                  </div>

                  <div className={styles.resultActions}>
                    <button
                      className={styles.secondaryButton}
                      onClick={() => playNow(video)}
                    >
                      Play
                    </button>
                    <button
                      className={styles.secondaryButton}
                      onClick={() => addToQueue(video)}
                    >
                      Add to queue
                    </button>
                    <button
                      className={styles.secondaryButton}
                      onClick={() => toggleSavedTrack(video)}
                    >
                      {savedTrackIds.has(video.id) ? "Saved" : "Save"}
                    </button>
                    <button
                      className={styles.secondaryButton}
                      onClick={() => toggleLikedTrack(video)}
                    >
                      {likedIdSet.has(video.id) ? "Liked" : "Like"}
                    </button>
                  </div>
                </article>
              ))}

              {!visibleResults.length && !isSearching ? (
                <p className={styles.emptyState}>
                  {activeSection === "Library"
                    ? "Save tracks from search results to build out your library."
                    : "Search above to fill SmbaMusic with embeddable YouTube tracks."}
                </p>
              ) : null}
            </div>
          </section>
        </section>
      </div>

      <section className={styles.playerDock}>
        <div className={styles.playerSummary}>
          <div className={styles.playerThumb}>
            {currentVideo.thumbnailUrl ? (
              <Image
                src={currentVideo.thumbnailUrl}
                alt={currentVideo.title}
                fill
                sizes="64px"
                className={styles.coverArt}
              />
            ) : null}
          </div>
          <div className={styles.playerText}>
            <strong>{currentVideo.title}</strong>
            <span>{currentVideo.channelTitle}</span>
          </div>
        </div>

        <div className={styles.playerCenter}>
          <div className={styles.playerControls}>
            <button className={styles.controlButton} onClick={playNext}>
              Next
            </button>
            <button
              className={styles.primaryButton}
              onClick={() => playNow(currentVideo)}
            >
              Playing
            </button>
          </div>
          <div className={styles.playerFrame}>
            <div id="youtube-player" className={styles.playerSlot} />
          </div>
        </div>

        <div className={styles.playerInfo}>
          <span>{queue.length} in queue</span>
          <span>{savedTracks.length} saved</span>
          <span>Official YouTube embed</span>
        </div>
      </section>
    </main>
  );
}
