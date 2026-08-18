"use client";

import { useState, useCallback } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VoiceAssistantControlBar,
  useVoiceAssistant,
  BarVisualizer,
} from "@livekit/components-react";
import "@livekit/components-styles";

const TOKEN_ENDPOINT = "http://localhost:8000/token";

export default function Home() {
  const [connectionDetails, setConnectionDetails] = useState<{
    token: string;
    url: string;
  } | null>(null);

  const connect = useCallback(async () => {
    const identity = `user-${Math.floor(Math.random() * 10000)}`;
    const res = await fetch(
      `${TOKEN_ENDPOINT}?identity=${identity}&room=nxb-support`
    );
    const data = await res.json();
    setConnectionDetails(data);
  }, []);

  if (!connectionDetails) {
    return (
      <main className="flex h-screen items-center justify-center bg-neutral-950">
        <button
          onClick={connect}
          className="rounded-full bg-blue-600 px-8 py-4 text-lg font-medium text-white hover:bg-blue-700"
        >
          Talk to Nextbridge
        </button>
      </main>
    );
  }

  return (
    <LiveKitRoom
      token={connectionDetails.token}
      serverUrl={connectionDetails.url}
      connect={true}
      audio={true}
      className="h-screen bg-neutral-950"
      onDisconnected={() => setConnectionDetails(null)}
    >
      <AgentUI />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function AgentUI() {
  const { state, audioTrack } = useVoiceAssistant();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 text-white">
      <p className="text-sm uppercase tracking-widest text-neutral-400">
        {state}
      </p>
      <BarVisualizer
        state={state}
        barCount={7}
        trackRef={audioTrack}
        className="h-24 w-64"
      />
      <VoiceAssistantControlBar />
    </div>
  );
}