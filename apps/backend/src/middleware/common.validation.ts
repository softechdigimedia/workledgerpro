import { z } from "zod";

const id = z.string().trim().min(1, "ID is required").max(128, "ID is too long");
const shortText = (max = 500) => z.string().trim().max(max);
const optionalText = (max = 500) => shortText(max).optional();
const positiveAmount = z.union([z.number(), z.string().trim().min(1)]).transform(Number).refine((n) => Number.isFinite(n) && n > 0, "Amount must be a positive number");
const latitude = z.coerce.number().min(-90).max(90).optional();
const longitude = z.coerce.number().min(-180).max(180).optional();
const tags = z.array(z.string().trim().min(1).max(40)).max(30).optional();
const body = (shape: z.ZodRawShape) => z.object(shape).passthrough();
const params = (shape: z.ZodRawShape) => z.object(shape).passthrough();
const query = (shape: z.ZodRawShape = {}) => z.object(shape).passthrough();

export const validationSchemas = {
  idParams: params({ id }),
  employeeIdParams: params({ employeeId: id }),
  employeeAndIdParams: params({ employeeId: id, id }),
  employeeAndAccountIdParams: params({ employeeId: id, id }),
  idAndTagParams: params({ id, tag: z.string().trim().min(1).max(40) }),
  employeeEntry: body({ withdrawalAmount: positiveAmount.optional(), amount: positiveAmount.optional(), referenceId: optionalText(128), reference: optionalText(128), remarks: optionalText(1000), screenshotUrl: optionalText(7_000_000), imageUrl: optionalText(7_000_000), proofImage: optionalText(7_000_000), bankAccountId: id.optional(), bankAccountNumber: optionalText(64), bankAccount: optionalText(64), bankName: optionalText(120) }).refine((v) => v.withdrawalAmount !== undefined || v.amount !== undefined, "Amount is required"),
  attendance: body({ latitude, longitude, accuracy: z.coerce.number().min(0).max(100_000).optional(), accuracyMeters: z.coerce.number().min(0).max(100_000).optional(), address: optionalText(500), notes: optionalText(1000) }).optional(),
  punch: body({ punchType: z.enum(["CHECK_IN", "CHECK_OUT"]), latitude, longitude, accuracy: z.coerce.number().min(0).max(100_000).optional(), accuracyMeters: z.coerce.number().min(0).max(100_000).optional(), address: optionalText(500), notes: optionalText(1000) }),
  floatRequest: body({ amount: positiveAmount.optional(), requestedAmount: positiveAmount.optional(), reason: optionalText(1000), remarks: optionalText(1000), bankAccount: optionalText(64), bankAccountNumber: optionalText(64) }).refine((v) => v.amount !== undefined || v.requestedAmount !== undefined, "Amount is required"),
  createUser: body({  name: z.string()
    .trim()
    .min(1, "Full name is required")
    .max(120, "Name cannot exceed 120 characters"),

  email: z.string()
    .trim()
    .min(1, "Email address is required")
    .email("Please enter a valid email address")
    .max(254, "Email address is too long"),

  password: z.string()
    .min(8, "Password must contain at least 8 characters")
    .max(128, "Password cannot exceed 128 characters")
    .optional(),
  phone: optionalText(30), region: optionalText(120), subAdminId: id.optional(), role: z.enum(["EMPLOYEE", "SUB_ADMIN", "SUPER_ADMIN"]).optional() }),
  userStatus: body({ status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]) }),
  changePassword: body({ password: z.string().min(8).max(128).optional(), newPassword: z.string().min(8).max(128).optional() }).refine((v) => Boolean(v.password || v.newPassword), "New password is required"),
  assignment: body({ employeeId: id, subAdminId: id }),
  allocation: body({ employeeId: id, amount: positiveAmount, remarks: optionalText(1000), reference: optionalText(128) }),
  decision: body({ referenceId: optionalText(128), bankAccount: optionalText(64), screenshotUrl: optionalText(7_000_000), remarks: optionalText(1000), reason: optionalText(1000) }).optional(),
  noInput: z.object({}).strict().optional(),
  settings: body({}).refine((v) => Object.keys(v).length > 0, "At least one setting is required"),
  bankAccount: body({ employeeId: id.optional(), accountNumber: optionalText(64), bankName: optionalText(120), ifscCode: optionalText(20), accountHolderName: optionalText(120), employeeAccount: optionalText(120), employeeAccountName: optionalText(120), bankUsername: optionalText(120), bankPassword: optionalText(256), tags, customTags: tags, tag: optionalText(40), customTag: optionalText(40), isPrimary: z.boolean().optional(), bankAccountId: id.optional() }).refine((v) => Boolean(v.bankAccountId) || Boolean(v.accountNumber && v.bankName && v.ifscCode), "Provide bankAccountId or accountNumber, bankName and ifscCode"),
 bankTags: body({
  tag: optionalText(40),
  customTag: optionalText(40),
  tags,
  customTags: tags,
  append: z.boolean().optional(),
  mode: z.enum(["append", "replace"]).optional()
}).refine(
  (v) =>
    Boolean(
      v.tag ||
      v.customTag ||
      (Array.isArray(v.tags) && v.tags.length > 0) ||
      (Array.isArray(v.customTags) && v.customTags.length > 0)
    ),
  "At least one tag is required"
),
  upiStatus: body({
  isUpiActive: z.boolean().optional(),

  upiStatus: z.enum([
    "ACTIVE",
    "EXHAUSTED",
    "INACTIVE"
  ]).optional(),

  reason: optionalText(500)
}).refine(
  (v) =>
    v.isUpiActive !== undefined ||
    v.upiStatus !== undefined,
  "UPI status is required"
),
  primary: body({ employeeId: id.optional() }).optional(),
  bankAccountQuery: query({ employeeId: id.optional() }),
  dateFilter: query({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").optional() }),
  alertIdParams: params({ id: z.string().trim().min(1).max(128) }),
  listQuery: query({ page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(200).optional(), status: z.string().trim().max(40).optional(), role: z.string().trim().max(40).optional(), search: z.string().trim().max(120).optional(), employeeId: id.optional() }),
};
