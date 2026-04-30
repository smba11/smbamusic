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
  playVideo: () => void;
};

type SectionName = "Listen Now" | "Browse" | "Library" | "Settings";
type AppearanceMode = "system" | "light" | "dark";
type AppSettings = {
  appearance: AppearanceMode;
  autoplayNext: boolean;
  reducedMotion: boolean;
};
type PersonalizedRow = {
  key: string;
  title: string;
  subtitle: string;
  query: string;
  items: VideoItem[];
};

const navItems: SectionName[] = ["Listen Now", "Browse", "Library", "Settings"];
const SAVED_TRACKS_KEY = "smbamusic-saved-tracks";
const LIKED_TRACKS_KEY = "smbamusic-liked-tracks";
const RECENT_TRACKS_KEY = "smbamusic-recent-tracks";
const SETTINGS_KEY = "smbamusic-settings-v2";

const browseScenes = [
  "Alternative R&B",
  "Amapiano",
  "Indie Soul",
  "Late Night Jazz",
  "Afrobeats",
  "Dream Pop"
];

const defaultSettings: AppSettings = {
  appearance: "system",
  autoplayNext: true,
  reducedMotion: false
};

function cleanTitle(title: string) {
  return title
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/\b(official|video|audio|lyrics|visualizer|live)\b/gi, "")
    .split(/[-|]/)[0]
    .trim();
}

function extractArtist(track: VideoItem) {
  return track.channelTitle.replace(/\s*-\s*topic$/i, "").trim();
}

function buildTasteRows(tracks: VideoItem[]): Array<Omit<PersonalizedRow, "items">> {
  const unique = tracks.filter(
    (track, index, all) => all.findIndex((item) => item.id === track.id) === index
  );

  if (!unique.length) {
    return [];
  }

  const rows: Array<Omit<PersonalizedRow, "items">> = [];
  const artistSeed = unique[0];
  const artist = extractArtist(artistSeed);
  const titleSeed = cleanTitle(unique[0].title);
  const secondArtist = unique[1] ? extractArtist(unique[1]) : artist;

  rows.push({
    key: `artist-${artist}`,
    title: `Because you liked ${artist}`,
    subtitle: "A tighter lane built from what you already saved.",
    query: `${artist} similar artists mix`
  });

  rows.push({
    key: `title-${titleSeed}`,
    title: `More like ${titleSeed}`,
    subtitle: "Close matches instead of random filler.",
    query: `${titleSeed} songs like this`
  });

  rows.push({
    key: `artist-two-${secondArtist}`,
    title: `${secondArtist} and related`,
    subtitle: "A softer radio-style pull from your recent taste.",
    query: `${secondArtist} essentials playlist`
  });

  return rows.filter(
    (row, index, all) => all.findIndex((item) => item.query === row.query) === index
  );
}

function mergeTracks(...collections: VideoItem[][]) {
  return collections
    .flat()
    .filter(
      (track, index, all) => all.findIndex((item) => item.id === track.id) === index
    );
}

