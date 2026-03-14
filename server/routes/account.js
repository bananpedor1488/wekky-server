const express = require('express');
const UserState = require('../models/UserState');
const { authRequired } = require('../middleware/authRequired');

const router = express.Router();

router.get('/state', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const doc = await UserState.findOne({ userId }).lean();
    return res.json({ success: true, data: doc?.data || {} });
  } catch (error) {
    console.error('Get state error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/state', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const data = req.body || {};

    const doc = await UserState.findOneAndUpdate(
      { userId },
      { $set: { data } },
      { new: true, upsert: true }
    ).lean();

    return res.json({ success: true, data: doc.data });
  } catch (error) {
    console.error('Update state error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
