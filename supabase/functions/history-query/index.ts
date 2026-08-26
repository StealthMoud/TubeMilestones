import { z } from 'zod';
import { authenticatedUser } from '../_shared/auth.ts';
import { AppError, jsonResponse } from '../_shared/errors.ts';
import { handleRequest } from '../_shared/handler.ts';
import { loadUnifiedHistory } from '../_shared/history-service.ts';

const requestSchema = z.object({
  channelId: z.uuid(),
  range: z.enum(['7D', '28D', '90D', '365D', 'ALL']),
});

Deno.serve((request) =>
  handleRequest(request, 'history-query', async () => {
    const { user, admin } = await authenticatedUser(request);
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError('INVALID_REQUEST', { cause: parsed.error });
    return jsonResponse(
      await loadUnifiedHistory(
        admin,
        user.id,
        parsed.data.channelId,
        parsed.data.range,
      ),
    );
  }),
);
