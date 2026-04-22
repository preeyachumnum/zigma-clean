"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  BlockedSlot,
  BookingDate,
  BookingRecord,
  createTimeSlots,
  DEFAULT_SERVICES,
  formatPrice,
  getBookingDates,
  Service,
  SLOT_DURATION_MINUTES,
} from "../lib/booking-data";

type ServiceFormState = {
  name: string;
  tagline: string;
  description: string;
  price: string;
};

type BlockedSlotFormState = {
  dateKey: string;
  time: string;
  reason: string;
};

const initialServiceFormState: ServiceFormState = {
  name: "",
  tagline: "",
  description: "",
  price: "",
};

async function fetchJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

export default function AdminPage() {
  const [isReady, setIsReady] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [services, setServices] = useState<Service[]>(DEFAULT_SERVICES);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [bookingDates, setBookingDates] = useState<BookingDate[]>([]);
  const [selectedDateKey, setSelectedDateKey] = useState("");
  const [serviceForm, setServiceForm] = useState(initialServiceFormState);
  const [blockedSlotForm, setBlockedSlotForm] = useState<BlockedSlotFormState>({
    dateKey: "",
    time: "08:00",
    reason: "",
  });
  const [dataError, setDataError] = useState("");

  const slotDuration = services[0]?.durationMinutes ?? SLOT_DURATION_MINUTES;
  const selectedDate =
    bookingDates.find((bookingDate) => bookingDate.key === selectedDateKey) ??
    bookingDates[0];
  const scheduleSlots = useMemo(
    () =>
      selectedDateKey
        ? createTimeSlots(selectedDateKey, slotDuration, bookings, blockedSlots, new Date())
        : [],
    [blockedSlots, bookings, selectedDateKey, slotDuration],
  );
  const bookingsForSelectedDate = bookings
    .filter((booking) => booking.dateKey === selectedDateKey)
    .sort((left, right) => left.time.localeCompare(right.time));

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      const dates = getBookingDates(10, new Date());

      if (!mounted) {
        return;
      }

      setBookingDates(dates);
      setSelectedDateKey((currentDateKey) => currentDateKey || dates[0]?.key || "");
      setBlockedSlotForm((currentForm) => ({
        ...currentForm,
        dateKey: currentForm.dateKey || dates[0]?.key || "",
      }));

      try {
        const [configPayload, bookingsPayload] = await Promise.all([
          fetchJson<{
            services?: Service[];
            blockedSlots?: BlockedSlot[];
            storageReady?: boolean;
          }>("/api/config"),
          fetchJson<{
            bookings?: BookingRecord[];
            storageReady?: boolean;
          }>("/api/bookings"),
        ]);

        if (!mounted) {
          return;
        }

        setServices(
          configPayload.services && configPayload.services.length
            ? configPayload.services
            : DEFAULT_SERVICES,
        );
        setBlockedSlots(configPayload.blockedSlots ?? []);
        setBookings(bookingsPayload.bookings ?? []);
        setStorageReady(
          Boolean(configPayload.storageReady) && Boolean(bookingsPayload.storageReady),
        );
        setDataError("");
      } catch (error) {
        if (!mounted) {
          return;
        }

        setServices(DEFAULT_SERVICES);
        setBlockedSlots([]);
        setBookings([]);
        setStorageReady(false);
        setDataError(
          error instanceof Error
            ? error.message
            : "โหลดข้อมูลหลังบ้านไม่สำเร็จ",
        );
      } finally {
        if (mounted) {
          setIsReady(true);
        }
      }
    }

    void loadData();

    return () => {
      mounted = false;
    };
  }, []);

  async function saveConfig(nextServices: Service[], nextBlockedSlots: BlockedSlot[]) {
    setIsSavingConfig(true);

    try {
      const payload = await fetchJson<{
        services?: Service[];
        blockedSlots?: BlockedSlot[];
        storageReady?: boolean;
      }>("/api/config", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          services: nextServices,
          blockedSlots: nextBlockedSlots,
        }),
      });

      setServices(payload.services ?? nextServices);
      setBlockedSlots(payload.blockedSlots ?? nextBlockedSlots);
      setStorageReady(Boolean(payload.storageReady));
      setDataError("");
    } catch (error) {
      setDataError(
        error instanceof Error ? error.message : "บันทึกข้อมูลหลังบ้านไม่สำเร็จ",
      );
    } finally {
      setIsSavingConfig(false);
    }
  }

  async function updateBookingStatus(
    bookingId: string,
    bookingStatus: BookingRecord["bookingStatus"],
  ) {
    try {
      const payload = await fetchJson<{ booking?: BookingRecord }>(
        `/api/bookings/${bookingId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ bookingStatus }),
        },
      );

      if (!payload.booking) {
        throw new Error("อัปเดตสถานะคิวไม่สำเร็จ");
      }

      setBookings((currentBookings) =>
        currentBookings.map((booking) =>
          booking.id === bookingId ? payload.booking! : booking,
        ),
      );
      setDataError("");
    } catch (error) {
      setDataError(
        error instanceof Error ? error.message : "อัปเดตสถานะคิวไม่สำเร็จ",
      );
    }
  }

  async function updatePaymentStatus(
    bookingId: string,
    paymentStatus: BookingRecord["paymentStatus"],
  ) {
    try {
      const payload = await fetchJson<{ booking?: BookingRecord }>(
        `/api/bookings/${bookingId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ paymentStatus }),
        },
      );

      if (!payload.booking) {
        throw new Error("อัปเดตสถานะการชำระเงินไม่สำเร็จ");
      }

      setBookings((currentBookings) =>
        currentBookings.map((booking) =>
          booking.id === bookingId ? payload.booking! : booking,
        ),
      );
      setDataError("");
    } catch (error) {
      setDataError(
        error instanceof Error
          ? error.message
          : "อัปเดตสถานะการชำระเงินไม่สำเร็จ",
      );
    }
  }

  async function deleteBooking(bookingId: string) {
    try {
      await fetchJson<{ ok?: boolean }>(`/api/bookings/${bookingId}`, {
        method: "DELETE",
      });

      setBookings((currentBookings) =>
        currentBookings.filter((booking) => booking.id !== bookingId),
      );
      setDataError("");
    } catch (error) {
      setDataError(
        error instanceof Error ? error.message : "ลบรายการจองไม่สำเร็จ",
      );
    }
  }

  function handleServiceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const price = Number(serviceForm.price);

    if (!serviceForm.name.trim() || Number.isNaN(price) || price <= 0) {
      setDataError("กรุณากรอกชื่อบริการและราคาให้ถูกต้อง");
      return;
    }

    const nextServices = [
      ...services,
      {
        id: `service-${Date.now()}`,
        name: serviceForm.name.trim(),
        tagline: serviceForm.tagline.trim() || "บริการใหม่",
        description:
          serviceForm.description.trim() || "แก้ไขรายละเอียดเพิ่มเติมได้ภายหลัง",
        durationMinutes: SLOT_DURATION_MINUTES,
        price,
        active: true,
      },
    ];

    void saveConfig(nextServices, blockedSlots);
    setServiceForm(initialServiceFormState);
  }

  function toggleService(serviceId: string) {
    const nextServices = services.map((service) =>
      service.id === serviceId ? { ...service, active: !service.active } : service,
    );

    void saveConfig(nextServices, blockedSlots);
  }

  function removeService(serviceId: string) {
    const nextServices = services.filter((service) => service.id !== serviceId);
    void saveConfig(nextServices, blockedSlots);
  }

  function handleBlockedSlotSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!blockedSlotForm.dateKey || !blockedSlotForm.reason.trim()) {
      setDataError("กรุณาเลือกวัน เวลา และเหตุผลในการปิดรับ");
      return;
    }

    const nextBlockedSlots = [
      {
        id: `blocked-${Date.now()}`,
        dateKey: blockedSlotForm.dateKey,
        time: blockedSlotForm.time,
        reason: blockedSlotForm.reason.trim(),
      },
      ...blockedSlots,
    ];

    void saveConfig(services, nextBlockedSlots);
    setBlockedSlotForm((currentForm) => ({
      ...currentForm,
      reason: "",
    }));
  }

  function removeBlockedSlot(blockedSlotId: string) {
    const nextBlockedSlots = blockedSlots.filter(
      (blockedSlot) => blockedSlot.id !== blockedSlotId,
    );

    void saveConfig(services, nextBlockedSlots);
  }

  if (!isReady || !selectedDate) {
    return (
      <main className="min-h-screen px-4 py-6">
        <div className="mx-auto max-w-6xl space-y-4 rounded-[32px] bg-white/92 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="h-10 w-56 animate-pulse rounded-full bg-slate-200" />
          <div className="h-80 animate-pulse rounded-[28px] bg-slate-100" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-4 text-slate-900 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 pb-10">
        <section className="rounded-[32px] bg-[linear-gradient(145deg,#0f172a_0%,#1e3a8a_42%,#0f766e_120%)] p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.2)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-white/60">
                Admin Backoffice
              </p>
              <h1 className="mt-3 text-3xl font-semibold">จัดการคิวและข้อมูลระบบ</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/78">
                จัดการบริการ ดูคิวประจำวัน ปรับสถานะการจอง และปิดช่วงเวลารับจองจากหน้าเดียว
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-white/60">
                  บริการที่เปิดอยู่
                </p>
                <p className="mt-2 text-lg font-semibold">
                  {services.filter((service) => service.active).length} รายการ
                </p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-white/60">
                  คิววันนี้
                </p>
                <p className="mt-2 text-lg font-semibold">
                  {bookings.filter((booking) => booking.dateKey === bookingDates[0]?.key).length} รายการ
                </p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-white/60">
                  ปิดรับไว้
                </p>
                <p className="mt-2 text-lg font-semibold">{blockedSlots.length} ช่วง</p>
              </div>
            </div>
          </div>
        </section>

        {!storageReady ? (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            หลังบ้านจะยังบันทึกไม่ได้จนกว่าจะใส่ค่า Apps Script Web App URL และ token ในไฟล์ .env ให้ครบ
          </div>
        ) : null}

        {dataError ? (
          <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {dataError}
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
          <section className="space-y-4 rounded-[28px] border border-white/80 bg-white/92 p-4 shadow-[0_18px_52px_rgba(15,23,42,0.08)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-sky-700">
                  Queue Board
                </p>
                <h2 className="mt-1 text-2xl font-semibold">ตารางคิวรายวัน</h2>
              </div>

              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {bookingDates.slice(0, 7).map((bookingDate) => {
                  const isSelected = bookingDate.key === selectedDateKey;

                  return (
                    <button
                      key={bookingDate.key}
                      type="button"
                      onClick={() => setSelectedDateKey(bookingDate.key)}
                      className={`min-w-24 rounded-[22px] border px-4 py-3 text-left transition ${
                        isSelected
                          ? "border-slate-950 bg-slate-950 text-white"
                          : "border-slate-200 bg-white text-slate-900"
                      }`}
                    >
                      <p className="text-xs">{bookingDate.weekday}</p>
                      <p className="mt-1 text-base font-semibold">{bookingDate.label}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-slate-200">
              <div className="grid grid-cols-[1fr_0.9fr_1.4fr] bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <span>เวลา</span>
                <span>สถานะ</span>
                <span>รายละเอียด</span>
              </div>
              <div className="divide-y divide-slate-100 bg-white">
                {scheduleSlots.map((slot) => (
                  <div
                    key={slot.value}
                    className="grid grid-cols-[1fr_0.9fr_1.4fr] items-center px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{slot.startTime}</p>
                      <p className="text-xs text-slate-500">{slot.endTime}</p>
                    </div>
                    <p
                      className={
                        slot.available ? "font-medium text-emerald-700" : "font-medium text-rose-600"
                      }
                    >
                      {slot.statusLabel}
                    </p>
                    <p className="text-slate-500">
                      {slot.booking?.customerName ??
                        slot.blockedReason ??
                        (slot.isPast ? "เลยเวลาแล้ว" : "พร้อมรับจอง")}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">
                  รายการจองวันที่ {selectedDate.fullLabel}
                </h3>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {bookingsForSelectedDate.length} รายการ
                </span>
              </div>

              <div className="grid gap-3">
                {bookingsForSelectedDate.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    ยังไม่มีคิวในวันนี้
                  </div>
                ) : null}

                {bookingsForSelectedDate.map((booking) => (
                  <article
                    key={booking.id}
                    className="rounded-[24px] border border-slate-200 bg-white p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-lg font-semibold text-slate-900">
                            {booking.customerName}
                          </h4>
                          <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                            {booking.bookingStatus}
                          </span>
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                            {booking.paymentStatus}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          {booking.time} | {booking.serviceName}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {booking.carModel} | {booking.licensePlate} | {booking.phoneNumber}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {booking.paymentMethodName} | {formatPrice(booking.amount)}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => updateBookingStatus(booking.id, "confirmed")}
                          className="rounded-full bg-sky-100 px-3 py-2 text-xs font-semibold text-sky-700"
                        >
                          ยืนยัน
                        </button>
                        <button
                          type="button"
                          onClick={() => updateBookingStatus(booking.id, "completed")}
                          className="rounded-full bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-700"
                        >
                          เสร็จงาน
                        </button>
                        <button
                          type="button"
                          onClick={() => updatePaymentStatus(booking.id, "refunded")}
                          className="rounded-full bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-700"
                        >
                          คืนเงิน
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteBooking(booking.id)}
                          className="rounded-full bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-700"
                        >
                          ลบ
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <div className="space-y-4">
            <section className="rounded-[28px] border border-white/80 bg-white/92 p-4 shadow-[0_18px_52px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-sky-700">
                    Services
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold">จัดการบริการ</h2>
                </div>
                {isSavingConfig ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    กำลังบันทึก...
                  </span>
                ) : null}
              </div>

              <div className="mt-4 space-y-3">
                {services.map((service) => (
                  <div
                    key={service.id}
                    className="rounded-[24px] border border-slate-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{service.name}</p>
                        <p className="mt-1 text-sm text-slate-500">{service.tagline}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {formatPrice(service.price)} | {service.durationMinutes} นาที
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => toggleService(service.id)}
                          disabled={!storageReady || isSavingConfig}
                          className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                        >
                          {service.active ? "ซ่อน" : "เปิด"}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeService(service.id)}
                          disabled={!storageReady || isSavingConfig}
                          className="rounded-full bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50"
                        >
                          ลบ
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleServiceSubmit} className="mt-4 space-y-3">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-800">ชื่อบริการ</span>
                  <input
                    value={serviceForm.name}
                    onChange={(event) =>
                      setServiceForm((currentForm) => ({
                        ...currentForm,
                        name: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder="เช่น ล้างรถ + เคลือบยาง"
                    disabled={!storageReady || isSavingConfig}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-800">คำอธิบายสั้น</span>
                  <input
                    value={serviceForm.tagline}
                    onChange={(event) =>
                      setServiceForm((currentForm) => ({
                        ...currentForm,
                        tagline: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder="เช่น งานไว จบใน 45 นาที"
                    disabled={!storageReady || isSavingConfig}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-800">รายละเอียด</span>
                  <input
                    value={serviceForm.description}
                    onChange={(event) =>
                      setServiceForm((currentForm) => ({
                        ...currentForm,
                        description: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder="อธิบายสิ่งที่ลูกค้าจะได้รับ"
                    disabled={!storageReady || isSavingConfig}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-800">ราคา</span>
                  <input
                    value={serviceForm.price}
                    onChange={(event) =>
                      setServiceForm((currentForm) => ({
                        ...currentForm,
                        price: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder="490"
                    inputMode="numeric"
                    disabled={!storageReady || isSavingConfig}
                  />
                </label>

                <button
                  type="submit"
                  disabled={!storageReady || isSavingConfig}
                  className="w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  เพิ่มบริการใหม่
                </button>
              </form>
            </section>

            <section className="rounded-[28px] border border-white/80 bg-white/92 p-4 shadow-[0_18px_52px_rgba(15,23,42,0.08)]">
              <p className="text-xs uppercase tracking-[0.24em] text-sky-700">
                Slot Control
              </p>
              <h2 className="mt-1 text-2xl font-semibold">ปิดช่วงเวลารับจอง</h2>

              <form onSubmit={handleBlockedSlotSubmit} className="mt-4 space-y-3">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-800">วันที่</span>
                  <select
                    value={blockedSlotForm.dateKey}
                    onChange={(event) =>
                      setBlockedSlotForm((currentForm) => ({
                        ...currentForm,
                        dateKey: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    disabled={!storageReady || isSavingConfig}
                  >
                    {bookingDates.map((bookingDate) => (
                      <option key={bookingDate.key} value={bookingDate.key}>
                        {bookingDate.fullLabel}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-800">เวลา</span>
                  <select
                    value={blockedSlotForm.time}
                    onChange={(event) =>
                      setBlockedSlotForm((currentForm) => ({
                        ...currentForm,
                        time: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    disabled={!storageReady || isSavingConfig}
                  >
                    {scheduleSlots.map((slot) => (
                      <option key={slot.value} value={slot.value}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-800">เหตุผล</span>
                  <input
                    value={blockedSlotForm.reason}
                    onChange={(event) =>
                      setBlockedSlotForm((currentForm) => ({
                        ...currentForm,
                        reason: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder="เช่น พักทีมงาน / ล้างเครื่อง / งานพิเศษ"
                    disabled={!storageReady || isSavingConfig}
                  />
                </label>

                <button
                  type="submit"
                  disabled={!storageReady || isSavingConfig}
                  className="w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  เพิ่มช่วงเวลาปิดรับ
                </button>
              </form>

              <div className="mt-4 space-y-3">
                {blockedSlots.map((blockedSlot) => (
                  <div
                    key={blockedSlot.id}
                    className="rounded-[24px] border border-slate-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {blockedSlot.dateKey} เวลา {blockedSlot.time}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {blockedSlot.reason}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeBlockedSlot(blockedSlot.id)}
                        disabled={!storageReady || isSavingConfig}
                        className="rounded-full bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50"
                      >
                        ลบ
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
