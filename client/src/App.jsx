import React from "react";
import { useEffect, useRef, useState } from "react";

const STREAM_API_URL = "http://localhost:3001/api/stream";
const CHANNELS_API_URL = "http://localhost:3001/api/channels";

function App() {
  const audioRef = useRef(null);
  const isDisconnectingRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState("");
  const [volume, setVolume] = useState(0.8);
  const [error, setError] = useState("");
  const currentChannel = channels.find((channel) => channel.id === selectedChannel) ??
    channels[0] ??
    { name: "Loading channels…", band: "", frequency: "" };

  useEffect(() => {
    let isMounted = true;

    fetch(CHANNELS_API_URL)
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load channels");
        return response.json();
      })
      .then((loadedChannels) => {
        if (!isMounted) return;
        setChannels(loadedChannels);
        setSelectedChannel((current) => current || loadedChannels[0]?.id || "");
      })
      .catch(() => {
        if (isMounted) setError("Radio channels could not be loaded. Check that the server is running.");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  function disconnectAudio() {
    const audio = audioRef.current;
    if (!audio) return;

    isDisconnectingRef.current = true;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  async function playChannel(channelId) {
    const audio = audioRef.current;
    if (!audio || !channelId) return;

    setIsLoading(true);
    try {
      isDisconnectingRef.current = false;
      audio.src = `${STREAM_API_URL}?channel=${encodeURIComponent(channelId)}`;
      audio.load();
      await audio.play();
      setIsPlaying(true);
    } catch {
      audio.removeAttribute("src");
      audio.load();
      setError("The stream could not be started. Check that the server is running.");
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
    }
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || isLoading) return;

    setError("");

    if (isPlaying) {
      disconnectAudio();
      setIsPlaying(false);
      return;
    }

    await playChannel(selectedChannel);
  }

  async function switchChannel(direction) {
    if (isLoading || channels.length === 0) return;

    setError("");
    const currentIndex = channels.findIndex((channel) => channel.id === selectedChannel);
    const nextIndex = (currentIndex + direction + channels.length) % channels.length;
    const nextChannel = channels[nextIndex];

    if (isPlaying) {
      disconnectAudio();
      setIsPlaying(false);
    }
    setSelectedChannel(nextChannel.id);
    await playChannel(nextChannel.id);
  }

  function handleStreamError() {
    if (isDisconnectingRef.current) return;

    setIsLoading(false);
    setIsPlaying(false);
    setError("The radio stream is currently unavailable.");
  }

  return (
    <main className="app-shell">
      <div className="radio-device">
        <section className="radio-card" aria-label="HK Radio player">
          <div className={`station-art${isPlaying || isLoading ? " station-art-on" : ""}`} aria-live="polite">
            {(isPlaying || isLoading) && (
              <>
                <div className="display-topline">
                  <span>{currentChannel.band}</span>
                  <span>{isLoading ? "○ TUNING" : "● LIVE"}</span>
                </div>
                <strong className="display-channel">{currentChannel.name}</strong>
                <div className="display-frequency">
                  <span>{currentChannel.frequency || "Podcast"}</span>
                  {currentChannel.frequency && <small>{currentChannel.band}</small>}
                </div>
                <div className="display-meter">
                  {Array.from({ length: 18 }, (_, index) => (
                    <span key={index} />
                  ))}
                </div>
                <div className="display-footer">
                  <span>PRESET {String(channels.findIndex((channel) => channel.id === selectedChannel) + 1).padStart(2, "0")}/{String(channels.length).padStart(2, "0")}</span>
                  <span>{isLoading ? "CONNECTING" : "SIGNAL LOCKED"}</span>
                </div>
              </>
            )}
          </div>

        <p className="eyebrow">Office Hea radio</p>
        <h1>扮公 Radio</h1>
        <p className="subtitle">slack off for work-life balance</p>

        <div className="channel-picker" aria-label="Switch radio channel">
          <button
            className="channel-button"
            type="button"
            onClick={() => switchChannel(-1)}
            aria-label={isLoading ? "Loading radio channel" : "Previous radio channel"}
            disabled={isLoading || channels.length === 0}
          >
            {isLoading ? "…" : "⏮"}
          </button>
          <strong className="channel-name">
            {currentChannel.name}
            <small>{currentChannel.band}{currentChannel.frequency ? ` · ${currentChannel.frequency}` : ""}</small>
          </strong>
          <button
            className="channel-button"
            type="button"
            onClick={() => switchChannel(1)}
            aria-label={isLoading ? "Loading radio channel" : "Next radio channel"}
            disabled={isLoading || channels.length === 0}
          >
            {isLoading ? "…" : "⏭"}
          </button>
        </div>

        <audio
          ref={audioRef}
          onError={handleStreamError}
        />

        <div className="player-controls">
          <div className="status">
            <strong>{isLoading ? "Connecting…" : isPlaying ? "Now playing" : "Ready to listen"}</strong>
            <span>{isLoading ? "Tuning in to the live stream" : isPlaying ? `${currentChannel.band} ${currentChannel.frequency}` : "Press play to tune in"}</span>
          </div>
        </div>

        <label className="volume-control">
          <span>Volume</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label="Volume"
          />
          <span>{Math.round(volume * 100)}%</span>
        </label>

        {error && <p className="error-message" role="alert">{error}</p>}
        </section>
        <button
          className="power-button"
          type="button"
          onClick={togglePlayback}
          aria-label={isLoading ? "Loading radio" : isPlaying ? "Turn radio off" : "Turn radio on"}
          disabled={isLoading}
        >
          <span className="power-icon">⏻</span>
        </button>
        {!isPlaying && !isLoading && (
          <span className="power-hint" aria-live="polite">
            Click to start
            <span className="power-hint-arrow" aria-hidden="true">→</span>
          </span>
        )}
      </div>
      <p className="footer-note">Created by Jacky Kwan. Radio broadcast provided by Radio Garden.</p>
    </main>
  );
}

export default App;
