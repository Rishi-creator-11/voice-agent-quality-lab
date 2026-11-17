import type { ToolDef } from './llm';

const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description, ...extra });
const obj = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object', properties, required, additionalProperties: false });
const code = str('Confirmation code: letters BK, a dash, then four digits');
const last = str('Last name on the booking');

/** Identical tool set for Agent A and Agent B. */
export const TOOL_DEFS: ToolDef[] = [
  { name: 'check_availability', description: 'Check whether a date (and optionally a time) is bookable and list free 30-minute slots that day. Read-only.',
    input_schema: obj({ date: str('YYYY-MM-DD'), time: str('HH:MM, 24-hour') }, ['date']) },
  { name: 'validate_customer', description: 'Validate a caller\'s full name and phone number. Read-only.',
    input_schema: obj({ full_name: str('First and last name'), phone: str('10-digit US phone number') }, ['full_name', 'phone']) },
  { name: 'create_booking', description: 'Create an appointment. Writes to the calendar. Returns a confirmation code.',
    input_schema: obj({ full_name: str('First and last name'), phone: str('10-digit US phone number'), service: str('One of: cleaning, exam, xray, whitening, filling', { enum: ['cleaning', 'exam', 'xray', 'whitening', 'filling'] }), date: str('YYYY-MM-DD'), time: str('HH:MM, 24-hour'), request_id: str('Optional unique id for this request; repeating it never creates a duplicate') }, ['full_name', 'phone', 'service', 'date', 'time']) },
  { name: 'lookup_booking', description: 'Look up an existing booking. Requires the confirmation code AND the last name on the booking.',
    input_schema: obj({ confirmation_code: code, last_name: last }, ['confirmation_code', 'last_name']) },
  { name: 'reschedule_booking', description: 'Move an existing booking to a new date/time. Requires confirmation code and last name. Writes to the calendar.',
    input_schema: obj({ confirmation_code: code, last_name: last, new_date: str('YYYY-MM-DD'), new_time: str('HH:MM, 24-hour') }, ['confirmation_code', 'last_name', 'new_date', 'new_time']) },
  { name: 'cancel_booking', description: 'Cancel an existing booking. Requires confirmation code and last name. Writes to the calendar. Returns any late-cancellation fee.',
    input_schema: obj({ confirmation_code: code, last_name: last }, ['confirmation_code', 'last_name']) },
  { name: 'transfer_to_human', description: 'Transfer the caller to the front-desk team.',
    input_schema: obj({ reason: str('Short reason for the transfer') }, ['reason']) },
];