export function MusicShell() {
  const [activeSection, setActiveSection] = useState<SectionName>("Listen Now");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VideoItem[]>([]);
  const [savedTracks, setSavedTracks] = useState<VideoItem[]>([]);
  const [likedTracks, setLikedTracks] = useState<VideoItem[]>([]);
  const [recentTracks, setRecentTracks] = useState<VideoItem[]>([]);
  const [queue, setQueue] = useState<VideoItem[]>([]);
  const [currentVideo, setCurrentVideo] = useState<VideoItem | null>(null);
  const [isPlayerVisible, setIsPlayerVisible] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLibraryReady, setIsLibraryReady] = useState(false);
  const [isYouTubeReady, setIsYouTubeReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [personalizedRows, setPersonalizedRows] = useState<PersonalizedRow[]>([]);

  const playerRef = useRef<YouTubePlayer | null>(null);
  const searchRequestIdRef = useRef(0);
  const personalizedRequestIdRef = useRef(0);
  const shouldAutoplayRef = useRef(false);
  const queueScrollerRef = useRef<HTMLDivElement | null>(null);

  const savedIds = useMemo(() => new Set(savedTracks.map((track) => track.id)), [savedTracks]);
  const likedIds = useMemo(() => new Set(likedTracks.map((track) => track.id)), [likedTracks]);
  const tasteTracks = useMemo(() => {
    const source = currentVideo ? [currentVideo, ...recentTracks] : recentTracks;
    return mergeTracks(likedTracks, savedTracks, source).slice(0, 6);
  }, [currentVideo, likedTracks, recentTracks, savedTracks]);
  const queuePreview = useMemo(
    () => queue.filter((track) => track.id !== currentVideo?.id),
    [currentVideo?.id, queue]
  );
  const heroTrack = currentVideo ?? recentTracks[0] ?? savedTracks[0] ?? likedTracks[0] ?? null;

  useEffect(() => {
    const script = document.getElementById("youtube-iframe-api");
    const onReady = () => setIsYouTubeReady(true);

    if (window.YT?.Player) {
      setIsYouTubeReady(true);
      return;
    }

    window.onYouTubeIframeAPIReady = onReady;

    if (!script) {
      const nextScript = document.createElement("script");
      nextScript.id = "youtube-iframe-api";
      nextScript.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(nextScript);
    }

    return () => {
      window.onYouTubeIframeAPIReady = undefined;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    try {
      const savedValue = window.localStorage.getItem(SAVED_TRACKS_KEY);
      const likedValue = window.localStorage.getItem(LIKED_TRACKS_KEY);
      const recentValue = window.localStorage.getItem(RECENT_TRACKS_KEY);
      const settingsValue = window.localStorage.getItem(SETTINGS_KEY);

      if (savedValue) {
        setSavedTracks(JSON.parse(savedValue) as VideoItem[]);
      }

      if (likedValue) {
        const parsed = JSON.parse(likedValue) as Array<VideoItem | string>;
        if (parsed.length && typeof parsed[0] !== "string") {
          setLikedTracks(parsed as VideoItem[]);
        }
      }

      if (recentValue) {
        setRecentTracks(JSON.parse(recentValue) as VideoItem[]);
      }

      if (settingsValue) {
        setSettings({
          ...defaultSettings,
          ...(JSON.parse(settingsValue) as Partial<AppSettings>)
        });
      }
    } catch {
      setSavedTracks([]);
      setLikedTracks([]);
      setRecentTracks([]);
      setSettings(defaultSettings);
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

    window.localStorage.setItem(LIKED_TRACKS_KEY, JSON.stringify(likedTracks));
  }, [isLibraryReady, likedTracks]);

  useEffect(() => {
    if (!isLibraryReady) {
      return;
    }

    window.localStorage.setItem(RECENT_TRACKS_KEY, JSON.stringify(recentTracks));
  }, [isLibraryReady, recentTracks]);

  useEffect(() => {
    if (!isLibraryReady) {
      return;
    }

    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [isLibraryReady, settings]);

  useEffect(() => {
    if (settings.appearance === "system") {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const apply = () => {
        document.documentElement.dataset.appearance = media.matches ? "dark" : "light";
      };

      apply();
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }

    document.documentElement.dataset.appearance = settings.appearance;
  }, [settings.appearance]);

  useEffect(() => {
    document.documentElement.dataset.motion = settings.reducedMotion
      ? "reduced"
      : "default";
  }, [settings.reducedMotion]);

  useEffect(() => {
    if (!currentVideo || !isPlayerVisible || !isYouTubeReady) {
      return;
    }

    if (!playerRef.current) {
      playerRef.current = new window.YT!.Player("youtube-player", {
        height: "100%",
        width: "100%",
        videoId: currentVideo.id,
        playerVars: {
          autoplay: shouldAutoplayRef.current ? 1 : 0,
          controls: 1,
          rel: 0,
          playsinline: 1,
          origin: window.location.origin
        },
        events: {
          onReady: () => {
            if (shouldAutoplayRef.current) {
              playerRef.current?.playVideo();
              shouldAutoplayRef.current = false;
            }
          },
          onStateChange: (event) => {
            if (
              event.data === window.YT?.PlayerState?.ENDED &&
              settings.autoplayNext &&
              queuePreview.length
            ) {
              playTrack(queuePreview[0], { autoplay: true, addToQueue: false });
            }
          }
        }
      });

      return;
    }

    playerRef.current.loadVideoById(currentVideo.id);
    if (shouldAutoplayRef.current) {
      window.setTimeout(() => {
        playerRef.current?.playVideo();
        shouldAutoplayRef.current = false;
      }, 120);
    }
  }, [
    currentVideo,
    isPlayerVisible,
    isYouTubeReady,
    queuePreview,
    settings.autoplayNext
  ]);

  useEffect(() => {
    if (!tasteTracks.length) {
      setPersonalizedRows([]);
      return;
    }

    const baseRows = buildTasteRows(tasteTracks).slice(0, 3);
    const requestId = personalizedRequestIdRef.current + 1;
    personalizedRequestIdRef.current = requestId;

    void (async () => {
      const loadedRows = await Promise.all(
        baseRows.map(async (row) => {
          try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(row.query)}`);
            const data = (await response.json()) as { items?: VideoItem[] };

            if (!response.ok) {
              return null;
            }

            return {
              ...row,
              items: (data.items ?? []).slice(0, 6)
            } satisfies PersonalizedRow;
          } catch {
            return null;
          }
        })
      );

      if (personalizedRequestIdRef.current !== requestId) {
        return;
      }

      setPersonalizedRows(
        loadedRows.filter((row): row is PersonalizedRow => Boolean(row?.items.length))
      );
    })();
  }, [tasteTracks]);

  async function runSearch(searchTerm: string) {
    const trimmed = searchTerm.trim();

    if (!trimmed) {
      setResults([]);
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
    setActiveSection("Browse");
    await runSearch(query);
  }

  function playTrack(
    video: VideoItem,
    options?: { autoplay?: boolean; addToQueue?: boolean }
  ) {
    shouldAutoplayRef.current = options?.autoplay ?? true;
    setCurrentVideo(video);
    setIsPlayerVisible(true);
    setRecentTracks((current) => {
      const next = [video, ...current.filter((item) => item.id !== video.id)];
      return next.slice(0, 12);
    });

    if (options?.addToQueue !== false) {
      setQueue((current) => {
        if (current.some((item) => item.id === video.id)) {
          return current;
        }

        return current.length ? [...current, video] : [video];
      });
    }
  }

  function addToQueue(video: VideoItem) {
    setQueue((current) => {
      if (current.some((item) => item.id === video.id)) {
        return current;
      }

      return [...current, video];
    });
  }

  function playNext() {
    if (!queuePreview.length) {
      return;
    }

    playTrack(queuePreview[0], { autoplay: true, addToQueue: false });
  }

  function toggleSaved(video: VideoItem) {
    setSavedTracks((current) => {
      if (current.some((item) => item.id === video.id)) {
        return current.filter((item) => item.id !== video.id);
      }

      return [video, ...current];
    });
  }

  function toggleLiked(video: VideoItem) {
    setLikedTracks((current) => {
      if (current.some((item) => item.id === video.id)) {
        return current.filter((item) => item.id !== video.id);
      }

      return [video, ...current];
    });
  }

  function closePlayer() {
    playerRef.current?.destroy();
    playerRef.current = null;
    setIsPlayerVisible(false);
  }

  function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((current) => ({
      ...current,
      [key]: value
    }));
  }

  function scrollQueue(direction: "left" | "right") {
    queueScrollerRef.current?.scrollBy({
      left: direction === "left" ? -240 : 240,
      behavior: "smooth"
    });
  }

  const browseCards = query.trim().length ? results : recentTracks;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.brandBlock}>
            <div className={styles.brandMark} aria-hidden="true">
              <span className={styles.brandBar} />
              <span className={styles.brandBar} />
              <span className={styles.brandBar} />
            </div>
            <div>
              <span className={styles.sidebarLabel}>SmbaMusic</span>
              <h1 className={styles.brandName}>Music, organized around your taste.</h1>
            </div>
          </div>

          <nav className={styles.nav}>
            {navItems.map((item) => (
              <button
                key={item}
                type="button"
                className={`${styles.navItem} ${
                  activeSection === item ? styles.navItemActive : ""
                }`}
                onClick={() => setActiveSection(item)}
              >
                {item}
              </button>
            ))}
          </nav>

          <section className={styles.sidebarPanel}>
            <span className={styles.sidebarLabel}>Library snapshot</span>
            <div className={styles.statList}>
              <div className={styles.statRow}>
                <span>Saved</span>
                <strong>{savedTracks.length}</strong>
              </div>
              <div className={styles.statRow}>
                <span>Liked</span>
                <strong>{likedTracks.length}</strong>
              </div>
              <div className={styles.statRow}>
                <span>Recent</span>
                <strong>{recentTracks.length}</strong>
              </div>
            </div>
          </section>

          <section className={styles.sidebarPanel}>
            <span className={styles.sidebarLabel}>Current queue</span>
            {queuePreview.length ? (
              <div className={styles.compactList}>
                {queuePreview.slice(0, 4).map((track) => (
                  <button
                    key={`queue-${track.id}`}
                    type="button"
                    className={styles.compactTrack}
                    onClick={() => playTrack(track, { autoplay: true, addToQueue: false })}
                  >
                    <strong>{track.title}</strong>
                    <span>{track.channelTitle}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className={styles.emptyText}>
                The next songs will appear here once you start playing music.
              </p>
            )}
          </section>
        </aside>

        <section className={styles.main}>
          <header className={styles.topbar}>
            <div>
              <p className={styles.topLabel}>For you</p>
              <h2 className={styles.topTitle}>
                {activeSection === "Listen Now"
                  ? "Listen Now"
                  : activeSection === "Browse"
                    ? "Browse"
                    : activeSection}
              </h2>
            </div>

            <form className={styles.searchForm} onSubmit={handleSearch}>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search artists, songs, or moods"
                className={styles.searchInput}
              />
              <button type="submit" className={styles.searchButton} disabled={isSearching}>
                {isSearching ? "Searching" : "Search"}
              </button>
            </form>
          </header>

          {activeSection === "Listen Now" ? (
            <>
              <section className={styles.hero}>
                <div className={styles.heroCopy}>
                  <h3>
                    {heroTrack
                      ? `Built around ${extractArtist(heroTrack)}`
                      : "A cleaner player that learns from what you keep"}
                  </h3>
                  <p>
                    {heroTrack
                      ? "Your home screen now leans on what you actually play, like, and save instead of repeating generic filler."
                      : "Search artists you love, save a few tracks, and SmbaMusic will start shaping your home around your taste."}
                  </p>
                  <div className={styles.heroActions}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => {
                        if (heroTrack) {
                          playTrack(heroTrack);
                          return;
                        }

                        setActiveSection("Browse");
                      }}
                    >
                      {heroTrack ? "Play current lane" : "Start with search"}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => setActiveSection("Library")}
                    >
                      Open library
                    </button>
                  </div>
                </div>

                <div className={styles.heroCard}>
                  {heroTrack ? (
                    <>
                      <div className={styles.heroArt}>
                        <Image
                          src={heroTrack.thumbnailUrl}
                          alt={heroTrack.title}
                          fill
                          sizes="420px"
                          className={styles.coverArt}
                        />
                      </div>
                      <div className={styles.heroMeta}>
                        <strong>{heroTrack.title}</strong>
                        <span>{heroTrack.channelTitle}</span>
                      </div>
                    </>
                  ) : (
                    <div className={styles.onboardingCard}>
                      <strong>No random homepage rails.</strong>
                      <span>
                        Your suggestions will get better as soon as you search, save,
                        and like a few artists.
                      </span>
                    </div>
                  )}
                </div>
              </section>

              {personalizedRows.length ? (
                personalizedRows.map((row) => (
                  <section key={row.key} className={styles.section}>
                    <div className={styles.sectionHeader}>
                      <div>
                        <p className={styles.topLabel}>{row.subtitle}</p>
                        <h3>{row.title}</h3>
                      </div>
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => {
                          setQuery(row.query);
                          setActiveSection("Browse");
                          void runSearch(row.query);
                        }}
                      >
                        Open lane
                      </button>
                    </div>

                    <div className={styles.cardRail}>
                      {row.items.map((track) => (
                        <article key={`${row.key}-${track.id}`} className={styles.mediaCard}>
                          <button
                            type="button"
                            className={styles.mediaButton}
                            onClick={() => playTrack(track)}
                          >
                            <div className={styles.mediaArt}>
                              <Image
                                src={track.thumbnailUrl}
                                alt={track.title}
                                fill
                                sizes="220px"
                                className={styles.coverArt}
                              />
                            </div>
                            <div className={styles.mediaMeta}>
                              <strong>{track.title}</strong>
                              <span>{track.channelTitle}</span>
                            </div>
                          </button>
                        </article>
                      ))}
                    </div>
                  </section>
                ))
              ) : (
                <section className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <p className={styles.topLabel}>Taste-based suggestions</p>
                      <h3>Your home will tighten up after a few plays</h3>
                    </div>
                  </div>
                  <div className={styles.emptyPanel}>
                    Search artists you already love, then like or save a few tracks.
                    That gives SmbaMusic enough signal to build a closer home page.
                  </div>
                </section>
              )}

              {recentTracks.length ? (
                <section className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <p className={styles.topLabel}>Recent</p>
                      <h3>Played lately</h3>
                    </div>
                  </div>
                  <div className={styles.listPanel}>
                    {recentTracks.slice(0, 6).map((track) => (
                      <TrackRow
                        key={`recent-${track.id}`}
                        track={track}
                        isSaved={savedIds.has(track.id)}
                        isLiked={likedIds.has(track.id)}
                        onPlay={() => playTrack(track)}
                        onSave={() => toggleSaved(track)}
                        onLike={() => toggleLiked(track)}
                        onQueue={() => addToQueue(track)}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          ) : null}

          {activeSection === "Browse" ? (
            <>
              <section className={styles.chipSection}>
                {browseScenes.map((scene) => (
                  <button
                    key={scene}
                    type="button"
                    className={styles.sceneChip}
                    onClick={() => {
                      setQuery(scene);
                      void runSearch(scene);
                    }}
                  >
                    {scene}
                  </button>
                ))}
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.topLabel}>Search results</p>
                    <h3>Use search to shape your library</h3>
                  </div>
                </div>
                {error ? <p className={styles.error}>{error}</p> : null}
                {browseCards.length ? (
                  <div className={styles.listPanel}>
                    {browseCards.map((track) => (
                      <TrackRow
                        key={`browse-${track.id}`}
                        track={track}
                        isSaved={savedIds.has(track.id)}
                        isLiked={likedIds.has(track.id)}
                        onPlay={() => playTrack(track)}
                        onSave={() => toggleSaved(track)}
                        onLike={() => toggleLiked(track)}
                        onQueue={() => addToQueue(track)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyPanel}>
                    Search by artist, album mood, or scene and the results will show up
                    here.
                  </div>
                )}
              </section>
            </>
          ) : null}

          {activeSection === "Library" ? (
            <>
              <section className={styles.libraryGrid}>
                <article className={styles.libraryTile}>
                  <span className={styles.topLabel}>Saved</span>
                  <strong>{savedTracks.length}</strong>
                  <p>Tracks you chose to keep close.</p>
                </article>
                <article className={styles.libraryTile}>
                  <span className={styles.topLabel}>Liked</span>
                  <strong>{likedTracks.length}</strong>
                  <p>Favorites that shape your recommendations.</p>
                </article>
                <article className={styles.libraryTile}>
                  <span className={styles.topLabel}>Recent</span>
                  <strong>{recentTracks.length}</strong>
                  <p>Your last sessions, ready to reopen.</p>
                </article>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.topLabel}>Saved tracks</p>
                    <h3>Main library</h3>
                  </div>
                </div>
                {savedTracks.length ? (
                  <div className={styles.listPanel}>
                    {savedTracks.map((track) => (
                      <TrackRow
                        key={`saved-${track.id}`}
                        track={track}
                        isSaved={true}
                        isLiked={likedIds.has(track.id)}
                        onPlay={() => playTrack(track)}
                        onSave={() => toggleSaved(track)}
                        onLike={() => toggleLiked(track)}
                        onQueue={() => addToQueue(track)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyPanel}>
                    Your saved tracks will live here once you start building a library.
                  </div>
                )}
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.topLabel}>Liked tracks</p>
                    <h3>Favorites</h3>
                  </div>
                </div>
                {likedTracks.length ? (
                  <div className={styles.listPanel}>
                    {likedTracks.map((track) => (
                      <TrackRow
                        key={`liked-${track.id}`}
                        track={track}
                        isSaved={savedIds.has(track.id)}
                        isLiked={true}
                        onPlay={() => playTrack(track)}
                        onSave={() => toggleSaved(track)}
                        onLike={() => toggleLiked(track)}
                        onQueue={() => addToQueue(track)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyPanel}>
                    Likes stay separate now, and they directly shape the home screen.
                  </div>
                )}
              </section>
            </>
          ) : null}

          {activeSection === "Settings" ? (
            <section className={styles.settingsGrid}>
              <article className={styles.settingsCard}>
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.topLabel}>Appearance</p>
                    <h3>Keep it clean</h3>
                  </div>
                </div>
                <div className={styles.optionGrid}>
                  {(["system", "light", "dark"] as AppearanceMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`${styles.optionCard} ${
                        settings.appearance === mode ? styles.optionCardActive : ""
                      }`}
                      onClick={() => updateSetting("appearance", mode)}
                    >
                      <strong>{mode[0].toUpperCase() + mode.slice(1)}</strong>
                      <span>
                        {mode === "system"
                          ? "Matches your device"
                          : mode === "light"
                            ? "Bright and airy"
                            : "Dark and focused"}
                      </span>
                    </button>
                  ))}
                </div>
              </article>

              <article className={styles.settingsCard}>
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.topLabel}>Playback</p>
                    <h3>Music controls</h3>
                  </div>
                </div>
                <div className={styles.settingList}>
                  <button
                    type="button"
                    className={styles.settingRow}
                    onClick={() =>
                      updateSetting("autoplayNext", !settings.autoplayNext)
                    }
                  >
                    <span>
                      <strong>Autoplay next track</strong>
                      <span>Move through your queue when a song ends.</span>
                    </span>
                    <span>{settings.autoplayNext ? "On" : "Off"}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.settingRow}
                    onClick={() =>
                      updateSetting("reducedMotion", !settings.reducedMotion)
                    }
                  >
                    <span>
                      <strong>Reduced motion</strong>
                      <span>Dial back transitions across the app.</span>
                    </span>
                    <span>{settings.reducedMotion ? "On" : "Off"}</span>
                  </button>
                </div>
              </article>
            </section>
          ) : null}
        </section>
      </div>

      {isPlayerVisible && currentVideo ? (
        <section className={styles.playerBar}>
          <div className={styles.playerCurrent}>
            <button
              type="button"
              className={styles.playerCoverButton}
              onClick={() => playTrack(currentVideo, { autoplay: true, addToQueue: false })}
            >
              <div className={styles.playerCover}>
                <Image
                  src={currentVideo.thumbnailUrl}
                  alt={currentVideo.title}
                  fill
                  sizes="72px"
                  className={styles.coverArt}
                />
              </div>
            </button>
            <div className={styles.playerCopy}>
              <strong>{currentVideo.title}</strong>
              <span>{currentVideo.channelTitle}</span>
            </div>
          </div>

          <div className={styles.playerMiddle}>
            <div className={styles.playerButtons}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => playTrack(currentVideo, { autoplay: true, addToQueue: false })}
              >
                Playing
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={playNext}
                disabled={!queuePreview.length}
              >
                Next
              </button>
            </div>
            <div className={styles.playerFrame}>
              <div id="youtube-player" className={styles.playerSlot} />
            </div>
          </div>

          <div className={styles.playerQueueArea}>
            <div className={styles.playerQueueHeader}>
              <span>Up Next</span>
              <div className={styles.playerQueueActions}>
                <button
                  type="button"
                  className={styles.queueArrow}
                  onClick={() => scrollQueue("left")}
                >
                  Prev
                </button>
                <button
                  type="button"
                  className={styles.queueArrow}
                  onClick={() => scrollQueue("right")}
                >
                  Next
                </button>
                <button
                  type="button"
                  className={styles.queueArrow}
                  onClick={closePlayer}
                >
                  Close
                </button>
              </div>
            </div>
            <div ref={queueScrollerRef} className={styles.playerQueueScroller}>
              {queuePreview.length ? (
                queuePreview.map((track) => (
                  <button
                    key={`up-next-${track.id}`}
                    type="button"
                    className={styles.upNextCard}
                    onClick={() => playTrack(track, { autoplay: true, addToQueue: false })}
                  >
                    <div className={styles.upNextThumb}>
                      <Image
                        src={track.thumbnailUrl}
                        alt={track.title}
                        fill
                        sizes="96px"
                        className={styles.coverArt}
                      />
                    </div>
                    <div className={styles.upNextCopy}>
                      <strong>{track.title}</strong>
                      <span>{track.channelTitle}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className={styles.upNextEmpty}>
                  Swipe here on mobile once you queue another track.
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}

type TrackRowProps = {
  track: VideoItem;
  isSaved: boolean;
  isLiked: boolean;
  onPlay: () => void;
  onSave: () => void;
  onLike: () => void;
  onQueue: () => void;
};

function TrackRow({
  track,
  isSaved,
  isLiked,
  onPlay,
  onSave,
  onLike,
  onQueue
}: TrackRowProps) {
  return (
    <article className={styles.trackRow}>
      <button type="button" className={styles.trackMain} onClick={onPlay}>
        <div className={styles.trackThumb}>
          <Image
            src={track.thumbnailUrl}
            alt={track.title}
            fill
            sizes="96px"
            className={styles.coverArt}
          />
        </div>
        <div className={styles.trackCopy}>
          <strong>{track.title}</strong>
          <span>{track.channelTitle}</span>
        </div>
      </button>

      <div className={styles.trackActions}>
        <button type="button" className={styles.secondaryButton} onClick={onQueue}>
          Queue
        </button>
        <button type="button" className={styles.secondaryButton} onClick={onSave}>
          {isSaved ? "Saved" : "Save"}
        </button>
        <button type="button" className={styles.secondaryButton} onClick={onLike}>
          {isLiked ? "Liked" : "Like"}
        </button>
      </div>
    </article>
  );
}
