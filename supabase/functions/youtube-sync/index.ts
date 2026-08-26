import { authenticatedUser } from '../_shared/auth.ts';
import { AppError, jsonResponse } from '../_shared/errors.ts';
import { handleRequest } from '../_shared/handler.ts';
import { synchronizeUser } from '../_shared/sync.ts';

Deno.serve((request) =>
  handleRequest(request, 'youtube-sync', async () => {
    const { user, admin } = await authenticatedUser(request);
    const body = (await request.json().catch(() => {
      throw new AppError('INVALID_REQUEST');
    })) as unknown;
    return jsonResponse(await synchronizeUser(admin, user.id, body));
  }),
);
