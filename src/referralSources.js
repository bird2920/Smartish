export const REFERRAL_SOURCES = {
  hn: {
    id: "hn",
    storageKey: "seenReferralModal:hn",
    refParamValues: ["hn", "hackernews"],
    referrerHosts: ["news.ycombinator.com"],
    title: "Heads up - you're early",
    eyebrow: "Heads up",
    intro: "You probably came here from Hacker News.",
    body: [
      "This is a real-time multiplayer trivia game I'm stress-testing before a wider launch.",
      "If you're poking at state, refresh behavior, reconnects, or edge cases - perfect.",
      "No tracking beyond basic analytics. No monetization. No account required.",
    ],
    primaryCta: "Jump in",
    secondaryCta: "What's the architecture?",
    secondaryHref: "/#/about",
    footer: "Hacker News feedback welcome - I'm in the comments.",
  },
  betalist: {
    id: "betalist",
    storageKey: "seenReferralModal:betalist",
    refParamValues: ["betalist", "beta-list"],
    referrerHosts: ["betalist.com", "www.betalist.com"],
    title: "Welcome BetaList visitors",
    eyebrow: "Welcome",
    intro: "You probably came here from BetaList.",
    body: [
      "QuackKing is a live multiplayer trivia game you can launch in seconds with nothing to install.",
      "Create a room, share a four-letter code, and run fast rounds from your laptop while everyone else joins on their phones.",
      "You can use your own CSV question packs or generate trivia with AI, then see instant scoring and leaderboards.",
    ],
    primaryCta: "Start a game",
    secondaryCta: "See how it works",
    secondaryHref: "/#/about",
    footer: "If you found this through BetaList, I'd like to hear what made you click.",
  },
};

export function getReferralSourceFromLocation() {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref")?.toLowerCase();
    if (ref) {
      const fromParam = Object.values(REFERRAL_SOURCES).find((source) =>
        source.refParamValues.includes(ref)
      );
      if (fromParam) return fromParam;
    }
  } catch (_) {
    // Ignore malformed search params.
  }

  try {
    const referrer = (document.referrer || "").toLowerCase();
    const fromReferrer = Object.values(REFERRAL_SOURCES).find((source) =>
      source.referrerHosts.some((host) => referrer.includes(host))
    );
    return fromReferrer || null;
  } catch (_) {
    return null;
  }
}
