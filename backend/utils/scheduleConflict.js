const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

const formatTime = (date) => timeFormatter.format(date).replace(/\//g, '-');

// 同一场地，前一场结束 + 布场时间不能碰到下一场开始。
// 对候选活动与既有活动，两个方向各检查一次（先发生的一方需要留出布场时间）。
function findConflicts(candidate, schedules) {
  const conflicts = [];

  for (const other of schedules) {
    const otherSetup = Number.isFinite(other.setupMinutes) ? other.setupMinutes : 0;
    const candidateSetup = Number.isFinite(candidate.setupMinutes) ? candidate.setupMinutes : 0;

    // candidate 在前：结束并留出布场时间后不能碰到 other 开始
    if (candidate.startTime.getTime() <= other.startTime.getTime() &&
        other.startTime.getTime() < candidate.endTime.getTime() + candidateSetup * 60000) {
      conflicts.push({ schedule: other, order: 'after' });
      continue;
    }

    // other 在前：结束并留出布场时间后不能碰到 candidate 开始
    if (other.startTime.getTime() <= candidate.startTime.getTime() &&
        candidate.startTime.getTime() < other.endTime.getTime() + otherSetup * 60000) {
      conflicts.push({ schedule: other, order: 'before' });
    }
  }

  return conflicts;
}

function buildConflictMessage(candidate, conflicts) {
  const lines = conflicts.map(({ schedule, order }) => {
    const setup = Number.isFinite(schedule.setupMinutes) ? schedule.setupMinutes : 0;
    const interval = `${formatTime(schedule.startTime)} - ${formatTime(schedule.endTime)}`;
    if (order === 'after') {
      const candidateSetup = Number.isFinite(candidate.setupMinutes) ? candidate.setupMinutes : 0;
      return `与活动「${schedule.title}」(${interval}) 撞场：本活动结束后需留出 ${candidateSetup} 分钟布场时间，不能晚于该活动开始`;
    }
    return `与活动「${schedule.title}」(${interval}) 撞场：该活动结束后需留出 ${setup} 分钟布场时间，本活动不能提前开始`;
  });

  return `场地「${candidate.location}」存在 ${conflicts.length} 个时间冲突，原日程未改动：\n${lines.join('\n')}`;
}

module.exports = { findConflicts, buildConflictMessage, formatTime };
