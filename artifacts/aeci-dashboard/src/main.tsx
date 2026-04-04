import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// Configure API client - uses env var or defaults to localhost
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
setBaseUrl(API_URL);
console.log("[Dashboard] API URL:", API_URL);

createRoot(document.getElementById("root")!).render(<App />);
