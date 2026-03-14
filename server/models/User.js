const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, default: '', trim: true },
    bio: { type: String, default: '', trim: true },
    avatarUrl: { type: String, default: '', trim: true },
    avatarBase64: { type: String, default: '' },
    bannerBase64: { type: String, default: '' },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: [] }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: [] }],
    privacy: {
      likesPublic: { type: Boolean, default: true },
      playlistsPublic: { type: Boolean, default: true }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
