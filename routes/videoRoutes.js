import express from 'express';
import multer from 'multer';
import { uploadVideo, getAllPublicVideos } from '../controllers/videoController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload', verifyToken, upload.single('video'), uploadVideo);
router.get('/public', getAllPublicVideos);

export default router;
