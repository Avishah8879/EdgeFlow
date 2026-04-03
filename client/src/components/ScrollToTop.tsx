import { useLocation } from "wouter";
import { useEffect, useRef, type ReactNode } from "react";

export function ScrollToTop({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const prevLocation = useRef(location);

  useEffect(() => {
    if (prevLocation.current !== location) {
      window.scrollTo(0, 0);
      prevLocation.current = location;
    }
  }, [location]);

  return children;
}
