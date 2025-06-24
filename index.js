// 1. Load Environment Variables First
require("dotenv").config();

// 2. Core Node.js and Express Imports
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const axios = require("axios");
const multer = require("multer"); // Re-introducing Multer
const fs = require("fs"); // For file system operations
const fsPromises = require("fs/promises"); // For async file deletion
const morgan = require("morgan");
const expressStatusMonitor = require("express-status-monitor");
const FormData = require("form-data"); // Needed for both types of uploads now
const https = require("https"); // Needed for httpsAgent in axios
const dns = require("dns"); // Optional: Keep if you had DNS issues

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

// 6. Multer Configuration for LOCAL File Uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      // Use /tmp directory which is ephemeral on Render
      cb(null, "/tmp/");
    },
    filename: (req, file, cb) => {
      // Generate a unique filename to avoid collisions
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(
        null,
        file.fieldname +
          "-" +
          uniqueSuffix +
          "." +
          file.originalname.split(".").pop()
      );
    },
  }),
  limits: {
    fileSize: 1024 * 1024 * 5000, // 5GB limit (Streamtape's max might be higher)
  },
});

// NEW: Handle video uploads to Streamtape using Busboy for direct streaming
// Handle video uploads to Streamtape using Busboy for direct streaming
// NEW: Local File Upload Route (using Multer disk storage)
app.post("/api/upload", upload.single("videoFile"), async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ success: false, message: "No video file provided." });
  }

  const tempFilePath = req.file.path; // Path to the temporarily saved file
  const originalFileName = req.file.originalname;

  let fileReadStream; // Declare outside try-finally for scope

  try {
    // Step 1: Get an upload URL from Streamtape
    const initResponse = await axios.get(`${API_BASE_URL}/file/ul`, {
      params: {
        login: STREAMTAPE_LOGIN,
        key: STREAMTAPE_KEY,
        folder: STREAMTAPE_FOLDER_ID,
      },
      timeout: 60000, // 1 minute timeout for this API call
    });

    if (initResponse.data.status !== 200 || !initResponse.data.result?.url) {
      throw new Error(
        initResponse.data.msg || "Failed to get upload URL from Streamtape."
      );
    }

    const uploadUrl = initResponse.data.result.url;
    console.log(
      `Streamtape upload URL obtained for ${originalFileName}: ${uploadUrl}`
    );

    // Step 2: Create a readable stream from the temporary file
    fileReadStream = fs.createReadStream(tempFilePath);

    const form = new FormData();
    form.append("file1", fileReadStream, {
      // Append the stream directly
      filename: originalFileName,
      contentType: req.file.mimetype || "application/octet-stream",
    });

    // Optional: Force IPv4 if you previously had issues, otherwise remove
    // dns.setDefaultResultOrder("ipv4first");
    const agent = new https.Agent({
      keepAlive: true,
      family: 4,
    });

    // Step 3: Perform the actual upload to Streamtape by piping the file stream
    const uploadResponse = await axios.post(uploadUrl, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      httpsAgent: agent,
      timeout: 600000, // 10 minutes timeout for the actual file upload
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        if (percentCompleted % 10 === 0 || percentCompleted === 100) {
          console.log(
            `Upload progress for ${originalFileName}: ${percentCompleted}%`
          );
        }
      },
    });

    if (uploadResponse.data.status !== 200 || !uploadResponse.data.result?.id) {
      throw new Error(
        uploadResponse.data.msg ||
          "Upload failed or no file ID returned from Streamtape."
      );
    }

    const result = uploadResponse.data.result;
    console.log(
      `File ${originalFileName} uploaded to Streamtape with ID: ${result.id}`
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
      "Error during Streamtape upload process for local file:",
      error.response?.data || error.message,
      error.stack
    );
    if (axios.isCancel(error) || error.code === "ECONNABORTED") {
      res
        .status(504)
        .json({ success: false, message: "Upload to Streamtape timed out." });
    } else if (error.response && error.response.status) {
      res.status(error.response.status).json({
        success: false,
        message: `Streamtape API error: ${error.response.status} - ${
          error.response.data?.msg || error.message
        }`,
      });
    } else {
      res.status(500).json({
        success: false,
        message: `Server error during upload: ${error.message}`,
      });
    }
  } finally {
    // Ensure the temporary file is deleted, regardless of success or failure
    if (tempFilePath) {
      await fsPromises
        .unlink(tempFilePath)
        .then(() => console.log(`Temporary file deleted: ${tempFilePath}`))
        .catch((unlinkError) =>
          console.error(
            `Error deleting temporary file ${tempFilePath}:`,
            unlinkError
          )
        );
    }
  }
});

