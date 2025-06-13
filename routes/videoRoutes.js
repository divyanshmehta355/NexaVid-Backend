import express from "express";
import {
  uploadVideo,
  getAllPublicVideos,
} from "../controllers/videoController.js";
import { verifyToken } from "../middleware/auth.js";
import { upload } from "../middleware/multer.js";

const router = express.Router();

router.post("/upload", verifyToken, upload.single("file"), uploadVideo);
router.get("/public", getAllPublicVideos);

export default router;
