import { handle, json } from '@/server/http';
import { readProviderChoice } from '@/server/ai';
import { clearCloudSession } from '@/server/ai/session';
import { testProvider } from '@/server/library/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "Test connection" for the Settings page. Uses the provider headers like
 * every model route; a Gemini key is proven with one five-token call.
 * 503 with a plain-language reason when the backend or key is not usable —
 * and a key that fails is not left parked in the cloud session.
 */
export const POST = handle(async (req: Request) => {
  const choice = readProviderChoice(req);
  try {
    return json(await testProvider(choice));
  } catch (err) {
    if (choice.kind !== 'local') clearCloudSession();
    throw err;
  }
});
