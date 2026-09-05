import { buildApp } from "./app.ts";
import { config } from "./config.ts";

const app = buildApp();
const port = config.PORT;

app.listen(port, () => {
    console.log(`Server is running on port ${port}`)
})