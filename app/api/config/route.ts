import { NextResponse } from "next/server";
import {
  AppConfig,
  BlockedSlot,
  DEFAULT_SERVICES,
  Service,
} from "../../lib/booking-data";
import {
  fetchAppConfig,
  isAppsScriptConfigured,
  replaceAppConfig,
} from "../../lib/server/apps-script";

function fallbackConfig(): AppConfig {
  return {
    services: DEFAULT_SERVICES,
    blockedSlots: [],
  };
}

export async function GET() {
  if (!isAppsScriptConfigured()) {
    return NextResponse.json({
      ...fallbackConfig(),
      storageReady: false,
      error:
        "Google Apps Script is not configured yet. Set GOOGLE_APPS_SCRIPT_URL in .env to enable saving.",
    });
  }

  try {
    const config = await fetchAppConfig();

    return NextResponse.json({
      services: config.services,
      blockedSlots: config.blockedSlots,
      storageReady: config.storageReady,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ...fallbackConfig(),
        storageReady: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch app config from Google Apps Script",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  if (!isAppsScriptConfigured()) {
    return NextResponse.json(
      {
        error:
          "Google Apps Script is not configured yet. Set GOOGLE_APPS_SCRIPT_URL in .env before editing admin data.",
      },
      { status: 503 },
    );
  }

  try {
    const payload = (await request.json()) as Partial<AppConfig>;
    const nextServices = (payload.services ?? []).filter(Boolean) as Service[];
    const nextBlockedSlots = (payload.blockedSlots ?? []).filter(
      Boolean,
    ) as BlockedSlot[];

    const config = await replaceAppConfig({
      services: nextServices,
      blockedSlots: nextBlockedSlots,
    });

    return NextResponse.json({
      services: config.services,
      blockedSlots: config.blockedSlots,
      storageReady: config.storageReady,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update app config",
      },
      { status: 500 },
    );
  }
}
