import {
  AppConfig,
  BlockedSlot,
  BookingRecord,
  DEFAULT_SERVICES,
  Service,
} from "../booking-data";

type AppsScriptResponse<T> = {
  ok?: boolean;
  error?: string;
  storageReady?: boolean;
} & T;

const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;
const APPS_SCRIPT_TOKEN = process.env.GOOGLE_APPS_SCRIPT_TOKEN;

function getAppsScriptUrl() {
  if (!APPS_SCRIPT_URL) {
    throw new Error(
      "Google Apps Script URL is missing. Set GOOGLE_APPS_SCRIPT_URL in .env.",
    );
  }

  return APPS_SCRIPT_URL;
}

export function isAppsScriptConfigured() {
  return Boolean(APPS_SCRIPT_URL);
}

async function parseAppsScriptResponse<T>(response: Response) {
  const rawText = await response.text();

  try {
    return JSON.parse(rawText) as AppsScriptResponse<T>;
  } catch {
    throw new Error(rawText || "Apps Script returned an invalid response");
  }
}

async function callAppsScript<T>(action: string, payload?: Record<string, unknown>) {
  const response = await fetch(getAppsScriptUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      action,
      token: APPS_SCRIPT_TOKEN,
      ...(payload ?? {}),
    }),
  });

  const parsed = await parseAppsScriptResponse<T>(response);

  if (!response.ok || parsed.ok === false) {
    throw new Error(parsed.error || "Apps Script request failed");
  }

  return parsed;
}

export async function fetchAppConfig() {
  if (!isAppsScriptConfigured()) {
    return {
      services: DEFAULT_SERVICES,
      blockedSlots: [],
      storageReady: false,
    } satisfies AppConfig & { storageReady: boolean };
  }

  const payload = await callAppsScript<{
    services?: Service[];
    blockedSlots?: BlockedSlot[];
  }>("getConfig");

  return {
    services: payload.services && payload.services.length ? payload.services : DEFAULT_SERVICES,
    blockedSlots: payload.blockedSlots ?? [],
    storageReady: true,
  };
}

export async function replaceAppConfig(config: AppConfig) {
  const payload = await callAppsScript<{
    services?: Service[];
    blockedSlots?: BlockedSlot[];
  }>("replaceConfig", config);

  return {
    services: payload.services ?? config.services,
    blockedSlots: payload.blockedSlots ?? config.blockedSlots,
    storageReady: true,
  };
}

export async function listBookings(customerKey?: string) {
  if (!isAppsScriptConfigured()) {
    return {
      bookings: [] as BookingRecord[],
      storageReady: false,
    };
  }

  const payload = await callAppsScript<{
    bookings?: BookingRecord[];
  }>("listBookings", customerKey ? { customerKey } : undefined);

  return {
    bookings: payload.bookings ?? [],
    storageReady: true,
  };
}

export async function createBooking(booking: BookingRecord) {
  const payload = await callAppsScript<{
    booking?: BookingRecord;
  }>("createBooking", { booking });

  if (!payload.booking) {
    throw new Error("Apps Script did not return a booking");
  }

  return payload.booking;
}

export async function updateBooking(
  bookingId: string,
  updates: Partial<
    Pick<BookingRecord, "paymentStatus" | "bookingStatus">
  >,
) {
  const payload = await callAppsScript<{
    booking?: BookingRecord;
  }>("updateBooking", {
    bookingId,
    updates,
  });

  if (!payload.booking) {
    throw new Error("Apps Script did not return an updated booking");
  }

  return payload.booking;
}

export async function deleteBooking(bookingId: string) {
  await callAppsScript("deleteBooking", { bookingId });
}
