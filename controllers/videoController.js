import Video from '../models/Video.js';
import { uploadToStreamtape } from '../utils/streamtape.js';

export const uploadVideo = async (req, res) => {
  try {
    const file = req.file;
    const { title, description, visibility } = req.body;

    const { fileId, streamUrl, downloadUrl } = await uploadToStreamtape(file.buffer, file.originalname);

    const newVideo = await Video.create({
      title,
      description,
      visibility,
      user: req.user.id,
      fileId,
      streamUrl,
      downloadUrl,
    });

    res.status(201).json(newVideo);
  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ message: 'Upload failed' });
  }
};

export const getAllPublicVideos = async (req, res) => {
  const videos = await Video.find({ visibility: 'public' }).populate('user', 'username');
  res.json(videos);
};
