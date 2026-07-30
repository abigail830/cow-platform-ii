import { handle } from 'hono/vercel';
import app from '../src/app.ts';

export default handle(app);

/** Vercel Pro: extend for long agent SSE streams. Hobby max is 10s. */
export const config = {
  maxDuration: 300,
};
