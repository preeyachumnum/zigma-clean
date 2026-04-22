import { NextResponse } from "next/server";
import {
  createBooking,
  isAppsScriptConfigured,
  listBookings,
} from "../../lib/server/apps-script";
import {
  BookingRecord,
  dateKeyFromDate,
  getBangkokNow,
  timeToMinutes,
} from "../../lib/booking-data";

export async function GET(request: Request) {
  if (!isAppsScriptConfigured()) {
    return NextResponse.json({
      bookings: [],
      storageReady: false,
      error:
        "Google Apps Script is not configured yet. Set GOOGLE_APPS_SCRIPT_URL in .env to enable booking history.",
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const customerKey = searchParams.get("customerKey");
    const payload = await listBookings(customerKey ?? undefined);

    return NextResponse.json({
      bookings: payload.bookings,
      storageReady: payload.storageReady,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch bookings from Google Apps Script",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!isAppsScriptConfigured()) {
    return NextResponse.json(
      {
        error:
          "Google Apps Script is not configured yet. Set GOOGLE_APPS_SCRIPT_URL in .env before accepting bookings.",
      },
      { status: 503 },
    );
  }

  try {
    const booking = (await request.json()) as BookingRecord;

    if (!booking.id || !booking.reference || !booking.time || !booking.dateKey) {
      return NextResponse.json(
        { error: "Booking payload is incomplete" },
        { status: 400 },
      );
    }

    const bookingsPayload = await listBookings();
    const bookings = bookingsPayload.bookings;
    const bangkokNow = getBangkokNow(new Date());
    const todayKey = dateKeyFromDate(bangkokNow);
    const currentMinutes =
      bangkokNow.getUTCHours() * 60 + bangkokNow.getUTCMinutes();
    const duplicatedSlot = bookings.find(
      (currentBooking) =>
        currentBooking.dateKey === booking.dateKey &&
        currentBooking.time === booking.time &&
        currentBooking.bookingStatus !== "cancelled",
    );

    if (
      booking.dateKey < todayKey ||
      (booking.dateKey === todayKey &&
        timeToMinutes(booking.time) < currentMinutes)
    ) {
      return NextResponse.json(
        { error: "This slot is already in the past" },
        { status: 400 },
      );
    }

    if (duplicatedSlot) {
      return NextResponse.json(
        { error: "This slot has already been booked" },
        { status: 409 },
      );
    }

    const savedBooking = await createBooking(booking);

    return NextResponse.json({ booking: savedBooking }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save booking to Google Apps Script",
      },
      { status: 500 },
    );
  }
}
