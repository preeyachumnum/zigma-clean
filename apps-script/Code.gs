const DEFAULT_BOOKINGS_SHEET_NAME = 'Bookings';
const DEFAULT_SERVICES_SHEET_NAME = 'Services';
const DEFAULT_BLOCKED_SLOTS_SHEET_NAME = 'BlockedSlots';

const BOOKING_COLUMNS = [
  'id',
  'reference',
  'customerKey',
  'customerName',
  'lineName',
  'phoneNumber',
  'carModel',
  'licensePlate',
  'serviceId',
  'serviceName',
  'dateKey',
  'dateLabel',
  'time',
  'endTime',
  'paymentMethodId',
  'paymentMethodName',
  'amount',
  'paymentStatus',
  'bookingStatus',
  'createdAt',
  'qrPayload',
];

const SERVICE_COLUMNS = [
  'id',
  'name',
  'tagline',
  'description',
  'durationMinutes',
  'price',
  'active',
];

const BLOCKED_SLOT_COLUMNS = ['id', 'dateKey', 'time', 'reason'];

function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : 'health';

    if (action === 'health') {
      return jsonResponse({ ok: true, service: 'zigma-carcare-apps-script' });
    }

    return jsonResponse({ ok: false, error: 'Use POST for data operations.' });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const request = parseRequest(e);
    authorizeRequest(request);

    switch (request.action) {
      case 'getConfig':
        return jsonResponse({
          ok: true,
          services: listServices_(),
          blockedSlots: listBlockedSlots_(),
        });

      case 'replaceConfig':
        return jsonResponse(replaceConfig_(request));

      case 'listBookings':
        return jsonResponse(listBookingsResponse_(request));

      case 'createBooking':
        return jsonResponse(createBooking_(request));

      case 'updateBooking':
        return jsonResponse(updateBooking_(request));

      case 'deleteBooking':
        return jsonResponse(deleteBooking_(request));

      default:
        return jsonResponse({ ok: false, error: 'Unsupported action.' });
    }
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error && error.message ? error.message : String(error),
    });
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

function parseRequest(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Request body is missing.');
  }

  return JSON.parse(e.postData.contents);
}

function authorizeRequest(request) {
  const configuredToken = getScriptProperty_('APP_TOKEN');

  if (!configuredToken) {
    return;
  }

  if (!request.token || request.token !== configuredToken) {
    throw new Error('Unauthorized request.');
  }
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function getSpreadsheet_() {
  const spreadsheetId = getScriptProperty_('SPREADSHEET_ID');

  if (spreadsheetId) {
    return SpreadsheetApp.openById(spreadsheetId);
  }

  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!activeSpreadsheet) {
    throw new Error(
      'Spreadsheet is not configured. Set SPREADSHEET_ID in Script Properties or bind this script to a Google Sheet.',
    );
  }

  return activeSpreadsheet;
}

function getScriptProperty_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function getSheetName_(propertyKey, fallbackValue) {
  return getScriptProperty_(propertyKey) || fallbackValue;
}

function ensureSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }

  const range = sheet.getRange(1, 1, 1, headers.length);
  const values = range.getValues()[0];
  const hasExpectedHeaders = headers.every(function (header, index) {
    return values[index] === header;
  });

  if (!hasExpectedHeaders) {
    range.setValues([headers]);
  }

  return sheet;
}

function getBookingsSheet_() {
  const spreadsheet = getSpreadsheet_();
  return ensureSheet_(
    spreadsheet,
    getSheetName_('BOOKINGS_SHEET_NAME', DEFAULT_BOOKINGS_SHEET_NAME),
    BOOKING_COLUMNS,
  );
}

function getServicesSheet_() {
  const spreadsheet = getSpreadsheet_();
  return ensureSheet_(
    spreadsheet,
    getSheetName_('SERVICES_SHEET_NAME', DEFAULT_SERVICES_SHEET_NAME),
    SERVICE_COLUMNS,
  );
}

function getBlockedSlotsSheet_() {
  const spreadsheet = getSpreadsheet_();
  return ensureSheet_(
    spreadsheet,
    getSheetName_('BLOCKED_SLOTS_SHEET_NAME', DEFAULT_BLOCKED_SLOTS_SHEET_NAME),
    BLOCKED_SLOT_COLUMNS,
  );
}

function getDataRows_(sheet, width) {
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return [];
  }

  return sheet.getRange(2, 1, lastRow - 1, width).getValues();
}

