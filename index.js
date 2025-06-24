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
// const path = require('path'); // Not needed if not serving static files from backend
const morgan = require("morgan");
const expressStatusMonitor = require("express-status-monitor");
const Busboy = require("busboy"); // NEW: Import Busboy for stream parsing

const app = express();
// Use process.env.PORT for Render deployment, fallback to 5000 for local dev
const PORT = process.env.PORT || 5000;

// For now, let's keep it simple for immediate access, but keep the security warning in mind:
app.use(expressStatusMonitor());

// 3. Essential Middleware
app.use(morgan("combined")); // Request Logging with Morgan (still useful for console logs)

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
      res.status(response.data.status || 500).json({
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
      res.status(response.data.status || 500).json({
        success: false,
        message: response.data.msg || "Failed to get thumbnail.",
      });
    }
  } catch (error) {
    console.error(`Error fetching thumbnail for ${linkId}:`, error.message);
    res.status(500).json({
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
      res.status(response.data.status || 500).json({
        success: false,
        message: response.data.msg || "Failed to get download ticket.",
      });
    }
  } catch (error) {
    console.error(
      `Error fetching download ticket for ${linkId}:`,
      error.message
    );
    res.status(500).json({
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
      res.status(response.data.status || 500).json({
        success: false,
        message: response.data.msg || "Failed to get download link.",
      });
    }
  } catch (error) {
    console.error(`Error fetching download link for ${linkId}:`, error.message);
    res.status(500).json({
      success: false,
      message: "Server error while fetching download link.",
    });
  }
});

// NEW: Handle video uploads to Streamtape using Busboy for direct streaming
// Handle video uploads to Streamtape using Busboy for direct streaming
app.post("/api/upload", (req, res) => {
  const busboy = Busboy({
    headers: req.headers,
    highWaterMark: 2 * 1024 * 1024,
  });

  let fileStream;
  let fileName = "unknown_file";

  busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
    if (fieldname !== "videoFile") {
      file.resume();
      return;
    }

    console.log(`Receiving file: ${filename.filename} (${mimetype})`);
    fileName = filename.filename || "uploaded_video";
    fileStream = file;

    file.on("error", (err) => {
      console.error("Error on file stream:", err);
      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          message: "File stream error during upload.",
        });
      }
    });
  });

  busboy.on(
    "field",
    (fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) => {
      // console.log(`Field [${fieldname}]: value: ${val}`);
    }
  );

  busboy.on("finish", async () => {
    if (!fileStream) {
      console.warn("No file stream found in upload request.");
      if (!res.headersSent) {
        return res
          .status(400)
          .json({ success: false, message: "No file uploaded." });
      }
    }

    try {
      const FormData = require("form-data");
      const https = require("https");
      const dns = require("dns");
      dns.setDefaultResultOrder("ipv4first");

      const initResponse = await axios.get(`${API_BASE_URL}/file/ul`, {
        params: {
          login: STREAMTAPE_LOGIN,
          key: STREAMTAPE_KEY,
          folder: STREAMTAPE_FOLDER_ID,
        },
        timeout: 60000, // NEW: Add timeout for initial URL fetch (1 minute)
      });

      if (initResponse.data.status !== 200 || !initResponse.data.result?.url) {
        throw new Error(
          initResponse.data.msg || "Failed to get upload URL from Streamtape."
        );
      }

      const uploadUrl = initResponse.data.result.url;
      console.log(`Streamtape upload URL obtained: ${uploadUrl}`);

      const form = new FormData();
      form.append("file1", fileStream, {
        filename: fileName,
        contentType: "application/octet-stream",
      });

      const agent = new https.Agent({
        keepAlive: true,
        family: 4,
      });

      const uploadResponse = await axios.post(uploadUrl, form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        httpsAgent: agent,
        timeout: 300000, // NEW: Increased timeout for the actual file upload (5 minutes)
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          if (percentCompleted % 10 === 0 || percentCompleted === 100) {
            console.log(
              `Upload progress for ${fileName}: ${percentCompleted}%`
            );
          }
        },
      });

      if (
        uploadResponse.data.status !== 200 ||
        !uploadResponse.data.result?.id
      ) {
        throw new Error(
          uploadResponse.data.msg ||
            "Upload failed or no file ID returned from Streamtape."
        );
      }

      const result = uploadResponse.data.result;
      console.log(
        `File ${fileName} uploaded to Streamtape with ID: ${result.id}`
      );

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
        "Error during Streamtape upload process:",
        error.response?.data || error.message
      );
      if (!res.headersSent) {
        // Check for Axios timeout errors specifically
        if (axios.isCancel(error)) {
          res
            .status(504)
            .json({ success: false, message: "Upload cancelled by timeout." });
        } else if (error.code === "ECONNABORTED") {
          res.status(504).json({
            success: false,
            message: "Upload timed out after a long wait.",
          });
        } else {
          res.status(500).json({
            success: false,
            message: `Failed to upload video: ${
              error.response?.data?.msg || error.message
            }`,
          });
        }
      }
    }
  });

  // Pipe the request into busboy
  req.pipe(busboy);
});

// 8. Basic Health Check Route
// Health Check Endpoint (still useful for Render's automated health checks)
app.get("/health", (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const dbMessage = dbStatus === 1 ? "Connected" : "Disconnected";
  const serverStatus = "OK";

  if (dbStatus === 1) {
    res.status(200).json({
      server: serverStatus,
      database: dbMessage,
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(500).json({
      server: serverStatus,
      database: dbMessage,
      timestamp: new Date().toISOString(),
      error: "Database connection is not healthy",
    });
  }
});

// This route will simply confirm the backend server is running.
app.get("/", (req, res) => {
  res.send("Seductive Streams Backend API is running!");
});

// 8. Start the Server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (process.env.NODE_ENV !== "production") {
    console.log(`Local API Access: http://localhost:${PORT}/api/videos`);
    console.log(`Local Upload Endpoint: http://localhost:${PORT}/api/upload`);
    console.log(`Local Health Check: http://localhost:${PORT}/health`);
    console.log(
      `Express Monitor Dashboard (requires API Key): http://localhost:${PORT}/status`
    );
  } else {
    console.log("Server is running in production mode.");
  }
});

// NEW: Increase server's default timeout (e.g., 5 minutes)
// This will prevent the Express server from timing out its response to the client
// while it's waiting for Streamtape to finish the upload.
server.timeout = 300000; // 5 minutes (in milliseconds)
// You might also need server.headersTimeout depending on Node.js version and specific network conditions

// Centralized Error Logging for Uncaught Exceptions and Unhandled Rejections (as before)
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION! 🚨 Shutting down...");
  console.error(err.name, err.message, err.stack);
  server.close(() => {
    process.exit(1);
  });
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("UNHANDLED REJECTION! 🚨 Shutting down...");
  console.error("Reason:", reason);
  console.error("Promise:", promise);
  server.close(() => {
    process.exit(1);
  });
});
