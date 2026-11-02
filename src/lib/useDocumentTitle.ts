import { useEffect } from "react";

const APP_TITLE = "Posda Release Module";

/** Name the browser tab after what the page shows -- "<title> — Posda", most
 *  specific part first, since browsers cut a long tab title from the end.
 *  Restores the app's own title when the page goes away. */
export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} — Posda` : APP_TITLE;
    return () => {
      document.title = APP_TITLE;
    };
  }, [title]);
}
