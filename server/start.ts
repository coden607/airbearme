import 'dotenv/config';
import { createServer } from "http";
import { createApp } from "./index.js";
import { log } from "./utils.js";

process.on("unhandledRejection", (reason) => {
  console.error("[UnhandledRejection]", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[UncaughtException]", error);
});

(async () => {
  const { app, server: devServer } = await createApp();
  const server = devServer || createServer(app);

  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
