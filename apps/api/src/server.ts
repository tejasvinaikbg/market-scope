import { buildApp } from "./app.ts";
import { config } from "./config.ts";
import { logger } from "./lib/logger.ts";

const app = buildApp();
const port = config.PORT;

app.listen(port, () => {
    logger.info(`Server is running on port ${port}`)
})