const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';

const shanghaiFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: SHANGHAI_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const SQLITE_UTC_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

const parseDateInput = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  // SQLite DATETIME values are often UTC without timezone marker.
  if (SQLITE_UTC_PATTERN.test(raw)) {
    return new Date(raw.replace(' ', 'T') + 'Z');
  }

  return new Date(raw);
};

export const formatDateTimeCn = (value?: string | null) => {
  if (!value) return '-';
  const date = parseDateInput(value);
  if (!date || Number.isNaN(date.getTime())) return String(value);
  return shanghaiFormatter.format(date);
};