function rowToBooking_(row, rowNumber) {
  return {
    sheetRowNumber: rowNumber,
    id: row[0] || '',
    reference: row[1] || '',
    customerKey: row[2] || '',
    customerName: row[3] || '',
    lineName: row[4] || undefined,
    phoneNumber: row[5] || '',
    carModel: row[6] || '',
    licensePlate: row[7] || '',
    serviceId: row[8] || '',
    serviceName: row[9] || '',
    dateKey: row[10] || '',
    dateLabel: row[11] || '',
    time: row[12] || '',
    endTime: row[13] || '',
    paymentMethodId: row[14] || '',
    paymentMethodName: row[15] || '',
    amount: Number(row[16] || 0),
    paymentStatus: row[17] || 'pending',
    bookingStatus: row[18] || 'pending',
    createdAt: row[19] || '',
    qrPayload: row[20] || '',
  };
}

function bookingToRow_(booking) {
  return [
    booking.id,
    booking.reference,
    booking.customerKey,
    booking.customerName,
    booking.lineName || '',
    booking.phoneNumber,
    booking.carModel,
    booking.licensePlate,
    booking.serviceId,
    booking.serviceName,
    booking.dateKey,
    booking.dateLabel,
    booking.time,
    booking.endTime,
    booking.paymentMethodId,
    booking.paymentMethodName,
    String(booking.amount),
    booking.paymentStatus,
    booking.bookingStatus,
    booking.createdAt,
    booking.qrPayload,
  ];
}

function serviceToRow_(service) {
  return [
    service.id,
    service.name,
    service.tagline,
    service.description,
    String(service.durationMinutes),
    String(service.price),
    String(service.active),
  ];
}

function rowToService_(row) {
  return {
    id: row[0] || '',
    name: row[1] || '',
    tagline: row[2] || '',
    description: row[3] || '',
    durationMinutes: Number(row[4] || 45),
    price: Number(row[5] || 0),
    active: row[6] !== 'false',
  };
}

function blockedSlotToRow_(blockedSlot) {
  return [
    blockedSlot.id,
    blockedSlot.dateKey,
    blockedSlot.time,
    blockedSlot.reason,
  ];
}

function rowToBlockedSlot_(row) {
  return {
    id: row[0] || '',
    dateKey: row[1] || '',
    time: row[2] || '',
    reason: row[3] || '',
  };
}

function listBookings_() {
  const sheet = getBookingsSheet_();
  const rows = getDataRows_(sheet, BOOKING_COLUMNS.length);

  return rows
    .filter(function (row) {
      return row[0];
    })
    .map(function (row, index) {
      return rowToBooking_(row, index + 2);
    });
}

function listServices_() {
  const sheet = getServicesSheet_();
  const rows = getDataRows_(sheet, SERVICE_COLUMNS.length);

  if (!rows.length) {
    const defaults = [
      {
        id: 'basic-wash',
        name: 'ล้างรถปกติ',
        tagline: 'ล้างภายนอกพร้อมเช็ดแห้ง ใช้เวลา 45 นาที',
        description: 'เหมาะกับลูกค้าที่ต้องการล้างรถแบบรวดเร็วและนัดคิวล่วงหน้าได้ทันที',
        durationMinutes: 45,
        price: 350,
        active: true,
      },
      {
        id: 'wash-vacuum',
        name: 'ล้างรถ + ดูดฝุ่น',
        tagline: 'ครบทั้งภายนอกและภายในภายใน 45 นาที',
        description: 'ล้างสี เช็ดแห้ง ดูดฝุ่นภายใน และเก็บรายละเอียดจุดใช้งานหลัก',
        durationMinutes: 45,
        price: 490,
        active: true,
      },
      {
        id: 'premium-wash',
        name: 'Premium Wash',
        tagline: 'ล้างรถพร้อมเคลือบเงาเบื้องต้นใน 45 นาที',
        description: 'เหมาะกับลูกค้าที่ต้องการงานเนี้ยบขึ้นและภาพรวมรถดูพร้อมใช้งานทันที',
        durationMinutes: 45,
        price: 690,
        active: true,
      },
    ];

    writeRows_(sheet, SERVICE_COLUMNS, defaults.map(serviceToRow_));
    return defaults;
  }

  return rows
    .filter(function (row) {
      return row[0];
    })
    .map(rowToService_);
}

