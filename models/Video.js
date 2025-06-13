import mongoose from "mongoose";

const videoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    visibility: {
      type: String,
      enum: ["public", "unlisted", "private"],
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // adjust if your User model has a different name
      required: true,
    },
    fileId: { type: String, required: true },
    streamUrl: { type: String, required: true },
    downloadUrl: { type: String, required: true },
    size: { type: Number },
    contentType: { type: String },
  },
  { timestamps: true }
);

const Video = mongoose.models.Video || mongoose.model("Video", videoSchema);

export default Video;
