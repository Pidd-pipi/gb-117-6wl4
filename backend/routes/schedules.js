const express = require('express');
const mongoose = require('mongoose');
const { auth } = require('../middleware/auth');
const Schedule = require('../models/Schedule');
const Expo = require('../models/Expo');
const { findConflicts, buildConflictMessage } = require('../utils/scheduleConflict');

const router = express.Router();

// 校验并整理表单数据，返回 { error } 或 { data }
function parseSchedulePayload(body) {
  const title = (body.title || '').trim();
  const location = (body.location || '').trim();
  const description = body.description || '';

  if (!title) {
    return { error: '请填写活动名称' };
  }
  if (!location) {
    return { error: '请填写场地' };
  }

  const startTime = new Date(body.startTime);
  const endTime = new Date(body.endTime);
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    return { error: '起止时间格式不正确，请重新选择' };
  }
  if (endTime.getTime() <= startTime.getTime()) {
    return { error: '结束时间必须晚于开始时间' };
  }

  let setupMinutes = 0;
  if (body.setupMinutes !== undefined && body.setupMinutes !== '') {
    setupMinutes = Number(body.setupMinutes);
    if (!Number.isInteger(setupMinutes) || setupMinutes < 0) {
      return { error: '布场分钟数必须是不小于 0 的整数' };
    }
  }

  return { data: { title, location, description, startTime, endTime, setupMinutes } };
}

router.get('/expo/:expoId', async (req, res) => {
  try {
    const schedules = await Schedule.find({ expoId: req.params.expoId }).sort({ startTime: 1 });
    res.json(schedules);
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { error, data } = parseSchedulePayload(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const expoId = req.body.expoId;
    if (!mongoose.Types.ObjectId.isValid(expoId)) {
      return res.status(400).json({ message: '活动所属展会不存在' });
    }
    const expo = await Expo.findById(expoId);
    if (!expo) {
      return res.status(400).json({ message: '活动不属于当前展会：该展会不存在' });
    }

    const sameVenue = await Schedule.find({ expoId, location: data.location });
    const conflicts = findConflicts(data, sameVenue);
    if (conflicts.length > 0) {
      return res.status(409).json({
        message: buildConflictMessage(data, conflicts),
        conflicts: conflicts.map(({ schedule }) => schedule)
      });
    }

    const schedule = new Schedule({
      ...data,
      expoId,
      createdBy: req.user._id
    });

    await schedule.save();
    res.status(201).json(schedule);
  } catch (err) {
    res.status(500).json({ message: '服务器错误', error: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const existing = await Schedule.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: '活动不存在' });
    }

    // 活动必须归属原展会，不允许通过编辑移到其他展会
    if (req.body.expoId && req.body.expoId !== existing.expoId.toString()) {
      return res.status(400).json({ message: '活动不属于当前展会，不能修改所属展会' });
    }

    const { error, data } = parseSchedulePayload(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const candidate = { ...data, expoId: existing.expoId };
    const sameVenue = await Schedule.find({
      _id: { $ne: existing._id },
      expoId: existing.expoId,
      location: data.location
    });
    const conflicts = findConflicts(candidate, sameVenue);
    if (conflicts.length > 0) {
      return res.status(409).json({
        message: buildConflictMessage(candidate, conflicts),
        conflicts: conflicts.map(({ schedule }) => schedule)
      });
    }

    existing.title = data.title;
    existing.description = data.description;
    existing.startTime = data.startTime;
    existing.endTime = data.endTime;
    existing.setupMinutes = data.setupMinutes;
    existing.location = data.location;
    await existing.save();

    res.json(existing);
  } catch (err) {
    res.status(500).json({ message: '服务器错误', error: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const schedule = await Schedule.findByIdAndDelete(req.params.id);

    if (!schedule) {
      return res.status(404).json({ message: '活动不存在' });
    }

    res.json({ message: '活动已删除' });
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

module.exports = router;
