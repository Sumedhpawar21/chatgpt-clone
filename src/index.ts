import express, { type Application } from "express";
import { envConfig } from "./configs/env.config.js";
import morgan from "morgan";
import cors from "cors";
import mainRouter from "./routes/main.route.js";
import { errorHandler } from "./utils/error.handler.util.js";

const app: Application = express();

app.use(morgan("dev"));
app.use(cors({
    origin: envConfig.CORS_ORIGINS,
    credentials: true,
    exposedHeaders: ["X-Chat-Id"],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_, res) => {
    res.json({ healthy: true });
});

app.use('/api', mainRouter)

app.use((_req, res) => {
    res.status(404).json({ success: false, message: "Route not found" });
});

app.use(errorHandler)

app.listen(envConfig.PORT, () => {
    console.log(`Server is running on port ${envConfig.PORT}`);
});
