import { NextResponse } from "next/server";
import {
  updateBooking,
  deleteBooking,
} from "../../../lib/server/apps-script";
import { BookingRecord } from "../../../lib/booking-data";

type Context = {
  params: Promise<{
    bookingId: string;
  }>;
};

export async function PATCH(request: Request, context: Context) {
  try {
    const { bookingId } = await context.params;
    const payload = (await request.json()) as Partial<BookingRecord>;

    const booking = await updateBooking(bookingId, {
      paymentStatus: payload.paymentStatus,
      bookingStatus: payload.bookingStatus,
    });

    return NextResponse.json({ booking });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update booking",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { bookingId } = await context.params;
    await deleteBooking(bookingId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete booking",
      },
      { status: 500 },
    );
  }
}
