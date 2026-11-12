export type IsoDate = string;

export interface DateOnlyParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MANILA_TIME_ZONE = "Asia/Manila";

function assertValidDateOnly(value: string): DateOnlyParts {
  const parts = parseDateOnly(value);
  if (!parts) {
    throw new RangeError(`Invalid date-only value: ${value}`);
  }
  return parts;
}

/** Parse a calendar date without constructing it through a date-string parser. */
export function parseDateOnly(value: string): DateOnlyParts | null {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const candidate = new Date(timestamp);

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

/** Build a UTC-midnight Date for formatting a date-only value safely. */
export function dateOnlyToUtcDate(value: IsoDate): Date {
  const { year, month, day } = assertValidDateOnly(value);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Return the calendar date seen in Asia/Manila for an instant. */
export function toManilaDate(instant: Date | string | number): IsoDate {
  if (typeof instant === "string" && DATE_ONLY_PATTERN.test(instant)) {
    assertValidDateOnly(instant);
    return instant;
  }

  const value = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(value.getTime())) {
    throw new RangeError("Invalid instant");
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

/** Count calendar days from `from` to `to`, independent of local time zone. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const fromParts = assertValidDateOnly(from);
  const toParts = assertValidDateOnly(to);
  const fromUtc = Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day);
  const toUtc = Date.UTC(toParts.year, toParts.month - 1, toParts.day);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

/** Compare two valid date-only values in calendar order. */
export function compareDateOnly(left: IsoDate, right: IsoDate): number {
  return daysBetween(left, right);
}

/** Format a date-only value without allowing the host time zone to shift it. */
export function formatDateOnly(
  value: IsoDate,
  options?: { readonly omitYear?: boolean; readonly referenceYear?: number },
): string {
  const date = dateOnlyToUtcDate(value);
  const omitYear =
    options?.omitYear === true &&
    options.referenceYear === assertValidDateOnly(value).year;

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(omitYear ? {} : { year: "numeric" as const }),
  }).format(date);
}

/** Format an instant's clock time in Asia/Manila for reminder labels. */
export function formatManilaTime(instant: Date | string | number): string {
  const value = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(value.getTime())) {
    throw new RangeError("Invalid instant");
  }

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: MANILA_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}
