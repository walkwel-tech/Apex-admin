import {
  convertToSeconds,
  isTokenExpired,
  retrieveAccessToken,
} from "../utils/helpers";
import {
  CALENDAR_BOOKED_SLOTS,
  CALENDAR_DATA,
  CALENDAR_OPEN_HOURS,
  CALENDAR_TEAM_MEMBERS,
  GHL_ACCOUNT_DETAILS,
  GHL_SUBACCOUNT_AUTH_ATTRIBUTES,
} from "../constants/tableAttributes";
import {
  insertData,
  matchByString,
  supabase,
  updateData,
} from "../services/supabaseClient";
import {
  GHL_SUBACCOUNT_AUTH_ACCOUNT_TYPE,
  SUPABASE_TABLE_NAME,
} from "../utils/constant";
import axios from "axios";
import { refreshAuth } from "./authController";
import { Request, Response } from "express";
import { AppointmentData, ContactData } from "../types/interfaces";
import { DateTime } from "luxon";
import dayjs from "dayjs";

export const fetchAllCalendarsByLocationId = async (
  req: Request,
  res: Response
) => {
  try {
    const { locationId } = req.query;
    if (!locationId) {
      return res
        .status(404)
        .json({ success: false, error: "Missing locationId in body" });
    }

    const access_token = await retrieveAccessToken(locationId as string);

    if (access_token) {
      const response = await axios.get(
        `${process.env.GHL_API_BASE_URL}/calendars/`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${access_token}`,
            Version: process.env.GHL_API_VERSION,
          },
          params: { locationId },
        }
      );

      const calendarIds = response.data.calendars
        .filter((calendar: { isActive: boolean }) => calendar.isActive)
        .map((calendar: { id: string; name: string }) => ({
          id: calendar.id,
          name: calendar.name,
        }));

      return res
        .status(200)
        .json({ success: true, message: "", data: calendarIds });
    }

    return res
      .status(404)
      .json({ success: false, message: "Subaccount Not Found" });
  } catch (error: any) {
    console.error(
      "Error fetching calendars:",
      error?.response?.data || error.message
    );
    return res.status(500).json({
      error: "Failed to fetch calendars",
      details: error?.response?.data || error.message,
    });
  }
};

export const fetchCompanyInformation = async (companyId: string) => {
  try {
    if (!companyId) {
      return { success: false, error: "Missing companyId in body" };
    }
    const { data, error } = await supabase
      .from(SUPABASE_TABLE_NAME.GHL_SUBACCOUNT_AUTH_TABLE)
      .select("*")
      .eq(GHL_SUBACCOUNT_AUTH_ATTRIBUTES.GHL_COMPANY_ID, companyId)
      .eq(
        GHL_SUBACCOUNT_AUTH_ATTRIBUTES.ACCOUNT_TYPE,
        GHL_SUBACCOUNT_AUTH_ACCOUNT_TYPE.COMPANY
      );

    let access_token = "";

    if (!error) {
      access_token = data[0]?.access_token;

      if (
        isTokenExpired(
          data[0]?.updated_at,
          data[0]?.[GHL_SUBACCOUNT_AUTH_ATTRIBUTES.EXPIRES_IN]
        )
      ) {
        const refreshTokenResponse = await refreshAuth(
          companyId,
          data[0]?.[GHL_SUBACCOUNT_AUTH_ATTRIBUTES.ACCOUNT_TYPE]
        );

        if (refreshTokenResponse.success && refreshTokenResponse.data?.length) {
          access_token = refreshTokenResponse.data[0].access_token;
        }
      }
    }
    const response = await axios.get(
      `${process.env.GHL_API_BASE_URL}/companies/${companyId}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${access_token}`,
          Version: process.env.GHL_API_VERSION,
        },
      }
    );
    return response.data;
  } catch (error: any) {
    console.error(
      "Error fetching company details:",
      error?.response?.data || error.message
    );
    return {
      error: "Failed to fetch company details",
      details: error?.response?.data || error.message,
    };
  }
};

export const fetchSubaccountInformation = async (locationId: string) => {
  try {
    if (!locationId) {
      return { success: false, error: "Missing locationId in body" };
    }
    const access_token = await retrieveAccessToken(locationId);

    const response = await axios.get(
      `${process.env.GHL_API_BASE_URL}/locations/${locationId}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${access_token}`,
          Version: process.env.GHL_API_VERSION,
        },
      }
    );
    return response.data;
  } catch (error: any) {
    console.error(
      "Error fetching subaccount details:",
      error?.response?.data || error.message
    );
    return {
      error: "Failed to fetch subaccount details",
      details: error?.response?.data || error.message,
    };
  }
};

export const fetchAndSaveCalendarInformation = async (
  calendarId: string,
  locationId: string
) => {
  try {
    if (!calendarId || !locationId) {
      return { success: false, error: "Missing calendarId or locationId" };
    }
    const access_token = await retrieveAccessToken(locationId as string);

    if (access_token) {
      const response = await axios.get(
        `${process.env.GHL_API_BASE_URL}/calendars/${calendarId}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${access_token}`,
            Version: process.env.GHL_API_VERSION,
          },
        }
      );

      const calendar = response?.data?.calendar;
      if (!calendar) {
        return { success: false, message: "Calendar data not found" };
      }

      const calendarData = {
        [CALENDAR_DATA.NAME]: response?.data?.calendar?.name,
        [CALENDAR_DATA.CALENDAR_ID]: response?.data?.calendar?.id,
        [CALENDAR_DATA.SLOT_INTERVAL]: convertToSeconds(
          response?.data?.calendar?.slotInterval || 0,
          response?.data?.calendar?.slotIntervalUnit || "mins"
        ),
        [CALENDAR_DATA.SLOT_DURATION]: convertToSeconds(
          response?.data?.calendar?.slotDuration || 0,
          response?.data?.calendar?.slotDurationUnit || "mins"
        ),
        [CALENDAR_DATA.PRE_BUFFER_TIME]: convertToSeconds(
          response?.data?.calendar?.preBuffer || 0,
          response?.data?.calendar?.preBufferUnit
        ),
        [CALENDAR_DATA.IS_ACTIVE]: response?.data?.calendar?.isActive || true,
        [CALENDAR_DATA.GROUP_ID]: response?.data?.calendar?.groupId,
        [CALENDAR_DATA.SLUG]: response?.data?.calendar?.slug,
        [CALENDAR_DATA.APPOINTMENTS_PER_SLOT]:
          response?.data?.calendar?.appoinmentPerSlot || 0,
        [CALENDAR_DATA.APPOINTMENTS_PER_DAY]:
          response?.data?.calendar?.appoinmentPerDay || 0,
        [CALENDAR_DATA.ALLOW_BOOKING_AFTER_DAY]: convertToSeconds(
          response?.data?.calendar?.allowBookingAfter || 0,
          response?.data?.calendar?.allowBookingAfterUnit
        ),
        [CALENDAR_DATA.ALLOW_CANCELLATION]:
          response?.data?.calendar?.allowCancellation,
        [CALENDAR_DATA.ALLOW_RESCHEDULE]:
          response?.data?.calendar?.allowReschedule,
        [CALENDAR_DATA.ALLOW_BOOKING_FOR_DAYS]: convertToSeconds(
          response?.data?.calendar?.allowBookingFor || 0,
          response?.data?.calendar?.allowBookingForUnit
        ),
        [CALENDAR_DATA.GHL_LOCATION_ID]: response?.data?.calendar?.locationId,
      };

      const existingCalendar = await matchByString(
        SUPABASE_TABLE_NAME.CALENDAR_DATA,
        CALENDAR_DATA.CALENDAR_ID,
        response?.data?.calendar?.id
      );
      let insertedCalendarData;

      if (
        Array.isArray(existingCalendar) &&
        Object.keys(existingCalendar).length > 0
      ) {
        insertedCalendarData = await updateData(
          SUPABASE_TABLE_NAME.CALENDAR_DATA,
          calendarData,
          CALENDAR_DATA.CALENDAR_ID,
          calendarId
        );
      } else {
        insertedCalendarData = await insertData(
          SUPABASE_TABLE_NAME.CALENDAR_DATA,
          calendarData
        );
      }

      const savedCalendarId = insertedCalendarData?.responseData?.[0]?.id;
      if (!insertedCalendarData?.success || !savedCalendarId) {
        return { success: false, message: "Failed to save calendar data" };
      }

      const getAccountDetails = await matchByString(
        SUPABASE_TABLE_NAME.GHL_ACCOUNT_DETAILS,
        GHL_ACCOUNT_DETAILS.GHL_ID,
        locationId
      );

      const locationTimezone =
        Array.isArray(getAccountDetails) && getAccountDetails[0]
          ? getAccountDetails[0]?.[GHL_ACCOUNT_DETAILS.GHL_LOCATION_TIMEZONE] ??
            "UTC"
          : "UTC";
      const [openHoursIds, teamMembersIds] = await Promise.all([
        saveOpenHoursToDB(calendar, savedCalendarId, locationTimezone),
        saveTeamMembersToDB(calendar, savedCalendarId),
      ]);

      return { ...insertedCalendarData };
    }
    return { success: false, message: "Data not saved into database" };
  } catch (error: any) {
    console.error(
      "Error fetching company details:",
      error?.response?.data || error.message
    );
    return {
      error: "Failed to fetch company details",
      details: error?.response?.data || error.message,
    };
  }
};

async function saveOpenHoursToDB(
  calendarData: any,
  calendarUuid: string,
  locationTimezone: string
) {
  if (!calendarData?.openHours) return;
  const insertedIds: string[] = [];

  for (const entry of calendarData.openHours) {
    for (const day of entry.daysOfTheWeek) {
      for (const hour of entry.hours) {
        let openHour = hour.openHour;
        let openMinute = hour.openMinute;
        let closeHour = hour.closeHour;
        let closeMinute = hour.closeMinute;

        if (locationTimezone !== "UTC") {
          const openTime = DateTime.fromObject(
            { hour: openHour, minute: openMinute },
            { zone: locationTimezone }
          ).toUTC();

          const closeTime = DateTime.fromObject(
            { hour: closeHour, minute: closeMinute },
            { zone: locationTimezone }
          ).toUTC();

          openHour = openTime.hour;
          openMinute = openTime.minute;
          closeHour = closeTime.hour;
          closeMinute = closeTime.minute;
        }

        const dataToInsert = {
          [CALENDAR_OPEN_HOURS.CALENDAR_ID]: calendarUuid,
          [CALENDAR_OPEN_HOURS.DAY_OF_THE_WEEK]: day,
          [CALENDAR_OPEN_HOURS.OPEN_HOUR]: openHour,
          [CALENDAR_OPEN_HOURS.OPEN_MINUTE]: openMinute,
          [CALENDAR_OPEN_HOURS.CLOSE_HOUR]: closeHour,
          [CALENDAR_OPEN_HOURS.CLOSE_MINUTE]: closeMinute,
          [CALENDAR_OPEN_HOURS.GHL_CALENDAR_ID]: calendarData?.id,
        };

        try {
          const { data, error } = await supabase
            .from(SUPABASE_TABLE_NAME.CALENDAR_OPEN_HOURS)
            .select()
            .eq(CALENDAR_OPEN_HOURS.CALENDAR_ID, calendarUuid)
            .eq(CALENDAR_OPEN_HOURS.DAY_OF_THE_WEEK, day)
            .limit(1)
            .single();

          let openHourEntry;

          if (!error && data) {
            openHourEntry = await updateData(
              SUPABASE_TABLE_NAME.CALENDAR_OPEN_HOURS,
              dataToInsert,
              CALENDAR_OPEN_HOURS.ID,
              data.id
            );
          } else {
            openHourEntry = await insertData(
              SUPABASE_TABLE_NAME.CALENDAR_OPEN_HOURS,
              dataToInsert
            );
          }

          if (
            openHourEntry?.success &&
            Array.isArray(openHourEntry.responseData)
          ) {
            insertedIds.push(
              ...openHourEntry.responseData.map((item: any) => item.id)
            );
          }
        } catch (error) {
          console.error(`Error inserting data for day ${day}:`, error);
        }
      }
    }
  }
  return insertedIds;
}

async function saveTeamMembersToDB(calendarData: any, calendarUuid: string) {
  if (
    !Array.isArray(calendarData?.teamMembers) ||
    calendarData.teamMembers.length === 0
  ) {
    return [];
  }

  try {
    const insertedIds: string[] = [];

    for (const member of calendarData.teamMembers) {
      const dataToInsert = {
        [CALENDAR_TEAM_MEMBERS.CALENDAR_ID]: calendarUuid,
        [CALENDAR_TEAM_MEMBERS.USER_ID]: member?.userId,
        [CALENDAR_TEAM_MEMBERS.PRIORITY]: member?.priority,
        [CALENDAR_TEAM_MEMBERS.IS_PRIMARY]: member?.isPrimary,
        [CALENDAR_TEAM_MEMBERS.GHL_CALENDAR_ID]: calendarData?.id,
      };

      const { data, error } = await supabase
        .from(SUPABASE_TABLE_NAME.CALENDAR_TEAM_MEMBERS)
        .select()
        .eq(CALENDAR_TEAM_MEMBERS.CALENDAR_ID, calendarUuid)
        .eq(CALENDAR_TEAM_MEMBERS.USER_ID, member?.userId)
        .limit(1)
        .single();

      let teamMember;
      if (!error && data) {
        teamMember = await updateData(
          SUPABASE_TABLE_NAME.CALENDAR_TEAM_MEMBERS,
          dataToInsert,
          CALENDAR_TEAM_MEMBERS.ID,
          data.id
        );
      } else {
        teamMember = await insertData(
          SUPABASE_TABLE_NAME.CALENDAR_TEAM_MEMBERS,
          dataToInsert
        );
      }

      if (teamMember?.success && Array.isArray(teamMember.responseData)) {
        insertedIds.push(
          ...teamMember.responseData.map((item: any) => item.id)
        );
      }
    }

    return insertedIds;
  } catch (error: any) {
    console.error("Error inserting team members:", error);
    return [];
  }
}

export const fetchAndSaveCalendarBookedSlot = async (
  calendarId: string,
  locationId: string
) => {
  try {
    if (!calendarId || !locationId) {
      return { success: false, error: "Missing calendarId or locationId" };
    }

    const access_token = await retrieveAccessToken(locationId as string);

    if (!access_token) {
      return { success: false, message: "Generate Access Token" };
    }
    const startTime = Date.now();
    const endTime = new Date().setFullYear(new Date().getFullYear() + 1);

    const response = await axios.get(
      `${process.env.GHL_API_BASE_URL}/calendars/events`,
      {
        params: { locationId, calendarId, startTime, endTime },
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${access_token}`,
          Version: process.env.GHL_API_VERSION,
        },
      }
    );

    const calendarEvents = response.data?.events;
    if (!calendarEvents || !calendarEvents.length) {
      return { success: false, message: "Calendar data not found" };
    }
    for (const event of calendarEvents) {
      const eventData = {
        [CALENDAR_BOOKED_SLOTS.APPOINTMNET_STATUS]: event?.appointmentStatus,
        [CALENDAR_BOOKED_SLOTS.GHL_EVENT_ID]: event?.id,
        [CALENDAR_BOOKED_SLOTS.GHL_LOCATION_ID]: event?.locationId,
        [CALENDAR_BOOKED_SLOTS.GHL_ASSIGNED_USER_ID]: event?.assignedUserId,
        [CALENDAR_BOOKED_SLOTS.GHL_CALENDAR_ID]: event?.calendarId,
        [CALENDAR_BOOKED_SLOTS.START_TIME]: dayjs.utc(event?.startTime).unix(),
        [CALENDAR_BOOKED_SLOTS.END_TIME]: dayjs.utc(event?.endTime).unix(),
      };

      try {
        const existingCalendarEvents = await matchByString(
          SUPABASE_TABLE_NAME.CALENDAR_BOOKED_SLOTS,
          CALENDAR_BOOKED_SLOTS.GHL_EVENT_ID,
          event?.id
        );

        let dbOperation;

        if (
          Array.isArray(existingCalendarEvents) &&
          existingCalendarEvents.length > 0
        ) {
          dbOperation = await updateData(
            SUPABASE_TABLE_NAME.CALENDAR_BOOKED_SLOTS,
            eventData,
            CALENDAR_BOOKED_SLOTS.GHL_EVENT_ID,
            event.id
          );
        } else {
          dbOperation = await insertData(
            SUPABASE_TABLE_NAME.CALENDAR_BOOKED_SLOTS,
            eventData
          );
        }
        console.log("Database operation successful:", dbOperation);
      } catch (error) {
        console.error("Error processing event:", event.id, error);
      }
    }

    return { success: true, events: calendarEvents };
  } catch (error: any) {
    console.error("Error fetching calendar booked slots:", error);
    return {
      success: false,
      error: "Failed to fetch calendar booked slots",
      details: error?.response?.data || error.message,
    };
  }
};