function listBlockedSlots_() {
  const sheet = getBlockedSlotsSheet_();
  const rows = getDataRows_(sheet, BLOCKED_SLOT_COLUMNS.length);

  return rows
    .filter(function (row) {
      return row[0];
    })
    .map(rowToBlockedSlot_);
}

function writeRows_(sheet, headers, rows) {
  const maxRows = sheet.getMaxRows();
  const maxColumns = Math.max(headers.length, sheet.getMaxColumns());

  if (maxRows > 1) {
    sheet.getRange(2, 1, maxRows - 1, maxColumns).clearContent();
  }

  if (!rows.length) {
    return;
  }

  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

function replaceConfig_(request) {
  const services = Array.isArray(request.services) ? request.services : [];
  const blockedSlots = Array.isArray(request.blockedSlots) ? request.blockedSlots : [];

  const servicesSheet = getServicesSheet_();
  const blockedSlotsSheet = getBlockedSlotsSheet_();

  writeRows_(servicesSheet, SERVICE_COLUMNS, services.map(serviceToRow_));
  writeRows_(
    blockedSlotsSheet,
    BLOCKED_SLOT_COLUMNS,
    blockedSlots.map(blockedSlotToRow_),
  );

  return {
    ok: true,
    services: listServices_(),
    blockedSlots: listBlockedSlots_(),
  };
}

function listBookingsResponse_(request) {
  const customerKey = request.customerKey;
  const bookings = listBookings_().filter(function (booking) {
    return !customerKey || booking.customerKey === customerKey;
  });

  return {
    ok: true,
    bookings: bookings,
  };
}

function getBangkokNow_() {
  const now = new Date();
  return {
    dateKey: Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM-dd'),
    currentMinutes: Number(Utilities.formatDate(now, 'Asia/Bangkok', 'H')) * 60 +
      Number(Utilities.formatDate(now, 'Asia/Bangkok', 'm')),
  };
}

function timeToMinutes_(value) {
  const parts = String(value || '0:0').split(':');
  return Number(parts[0] || 0) * 60 + Number(parts[1] || 0);
}

function createBooking_(request) {
  const booking = request.booking;

  if (!booking || !booking.id || !booking.dateKey || !booking.time) {
    throw new Error('Booking payload is incomplete.');
  }

  const current = getBangkokNow_();

  if (
    booking.dateKey < current.dateKey ||
    (booking.dateKey === current.dateKey &&
      timeToMinutes_(booking.time) < current.currentMinutes)
  ) {
    throw new Error('This slot is already in the past.');
  }

  const duplicated = listBookings_().find(function (currentBooking) {
    return (
      currentBooking.dateKey === booking.dateKey &&
      currentBooking.time === booking.time &&
      currentBooking.bookingStatus !== 'cancelled'
    );
  });

  if (duplicated) {
    throw new Error('This slot has already been booked.');
  }

  const sheet = getBookingsSheet_();
  const nextRow = sheet.getLastRow() + 1;
  sheet.getRange(nextRow, 1, 1, BOOKING_COLUMNS.length).setValues([
    bookingToRow_(booking),
  ]);

  return {
    ok: true,
    booking: rowToBooking_(bookingToRow_(booking), nextRow),
  };
}

function updateBooking_(request) {
  const bookingId = request.bookingId;
  const updates = request.updates || {};
  const sheet = getBookingsSheet_();
  const bookings = listBookings_();
  const booking = bookings.find(function (item) {
    return item.id === bookingId;
  });

  if (!booking || !booking.sheetRowNumber) {
    throw new Error('Booking not found.');
  }

  const nextBooking = Object.assign({}, booking, {
    paymentStatus: updates.paymentStatus || booking.paymentStatus,
    bookingStatus: updates.bookingStatus || booking.bookingStatus,
  });

  sheet
    .getRange(booking.sheetRowNumber, 1, 1, BOOKING_COLUMNS.length)
    .setValues([bookingToRow_(nextBooking)]);

  return {
    ok: true,
    booking: rowToBooking_(bookingToRow_(nextBooking), booking.sheetRowNumber),
  };
}

function deleteBooking_(request) {
  const bookingId = request.bookingId;
  const sheet = getBookingsSheet_();
  const bookings = listBookings_();
  const booking = bookings.find(function (item) {
    return item.id === bookingId;
  });

  if (!booking || !booking.sheetRowNumber) {
    throw new Error('Booking not found.');
  }

  sheet.deleteRow(booking.sheetRowNumber);

  return {
    ok: true,
  };
}