// Existing: Remote Upload Endpoint (from previous step)
app.post("/api/remote-upload", async (req, res) => {
  const { url, name } = req.body;

  if (!url) {
    return res
      .status(400)
      .json({ success: false, message: "Remote URL is required." });
  }

  try {
    const streamtapeRemoteDlUrl = `${API_BASE_URL}/remotedl/add`;
    const params = {
      login: STREAMTAPE_LOGIN,
      key: STREAMTAPE_KEY,
      url: url,
      folder: STREAMTAPE_FOLDER_ID,
    };

    if (name) {
      params.name = name;
    }

    const response = await axios.get(streamtapeRemoteDlUrl, { params });

    if (response.data.status === 200 && response.data.result) {
      console.log(
        `Remote upload initiated for URL: ${url}. Streamtape ID: ${response.data.result.id}`
      );
      res.status(200).json({
        success: true,
        message: "Remote upload initiated successfully.",
        remoteUploadId: response.data.result.id,
        folderId: response.data.result.folderid,
      });
    } else {
      console.error("Streamtape Remote DL API error (add):", response.data.msg);
      res.status(response.data.status || 500).json({
        success: false,
        message: response.data.msg || "Failed to initiate remote upload.",
      });
    }
  } catch (error) {
    console.error(
      "Error initiating remote upload:",
      error.message,
      error.stack
    );
    res.status(500).json({
      success: false,
      message: `Server error initiating remote upload: ${error.message}`,
    });
  }
});

// Existing: Check Remote Upload Status Endpoint
app.get("/api/remote-upload-status/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const streamtapeRemoteDlStatusUrl = `${API_BASE_URL}/remotedl/status`;
    const params = {
      login: STREAMTAPE_LOGIN,
      key: STREAMTAPE_KEY,
      id: id,
    };

    const response = await axios.get(streamtapeRemoteDlStatusUrl, { params });

    if (
      response.data.status === 200 &&
      response.data.result &&
      response.data.result[id]
    ) {
      console.log(
        `Remote upload status for ID ${id}: ${response.data.result[id].status}`
      );
      res.status(200).json({
        success: true,
        status: response.data.result[id].status,
        bytesLoaded: response.data.result[id].bytes_loaded,
        bytesTotal: response.data.result[id].bytes_total,
        remoteUrl: response.data.result[id].remoteurl,
        streamtapeUrl: response.data.result[id].url,
      });
    } else if (
      response.data.status === 200 &&
      response.data.result &&
      !response.data.result[id]
    ) {
      console.warn(`Remote upload ID ${id} not found or no status available.`);
      res.status(404).json({
        success: false,
        message: "Remote upload ID not found or status not yet available.",
      });
    } else {
      console.error(
        "Streamtape Remote DL API error (status):",
        response.data.msg
      );
      res.status(response.data.status || 500).json({
        success: false,
        message:
          response.data.msg || "Failed to retrieve remote upload status.",
      });
    }
  } catch (error) {
    console.error(
      "Error checking remote upload status:",
      error.message,
      error.stack
    );
    res.status(500).json({
      success: false,
      message: `Server error checking remote upload status: ${error.message}`,
    });
  }
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
