// Tiny hook to read the current project id from the URL. The library is
// only ever rendered inside the /w/$wsId/p/$pid route, so the regex always
// matches in practice. We parse the URL unconditionally (no conditional hook
// calls, no throws on missing params).

import { useEffect, useState } from "react";

export function useLibraryProject(): string | null {
  const [pid, setPid] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.location.pathname.match(/\/p\/([^/]+)/);
    setPid(m ? decodeURIComponent(m[1]) : null);
  }, []);
  return pid;
}
