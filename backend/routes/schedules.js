const express = require('express');
const mongoose = require('mongoose');
const { auth } = require('../middleware/auth');
const Schedule = require('../models/Schedule');
const Expo = require('../models/Expo');

const router = express.Router();

const MINUTE = 60 * 1000;

// 判断同一场地的两场活动是否撞场：
// 前一场结束并留出下一场的布场时间后，不能碰到下一场开始
function isConflict(a, b) {
  const aStart = new Date(a.startTime).getTime();
  const aEnd = new Date(a.endTime).getTime();
  const bStart = new Date(b.startTime).getTime();
  const bEnd = new Date(b.endTime).getTime();
  const aSetup = (a.setupMinutes || 0) * MINUTE;
  const bSetup = (b.setupMinutes || 0) * MINUTE;

  if (aEnd + bSetup <= bStart) return false; // a 在前，已留足 b 的布场时间
  if (bEnd + aSetup <= aStart) return false; // b 在前，已留足 a 的布场时间
  return true;
}

function formatTime(t) {
  return new Date(t).toLocaleString('zh-CN', { hour12: false });
}

// 查找同一展会、同一场地下与候选活动撞场的已有活动
async function findConflicts({ expoId, location, startTime, endTime, setupMinutes, excludeId }) {
  const query = { expoId, location };
  if (excludeId) query._id = { $ne: excludeId };
  const existing = await Schedule.find(query);
  const candidate = { startTime, endTime, setupMinutes };
  return existing.filter(item => isConflict(item, candidate));
}

function conflictResponse(res, location, conflicts) {
  const names = conflicts
    .map(c => `「${c.title}」（${formatTime(c.startTime)} - ${formatTime(c.endTime)}）`)
    .join('、');
  res.status(409).json({
    message: `场地「${location}」时段冲突：与 ${names} 撞场（含布场时间），原日程未改动`,
    conflicts: conflicts.map(c => ({
      _id: c._id,
      title: c.title,
      startTime: c.startTime,
      endTime: c.endTime,
      location: c.location,
      setupMinutes: c.setupMinutes || 0
    }))
  });
}

function validateTimes(startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { error: '请填写完整的开始时间和结束时间' };
  }
  if (end <= start) {
    return { error: '结束时间早于开始时间，请调整起止时间' };
  }
  return { start, end };
}

function validateSetupMinutes(setupMinutes) {
  const value = Number(setupMinutes);
  if (isNaN(value) || value < 0) {
    return { error: '布场分钟数不能为负数' };
  }
  return { value };
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
    const { title, description, startTime, endTime, location, setupMinutes = 0, expoId } = req.body;

    if (!expoId || !mongoose.Types.ObjectId.isValid(expoId)) {
      return res.status(400).json({ message: '缺少展会信息，无法保存活动' });
    }
    const expo = await Expo.findById(expoId);
    if (!expo) {
      return res.status(400).json({ message: '活动不属于当前展会，请从对应展会的日程页添加' });
    }

    const times = validateTimes(startTime, endTime);
    if (times.error) {
      return res.status(400).json({ message: times.error });
    }

    const setup = validateSetupMinutes(setupMinutes);
    if (setup.error) {
      return res.status(400).json({ message: setup.error });
    }

    const conflicts = await findConflicts({
      expoId,
      location,
      startTime: times.start,
      endTime: times.end,
      setupMinutes: setup.value
    });
    if (conflicts.length > 0) {
      return conflictResponse(res, location, conflicts);
    }

    const schedule = new Schedule({
      title,
      description,
      startTime: times.start,
      endTime: times.end,
      location,
      setupMinutes: setup.value,
      expoId,
      createdBy: req.user._id
    });

    await schedule.save();
    res.status(201).json(schedule);
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: '活动不存在' });
    }
    const schedule = await Schedule.findById(req.params.id);
    if (!schedule) {
      return res.status(404).json({ message: '活动不存在' });
    }

    const { title, description, startTime, endTime, location, setupMinutes, expoId } = req.body;

    if (expoId && expoId !== schedule.expoId.toString()) {
      return res.status(400).json({ message: '该活动不属于当前展会，不能在此修改' });
    }

    const newStartTime = startTime !== undefined ? startTime : schedule.startTime;
    const newEndTime = endTime !== undefined ? endTime : schedule.endTime;
    const newLocation = location !== undefined ? location : schedule.location;
    const newSetupMinutes = setupMinutes !== undefined ? setupMinutes : (schedule.setupMinutes || 0);

    const times = validateTimes(newStartTime, newEndTime);
    if (times.error) {
      return res.status(400).json({ message: times.error });
    }

    const setup = validateSetupMinutes(newSetupMinutes);
    if (setup.error) {
      return res.status(400).json({ message: setup.error });
    }

    const conflicts = await findConflicts({
      expoId: schedule.expoId,
      location: newLocation,
      startTime: times.start,
      endTime: times.end,
      setupMinutes: setup.value,
      excludeId: schedule._id
    });
    if (conflicts.length > 0) {
      return conflictResponse(res, newLocation, conflicts);
    }

    if (title !== undefined) schedule.title = title;
    if (description !== undefined) schedule.description = description;
    schedule.startTime = times.start;
    schedule.endTime = times.end;
    schedule.location = newLocation;
    schedule.setupMinutes = setup.value;

    await schedule.save();
    res.json(schedule);
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error: error.message });
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
