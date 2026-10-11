import type { AppData, Appointment, Service, Settings } from "./types";

const DEFAULT_TIMEZONE = "Europe/Madrid";

export const defaultServices: Service[] = [
  {
    id: "cut",
    name: "Corte de pelo",
    description: "Degradado, clásico o tu propio estilo. Tú eliges.",
    duration: 45,
    price: 7,
    icon: "scissors",
  },
];

export const defaultSettings: Settings = {
  shopName: "Barber Cruz",
  instagram: "https://www.instagram.com/_barbercruz_/",
  timezone: DEFAULT_TIMEZONE,
  slotStep: 15,
  advanceDays: 30,
  requiredCuts: 7,
  openingHours: {
    0: { open: false, start: "10:00", end: "20:00" },
    1: { open: true, start: "10:00", end: "20:00" },
    2: { open: true, start: "10:00", end: "20:00" },
    3: { open: true, start: "10:00", end: "20:00" },
    4: { open: true, start: "10:00", end: "20:00" },
    5: { open: true, start: "10:00", end: "20:00" },
    6: { open: true, start: "10:00", end: "20:00" },
  },
};

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (name: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === name)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    minutes:
      Number(part("hour")) * 60 +
      Number(part("minute")) +
      Number(part("second")) / 60,
  };
}

/** Calendar keys use the shop timezone, independently of the browser timezone. */
export function dateKey(date: Date, timezone = DEFAULT_TIMEZONE): string {
  return zonedParts(date, timezone).date;
}

export function today(timezone = DEFAULT_TIMEZONE): string {
  return dateKey(new Date(), timezone);
}

function calendarDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const result = new Date(`${value}T12:00:00.000Z`);
  if (
    Number.isNaN(result.getTime()) ||
    result.toISOString().slice(0, 10) !== value
  )
    return undefined;
  return result;
}

/** Advance calendar days in UTC so daylight-saving changes never skip a date. */
export function addDays(dateString: string, days: number): string {
  const date = calendarDate(dateString);
  if (!date || !Number.isFinite(days)) return "";
  date.setUTCDate(date.getUTCDate() + Math.trunc(days));
  return date.toISOString().slice(0, 10);
}

export function formatDate(
  dateString: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = calendarDate(dateString);
  if (!date) return dateString;
  return new Intl.DateTimeFormat("es-ES", {
    ...(options ?? { weekday: "long", day: "numeric", month: "long" }),
    timeZone: "UTC",
  }).format(date);
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);
}

export function timeMinutes(time: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return Number.NaN;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return Number.NaN;
  return hour * 60 + minute;
}

export function minutesTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = Math.floor(minutes % 60);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export interface SlotOptions {
  now?: Date;
  excludeId?: string;
  bookedIntervals?: { time: string; duration: number }[];
}

export function getSlots(
  date: string,
  service: Service,
  data: AppData,
  options: SlotOptions = {},
): string[] {
  const calendar = calendarDate(date);
  if (!calendar || !(service.duration > 0)) return [];
  const current = zonedParts(options.now ?? new Date(), data.settings.timezone);
  const lastDate = addDays(current.date, data.settings.advanceDays);
  if (date < current.date || date > lastDate) return [];
  const hours = data.settings.openingHours[calendar.getUTCDay()];
  if (!hours?.open) return [];
  const opening = timeMinutes(hours.start);
  const closing = timeMinutes(hours.end);
  const step = data.settings.slotStep;
  if (
    !Number.isFinite(opening) ||
    !Number.isFinite(closing) ||
    !Number.isFinite(step) ||
    step <= 0
  )
    return [];

  const occupied: { start: number; end: number }[] = [];
  for (const appointment of data.appointments) {
    if (
      appointment.date !== date ||
      appointment.status === "cancelled" ||
      appointment.id === options.excludeId
    )
      continue;
    const start = timeMinutes(appointment.time);
    const bookedService = data.services.find(
      (item) => item.id === appointment.serviceId,
    );
    const duration = appointment.duration ?? bookedService?.duration ?? 45;
    occupied.push({ start, end: start + duration });
  }
  for (const block of data.blocks) {
    if (block.date === date)
      occupied.push({
        start: timeMinutes(block.start),
        end: timeMinutes(block.end),
      });
  }
  for (const interval of options.bookedIntervals ?? []) {
    const start = timeMinutes(interval.time);
    occupied.push({ start, end: start + interval.duration });
  }

  const slots: string[] = [];
  for (
    let start = opening;
    start + service.duration <= closing;
    start += step
  ) {
    if (date === current.date && start < current.minutes) continue;
    const end = start + service.duration;
    if (
      occupied.some((interval) => start < interval.end && end > interval.start)
    )
      continue;
    slots.push(minutesTime(start));
  }
  return slots;
}

export interface Loyalty {
  paidCuts: number;
  rewardsUsed: number;
  stamps: number;
  rewardsAvailable: number;
}

export function loyalty(
  profileId: string,
  appointments: Appointment[],
  requiredCuts = 7,
): Loyalty {
  const threshold =
    Number.isInteger(requiredCuts) && requiredCuts > 0 ? requiredCuts : 7;
  const own = appointments.filter(
    (appointment) => appointment.userId === profileId,
  );
  const paidCuts = own.filter(
    (appointment) =>
      appointment.status === "completed" &&
      !appointment.redemption &&
      (appointment.serviceId === "cut" || appointment.serviceId === "combo"),
  ).length;
  const rewardsUsed = own.filter(
    (appointment) =>
      appointment.status === "completed" && appointment.redemption,
  ).length;
  const reservedRewards = own.filter(
    (appointment) =>
      appointment.status === "confirmed" && appointment.redemption,
  ).length;
  const rewardsAvailable = Math.max(
    0,
    Math.floor(paidCuts / threshold) - rewardsUsed - reservedRewards,
  );
  const stamps = rewardsAvailable > 0 ? threshold : paidCuts % threshold;
  return { paidCuts, rewardsUsed, stamps, rewardsAvailable };
}

export function nextAppointment(
  profileId: string,
  appointments: Appointment[],
  now = new Date(),
  timezone = DEFAULT_TIMEZONE,
): Appointment | undefined {
  const current = zonedParts(now, timezone);
  return appointments
    .filter(
      (appointment) =>
        appointment.userId === profileId &&
        appointment.status === "confirmed" &&
        (appointment.date > current.date ||
          (appointment.date === current.date &&
            timeMinutes(appointment.time) >= current.minutes)),
    )
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
    )[0];
}

export function createDemoData(): AppData {
  return {
    profiles: [],
    appointments: [],
    services: structuredClone(defaultServices),
    settings: structuredClone(defaultSettings),
    blocks: [],
    galleryPhotos: [],
  };
}
