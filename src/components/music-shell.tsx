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

const navItems = ["Home", "Explore", "Library", "Settings"];
const SAVED_TRACKS_KEY = "smbamusic-saved-tracks";
const LIKED_TRACKS_KEY = "smbamusic-liked-tracks";
const RECENT_TRACKS_KEY = "smbamusic-recent-tracks";
const SETTINGS_KEY = "smbamusic-settings";
const exploreCollections = [
  {
    title: "Golden Hour",
    subtitle: "Warm, glowy evening music",
    query: "sunset chill music"
  },
  {
    title: "Late Night Drive",
    subtitle: "Smooth, glossy night energy",
    query: "night drive rnb mix"
  },
  {
    title: "Global Pulse",
    subtitle: "Amapiano, Afrobeats, and bounce",
    query: "afrobeats amapiano hits"
  },
  {
    title: "Indie Float",
    subtitle: "Dreamy bands and soft textures",
    query: "indie dream pop mix"
  }
];
const exploreGenres = [
  "Amapiano",
  "Afrobeats",
  "Alternative R&B",
  "Lo-fi",
  "House",
  "Indie Pop",
  "Dancehall",
  "Neo Soul"
];
const themeOptions = [
  {
    id: "default",
    label: "Rose Glow",
    description: "The current pink-lit SmbaMusic mood."
  },
  {
    id: "aurora",
    label: "Aurora",
    description: "Cool cyan and periwinkle glow."
  },
  {
    id: "sunset",
    label: "Sunset",
    description: "Warm orange and coral energy."
  },
  {
    id: "forest",
    label: "Forest",
    description: "Soft green with teal highlights."
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Purple-blue late night shine."
  }
] as const;

type SectionName = "Home" | "Explore" | "Library" | "Settings";
type ToastState = {
  id: number;
  message: string;
};
type ThemeOption = (typeof themeOptions)[number]["id"];
type AppSettings = {
  theme: ThemeOption;
  autoplayNext: boolean;
  showToasts: boolean;
  mobilePlayerExpanded: boolean;
  reducedMotion: boolean;
};

const defaultSettings: AppSettings = {
  theme: "default",
  autoplayNext: true,
  showToasts: true,
  mobilePlayerExpanded: false,
  reducedMotion: false
};

