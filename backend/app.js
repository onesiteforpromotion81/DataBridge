import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import csvRoutes from "./routes/csvRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/csv", csvRoutes);

// Serve frontend static files
app.use(express.static(path.join(__dirname, "../frontend")));
app.get("/favicon.ico", (req, res) => res.status(204).end());

// Serve index.html at root
app.get("/", (req, res) => {
  const indexPath = path.resolve(__dirname, "../frontend/index.html");
  res.sendFile(indexPath);
});

export default app;
