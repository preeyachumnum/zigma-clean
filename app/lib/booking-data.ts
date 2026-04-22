export type Service = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  durationMinutes: number;
  price: number;
  active: boolean;
};

export type BookingDate = {
  key: string;
  label: string;
  weekday: string;
  fullLabel: string;
  isToday: boolean;
};

export type PaymentMethod = {
  id: string;
  name: string;
  description: string;
  badge: string;
};

export type BookingRecord = {
  id: string;
  sheetRowNumber?: number;
  reference: string;
  customerKey: string;
  customerName: string;
  lineName?: string;
  phoneNumber: string;
  carModel: string;
  licensePlate: string;
  serviceId: string;
  serviceName: string;
  dateKey: string;
  dateLabel: string;
  time: string;
  endTime: string;
  paymentMethodId: string;
  paymentMethodName: string;
  amount: number;
  paymentStatus: "pending" | "paid" | "refunded";
  bookingStatus: "pending" | "confirmed" | "completed" | "cancelled";
  createdAt: string;
  qrPayload: string;
};

export type BlockedSlot = {
  id: string;
  dateKey: string;
  time: string;
  reason: string;
};

export type TimeSlot = {
  value: string;
  label: string;
  startTime: string;
  endTime: string;
  available: boolean;
  isPast: boolean;
  booking?: BookingRecord;
  blockedReason?: string;
  statusLabel: string;
};

export type AppConfig = {
  services: Service[];
  blockedSlots: BlockedSlot[];
};

export const OPEN_HOUR = 8;
export const CLOSE_HOUR = 20;
export const SLOT_DURATION_MINUTES = 45;

export const DEFAULT_SERVICES: Service[] = [
  {
    id: "basic-wash",
    name: "ล้างรถปกติ",
    tagline: "ล้างภายนอกพร้อมเช็ดแห้ง",
    description: "เหมาะกับลูกค้าที่ต้องการล้างรถแบบรวดเร็วและนัดคิวล่วงหน้าได้ทันที",
    durationMinutes: SLOT_DURATION_MINUTES,
    price: 350,
    active: true,
  },
  {
    id: "wash-vacuum",
    name: "ล้างรถ + ดูดฝุ่น",
    tagline: "ครบทั้งภายนอกและภายใน",
    description: "ล้างสี เช็ดแห้ง ดูดฝุ่นภายใน และเก็บรายละเอียดจุดใช้งานหลัก",
    durationMinutes: SLOT_DURATION_MINUTES,
    price: 490,
    active: true,
  },
  {
    id: "premium-wash",
    name: "Premium Wash",
    tagline: "ล้างรถพร้อมเคลือบเงาเบื้องต้น",
    description: "เหมาะกับลูกค้าที่ต้องการงานเนี้ยบขึ้นและภาพรวมรถดูพร้อมใช้งานทันที",
    durationMinutes: SLOT_DURATION_MINUTES,
    price: 690,
    active: true,
  },
];

export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "promptpay",
    name: "PromptPay QR",
    description: "ชำระผ่านคิวอาร์ก่อนยืนยันการจอง",
    badge: "แนะนำ",
  },
  {
    id: "credit-card",
    name: "บัตรเครดิต / เดบิต",
    description: "เตรียมไว้สำหรับต่อ payment gateway ในรอบถัดไป",
    badge: "ออนไลน์",
  },
];

const THAI_MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

const THAI_WEEKDAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const BANGKOK_OFFSET_IN_MILLISECONDS = 7 * 60 * 60 * 1000;

const CURRENCY_FORMATTER = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function getBangkokNow(referenceDate = new Date()) {
  const bangkokDate = new Date(
    referenceDate.getTime() + BANGKOK_OFFSET_IN_MILLISECONDS,
  );

  return new Date(
    Date.UTC(
      bangkokDate.getUTCFullYear(),
      bangkokDate.getUTCMonth(),
      bangkokDate.getUTCDate(),
      bangkokDate.getUTCHours(),
      bangkokDate.getUTCMinutes(),
      bangkokDate.getUTCSeconds(),
      bangkokDate.getUTCMilliseconds(),
    ),
  );
}

