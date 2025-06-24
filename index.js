// server/index.js - Consolidated and Production-Ready Backend for Render

// 1. Load Environment Variables First
// This ensures process.env has your sensitive data from the .env file during local development.
// On Render, these variables are injected directly and this line will still work.
require("dotenv").config();

// 2. Core Node.js and Express Imports
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const axios = require("axios"); // For making HTTP requests to Streamtape API
const multer = require("multer"); // For handling file uploads (multipart/form-data)
// const path = require('path'); // Not needed if not serving static files from backend

const app = express();
// Use process.env.PORT for Render deployment, fallback to 5000 for local dev
const PORT = process.env.PORT || 5000;

// 3. Essential Middleware
// CORS: Critical for allowing your frontend (on Cloudflare Pages) to make requests to this backend.
// In production, `process.env.FRONTEND_URL` should be set on Render to your Cloudflare Pages domain (e.g., https://your-site.pages.dev).
const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? [process.env.FRONTEND_URL] // Render will inject FRONTEND_URL.
    : ["http://localhost:5173"]; // Your local React dev server port

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg =
          "The CORS policy for this site does not allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Allow necessary HTTP methods
    credentials: true, // Allow cookies to be sent (if you add authentication later)
    allowedHeaders: ["Content-Type", "Authorization"], // Allow necessary headers
  })
);

app.use(express.json()); // Parses incoming JSON requests
app.use(express.urlencoded({ extended: true })); // Parses URL-encoded requests

// 4. MongoDB Connection
const mongoURI = process.env.MONGO_URI;

mongoose
  .connect(mongoURI)
  .then(() => console.log("MongoDB connected successfully"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Optional: Define a simple Mongoose Schema for Videos if you want to store metadata
// This is commented out. If you decide to use it, uncomment and potentially create a `models` folder.
/*
const videoSchema = new mongoose.Schema({
    fileId: { type: String, required: true, unique: true },
    fileName: String,
    streamUrl: String,
    downloadUrl: String,
    size: Number,
    contentType: String,
    uploadedAt: { type: Date, default: Date.now },
    // Add more fields as needed (e.g., views, likes, description, tags)
});
const Video = mongoose.model('Video', videoSchema);
*/

// 5. Streamtape API Configuration (from .env)
const STREAMTAPE_LOGIN = process.env.STREAMTAPE_LOGIN;
const STREAMTAPE_KEY = process.env.STREAMTAPE_KEY;
const STREAMTAPE_FOLDER_ID = process.env.STREAMTAPE_FOLDER_ID; // Used for both listing and uploading

// Basic validation for credentials - important for production!
if (!STREAMTAPE_LOGIN || !STREAMTAPE_KEY || !STREAMTAPE_FOLDER_ID) {
  console.error(
    "CRITICAL ERROR: Streamtape API credentials (login, key, folder ID) are not fully set in environment variables."
  );
  console.error(
    "Please ensure STREAMTAPE_LOGIN, STREAMTAPE_KEY, STREAMTAPE_FOLDER_ID, and FRONTEND_URL are defined in Render's environment settings."
  );
  // In a real production app, you might want to gracefully shut down or prevent API calls
  // process.exit(1); // Uncomment this to stop the app if credentials are missing
}

const API_BASE_URL = "https://api.streamtape.com";

// 6. Multer Configuration for File Uploads
// Stores the file in memory as a buffer. Limits to 1GB by default.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024 * 1000, // 1GB limit (adjust as needed, check Streamtape limits)
  },
});

// 7. Backend API Routes

// Route: Get all videos from a Streamtape folder
app.get("/api/videos", async (req, res) => {
  try {
    const streamtapeUrl = `${API_BASE_URL}/file/listfolder?login=${STREAMTAPE_LOGIN}&key=${STREAMTAPE_KEY}&folder=${STREAMTAPE_FOLDER_ID}`;
    const response = await axios.get(streamtapeUrl);

    if (
      response.data.status === 200 &&
      response.data.result &&
      response.data.result.files
    ) {
      const videos = response.data.result.files.filter(
        (file) => file.linkid && file.convert === "converted"
      );
      res.json({ success: true, videos });
    } else {
      console.error("Streamtape API error (listfolder):", response.data.msg);
      res
        .status(response.data.status || 500)
        .json({
          success: false,
          message: response.data.msg || "Failed to fetch videos.",
        });
    }
  } catch (error) {
    console.error("Error fetching videos:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Server error while fetching videos." });
  }
});

// Route: Get video thumbnail (splash screen)
app.get("/api/videos/:linkId/thumbnail", async (req, res) => {
  const { linkId } = req.params;
  try {
    const streamtapeUrl = `${API_BASE_URL}/file/getsplash?login=${STREAMTAPE_LOGIN}&key=${STREAMTAPE_KEY}&file=${linkId}`;
    const response = await axios.get(streamtapeUrl);

    if (response.data.status === 200 && response.data.result) {
      res.json({ success: true, thumbnailUrl: response.data.result });
    } else {
      console.error(
        `Streamtape API error (getsplash for ${linkId}):`,
        response.data.msg
      );
      res
        .status(response.data.status || 500)
        .json({
          success: false,
          message: response.data.msg || "Failed to get thumbnail.",
        });
    }
  } catch (error) {
    console.error(`Error fetching thumbnail for ${linkId}:`, error.message);
    res
      .status(500)
      .json({
        success: false,
        message: "Server error while fetching thumbnail.",
      });
  }
});

