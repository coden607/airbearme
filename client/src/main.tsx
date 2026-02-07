import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element not found");
}

const root = createRoot(container);
root.render(<App />);

// Version info in development console only
if (import.meta.env.DEV) {
  console.log(`%c🚀 AirBear Ride Share v1.3.0`, 'color: #10b981; font-weight: bold; font-size: 1.2em;');
}
