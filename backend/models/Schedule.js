const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  location: {
    type: String,
    required: true
  },
  setupMinutes: {
    type: Number,
    default: 0,
    min: 0
  },
  expoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expo',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Schedule', scheduleSchema);
