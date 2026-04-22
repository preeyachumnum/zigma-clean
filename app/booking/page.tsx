"use client";

import liff from "@line/liff";
import Image from "next/image";
import QRCode from "qrcode";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  BlockedSlot,
  BookingDate,
  BookingRecord,
  createBookingId,
  createBookingReference,
  createQrPayload,
  createTimeSlots,
  DEFAULT_SERVICES,
  formatPrice,
  getBookingDates,
  getServiceById,
  PaymentMethod,
  PAYMENT_METHODS,
  Service,
  TimeSlot,
} from "../lib/booking-data";

type LiffProfile = {
  displayName: string;
  pictureUrl?: string;
  userId?: string;
};

type BookingFormState = {
  customerName: string;
  phoneNumber: string;
  carModel: string;
  licensePlate: string;
};

type PaymentDraft = {
  customerKey: string;
  customerName: string;
  phoneNumber: string;
  carModel: string;
  licensePlate: string;
  serviceId: string;
  serviceName: string;
  amount: number;
  dateKey: string;
  dateLabel: string;
  time: string;
  endTime: string;
  lineName?: string;
};

type ConfirmationState = {
  booking: BookingRecord;
  qrCodeDataUrl: string;
};

type LiffState = {
  status: "loading" | "ready" | "guest" | "error";
  profile?: LiffProfile;
  errorMessage?: string;
};

const initialFormState: BookingFormState = {
  customerName: "",
  phoneNumber: "",
  carModel: "",
  licensePlate: "",
};

function normalizePhoneNumber(phoneNumber: string) {
  return phoneNumber.replace(/[^\d]/g, "");
}

function getCustomerKey(profile?: LiffProfile) {
  if (profile?.userId) {
    return `line-user:${profile.userId}`;
  }

  if (profile?.displayName) {
    return `line-name:${profile.displayName}`;
  }

  return "browser-guest";
}

async function fetchJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