export const createGhlAppointment = async (
  appointmentData: AppointmentData,
  access_token: string
) => {
  try {
    const response = await axios.post(
      `${process.env.GHL_API_BASE_URL}/calendars/events/appointments`,
      appointmentData,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
          Version: process.env.GHL_API_VERSION,
        },
      }
    );
    return { success: true, data: response?.data };
  } catch (error) {
    console.error("Error creating appointment", error);
    return {
      success: false,
      error: "Failed to create appointment",
      details: error,
    };
  }
};

export const createGhlContact = async (
  contactData: ContactData,
  access_token: string
) => {
  try {
    const response = await axios.post(
      `${process.env.GHL_API_BASE_URL}/contacts/upsert`,
      contactData,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
          Version: process.env.GHL_API_VERSION,
        },
      }
    );
    return response.data?.contact;
  } catch (error) {
    console.error("Error creating new contact", error);
    return {
      success: false,
      error: "Failed to create contact",
      details: error,
    };
  }
};

export const fetchCalendarAvailableSlots = async (
  calendarId: string,
  locationId: string,
  startDate: number,
  endDate: number,
  timezone: string
) => {
  try {
    if (!calendarId || !locationId) {
      return { success: false, error: "Missing calendarId or locationId" };
    }
    const access_token = await retrieveAccessToken(locationId as string);

    if (access_token) {
      const response = await axios.get(
        `${process.env.GHL_API_BASE_URL}/calendars/${calendarId}/free-slots`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${access_token}`,
            Version: process.env.GHL_API_VERSION,
          },
          params: { startDate, endDate, timezone },
        }
      );

      return { success: true, data: response.data };
    }
    return { success: false, message: "Data not saved into database" };
  } catch (error: any) {
    console.error(
      "Error fetching company details:",
      error?.response?.data || error.message
    );
    return {
      error: "Failed to fetch company details",
      details: error?.response?.data || error.message,
    };
  }
};

export const createCustomField = async (
  locationId: string,
  access_token: string
) => {
  try {
    const response = await axios.post(
      `${process.env.GHL_API_BASE_URL}/locations/${locationId}/customFields`,
      {
        name: `${process.env.GHL_APP_NAME} UTM`,
        dataType: "TEXT",
      },
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
          Version: process.env.GHL_API_VERSION || "2021-07-28",
        },
      }
    );
    return response.data?.customField;
  } catch (error: any) {
    console.error(
      "Error creating custom field:",
      error?.response?.data || error
    );
    return {
      success: false,
      error: "Failed to create custom field",
      details: error?.response?.data || error,
    };
  }
};
