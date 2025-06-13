// src/middleware/multer.js
import multer from "multer";

// We're using memoryStorage here
const storage = multer.memoryStorage();

export const upload = multer({ storage });
