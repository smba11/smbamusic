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

type SectionName = "Listen Now" | "New" | "Radio" | "Library" | "Settings";
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

const navItems: SectionName[] = ["Listen Now", "New", "Radio", "Library", "Settings"];
const mobileTabs: SectionName[] = ["Listen Now", "New", "Radio", "Library"];
const SAVED_TRACKS_KEY = "smbamusic-saved-tracks";
const LIKED_TRACKS_KEY = "smbamusic-liked-tracks";
const RECENT_TRACKS_KEY = "smbamusic-recent-tracks";
const SETTINGS_KEY = "smbamusic-settings-v3";

const sceneSeeds = [
  "Viral Hits",
  "Alternative Pop",
  "Late Night R&B",
  "Amapiano Essentials",
  "Lo-fi Focus",
  "Soft Indie"
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

function mergeTracks(...collections: VideoItem[][]) {
  return collections
    .flat()
    .filter(
      (track, index, all) => all.findIndex((item) => item.id === track.id) === index
    );
}

function buildTasteRows(tracks: VideoItem[]): Array<Omit<PersonalizedRow, "items">> {
  const unique = tracks.filter(
    (track, index, all) => all.findIndex((item) => item.id === track.id) === index
  );

  if (!unique.length) {
    return [];
  }

  const first = unique[0];
  const second = unique[1] ?? first;
  const third = unique[2] ?? second;

  return [
    {
      key: `artist-${first.id}`,
      title: `Because you liked ${extractArtist(first)}`,
      subtitle: "Picked from your own library.",
      query: `${extractArtist(first)} essentials`
    },
    {
      key: `title-${second.id}`,
      title: `More like ${cleanTitle(second.title)}`,
      subtitle: "Close matches instead of generic filler.",
      query: `${cleanTitle(second.title)} songs like this`
    },
    {
      key: `radio-${third.id}`,
      title: `${extractArtist(third)} Radio`,
      subtitle: "A softer station built from your recent taste.",
      query: `${extractArtist(third)} mix radio`
    }
  ];
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
    const base = currentVideo ? [currentVideo, ...recentTracks] : recentTracks;
    return mergeTracks(likedTracks, savedTracks, base).slice(0, 6);
  }, [currentVideo, likedTracks, recentTracks, savedTracks]);
  const queuePreview = useMemo(
    () => queue.filter((track) => track.id !== currentVideo?.id),
    [currentVideo?.id, queue]
  );
  const homeRows = personalizedRows.slice(0, 2);
  const radioRows = personalizedRows.slice(2);
  const leadTrack = currentVideo ?? recentTracks[0] ?? likedTracks[0] ?? savedTracks[0] ?? null;
  const newHighlights = results.length ? results.slice(0, 6) : recentTracks.slice(0, 6);

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

    const rows = buildTasteRows(tasteTracks);
    const requestId = personalizedRequestIdRef.current + 1;
    personalizedRequestIdRef.current = requestId;

    void (async () => {
      const loaded = await Promise.all(
        rows.map(async (row) => {
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
        loaded.filter((row): row is PersonalizedRow => Boolean(row?.items.length))
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
      const data = (await response.json()) as { items?: VideoItem[]; error?: string };

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
    setActiveSection("New");
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
      left: direction === "left" ? -220 : 220,
      behavior: "smooth"
    });
  }

  const searchCards = query.trim().length ? results : newHighlights;

  return (
    <main className={styles.page}>
      <div className={styles.windowShell}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarTop}>
            <div className={styles.brandLockup}>
              <div className={styles.brandBadge} aria-hidden="true">
                <span className={styles.brandStripe} />
                <span className={styles.brandStripe} />
                <span className={styles.brandStripe} />
              </div>
              <div>
                <strong className={styles.brandTitle}>SmbaMusic</strong>
                <span className={styles.brandSubtle}>Your library, refined.</span>
              </div>
            </div>

            <form className={styles.sidebarSearch} onSubmit={handleSearch}>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                className={styles.searchInput}
              />
              <button type="submit" className={styles.searchMini}>
                {isSearching ? "..." : "Go"}
              </button>
            </form>
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
                <span className={styles.navGlyph} aria-hidden="true" />
                <span>{item}</span>
              </button>
            ))}
          </nav>

          <div className={styles.sidebarGroup}>
            <span className={styles.groupLabel}>Library</span>
            <button type="button" className={styles.libraryLink} onClick={() => setActiveSection("Library")}>
              Recently Added
            </button>
            <button type="button" className={styles.libraryLink} onClick={() => setActiveSection("Library")}>
              Songs
            </button>
            <button type="button" className={styles.libraryLink} onClick={() => setActiveSection("Library")}>
              Playlists
            </button>
          </div>
        </aside>

        <section className={styles.workspace}>
          <header className={styles.toolbar}>
            <div className={styles.toolbarPage}>
              <h1 className={styles.pageTitle}>{activeSection}</h1>
            </div>

            <div className={styles.toolbarPlayer}>
              <button type="button" className={styles.transportButton} onClick={playNext}>
                Next
              </button>
              <button
                type="button"
                className={styles.toolbarTrack}
                onClick={() => {
                  if (leadTrack) {
                    playTrack(leadTrack, { autoplay: true, addToQueue: false });
                  }
                }}
              >
                {leadTrack ? (
                  <>
                    <span className={styles.toolbarThumb}>
                      <Image
                        src={leadTrack.thumbnailUrl}
                        alt={leadTrack.title}
                        fill
                        sizes="52px"
                        className={styles.coverArt}
                      />
                    </span>
                    <span className={styles.toolbarTrackCopy}>
                      <strong>{cleanTitle(leadTrack.title)}</strong>
                      <span>{extractArtist(leadTrack)}</span>
                    </span>
                  </>
                ) : (
                  <span className={styles.toolbarEmpty}>Start playing to pin music here.</span>
                )}
              </button>
            </div>

            <div className={styles.toolbarActions}>
              <button type="button" className={styles.transportButton} onClick={() => setActiveSection("Settings")}>
                Settings
              </button>
            </div>
          </header>

          {activeSection === "Listen Now" ? (
            <div className={styles.contentStack}>
              <section className={styles.sectionBlock}>
                <div className={styles.sectionLead}>
                  <div>
                    <h2 className={styles.sectionTitle}>Top Picks</h2>
                    <p className={styles.sectionMeta}>Just updated</p>
                  </div>
                  <button type="button" className={styles.linkButton} onClick={() => setActiveSection("Library")}>
                    See All
                  </button>
                </div>
                <div className={styles.featureGrid}>
                  {(homeRows[0]?.items ?? recentTracks).slice(0, 2).map((track) => (
                    <FeatureCard
                      key={`top-${track.id}`}
                      track={track}
                      onPlay={() => playTrack(track)}
                    />
                  ))}
                </div>
              </section>

              <section className={styles.sectionBlock}>
                <div className={styles.sectionLead}>
                  <div>
                    <h2 className={styles.sectionTitle}>Recently Played</h2>
                    <p className={styles.sectionMeta}>Based on your last sessions</p>
                  </div>
                </div>
                <div className={styles.rowRail}>
                  {recentTracks.slice(0, 6).map((track) => (
                    <MiniCard
                      key={`recent-${track.id}`}
                      track={track}
                      onPlay={() => playTrack(track)}
                    />
                  ))}
                  {!recentTracks.length ? (
                    <div className={styles.emptyPanel}>
                      Your recent listening will show up here after your first plays.
                    </div>
                  ) : null}
                </div>
              </section>

              {homeRows[1] ? (
                <section className={styles.sectionBlock}>
                  <div className={styles.sectionLead}>
                    <div>
                      <h2 className={styles.sectionTitle}>{homeRows[1].title}</h2>
                      <p className={styles.sectionMeta}>{homeRows[1].subtitle}</p>
                    </div>
                  </div>
                  <div className={styles.posterRail}>
                    {homeRows[1].items.map((track) => (
                      <PosterCard
                        key={`row-${track.id}`}
                        track={track}
                        onPlay={() => playTrack(track)}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}

          {activeSection === "New" ? (
            <div className={styles.contentStack}>
              <section className={styles.sectionBlock}>
                <div className={styles.sectionLead}>
                  <div>
                    <h2 className={styles.sectionTitle}>New</h2>
                    <p className={styles.sectionMeta}>Fresh search-driven picks</p>
                  </div>
                </div>
                {error ? <p className={styles.error}>{error}</p> : null}
                <div className={styles.editorialGrid}>
                  {searchCards.slice(0, 2).map((track, index) => (
                    <EditorialCard
                      key={`editorial-${track.id}`}
                      track={track}
                      eyebrow={index === 0 ? "Just Updated" : "Featured Playlist"}
                      onPlay={() => playTrack(track)}
                    />
                  ))}
                </div>
              </section>

              <section className={styles.sectionBlock}>
                <div className={styles.sectionLead}>
                  <div>
                    <h2 className={styles.sectionTitle}>Playlists We Love</h2>
                    <p className={styles.sectionMeta}>Closer to the Apple Music shelf feel</p>
                  </div>
                </div>
                <div className={styles.posterRail}>
                  {searchCards.slice(0, 6).map((track) => (
                    <PosterCard
                      key={`new-${track.id}`}
                      track={track}
                      onPlay={() => playTrack(track)}
                    />
                  ))}
                </div>
              </section>

              <section className={styles.sectionBlock}>
                <div className={styles.chipRail}>
                  {sceneSeeds.map((seed) => (
                    <button
                      key={seed}
                      type="button"
                      className={styles.sceneChip}
                      onClick={() => {
                        setQuery(seed);
                        void runSearch(seed);
                      }}
                    >
                      {seed}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          {activeSection === "Radio" ? (
            <div className={styles.contentStack}>
              <section className={styles.sectionBlock}>
                <div className={styles.sectionLead}>
                  <div>
                    <h2 className={styles.sectionTitle}>Radio</h2>
                    <p className={styles.sectionMeta}>Stations built from what matters to you.</p>
                  </div>
                </div>
                <div className={styles.radioGrid}>
                  {(radioRows[0]?.items ?? personalizedRows.flatMap((row) => row.items)).slice(0, 4).map((track) => (
                    <RadioCard
                      key={`radio-${track.id}`}
                      track={track}
                      onPlay={() => playTrack(track)}
                    />
                  ))}
                  {!personalizedRows.length ? (
                    <div className={styles.emptyPanel}>
                      Like or save more songs and your Radio page will tighten up around your taste.
                    </div>
                  ) : null}
                </div>
              </section>
            </div>
          ) : null}

          {activeSection === "Library" ? (
            <div className={styles.contentStack}>
              <section className={styles.sectionBlock}>
                <div className={styles.sectionLead}>
                  <div>
                    <h2 className={styles.sectionTitle}>Library</h2>
                    <p className={styles.sectionMeta}>Saved, liked, and recently played.</p>
                  </div>
                </div>
                <div className={styles.libraryStats}>
                  <div className={styles.statTile}>
                    <strong>{savedTracks.length}</strong>
                    <span>Saved</span>
                  </div>
                  <div className={styles.statTile}>
                    <strong>{likedTracks.length}</strong>
                    <span>Liked</span>
                  </div>
                  <div className={styles.statTile}>
                    <strong>{recentTracks.length}</strong>
                    <span>Recent</span>
                  </div>
                </div>
              </section>

              <section className={styles.sectionBlock}>
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
                  {!savedTracks.length ? (
                    <div className={styles.emptyPanel}>
                      Save a few songs from Search or Radio and they’ll appear here.
                    </div>
                  ) : null}
                </div>
              </section>
            </div>
          ) : null}

          {activeSection === "Settings" ? (
            <div className={styles.contentStack}>
              <section className={styles.sectionBlock}>
                <div className={styles.sectionLead}>
                  <div>
                    <h2 className={styles.sectionTitle}>Settings</h2>
                    <p className={styles.sectionMeta}>Light, dark, and playback behavior.</p>
                  </div>
                </div>
                <div className={styles.settingsGrid}>
                  <div className={styles.settingsCard}>
                    <h3 className={styles.settingsTitle}>Appearance</h3>
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
                                ? "Apple-style bright UI"
                                : "Darker nighttime chrome"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={styles.settingsCard}>
                    <h3 className={styles.settingsTitle}>Playback</h3>
                    <div className={styles.settingList}>
                      <button
                        type="button"
                        className={styles.settingRow}
                        onClick={() => updateSetting("autoplayNext", !settings.autoplayNext)}
                      >
                        <span>
                          <strong>Autoplay next track</strong>
                          <span>Continue through your queue when a song ends.</span>
                        </span>
                        <span>{settings.autoplayNext ? "On" : "Off"}</span>
                      </button>
                      <button
                        type="button"
                        className={styles.settingRow}
                        onClick={() => updateSetting("reducedMotion", !settings.reducedMotion)}
                      >
                        <span>
                          <strong>Reduced motion</strong>
                          <span>Dial back transitions across the app.</span>
                        </span>
                        <span>{settings.reducedMotion ? "On" : "Off"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          ) : null}
        </section>
      </div>

      <nav className={styles.mobileTabBar}>
        {mobileTabs.map((item) => (
          <button
            key={item}
            type="button"
            className={`${styles.mobileTab} ${
              activeSection === item ? styles.mobileTabActive : ""
            }`}
            onClick={() => setActiveSection(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      {isPlayerVisible && currentVideo ? (
        <section className={styles.playerBar}>
          <div className={styles.playerMain}>
            <button
              type="button"
              className={styles.playerArtButton}
              onClick={() => playTrack(currentVideo, { autoplay: true, addToQueue: false })}
            >
              <div className={styles.playerArt}>
                <Image
                  src={currentVideo.thumbnailUrl}
                  alt={currentVideo.title}
                  fill
                  sizes="60px"
                  className={styles.coverArt}
                />
              </div>
            </button>
            <div className={styles.playerMeta}>
              <strong>{cleanTitle(currentVideo.title)}</strong>
              <span>{extractArtist(currentVideo)}</span>
            </div>
            <div className={styles.playerActions}>
              <button type="button" className={styles.transportButton} onClick={() => playTrack(currentVideo, { autoplay: true, addToQueue: false })}>
                Play
              </button>
              <button type="button" className={styles.transportButton} onClick={playNext}>
                Next
              </button>
            </div>
          </div>

          <div className={styles.playerInlineFrame}>
            <div id="youtube-player" className={styles.playerSlot} />
          </div>

          <div className={styles.queueStrip}>
            <div className={styles.queueStripHeader}>
              <span>Up Next</span>
              <div className={styles.queueStripControls}>
                <button type="button" className={styles.queueArrow} onClick={() => scrollQueue("left")}>
                  Prev
                </button>
                <button type="button" className={styles.queueArrow} onClick={() => scrollQueue("right")}>
                  Next
                </button>
                <button type="button" className={styles.queueArrow} onClick={closePlayer}>
                  Close
                </button>
              </div>
            </div>
            <div ref={queueScrollerRef} className={styles.queueScroller}>
              {queuePreview.length ? (
                queuePreview.map((track) => (
                  <button
                    key={`next-${track.id}`}
                    type="button"
                    className={styles.queueCard}
                    onClick={() => playTrack(track, { autoplay: true, addToQueue: false })}
                  >
                    <div className={styles.queueCardThumb}>
                      <Image
                        src={track.thumbnailUrl}
                        alt={track.title}
                        fill
                        sizes="72px"
                        className={styles.coverArt}
                      />
                    </div>
                    <div className={styles.queueCardCopy}>
                      <strong>{cleanTitle(track.title)}</strong>
                      <span>{extractArtist(track)}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className={styles.queueEmpty}>Queue another track to swipe through what’s next.</div>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}

type FeatureCardProps = {
  track: VideoItem;
  onPlay: () => void;
};

function FeatureCard({ track, onPlay }: FeatureCardProps) {
  return (
    <button type="button" className={styles.featureCard} onClick={onPlay}>
      <div className={styles.featureArt}>
        <Image
          src={track.thumbnailUrl}
          alt={track.title}
          fill
          sizes="480px"
          className={styles.coverArt}
        />
      </div>
      <div className={styles.featureCopy}>
        <strong>{cleanTitle(track.title)}</strong>
        <span>{extractArtist(track)}</span>
      </div>
    </button>
  );
}

type PosterCardProps = FeatureCardProps;

function PosterCard({ track, onPlay }: PosterCardProps) {
  return (
    <button type="button" className={styles.posterCard} onClick={onPlay}>
      <div className={styles.posterArt}>
        <Image
          src={track.thumbnailUrl}
          alt={track.title}
          fill
          sizes="220px"
          className={styles.coverArt}
        />
      </div>
      <div className={styles.posterCopy}>
        <strong>{cleanTitle(track.title)}</strong>
        <span>{extractArtist(track)}</span>
      </div>
    </button>
  );
}

type MiniCardProps = FeatureCardProps;

function MiniCard({ track, onPlay }: MiniCardProps) {
  return (
    <button type="button" className={styles.miniCard} onClick={onPlay}>
      <div className={styles.miniThumb}>
        <Image
          src={track.thumbnailUrl}
          alt={track.title}
          fill
          sizes="120px"
          className={styles.coverArt}
        />
      </div>
      <div className={styles.miniCopy}>
        <strong>{cleanTitle(track.title)}</strong>
        <span>{extractArtist(track)}</span>
      </div>
    </button>
  );
}

type EditorialCardProps = {
  track: VideoItem;
  eyebrow: string;
  onPlay: () => void;
};

function EditorialCard({ track, eyebrow, onPlay }: EditorialCardProps) {
  return (
    <button type="button" className={styles.editorialCard} onClick={onPlay}>
      <div className={styles.editorialHeader}>
        <span>{eyebrow}</span>
        <strong>{cleanTitle(track.title)}</strong>
        <small>{extractArtist(track)}</small>
      </div>
      <div className={styles.editorialArt}>
        <Image
          src={track.thumbnailUrl}
          alt={track.title}
          fill
          sizes="620px"
          className={styles.coverArt}
        />
      </div>
    </button>
  );
}

type RadioCardProps = FeatureCardProps;

function RadioCard({ track, onPlay }: RadioCardProps) {
  return (
    <button type="button" className={styles.radioCard} onClick={onPlay}>
      <div className={styles.radioArt}>
        <Image
          src={track.thumbnailUrl}
          alt={track.title}
          fill
          sizes="320px"
          className={styles.coverArt}
        />
      </div>
      <div className={styles.radioCopy}>
        <strong>{extractArtist(track)} Radio</strong>
        <span>{cleanTitle(track.title)}</span>
      </div>
    </button>
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
            sizes="120px"
            className={styles.coverArt}
          />
        </div>
        <div className={styles.trackCopy}>
          <strong>{cleanTitle(track.title)}</strong>
          <span>{extractArtist(track)}</span>
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
