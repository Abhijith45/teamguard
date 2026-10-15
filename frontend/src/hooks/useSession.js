import { useEffect, useState } from "react";
import { api, clearAccessToken, setAccessToken } from "../services/api-client.js";

export function useSession(onRestored) {
  const [user, setUser] = useState(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    let active = true;
    api.refresh().then((session) => {
      if (!active || !session) return;
      setAccessToken(session.accessToken);
      setUser(session.user);
      onRestored(session.user);
    }).catch(() => {}).finally(() => {
      if (active) setRestoring(false);
    });
    return () => { active = false; };
  }, [onRestored]);

  function establishSession(nextUser) {
    setUser(nextUser);
    onRestored(nextUser);
  }

  async function logout() {
    try { await api.logout(); } catch { /* Complete local sign-out if the API is unavailable. */ }
    clearAccessToken();
    setUser(null);
  }

  return { user, restoring, establishSession, logout };
}
