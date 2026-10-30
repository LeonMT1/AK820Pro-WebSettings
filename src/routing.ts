import { useCallback, useEffect, useState } from "react";

export const sections = [
  "Connection",
  "Lighting",
  "Display",
  "Presets",
  "Diagnostics",
] as const;
export type Section = (typeof sections)[number];
type Route = { section: Section; lightingView: "effects" | "keys" };
function readRoute(): Route {
  const [page, editor] = window.location.hash.slice(2).split("/");
  return {
    section: sections.find((s) => s.toLowerCase() === page) ?? "Connection",
    lightingView: page === "lighting" && editor === "keys" ? "keys" : "effects",
  };
}
function hashFor(route: Route) {
  return `#/${route.section.toLowerCase()}${route.section === "Lighting" && route.lightingView === "keys" ? "/keys" : ""}`;
}
export function useRoute() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const sync = () => {
      const next = readRoute();
      if (location.hash !== hashFor(next))
        window.history.replaceState(null, "", hashFor(next));
      setRoute(next);
    };
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);
  const navigate = useCallback(
    (section: Section, lightingView: Route["lightingView"] = "effects") => {
      const next = { section, lightingView };
      const hash = hashFor(next);
      if (location.hash === hash) return;
      window.history.pushState(null, "", hash);
      setRoute(next);
      window.scrollTo(0, 0);
    },
    [],
  );
  useEffect(() => {
    document.title = `${route.section}${route.section === "Lighting" && route.lightingView === "keys" ? " / Per-key RGB" : ""} · AK820 Pro Studio`;
  }, [route]);
  return { ...route, navigate };
}
