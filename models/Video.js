import mongoose from 'mongoose';

const videoSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: { type: String },
  visibility:  { type: String, enum: ['public', 'private', 'unlisted'], default: 'public' },
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  fileId:      { type: String, required: true },
  streamUrl:   { type: String },
  downloadUrl: { type: String },
}, { timestamps: true });

export default mongoose.model('Video', videoSchema);