"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import AdminButton from "./AdminButton";
import AdminCard from "./AdminCard";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function isSameDay(a: Date | null, b: Date | null) {
  return Boolean(
    a &&
      b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
  );
}

function normalizeDateValue(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const nextDate = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(nextDate.getTime()) ? null : nextDate;
}

function buildMonthDays(displayDate: Date) {
  const first = startOfMonth(displayDate);
  const last = endOfMonth(displayDate);
  const days: Array<{ date: Date; outside: boolean }> = [];

  const leading = first.getDay();
  for (let index = leading; index > 0; index -= 1) {
    days.push({
      date: new Date(first.getFullYear(), first.getMonth(), 1 - index),
      outside: true,
    });
  }

  for (let day = 1; day <= last.getDate(); day += 1) {
    days.push({
      date: new Date(displayDate.getFullYear(), displayDate.getMonth(), day),
      outside: false,
    });
  }

  while (days.length % 7 !== 0) {
    const nextIndex = days.length - leading - last.getDate() + 1;
    days.push({
      date: new Date(displayDate.getFullYear(), displayDate.getMonth() + 1, nextIndex),
      outside: true,
    });
  }

  return days;
}

function buildTimeSlots() {
  const slots: string[] = [];
  for (let hour = 0; hour <= 23; hour += 1) {
    slots.push(`${pad(hour)}:00`);
    slots.push(`${pad(hour)}:30`);
  }
  return slots;
}

