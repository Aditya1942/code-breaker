"use client";

import { useEffect, useState } from "react";

export type RoomPlayer = { id: string; username: string; online: boolean };
export type RoomState = { key: string; players: RoomPlayer[] };

export function useRoom(roomKey: string, enabled: boolean) {
  const [state, setState] = useState<RoomState | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const es = new EventSource(`/api/rooms/${roomKey}/events`);
    es.onmessage = (e) => {
      const data = JSON.parse(e.data) as RoomState | null;
      if (data === null) setNotFound(true);
      else setState(data);
    };

    const beat = () =>
      fetch(`/api/rooms/${roomKey}/heartbeat`, { method: "POST" }).catch(() => {});
    beat();
    const interval = setInterval(beat, 10_000);

    return () => {
      es.close();
      clearInterval(interval);
    };
  }, [roomKey, enabled]);

  return { state, notFound };
}