export function MusicShell() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VideoItem[]>([]);
  const [queue, setQueue] = useState<VideoItem[]>(starterQueue);
  const [currentVideo, setCurrentVideo] = useState<VideoItem>(starterQueue[0]);
  const [savedTracks, setSavedTracks] = useState<VideoItem[]>([]);
  const [likedTracks, setLikedTracks] = useState<VideoItem[]>([]);
  const [legacyLikedTrackIds, setLegacyLikedTrackIds] = useState<string[]>([]);
  const [recentTracks, setRecentTracks] = useState<VideoItem[]>([]);
  const [activeSection, setActiveSection] = useState<SectionName>("Home");
  const [isPlayerVisible, setIsPlayerVisible] = useState(false);
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(false);
  const [isLibraryReady, setIsLibraryReady] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pulseKey, setPulseKey] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const searchRequestIdRef = useRef(0);
  const toastIdRef = useRef(0);
  const shouldAutoplayRef = useRef(false);
  const featuredTracks = results.length ? results.slice(0, 4) : queue.slice(0, 4);
  const exploreTracks = results.length ? results.slice(0, 6) : [...queue, ...savedTracks].slice(0, 6);

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
      shouldAutoplayRef.current = false;
    }
  }, [currentVideo]);

  useEffect(() => {
    if (!isPlayerVisible || !window.YT?.Player || playerRef.current) {
      return;
    }

    initializePlayer(currentVideo.id);
  }, [currentVideo.id, isPlayerVisible]);

  useEffect(() => {
    void runSearch(query);
  }, []);

  const queueIds = useMemo(() => new Set(queue.map((item) => item.id)), [queue]);
  const savedTrackIds = useMemo(
    () => new Set(savedTracks.map((item) => item.id)),
    [savedTracks]
  );
  const knownTracks = useMemo(() => {
    const merged = [
      currentVideo,
      ...results,
      ...queue,
      ...savedTracks,
      ...likedTracks,
      ...recentTracks
    ];

    return merged.filter(
      (track, index, self) => self.findIndex((item) => item.id === track.id) === index
    );
  }, [currentVideo, likedTracks, queue, recentTracks, results, savedTracks]);
  const likedTracksFromLegacyIds = useMemo(
    () => knownTracks.filter((track) => legacyLikedTrackIds.includes(track.id)),
    [knownTracks, legacyLikedTrackIds]
  );
  const libraryLikedTracks = useMemo(() => {
    const merged = [...likedTracks, ...likedTracksFromLegacyIds];
    return merged.filter(
      (track, index, self) => self.findIndex((item) => item.id === track.id) === index
    );
  }, [likedTracks, likedTracksFromLegacyIds]);
  const likedIdSet = useMemo(
    () => new Set(libraryLikedTracks.map((item) => item.id)),
    [libraryLikedTracks]
  );

  useEffect(() => {
    try {
      const savedTrackValue = window.localStorage.getItem(SAVED_TRACKS_KEY);
      const likedTrackValue = window.localStorage.getItem(LIKED_TRACKS_KEY);
      const recentTrackValue = window.localStorage.getItem(RECENT_TRACKS_KEY);
      const settingsValue = window.localStorage.getItem(SETTINGS_KEY);

      if (savedTrackValue) {
        setSavedTracks(JSON.parse(savedTrackValue) as VideoItem[]);
      }

      if (likedTrackValue) {
        const parsedLikedTracks = JSON.parse(likedTrackValue) as VideoItem[] | string[];

        if (
          Array.isArray(parsedLikedTracks) &&
          parsedLikedTracks.length > 0 &&
          typeof parsedLikedTracks[0] === "string"
        ) {
          setLegacyLikedTrackIds(parsedLikedTracks as string[]);
        } else {
          setLikedTracks((parsedLikedTracks as VideoItem[]) ?? []);
        }
      }

      if (recentTrackValue) {
        setRecentTracks(JSON.parse(recentTrackValue) as VideoItem[]);
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
      setLegacyLikedTrackIds([]);
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
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.motion = settings.reducedMotion
      ? "reduced"
      : "default";
  }, [settings.reducedMotion, settings.theme]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!pulseKey) {
      return;
    }

    const timeout = window.setTimeout(() => setPulseKey(null), 900);
    return () => window.clearTimeout(timeout);
  }, [pulseKey]);

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
            settings.autoplayNext
          ) {
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
      triggerFeedback("Already in your queue", `queue-${video.id}`);
      return;
    }

    setQueue((current) => [...current, video]);
    triggerFeedback("Added to queue", `queue-${video.id}`);
  }

  function playNext() {
    shouldAutoplayRef.current = true;
    setQueue((current) => {
      const currentIndex = current.findIndex((item) => item.id === currentVideo.id);
      const nextVideo =
        current[(currentIndex + 1) % current.length] ?? currentVideo;
      setIsPlayerVisible(true);
      setIsPlayerExpanded(
        settings.mobilePlayerExpanded && window.innerWidth <= 820
      );
      setCurrentVideo(nextVideo);
      return current;
    });
  }

  function playNow(video: VideoItem) {
    shouldAutoplayRef.current = true;
    setIsPlayerVisible(true);
    setIsPlayerExpanded(
      settings.mobilePlayerExpanded && window.innerWidth <= 820
    );
    setCurrentVideo(video);
    setRecentTracks((current) => {
      const next = [video, ...current.filter((item) => item.id !== video.id)];
      return next.slice(0, 8);
    });

    if (!queueIds.has(video.id)) {
      setQueue((current) => [video, ...current]);
    }

    triggerFeedback(`Now playing ${video.title}`, `play-${video.id}`);
  }

  function toggleSavedTrack(video: VideoItem) {
    setSavedTracks((current) => {
      const isSaved = current.some((item) => item.id === video.id);

      triggerFeedback(
        isSaved ? "Removed from library" : "Saved to your library",
        `save-${video.id}`
      );

      if (isSaved) {
        return current.filter((item) => item.id !== video.id);
      }

      return [video, ...current];
    });
  }

  function toggleLikedTrack(video: VideoItem) {
    setLikedTracks((current) => {
      const isLiked = current.some((item) => item.id === video.id);

      triggerFeedback(
        isLiked ? "Removed from liked tracks" : "Added to liked tracks",
        `like-${video.id}`
      );

      if (isLiked) {
        return current.filter((item) => item.id !== video.id);
      }

      return [video, ...current];
    });
    setLegacyLikedTrackIds((current) => current.filter((id) => id !== video.id));
  }

  const visibleResults = activeSection === "Explore" ? results : results;

  function closePlayer() {
    playerRef.current?.destroy();
    playerRef.current = null;
    setIsPlayerVisible(false);
    setIsPlayerExpanded(false);
    triggerFeedback("Player dismissed", "player-close");
  }

  function togglePlayerExpanded() {
    setIsPlayerExpanded((current) => !current);
  }

  function triggerFeedback(message: string, nextPulseKey: string) {
    if (!settings.showToasts) {
      setPulseKey(nextPulseKey);
      return;
    }

    toastIdRef.current += 1;
    setToast({
      id: toastIdRef.current,
      message
    });
    setPulseKey(nextPulseKey);
  }

  function updateSettings<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) {
    setSettings((current) => ({
      ...current,
      [key]: value
    }));
  }

  return (
    <main className={styles.page}>
      <div className={styles.appShell}>
        <aside className={styles.sidebar}>
          <div className={styles.brandBlock}>
            <div className={styles.brandGlyph} aria-hidden="true">
              <span className={`${styles.brandWave} ${styles.brandWaveOne}`} />
              <span className={`${styles.brandWave} ${styles.brandWaveTwo}`} />
              <span className={`${styles.brandWave} ${styles.brandWaveThree}`} />
            </div>
            <div>
              <h1 className={styles.brandName}>SmbaMusic</h1>
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
                  type="button"
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
                <strong>{libraryLikedTracks.length}</strong>
                <span>Liked tracks</span>
              </div>
            </div>
            <div className={styles.savedList}>
              {savedTracks.slice(0, 4).map((video) => (
                <article key={video.id} className={styles.savedItem}>
                  <button
                    className={styles.savedPlayButton}
                    type="button"
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
                    type="button"
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
              <button
                className={styles.searchButton}
                disabled={isSearching}
                type="submit"
              >
                {isSearching ? "Searching..." : "Search"}
              </button>
            </form>

            <div className={styles.userPill}>Smba</div>
          </header>

          {activeSection === "Library" ? (
            <>
              <section className={styles.libraryHero}>
                <div className={styles.heroCopy}>
                  <p className={styles.sectionEyebrow}>Your collection</p>
                  <h2>Everything you saved inside SmbaMusic.</h2>
                  <p className={styles.subcopy}>
                    Jump back into saved tracks, revisit liked picks, and keep your
                    recent listens close without losing the music-first feel.
                  </p>
                </div>

                <div className={styles.libraryHeroStats}>
                  <div className={styles.libraryHeroCard}>
                    <strong>{savedTracks.length}</strong>
                    <span>Saved tracks</span>
                  </div>
                  <div className={styles.libraryHeroCard}>
                    <strong>{libraryLikedTracks.length}</strong>
                    <span>Liked tracks</span>
                  </div>
                  <div className={styles.libraryHeroCard}>
                    <strong>{recentTracks.length}</strong>
                    <span>Recent plays</span>
                  </div>
                </div>
              </section>

              <section className={styles.resultsSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.sectionEyebrow}>Saved tracks</p>
                    <h3>Your main library</h3>
                  </div>
                </div>

                <div className={styles.results}>
                  {savedTracks.map((video) => (
                    <article key={`library-${video.id}`} className={styles.resultItem}>
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
                          type="button"
                          onClick={() => playNow(video)}
                        >
                          Play
                        </button>
                        <button
                          className={styles.secondaryButton}
                          type="button"
                          onClick={() => addToQueue(video)}
                        >
                          Queue
                        </button>
                        <button
                          className={styles.secondaryButton}
                          type="button"
                          onClick={() => toggleSavedTrack(video)}
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  ))}

                  {!savedTracks.length ? (
                    <p className={styles.emptyState}>
                      Save tracks from search results to start building your library.
                    </p>
                  ) : null}
                </div>
              </section>

              <section className={styles.libraryShelf}>
                <div className={styles.libraryPanel}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Liked</p>
                      <h3>Favorites</h3>
                    </div>
                  </div>
                  <div className={styles.savedList}>
                    {libraryLikedTracks.map((video) => (
                      <article key={`liked-${video.id}`} className={styles.savedItem}>
                        <button
                          className={styles.savedPlayButton}
                          type="button"
                          onClick={() => playNow(video)}
                        >
                          <span className={styles.queueText}>
                            <strong>{video.title}</strong>
                            <span>{video.channelTitle}</span>
                          </span>
                        </button>
                      </article>
                    ))}
                    {!libraryLikedTracks.length ? (
                      <p className={styles.emptyState}>Tracks you like will show up here.</p>
                    ) : null}
                  </div>
                </div>

                <div className={styles.libraryPanel}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Recent</p>
                      <h3>Played lately</h3>
                    </div>
                  </div>
                  <div className={styles.savedList}>
                    {recentTracks.map((video) => (
                      <article key={`recent-page-${video.id}`} className={styles.savedItem}>
                        <button
                          className={styles.savedPlayButton}
                          type="button"
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
                      <p className={styles.emptyState}>Your recent plays will show up here.</p>
                    ) : null}
                  </div>
                </div>
              </section>
            </>
          ) : activeSection === "Explore" ? (
            <>
              <section className={styles.exploreHero}>
                <div className={styles.heroCopy}>
                  <p className={styles.sectionEyebrow}>Explore</p>
                  <h2>Find a lane fast, then let SmbaMusic do the mood-setting.</h2>
                  <p className={styles.subcopy}>
                    Browse curated vibes, tap a genre, or jump into something new
                    without losing the glow of the player.
                  </p>
                </div>

                <div className={styles.exploreOrbit}>
                  {exploreCollections.slice(0, 3).map((collection) => (
                    <button
                      key={collection.title}
                      type="button"
                      className={styles.orbitChip}
                      onClick={() => {
                        setQuery(collection.query);
                        void runSearch(collection.query);
                      }}
                    >
                      {collection.title}
                    </button>
                  ))}
                </div>
              </section>

              <section className={styles.exploreCollections}>
                {exploreCollections.map((collection) => (
                  <button
                    key={collection.title}
                    type="button"
                    className={styles.collectionCard}
                    onClick={() => {
                      setQuery(collection.query);
                      void runSearch(collection.query);
                    }}
                  >
                    <span className={styles.collectionGlow} />
                    <span className={styles.sectionEyebrow}>Collection</span>
                    <strong>{collection.title}</strong>
                    <span>{collection.subtitle}</span>
                  </button>
                ))}
              </section>

              <section className={styles.genreSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.sectionEyebrow}>Browse genres</p>
                    <h3>Start with a mood</h3>
                  </div>
                </div>
                <div className={styles.genreGrid}>
                  {exploreGenres.map((genre) => (
                    <button
                      key={genre}
                      type="button"
                      className={styles.genreCard}
                      onClick={() => {
                        setQuery(genre);
                        void runSearch(genre);
                      }}
                    >
                      {genre}
                    </button>
                  ))}
                </div>
              </section>

              <section className={styles.resultsSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.sectionEyebrow}>Fresh picks</p>
                    <h3>Ready to jump into</h3>
                  </div>
                </div>

                {error ? <p className={styles.error}>{error}</p> : null}

                <div className={styles.results}>
                  {exploreTracks.map((video) => (
                    <article key={`explore-${video.id}`} className={styles.resultItem}>
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
                          className={`${styles.secondaryButton} ${
                            pulseKey === `play-${video.id}` ? styles.buttonPulse : ""
                          }`}
                          type="button"
                          onClick={() => playNow(video)}
                        >
                          Play
                        </button>
                        <button
                          className={`${styles.secondaryButton} ${
                            pulseKey === `queue-${video.id}` ? styles.buttonPulse : ""
                          }`}
                          type="button"
                          onClick={() => addToQueue(video)}
                        >
                          Queue
                        </button>
                        <button
                          className={`${styles.secondaryButton} ${
                            savedTrackIds.has(video.id) ? styles.actionActive : ""
                          } ${pulseKey === `save-${video.id}` ? styles.buttonPulse : ""}`}
                          type="button"
                          onClick={() => toggleSavedTrack(video)}
                        >
                          {savedTrackIds.has(video.id) ? "Saved" : "Save"}
                        </button>
                        <button
                          className={`${styles.secondaryButton} ${
                            likedIdSet.has(video.id) ? styles.actionActive : ""
                          } ${pulseKey === `like-${video.id}` ? styles.buttonPulse : ""}`}
                          type="button"
                          onClick={() => toggleLikedTrack(video)}
                        >
                          {likedIdSet.has(video.id) ? "Liked" : "Like"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </>
          ) : activeSection === "Settings" ? (
            <>
              <section className={styles.settingsHero}>
                <div className={styles.heroCopy}>
                  <p className={styles.sectionEyebrow}>Settings</p>
                  <h2>Tune SmbaMusic to your vibe.</h2>
                  <p className={styles.subcopy}>
                    Switch visual moods, adjust playback behavior, and make the app
                    feel more like your own listening space.
                  </p>
                </div>
              </section>

              <section className={styles.settingsGrid}>
                <div className={styles.settingsCard}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Color vibes</p>
                      <h3>Choose your theme</h3>
                    </div>
                  </div>
                  <div className={styles.themeOptionGrid}>
                    {themeOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`${styles.themeOption} ${
                          settings.theme === option.id ? styles.themeOptionActive : ""
                        }`}
                        onClick={() => updateSettings("theme", option.id)}
                      >
                        <span
                          className={`${styles.themeSwatch} ${
                            styles[`themeSwatch${option.label.replace(/\s+/g, "")}`]
                          }`}
                        />
                        <strong>{option.label}</strong>
                        <span>{option.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.settingsCard}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Playback</p>
                      <h3>Player behavior</h3>
                    </div>
                  </div>
                  <div className={styles.settingsList}>
                    <button
                      className={styles.settingRow}
                      type="button"
                      onClick={() =>
                        updateSettings("autoplayNext", !settings.autoplayNext)
                      }
                    >
                      <span>
                        <strong>Autoplay next track</strong>
                        <span>Move through your queue automatically.</span>
                      </span>
                      <span className={styles.settingValue}>
                        {settings.autoplayNext ? "On" : "Off"}
                      </span>
                    </button>
                    <button
                      className={styles.settingRow}
                      type="button"
                      onClick={() =>
                        updateSettings(
                          "mobilePlayerExpanded",
                          !settings.mobilePlayerExpanded
                        )
                      }
                    >
                      <span>
                        <strong>Open mobile player expanded</strong>
                        <span>Show the full player sheet right away on phones.</span>
                      </span>
                      <span className={styles.settingValue}>
                        {settings.mobilePlayerExpanded ? "On" : "Off"}
                      </span>
                    </button>
                  </div>
                </div>

                <div className={styles.settingsCard}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Experience</p>
                      <h3>Interface details</h3>
                    </div>
                  </div>
                  <div className={styles.settingsList}>
                    <button
                      className={styles.settingRow}
                      type="button"
                      onClick={() => updateSettings("showToasts", !settings.showToasts)}
                    >
                      <span>
                        <strong>Action toasts</strong>
                        <span>Show little confirmations when you save, like, or queue.</span>
                      </span>
                      <span className={styles.settingValue}>
                        {settings.showToasts ? "On" : "Off"}
                      </span>
                    </button>
                    <button
                      className={styles.settingRow}
                      type="button"
                      onClick={() =>
                        updateSettings("reducedMotion", !settings.reducedMotion)
                      }
                    >
                      <span>
                        <strong>Reduced motion</strong>
                        <span>Dial back animations and transitions across the app.</span>
                      </span>
                      <span className={styles.settingValue}>
                        {settings.reducedMotion ? "On" : "Off"}
                      </span>
                    </button>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <>
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
                      type="button"
                      onClick={() => playNow(currentVideo)}
                    >
                      Play now
                    </button>
                    <button
                      className={styles.secondaryButton}
                      onClick={playNext}
                      type="button"
                    >
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
                    type="button"
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
                        type="button"
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
                          className={`${styles.secondaryButton} ${
                            savedTrackIds.has(video.id) ? styles.actionActive : ""
                          } ${pulseKey === `save-${video.id}` ? styles.buttonPulse : ""}`}
                          type="button"
                          onClick={() => toggleSavedTrack(video)}
                        >
                          {savedTrackIds.has(video.id) ? "Saved" : "Save"}
                        </button>
                        <button
                          className={`${styles.secondaryButton} ${
                            likedIdSet.has(video.id) ? styles.actionActive : ""
                          } ${pulseKey === `like-${video.id}` ? styles.buttonPulse : ""}`}
                          type="button"
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
                    <p className={styles.sectionEyebrow}>Search results</p>
                    <h3>Playable on YouTube embed</h3>
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
                          type="button"
                          onClick={() => playNow(video)}
                        >
                          Play
                        </button>
                        <button
                          className={`${styles.secondaryButton} ${
                            pulseKey === `queue-${video.id}` ? styles.buttonPulse : ""
                          }`}
                          type="button"
                          onClick={() => addToQueue(video)}
                        >
                          Add to queue
                        </button>
                        <button
                          className={`${styles.secondaryButton} ${
                            savedTrackIds.has(video.id) ? styles.actionActive : ""
                          } ${pulseKey === `save-${video.id}` ? styles.buttonPulse : ""}`}
                          type="button"
                          onClick={() => toggleSavedTrack(video)}
                        >
                          {savedTrackIds.has(video.id) ? "Saved" : "Save"}
                        </button>
                        <button
                          className={`${styles.secondaryButton} ${
                            likedIdSet.has(video.id) ? styles.actionActive : ""
                          } ${pulseKey === `like-${video.id}` ? styles.buttonPulse : ""}`}
                          type="button"
                          onClick={() => toggleLikedTrack(video)}
                        >
                          {likedIdSet.has(video.id) ? "Liked" : "Like"}
                        </button>
                      </div>
                    </article>
                  ))}

                  {!visibleResults.length && !isSearching ? (
                    <p className={styles.emptyState}>
                      Search above to fill SmbaMusic with embeddable YouTube tracks.
                    </p>
                  ) : null}
                </div>
              </section>
            </>
          )}
        </section>
      </div>

      {isPlayerVisible ? (
        <section
          className={`${styles.playerDock} ${
            isPlayerExpanded ? styles.playerDockExpanded : ""
          }`}
        >
        <button
          className={styles.playerGrabber}
          onClick={togglePlayerExpanded}
          aria-label={isPlayerExpanded ? "Collapse player" : "Expand player"}
          type="button"
        >
          <span className={styles.playerGrabberBar} />
        </button>
        <button
          className={styles.closePlayerButton}
          onClick={closePlayer}
          aria-label="Close player"
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>
        <button
          className={styles.playerSummary}
          onClick={togglePlayerExpanded}
          type="button"
        >
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
        </button>

        <div className={styles.playerCenter}>
          <div className={styles.playerFrame}>
            <div className={styles.playerAmbient} aria-hidden="true">
              {currentVideo.thumbnailUrl ? (
                <Image
                  src={currentVideo.thumbnailUrl}
                  alt=""
                  fill
                  sizes="420px"
                  className={styles.coverArt}
                />
              ) : null}
            </div>
            <div className={styles.playerFrameChrome}>
              <div className={styles.playerMetaBar}>
                <div className={styles.playerMetaCopy}>
                  <span className={styles.playerKicker}>Now Playing</span>
                  <strong>{currentVideo.title}</strong>
                  <span>{currentVideo.channelTitle}</span>
                </div>
                <div className={styles.playerMetaBadge}>Official YouTube playback</div>
              </div>
              <div className={styles.playerControls}>
                <button
                  className={styles.controlButton}
                  onClick={playNext}
                  type="button"
                >
                  Next
                </button>
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={() => playNow(currentVideo)}
                >
                  Playing
                </button>
              </div>
              <div className={styles.playerVideoShell}>
                <div id="youtube-player" className={styles.playerSlot} />
              </div>
            </div>
          </div>
        </div>

        <div className={styles.playerInfo}>
          <span>{queue.length} in queue</span>
          <span>{savedTracks.length} saved</span>
          <span>Official YouTube embed</span>
        </div>
      </section>
      ) : null}

      {toast ? (
        <div key={toast.id} className={styles.toast}>
          {toast.message}
        </div>
      ) : null}
    </main>
  );
}
