import app from "./app";
import { logger } from "./lib/logger";
import { startBot } from "./bot/index";

const port = Number(process.env["PORT"] ?? 3000);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env["PORT"]}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

startBot().catch((err) => {
  logger.error({ err }, "Failed to start bot");
});
