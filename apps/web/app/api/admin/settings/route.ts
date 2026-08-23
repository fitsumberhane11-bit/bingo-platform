import type { NextRequest } from "next/server";
import { z } from "zod";
import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { listSettings, updateSetting, InvalidSettingValueError, UnknownSettingError } from "@/lib/settings-service";
import { ValidationError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

export const GET = withApiHandler(async () => {
  await requireApiPermission(PERMISSIONS.SETTINGS_MANAGE);
  const settings = await listSettings();
  return jsonOk({ settings });
});

const schema = z.object({ key: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) });

export const PATCH = withApiHandler(async (req: NextRequest) => {
  const ctx = await requireApiPermission(PERMISSIONS.SETTINGS_MANAGE);
  const { key, value } = schema.parse(await req.json());

  let updated;
  try {
    updated = await updateSetting(key, value, ctx.userId);
  } catch (err) {
    if (err instanceof UnknownSettingError || err instanceof InvalidSettingValueError) {
      throw new ValidationError(err.message);
    }
    throw err;
  }

  await writeAuditLog({
    actorUserId: ctx.userId,
    action: "SETTING_UPDATED",
    entityType: "SystemSetting",
    entityId: key,
    newValue: { key, value },
  });

  return jsonOk({ setting: updated });
});