export function createDayAnchor(referenceDate = new Date()) {
  const bangkokDate = getBangkokNow(referenceDate);

  return new Date(
    Date.UTC(
      bangkokDate.getUTCFullYear(),
      bangkokDate.getUTCMonth(),
      bangkokDate.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
}

export function dateKeyFromDate(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function weekdayLabel(date: Date) {
  return THAI_WEEKDAYS[date.getUTCDay()];
}

function shortDateLabel(date: Date) {
  return `${date.getUTCDate()} ${THAI_MONTHS[date.getUTCMonth()]}`;
}

export function getBookingDates(totalDays = 7, referenceDate = new Date()) {
  const today = createDayAnchor(referenceDate);
  const todayKey = dateKeyFromDate(today);

  return Array.from({ length: totalDays }, (_, index) => {
    const currentDate = new Date(today);
    currentDate.setUTCDate(today.getUTCDate() + index);

    const key = dateKeyFromDate(currentDate);
    const weekday = index === 0 ? "วันนี้" : weekdayLabel(currentDate);
    const label = shortDateLabel(currentDate);

    return {
      key,
      label,
      weekday,
      fullLabel: `${weekday} ${label}`,
      isToday: key === todayKey,
    };
  });
}

export function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${pad(hours)}:${pad(minutes)}`;
}

export function createTimeSlots(
  dateKey: string,
  durationMinutes: number,
  bookings: BookingRecord[],
  blockedSlots: BlockedSlot[],
  now = new Date(),
) {
  const slots: TimeSlot[] = [];
  const currentBangkokDate = getBangkokNow(now);
  const currentDateKey = dateKeyFromDate(currentBangkokDate);
  const currentMinutes =
    currentBangkokDate.getUTCHours() * 60 + currentBangkokDate.getUTCMinutes();

  for (
    let startMinutes = OPEN_HOUR * 60;
    startMinutes + durationMinutes <= CLOSE_HOUR * 60;
    startMinutes += durationMinutes
  ) {
    const startTime = minutesToTime(startMinutes);
    const endTime = minutesToTime(startMinutes + durationMinutes);
    const blockedSlot = blockedSlots.find(
      (slot) => slot.dateKey === dateKey && slot.time === startTime,
    );
    const slotBooking = bookings.find(
      (booking) =>
        booking.dateKey === dateKey &&
        booking.time === startTime &&
        booking.bookingStatus !== "cancelled",
    );
    const isPast = dateKey === currentDateKey && startMinutes < currentMinutes;
    const available = !blockedSlot && !slotBooking && !isPast;

    slots.push({
      value: startTime,
      label: `${startTime} - ${endTime}`,
      startTime,
      endTime,
      available,
      isPast,
      booking: slotBooking,
      blockedReason: blockedSlot?.reason,
      statusLabel: blockedSlot
        ? `ปิดรับ: ${blockedSlot.reason}`
        : slotBooking
          ? "จองแล้ว"
          : isPast
            ? "เลยเวลาแล้ว"
            : "ว่าง",
    });
  }

  return slots;
}

export function formatPrice(amount: number) {
  return CURRENCY_FORMATTER.format(amount);
}

export function createBookingReference(referenceDate = new Date()) {
  const bangkokDate = getBangkokNow(referenceDate);

  return `CW-${bangkokDate.getUTCFullYear()}${pad(
    bangkokDate.getUTCMonth() + 1,
  )}${pad(bangkokDate.getUTCDate())}-${pad(
    bangkokDate.getUTCHours(),
  )}${pad(bangkokDate.getUTCMinutes())}${pad(bangkokDate.getUTCSeconds())}`;
}

export function createBookingId(referenceDate = new Date()) {
  return `booking-${createBookingReference(referenceDate)}`;
}

export function createQrPayload(
  booking: Pick<
    BookingRecord,
    | "reference"
    | "customerName"
    | "serviceName"
    | "dateLabel"
    | "time"
    | "licensePlate"
  >,
) {
  return JSON.stringify({
    bookingRef: booking.reference,
    customerName: booking.customerName,
    serviceName: booking.serviceName,
    dateLabel: booking.dateLabel,
    time: booking.time,
    licensePlate: booking.licensePlate,
  });
}

export function getServiceById(services: Service[], serviceId: string) {
  return services.find((service) => service.id === serviceId) ?? services[0];
}