export default function BookingPage() {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  const [isReady, setIsReady] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [services, setServices] = useState<Service[]>(DEFAULT_SERVICES);
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [bookingDates, setBookingDates] = useState<BookingDate[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedDateKey, setSelectedDateKey] = useState("");
  const [selectedPaymentId, setSelectedPaymentId] = useState(
    PAYMENT_METHODS[0].id,
  );
  const [liffState, setLiffState] = useState<LiffState>({
    status: "loading",
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [bookingForm, setBookingForm] = useState(initialFormState);
  const [modalError, setModalError] = useState("");
  const [flowStep, setFlowStep] = useState<"browse" | "payment" | "confirmation">(
    "browse",
  );
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [dataError, setDataError] = useState("");

  const activeServices = useMemo(
    () => services.filter((service) => service.active),
    [services],
  );
  const serviceOptions = activeServices.length ? activeServices : services;
  const selectedService =
    getServiceById(serviceOptions, selectedServiceId) ?? serviceOptions[0];
  const selectedDate =
    bookingDates.find((bookingDate) => bookingDate.key === selectedDateKey) ??
    bookingDates[0];
  const currentCustomerKey = getCustomerKey(liffState.profile);
  const customerHistory = useMemo(
    () =>
      bookings
        .filter((booking) => booking.customerKey === currentCustomerKey)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [bookings, currentCustomerKey],
  );
  const latestBooking = customerHistory[0];
  const timeSlots = useMemo(() => {
    if (!selectedDateKey || !selectedService) {
      return [];
    }

    return createTimeSlots(
      selectedDateKey,
      selectedService.durationMinutes,
      bookings,
      blockedSlots,
      new Date(),
    );
  }, [blockedSlots, bookings, selectedDateKey, selectedService]);
  const visibleTimeSlots = timeSlots.filter((slot) => !slot.isPast);
  const selectedPayment =
    PAYMENT_METHODS.find((paymentMethod) => paymentMethod.id === selectedPaymentId) ??
    PAYMENT_METHODS[0];

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      const dates = getBookingDates(7, new Date());

      if (!mounted) {
        return;
      }

      setBookingDates(dates);
      setSelectedDateKey((currentDateKey) => currentDateKey || dates[0]?.key || "");

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

        const nextServices =
          configPayload.services && configPayload.services.length
            ? configPayload.services
            : DEFAULT_SERVICES;

        setServices(nextServices);
        setBlockedSlots(configPayload.blockedSlots ?? []);
        setBookings(bookingsPayload.bookings ?? []);
        setSelectedServiceId(
          (currentServiceId) =>
            currentServiceId || nextServices.find((service) => service.active)?.id || "",
        );
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
        setSelectedServiceId(
          (currentServiceId) =>
            currentServiceId || DEFAULT_SERVICES.find((service) => service.active)?.id || "",
        );
        setStorageReady(false);
        setDataError(
          error instanceof Error
            ? error.message
            : "โหลดข้อมูลระบบจองไม่สำเร็จ",
        );
      } finally {
        if (mounted) {
          setIsReady(true);
        }
      }
    }

    async function initializeLiff() {
      if (!liffId) {
        if (mounted) {
          setLiffState({ status: "guest" });
        }
        return;
      }

      try {
        await liff.init({
          liffId,
          withLoginOnExternalBrowser: false,
        });

        if (!mounted) {
          return;
        }

        if (!liff.isLoggedIn()) {
          setLiffState({ status: "guest" });
          return;
        }

        const profile = await liff.getProfile();

        if (!mounted) {
          return;
        }

        setLiffState({
          status: "ready",
          profile: {
            displayName: profile.displayName,
            pictureUrl: profile.pictureUrl,
            userId: profile.userId,
          },
        });
      } catch (error) {
        if (mounted) {
          setLiffState({
            status: "error",
            errorMessage:
              error instanceof Error
                ? error.message
                : "เชื่อมต่อ LINE ไม่สำเร็จ",
          });
        }
      }
    }

    void loadData();
    void initializeLiff();

    return () => {
      mounted = false;
    };
  }, [liffId]);

  function openBookingModal(slot: TimeSlot) {
    setSelectedSlot(slot);
    setModalError("");
    setBookingForm({
      customerName: liffState.profile?.displayName || latestBooking?.customerName || "",
      phoneNumber: latestBooking?.phoneNumber || "",
      carModel: latestBooking?.carModel || "",
      licensePlate: latestBooking?.licensePlate || "",
    });
    setIsModalOpen(true);
  }

  function closeBookingModal() {
    setIsModalOpen(false);
    setModalError("");
  }

  function updateBookingForm<K extends keyof BookingFormState>(
    key: K,
    value: BookingFormState[K],
  ) {
    setBookingForm((currentForm) => ({
      ...currentForm,
      [key]: value,
    }));
  }

  function submitBookingDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedService || !selectedDate || !selectedSlot) {
      setModalError("ไม่พบบริการหรือช่วงเวลาที่เลือก");
      return;
    }

    const customerName =
      bookingForm.customerName.trim() ||
      liffState.profile?.displayName ||
      latestBooking?.customerName ||
      "ลูกค้า LINE";
    const phoneNumber = normalizePhoneNumber(bookingForm.phoneNumber);

    if (phoneNumber.length < 9) {
      setModalError("กรุณากรอกเบอร์โทรให้ครบถ้วน");
      return;
    }

    if (!bookingForm.carModel.trim()) {
      setModalError("กรุณากรอกรุ่นรถ");
      return;
    }

    if (!bookingForm.licensePlate.trim()) {
      setModalError("กรุณากรอกทะเบียนรถ");
      return;
    }

    setPaymentDraft({
      customerKey: currentCustomerKey,
      customerName,
      phoneNumber,
      carModel: bookingForm.carModel.trim(),
      licensePlate: bookingForm.licensePlate.trim(),
      serviceId: selectedService.id,
      serviceName: selectedService.name,
      amount: selectedService.price,
      dateKey: selectedDate.key,
      dateLabel: selectedDate.fullLabel,
      time: selectedSlot.startTime,
      endTime: selectedSlot.endTime,
      lineName: liffState.profile?.displayName,
    });
    setFlowStep("payment");
    closeBookingModal();
  }

  async function completePayment(paymentMethod: PaymentMethod) {
    if (!paymentDraft) {
      return;
    }

    setIsProcessingPayment(true);

    try {
      const createdAt = new Date().toISOString();
      const reference = createBookingReference(new Date());
      const booking: BookingRecord = {
        id: createBookingId(new Date()),
        reference,
        customerKey: paymentDraft.customerKey,
        customerName: paymentDraft.customerName,
        lineName: paymentDraft.lineName,
        phoneNumber: paymentDraft.phoneNumber,
        carModel: paymentDraft.carModel,
        licensePlate: paymentDraft.licensePlate,
        serviceId: paymentDraft.serviceId,
        serviceName: paymentDraft.serviceName,
        dateKey: paymentDraft.dateKey,
        dateLabel: paymentDraft.dateLabel,
        time: paymentDraft.time,
        endTime: paymentDraft.endTime,
        paymentMethodId: paymentMethod.id,
        paymentMethodName: paymentMethod.name,
        amount: paymentDraft.amount,
        paymentStatus: "paid",
        bookingStatus: "confirmed",
        createdAt,
        qrPayload: createQrPayload({
          reference,
          customerName: paymentDraft.customerName,
          serviceName: paymentDraft.serviceName,
          dateLabel: paymentDraft.dateLabel,
          time: paymentDraft.time,
          licensePlate: paymentDraft.licensePlate,
        }),
      };

      const payload = await fetchJson<{ booking?: BookingRecord }>("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(booking),
      });

      if (!payload.booking) {
        throw new Error("บันทึกการจองไม่สำเร็จ");
      }

      const savedBooking = payload.booking;
      setBookings((currentBookings) => [savedBooking, ...currentBookings]);

      const qrCodeDataUrl = await QRCode.toDataURL(savedBooking.qrPayload, {
        width: 220,
        margin: 1,
        color: {
          dark: "#0f172a",
          light: "#ffffff",
        },
      });

      setConfirmation({
        booking: savedBooking,
        qrCodeDataUrl,
      });
      setFlowStep("confirmation");
      setPaymentDraft(null);
      setDataError("");
    } catch (error) {
      setDataError(
        error instanceof Error ? error.message : "ยืนยันการชำระเงินไม่สำเร็จ",
      );
    } finally {
      setIsProcessingPayment(false);
    }
  }

  function resetToBrowse() {
    setFlowStep("browse");
    setPaymentDraft(null);
    setConfirmation(null);
    setSelectedPaymentId(PAYMENT_METHODS[0].id);
  }

  if (!isReady || !selectedService || !selectedDate) {
    return (
      <main className="min-h-screen px-4 py-6">
        <div className="mx-auto max-w-md space-y-4 rounded-[32px] bg-white/92 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="h-7 w-40 animate-pulse rounded-full bg-slate-200" />
          <div className="h-24 animate-pulse rounded-[24px] bg-slate-100" />
          <div className="h-80 animate-pulse rounded-[24px] bg-slate-100" />
        </div>
      </main>
    );
  }

  const availableTimeSlots = visibleTimeSlots.filter((slot) => slot.available);

  return (
    <main className="min-h-screen bg-transparent px-4 py-4 text-slate-900 sm:px-6">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 pb-10">
        <section className="px-1 pt-2">
          <div className="inline-flex rounded-full border border-slate-200/80 bg-white/75 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 shadow-[0_8px_24px_rgba(15,23,42,0.05)] backdrop-blur">
            Zigma Carcare
          </div>
          <h1 className="mt-3 text-[34px] font-semibold leading-[1.05] text-slate-950">
            จองคิวล้างรถ
          </h1>
          {liffState.status === "ready" && liffState.profile ? (
            <p className="mt-2 text-sm text-slate-500">
              ใช้ชื่อ LINE: {liffState.profile.displayName}
            </p>
          ) : null}
          {liffState.status === "error" ? (
            <p className="mt-2 text-sm text-amber-700">
              {liffState.errorMessage || "เชื่อมต่อ LINE ไม่สำเร็จ"}
            </p>
          ) : null}
          {!storageReady ? (
            <p className="mt-2 text-sm text-amber-700">
              ระบบยังไม่เชื่อม Apps Script จึงยังไม่บันทึกข้อมูลจริง
            </p>
          ) : null}
          {dataError ? (
            <p className="mt-2 text-sm text-rose-700">{dataError}</p>
          ) : null}
        </section>

        {flowStep === "browse" ? (
          <section className="space-y-4 rounded-[30px] border border-white/80 bg-white/92 p-4 shadow-[0_18px_52px_rgba(15,23,42,0.08)]">
            <div>
              <h2 className="text-[28px] font-semibold leading-tight text-slate-950">
                เลือกบริการ
              </h2>
            </div>

            <div className="grid gap-3">
              {serviceOptions.map((service) => {
                const isSelected = service.id === selectedServiceId;

                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => setSelectedServiceId(service.id)}
                    className={`rounded-[26px] border px-4 py-4 text-left transition ${
                      isSelected
                        ? "border-[#c5852c] bg-[linear-gradient(135deg,#fff5de_0%,#fffaf2_48%,#ffffff_100%)] shadow-[0_18px_38px_rgba(197,133,44,0.16)]"
                        : "border-slate-200/90 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.04)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span
                          className={`h-3 w-3 rounded-full ${
                            isSelected ? "bg-[#c5852c]" : "bg-slate-200"
                          }`}
                        />
                        <p className="text-[18px] font-semibold text-slate-950">
                          {service.name}
                        </p>
                      </div>
                      <div className="rounded-full bg-white/80 px-3 py-1 text-[17px] font-semibold text-slate-950">
                        {formatPrice(service.price)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-1">
              <h2 className="text-[28px] font-semibold leading-tight text-slate-950">
                เลือกวันและเวลา
              </h2>
            </div>

            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 no-scrollbar">
              {bookingDates.map((bookingDate) => {
                const isSelected = bookingDate.key === selectedDateKey;

                return (
                  <button
                    key={bookingDate.key}
                    type="button"
                    onClick={() => setSelectedDateKey(bookingDate.key)}
                    className={`min-w-[108px] rounded-[22px] border px-4 py-3 text-left transition ${
                      isSelected
                        ? "border-slate-950 bg-slate-950 text-white shadow-[0_16px_28px_rgba(15,23,42,0.18)]"
                        : "border-slate-200/90 bg-white text-slate-900 shadow-[0_6px_18px_rgba(15,23,42,0.04)]"
                    }`}
                  >
                    <p className="text-xs">{bookingDate.weekday}</p>
                    <p className="mt-1 text-base font-semibold">{bookingDate.label}</p>
                  </button>
                );
              })}
            </div>

            <div className="rounded-[28px] border border-[#efe5d8] bg-[linear-gradient(180deg,#fffaf3_0%,#ffffff_100%)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <div className="flex items-center justify-between gap-3 px-1">
                <p className="text-sm font-semibold text-slate-900">{selectedDate.fullLabel}</p>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#a56a1d] shadow-[0_4px_10px_rgba(15,23,42,0.05)]">
                  {availableTimeSlots.length} slot
                </span>
              </div>

              {availableTimeSlots.length > 0 ? (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {availableTimeSlots.map((slot) => (
                    <button
                      key={slot.value}
                      type="button"
                      disabled={!slot.available}
                      onClick={() => openBookingModal(slot)}
                      className="rounded-[24px] border border-white bg-white px-4 py-4 text-left shadow-[0_12px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-[#d8b07a] hover:shadow-[0_18px_28px_rgba(15,23,42,0.1)]"
                    >
                      <p className="text-[28px] font-semibold leading-none text-slate-950">
                        {slot.startTime}
                      </p>
                      <p className="mt-2 text-sm text-slate-500">{slot.endTime}</p>
                      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#c5852c]">
                        จอง
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-[22px] bg-white px-4 py-5 text-sm text-slate-500 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                  ไม่มีช่วงเวลาที่จองได้สำหรับวันที่เลือก
                </div>
              )}
            </div>
          </section>
        ) : null}

        {flowStep === "payment" && paymentDraft ? (
          <section className="space-y-4 rounded-[28px] border border-white/80 bg-white/94 p-4 shadow-[0_16px_48px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-slate-950">ชำระเงิน</h2>
                <p className="mt-1 text-sm text-slate-500">ตรวจสอบข้อมูลแล้วกดยืนยันได้เลย</p>
              </div>
              <button
                type="button"
                onClick={() => setFlowStep("browse")}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                ย้อนกลับ
              </button>
            </div>

            <div className="rounded-[24px] bg-slate-950 p-5 text-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-white/68">ยอดชำระ</p>
                  <p className="mt-1 text-4xl font-semibold">
                    {formatPrice(paymentDraft.amount)}
                  </p>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/84">
                  {selectedPayment.name}
                </span>
              </div>

              <div className="mt-4 grid gap-2 text-sm text-white/78">
                <p>{paymentDraft.serviceName}</p>
                <p>
                  {paymentDraft.dateLabel} • {paymentDraft.time} - {paymentDraft.endTime}
                </p>
                <p>{paymentDraft.customerName}</p>
                <p>
                  {paymentDraft.carModel} • {paymentDraft.licensePlate}
                </p>
              </div>
            </div>

            <div className="grid gap-3">
              {PAYMENT_METHODS.map((paymentMethod) => {
                const isSelected = paymentMethod.id === selectedPaymentId;

                return (
                  <button
                    key={paymentMethod.id}
                    type="button"
                    onClick={() => setSelectedPaymentId(paymentMethod.id)}
                    className={`rounded-[24px] border px-4 py-4 text-left transition ${
                      isSelected
                        ? "border-emerald-300 bg-emerald-50 shadow-[0_10px_24px_rgba(16,185,129,0.12)]"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">
                          {paymentMethod.name}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {paymentMethod.description}
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                        {paymentMethod.badge}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => completePayment(selectedPayment)}
              disabled={isProcessingPayment}
              className="w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {isProcessingPayment
                ? "กำลังยืนยันการชำระเงิน..."
                : "ชำระเงินเสร็จแล้ว"}
            </button>

            <p className="text-center text-xs text-slate-500">
              ยืนยันแล้วระบบจะแสดงตั๋วจองพร้อม QR code ทันที
            </p>
          </section>
        ) : null}

        {flowStep === "confirmation" && confirmation ? (
          <section className="space-y-4 rounded-[28px] border border-emerald-200 bg-white/96 p-4 shadow-[0_20px_60px_rgba(16,185,129,0.12)]">
            <div className="overflow-hidden rounded-[28px] border border-emerald-100 bg-[linear-gradient(180deg,#ffffff_0%,#f6fef8_100%)]">
              <div className="border-b border-dashed border-emerald-200 px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-emerald-700">
                      Booking Ticket
                    </p>
                    <h2 className="mt-2 text-3xl font-semibold text-slate-950">
                      จองคิวเรียบร้อย
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">
                      ใช้ QR code นี้ตอนเข้ารับบริการ
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                    พร้อมใช้
                  </span>
                </div>
              </div>

              <div className="px-5 py-5">
                <div className="rounded-[22px] bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                  <p>
                    <span className="font-semibold text-slate-950">เลขอ้างอิง:</span>{" "}
                    {confirmation.booking.reference}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-950">บริการ:</span>{" "}
                    {confirmation.booking.serviceName}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-950">วันเวลา:</span>{" "}
                    {confirmation.booking.dateLabel} เวลา {confirmation.booking.time}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-950">ลูกค้า:</span>{" "}
                    {confirmation.booking.customerName}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-950">รถ:</span>{" "}
                    {confirmation.booking.carModel} / {confirmation.booking.licensePlate}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-950">ยอดชำระ:</span>{" "}
                    {formatPrice(confirmation.booking.amount)}
                  </p>
                </div>

                <div className="mt-4 flex flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-white p-4">
                  <Image
                    src={confirmation.qrCodeDataUrl}
                    alt="Booking QR Code"
                    width={220}
                    height={220}
                    className="h-44 w-44 rounded-2xl"
                    unoptimized
                  />
                  <p className="mt-3 text-xs font-medium tracking-[0.2em] text-slate-500">
                    SCAN AT COUNTER
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={resetToBrowse}
              className="w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              จองคิวใหม่
            </button>
          </section>
        ) : null}
      </div>

      {isModalOpen && selectedSlot ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 p-3 sm:items-center sm:justify-center">
          <div className="w-full max-w-md rounded-[32px] bg-white p-5 shadow-[0_28px_90px_rgba(15,23,42,0.2)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-semibold text-slate-950">ข้อมูลสำหรับจอง</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {selectedDate.fullLabel} • {selectedSlot.label}
                </p>
              </div>
              <button
                type="button"
                onClick={closeBookingModal}
                className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
              >
                ปิด
              </button>
            </div>

            <form onSubmit={submitBookingDetails} className="mt-5 space-y-3">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-800">ชื่อ</span>
                <input
                  value={bookingForm.customerName}
                  onChange={(event) =>
                    updateBookingForm("customerName", event.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                  placeholder={liffState.profile?.displayName ?? "ชื่อผู้จอง"}
                />
                <p className="text-xs text-slate-500">
                  เว้นว่างได้ ระบบจะใช้ชื่อ LINE หรือข้อมูลล่าสุดให้
                </p>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-800">เบอร์โทร</span>
                <input
                  value={bookingForm.phoneNumber}
                  onChange={(event) =>
                    updateBookingForm("phoneNumber", event.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                  placeholder="08x-xxx-xxxx"
                  inputMode="tel"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-800">รุ่นรถ</span>
                <input
                  value={bookingForm.carModel}
                  onChange={(event) => updateBookingForm("carModel", event.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                  placeholder="เช่น Toyota Yaris"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-800">ทะเบียนรถ</span>
                <input
                  value={bookingForm.licensePlate}
                  onChange={(event) =>
                    updateBookingForm("licensePlate", event.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                  placeholder="1กข 1234"
                />
              </label>

              {modalError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {modalError}
                </div>
              ) : null}

              <button
                type="submit"
                className="w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                ไปหน้าชำระเงิน
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
