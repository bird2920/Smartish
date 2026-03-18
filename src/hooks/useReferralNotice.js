import { useCallback, useEffect, useState } from "react";
import { getReferralSourceFromLocation } from "../referralSources";

export function useReferralNotice({ canShow = true } = {}) {
  const [source, setSource] = useState(null);
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    if (!canShow) return;

    const nextSource = getReferralSourceFromLocation();
    if (!nextSource) return;

    const hasSeen = localStorage.getItem(nextSource.storageKey) === "true";
    if (hasSeen) return;

    setSource(nextSource);
    setShouldShow(true);
  }, [canShow]);

  const dismiss = useCallback(() => {
    if (source?.storageKey) {
      localStorage.setItem(source.storageKey, "true");
    }
    setShouldShow(false);
  }, [source]);

  return { source, shouldShow, dismiss };
}
