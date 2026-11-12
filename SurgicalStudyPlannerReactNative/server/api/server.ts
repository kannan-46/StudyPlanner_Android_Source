import express from "express";
import { createApiServer } from "../src/api.js";

const app = express();
const { httpServer } = createApiServer(app);

export default httpServer;
