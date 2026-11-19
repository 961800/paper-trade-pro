import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";

if (import.meta.env.VITE_API_URL) {
  setBaseUrl(import.meta.env.VITE_API_URL);
} else {
  setBaseUrl("/");
}

// Attach Bearer token from localStorage for reliable cross-origin auth
setAuthTokenGetter(() => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("papertrade_token");
  }
  return null;
});

createRoot(document.getElementById("root")!).render(<App />);