// Route: Get a download ticket (first step for direct download)
app.get("/api/videos/:linkId/download-ticket", async (req, res) => {
  const { linkId } = req.params;
  try {
    const streamtapeUrl = `${API_BASE_URL}/file/dlticket?login=${STREAMTAPE_LOGIN}&key=${STREAMTAPE_KEY}&file=${linkId}`;
    const response = await axios.get(streamtapeUrl);

    if (response.data.status === 200 && response.data.result) {
      res.json({
        success: true,
        ticket: response.data.result.ticket,
        wait_time: response.data.result.wait_time,
      });
    } else {
      console.error(
        `Streamtape API error (dlticket for ${linkId}):`,
        response.data.msg
      );
      res
        .status(response.data.status || 500)
        .json({
          success: false,
          message: response.data.msg || "Failed to get download ticket.",
        });
    }
  } catch (error) {
    console.error(
      `Error fetching download ticket for ${linkId}:`,
      error.message
    );
    res
      .status(500)
      .json({
        success: false,
        message: "Server error while fetching download ticket.",
      });
  }
});

// Route: Get the actual download link using the ticket
app.get("/api/videos/:linkId/download-link", async (req, res) => {
  const { linkId } = req.params;
  const { ticket } = req.query; // Ticket passed as query parameter from client

  if (!ticket) {
    return res
      .status(400)
      .json({ success: false, message: "Download ticket is required." });
  }

  try {
    const streamtapeUrl = `${API_BASE_URL}/file/dl?file=${linkId}&ticket=${ticket}`;
    const response = await axios.get(streamtapeUrl);

    if (
      response.data.status === 200 &&
      response.data.result &&
      response.data.result.url
    ) {
      res.json({
        success: true,
        downloadUrl: response.data.result.url,
        filename: response.data.result.name,
      });
    } else {
      console.error(
        `Streamtape API error (dl for ${linkId}):`,
        response.data.msg
      );
      res
        .status(response.data.status || 500)
        .json({
          success: false,
          message: response.data.msg || "Failed to get download link.",
        });
    }
  } catch (error) {
    console.error(`Error fetching download link for ${linkId}:`, error.message);
    res
      .status(500)
      .json({
        success: false,
        message: "Server error while fetching download link.",
      });
  }
});

// Route: Handle video uploads to Streamtape
app.post("/api/upload", upload.single("videoFile"), async (req, res) => {
  // 'videoFile' is the name of the field in the FormData sent from the frontend
  // Ensure you have added 'axios', 'multer', 'form-data', 'https', 'dns' to your package.json dependencies

  if (!req.file) {
    return res
      .status(400)
      .json({ success: false, message: "No file uploaded." });
  }

  const buffer = req.file.buffer;
  const filename = req.file.originalname;

  try {
    // These are required inside the function due to being CommonJS and potentially large
    const FormData = require("form-data");
    const https = require("https");
    const dns = require("dns");

    dns.setDefaultResultOrder("ipv4first"); // Ensure this is set for DNS resolution

    // Step 1: Get an upload URL from Streamtape
    const initResponse = await axios.get(`${API_BASE_URL}/file/ul`, {
      params: {
        login: STREAMTAPE_LOGIN,
        key: STREAMTAPE_KEY,
        folder: STREAMTAPE_FOLDER_ID,
      },
    });

    if (initResponse.data.status !== 200 || !initResponse.data.result?.url) {
      throw new Error(
        initResponse.data.msg || "Failed to get upload URL from Streamtape."
      );
    }

    const uploadUrl = initResponse.data.result.url;

    // Step 2: Prepare the file for upload
    const form = new FormData();
    form.append("file1", buffer, {
      filename: filename,
      contentType: req.file.mimetype || "application/octet-stream", // Use actual mimetype
    });

    // Ensure proper agent for HTTPS to force IPv4
    const agent = new https.Agent({
      keepAlive: true,
      family: 4,
    });

    // Step 3: Perform the actual upload
    const uploadResponse = await axios.post(uploadUrl, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      httpsAgent: agent,
    });

    if (uploadResponse.data.status !== 200 || !uploadResponse.data.result?.id) {
      throw new Error(
        uploadResponse.data.msg ||
          "Upload failed or no file ID returned from Streamtape."
      );
    }

    const result = uploadResponse.data.result;

    // Optional: Save file metadata to your MongoDB database here
    // if (Video) { // Check if Video model is defined and import it if needed
    //     const newVideo = new Video({
    //         fileId: result.id,
    //         fileName: result.name,
    //         streamUrl: `https://streamtape.com/e/${result.id}`,
    //         downloadUrl: result.url,
    //         size: result.size,
    //         contentType: result.content_type,
    //         uploadedAt: new Date(),
    //         // ... other fields you might want to save
    //     });
    //     await newVideo.save();
    // }

    res.status(200).json({
      success: true,
      message: "Video uploaded successfully!",
      data: {
        fileId: result.id,
        fileName: result.name,
        streamUrl: `https://streamtape.com/e/${result.id}`,
        downloadUrl: result.url,
        size: result.size,
        contentType: result.content_type,
        sha256: result.sha256,
      },
    });
  } catch (error) {
    console.error(
      "Error in /api/upload route:",
      error.response?.data || error.message
    );
    res.status(500).json({
      success: false,
      message: `Failed to upload video: ${
        error.response?.data?.msg || error.message
      }`,
    });
  }
});

// 8. Basic Health Check Route
// This route will simply confirm the backend server is running.
app.get("/", (req, res) => {
  res.send("Seductive Streams Backend API is running!");
});

// 9. Start the Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (process.env.NODE_ENV !== "production") {
    console.log(`Local API Access: http://localhost:${PORT}/api/videos`);
    console.log(`Local Upload Endpoint: http://localhost:${PORT}/api/upload`);
  } else {
    console.log("Server is running in production mode.");
  }
});
