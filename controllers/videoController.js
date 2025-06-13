import { uploadToStreamtape } from "../utils/streamtape.js";
import Video from "../models/Video.js";

// Controller to handle video upload
export const uploadVideo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No video file uploaded" });
    }
    if (!req.body.title) {
      return res.status(400).json({ message: "Title is required" });
    }
    if (!req.body.description) {
      return res.status(400).json({ message: "Description is required" });
    }
    if (!req.body.visibility) {
      return res.status(400).json({ message: "Visibility is required" });
    }
    if (!req?.user?.id) {
      // assumes you have authentication
      return res.status(401).json({ message: "Not authorized" });
    }

    // 1️⃣ Streamtape upload
    const streamtape = await uploadToStreamtape(
      req.file.buffer,
      req.file.originalname
    );

    // 2️⃣ Prepare video metadata
    const video = await Video.create({
      title: req.body.title,
      description: req.body.description,
      visibility: req.body.visibility,
      user: req.user.id,
      fileId: streamtape.fileId,
      streamUrl: streamtape.streamUrl,
      downloadUrl: streamtape.downloadUrl,
      size: streamtape.size,
      contentType: streamtape.contentType,
    });

    res.status(201).json({ video });
  } catch (error) {
    console.error("Error uploading video:", error?.message);
    res.status(500).json({ message: "Server Error", error: error?.message });
  }
};

export const getAllPublicVideos = async (req, res) => {
  const videos = await Video.find({ visibility: "public" }).populate(
    "user",
    "username"
  );
  res.json(videos);
};