function formatMonthLabel(date: Date) {
  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function formatSelectedDate(date: Date) {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatSelectedDateTime(date: Date) {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toLocalDateTime(date: Date, time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour,
    minute,
    0,
    0
  );
}

function formatTimeLabel(slot: string) {
  const [hour, minute] = slot.split(":").map(Number);
  const localDate = new Date(2000, 0, 1, hour, minute, 0, 0);
  return localDate.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function nextHalfHourTime() {
  const now = new Date();
  const minutes = now.getMinutes();
  const roundedMinutes = minutes < 30 ? 30 : 0;
  const hour = minutes < 30 ? now.getHours() : now.getHours() + 1;
  return `${pad(Math.min(hour, 23))}:${pad(roundedMinutes)}`;
}

function getEarliestAllowedDate(now: Date, minDate: Date | null) {
  const today = startOfDay(now);
  const minDay = minDate ? startOfDay(minDate) : null;
  if (!minDay) {
    return today;
  }

  return minDay.getTime() > today.getTime() ? minDay : today;
}

function isSlotBeforeBoundary(slotDateTime: Date, now: Date, minDate: Date | null) {
  if (slotDateTime.getTime() < now.getTime()) {
    return true;
  }

  if (minDate && slotDateTime.getTime() < minDate.getTime()) {
    return true;
  }

  return false;
}

type AdminSchedulePopoverProps = {
  value?: Date | string | null;
  onChange: (value: string | null) => void;
  timezoneLabel?: string;
  minDate?: Date | string | null;
  triggerLabel?: string;
  clearLabel?: string;
  disabled?: boolean;
  nowLabel?: string;
  applyLabel?: string;
  scheduledLabel?: string;
  showNowAction?: boolean;
  showValueLabel?: boolean;
};

export default function AdminSchedulePopover({
  value = null,
  onChange,
  timezoneLabel,
  minDate,
  triggerLabel = "Schedule",
  clearLabel = "Clear",
  disabled = false,
  nowLabel = "Publish now",
  applyLabel = "Schedule publish",
  scheduledLabel = "Scheduled",
  showNowAction = true,
  showValueLabel = false,
}: AdminSchedulePopoverProps) {
  const initialValueDate = normalizeDateValue(value);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [selectedDate, setSelectedDate] = useState(initialValueDate || new Date());
  const [displayDate, setDisplayDate] = useState(initialValueDate || new Date());
  const [selectedTime, setSelectedTime] = useState(
    initialValueDate
      ? `${pad(initialValueDate.getHours())}:${pad(initialValueDate.getMinutes())}`
      : nextHalfHourTime()
  );
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});

  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const monthDays = useMemo(() => buildMonthDays(displayDate), [displayDate]);
  const timeSlots = useMemo(() => buildTimeSlots(), []);
  const resolvedMinDate = useMemo(() => normalizeDateValue(minDate), [minDate]);
  const resolvedTimezoneLabel =
    timezoneLabel || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const normalizedValue = normalizeDateValue(value);
  const hasScheduledValue = Boolean(
// eslint-disable-next-line react-hooks/purity -- intentional runtime value preserves existing scheduling/toast behavior
    normalizedValue && normalizedValue.getTime() > Date.now()
  );
  const triggerText =
    showValueLabel && normalizedValue
      ? formatSelectedDateTime(normalizedValue)
      : hasScheduledValue
        ? scheduledLabel
        : triggerLabel;

  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
    setMounted(true);
  }, []);

  useEffect(() => {
    const nextValueDate = normalizeDateValue(value);
    if (!nextValueDate) {
      return;
    }

// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
    setSelectedDate(nextValueDate);
    setDisplayDate(new Date(nextValueDate.getFullYear(), nextValueDate.getMonth(), 1));
    setSelectedTime(`${pad(nextValueDate.getHours())}:${pad(nextValueDate.getMinutes())}`);
  }, [value]);

  useEffect(() => {
    if (!open || !rootRef.current) {
      return;
    }

    const updatePosition = () => {
      const triggerRect = rootRef.current?.getBoundingClientRect();
      const popoverRect = popoverRef.current?.getBoundingClientRect();
      if (!triggerRect) {
        return;
      }

      const width = Math.min(520, window.innerWidth - 32);
      const estimatedWidth = popoverRect?.width || width;
      const estimatedHeight = popoverRect?.height || 420;
      const spacing = 10;
      const viewportPadding = 8;
      const availableBelow = window.innerHeight - triggerRect.bottom - spacing - viewportPadding;
      const availableAbove = triggerRect.top - spacing - viewportPadding;
      const placeAbove = availableBelow < estimatedHeight && availableAbove > availableBelow;
      const maxLeft = window.innerWidth - estimatedWidth - 8;
      const nextLeft = Math.max(8, Math.min(triggerRect.right - estimatedWidth, maxLeft));
      const nextTop = placeAbove
        ? Math.max(8, triggerRect.top - estimatedHeight - spacing)
        : Math.max(8, Math.min(triggerRect.bottom + spacing, window.innerHeight - estimatedHeight - viewportPadding));
      const maxHeight = Math.max(240, Math.min(estimatedHeight, placeAbove ? availableAbove : availableBelow));

      setPopoverStyle({
        top: `${nextTop}px`,
        left: `${nextLeft}px`,
        maxHeight: `${maxHeight}px`,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      const clickedTrigger = target instanceof Node && rootRef.current && rootRef.current.contains(target);
      const clickedPopover = target instanceof Node && popoverRef.current && popoverRef.current.contains(target);
      if (!clickedTrigger && !clickedPopover) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const earliestAllowedDay = useMemo(
    () => getEarliestAllowedDate(new Date(), resolvedMinDate),
    [resolvedMinDate]
  );

  const selectedDateTime = useMemo(
    () => toLocalDateTime(selectedDate, selectedTime),
    [selectedDate, selectedTime]
  );

  const selectedIsPast = isSlotBeforeBoundary(
    selectedDateTime,
    new Date(),
    resolvedMinDate
  );

  const isDayDisabled = (date: Date) => {
    const day = startOfDay(date);
    return day.getTime() < earliestAllowedDay.getTime();
  };

  const isSlotDisabled = (slot: string) => {
    const slotDateTime = toLocalDateTime(selectedDate, slot);
    return isSlotBeforeBoundary(slotDateTime, new Date(), resolvedMinDate);
  };

  const selectFirstValidSlot = (date: Date) => {
    const nextValid = timeSlots.find((slot) => {
      const slotDateTime = toLocalDateTime(date, slot);
      return !isSlotBeforeBoundary(slotDateTime, new Date(), resolvedMinDate);
    });

    if (nextValid) {
      setSelectedTime(nextValid);
    }
  };

  const applySchedule = () => {
    if (selectedIsPast) {
      return;
    }
    onChange(selectedDateTime.toISOString());
    setOpen(false);
  };

  const clearSchedule = () => {
    onChange(null);
    setOpen(false);
  };

  const publishNow = () => {
    onChange(new Date().toISOString());
    setOpen(false);
  };

  const popover = open ? (
    <div
      className="admin-schedule-popover"
      ref={popoverRef}
      role="dialog"
      style={popoverStyle}
    >
      <AdminCard className="admin-schedule-popover__surface" spotlight={false} variant="card">
      <div className="admin-schedule-calendar">
        <div className="admin-schedule-calendar-header">
          <button
            aria-label="Previous month"
            className="admin-schedule-icon-button"
            onClick={() =>
              setDisplayDate(
                new Date(displayDate.getFullYear(), displayDate.getMonth() - 1, 1)
              )
            }
            type="button"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              chevron_left
            </span>
          </button>

          <strong>{formatMonthLabel(displayDate)}</strong>

          <button
            aria-label="Next month"
            className="admin-schedule-icon-button"
            onClick={() =>
              setDisplayDate(
                new Date(displayDate.getFullYear(), displayDate.getMonth() + 1, 1)
              )
            }
            type="button"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              chevron_right
            </span>
          </button>
        </div>

        <div className="admin-schedule-weekdays">
          {WEEKDAYS.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div className="admin-schedule-days">
          {monthDays.map(({ date, outside }) => {
            const disabledDay = isDayDisabled(date);
            const selected = isSameDay(date, selectedDate);

            return (
              <button
                className={[
                  "admin-schedule-day",
                  outside ? "is-outside" : "",
                  selected ? "is-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={disabledDay}
                key={date.toISOString()}
                onClick={() => {
                  setSelectedDate(date);
                  const selectedDateTimeForDay = toLocalDateTime(date, selectedTime);
                  if (
                    isSlotBeforeBoundary(
                      selectedDateTimeForDay,
                      new Date(),
                      resolvedMinDate
                    )
                  ) {
                    selectFirstValidSlot(date);
                  }
                }}
                type="button"
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      <div className="admin-schedule-times">
        <div className="admin-schedule-times-header">
          <strong>{formatSelectedDate(selectedDate)}</strong>
          <span>{resolvedTimezoneLabel}</span>
        </div>

        <div className="admin-schedule-time-list custom-scrollbar">
          {timeSlots.map((slot) => {
            const slotDisabled = isSlotDisabled(slot);
            const selected = slot === selectedTime;

            return (
              <button
                className={[
                  "admin-schedule-time",
                  selected ? "is-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={slotDisabled}
                key={slot}
                onClick={() => setSelectedTime(slot)}
                type="button"
              >
                {formatTimeLabel(slot)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="admin-schedule-footer">
        <AdminButton onClick={clearSchedule} size="sm" type="button" variant="ghost">
          {clearLabel}
        </AdminButton>
        {showNowAction ? (
          <AdminButton onClick={publishNow} size="sm" type="button" variant="secondary">
            {nowLabel}
          </AdminButton>
        ) : null}
        <AdminButton
          disabled={selectedIsPast}
          onClick={applySchedule}
          size="sm"
          type="button"
          variant="primary"
        >
          {applyLabel}
        </AdminButton>
      </div>
      </AdminCard>
    </div>
  ) : null;

  return (
    <div className="admin-schedule-popover-root" ref={rootRef}>
      <AdminButton
        disabled={disabled}
        onClick={() => setOpen((nextOpen) => !nextOpen)}
        rightIcon={
          <span className="material-symbols-outlined" aria-hidden="true">
            expand_more
          </span>
        }
        size="sm"
        type="button"
        variant={hasScheduledValue ? "primary" : "secondary"}
      >
        {triggerText}
      </AdminButton>

      {mounted && popover ? createPortal(popover, document.body) : null}
    </div>
  );
}
