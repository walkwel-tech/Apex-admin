import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from 'dotenv';
import authRoutes from "./routes/authRoutes";
import webhookRoutes from "./routes/webhookRoutes";

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());
app.use(authRoutes);
app.use("/api", webhookRoutes);

// Routes
app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Hello from TypeScript Express Server!" });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
