import mongoose from 'mongoose';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

let cached: MongooseCache = global.mongooseCache || { conn: null, promise: null };

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

export async function connectDB(): Promise<typeof mongoose | null> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    // الخدمات الأعلى مستوى تقرر صراحةً هل تسمح بوضع الديمو؛ لا نفترض ذلك في الإنتاج.
    return null;
  }

  if (cached.conn && cached.conn.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    };

    cached.promise = mongoose.connect(uri, opts).then((m) => {
      console.log('✅ Connected successfully to MongoDB Atlas');
      return m;
    }).catch((err) => {
      console.error('❌ MongoDB Atlas connection error:', err);
      cached.promise = null;
      throw err;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export interface DatabaseHealthStatus {
  provider: 'mongodb_atlas';
  configured: boolean;
  connected: boolean;
  status: 'connected' | 'connection_failed' | 'timed_out' | 'not_configured';
  latencyMs: number | null;
}

/**
 * فحص غير متلف ومحدد زمنياً لسلامة الاتصال بقاعدة البيانات.
 * لا يكتب أي بيانات ولا يسرب معلومات الاتصال أو الأخطاء الخام.
 */
export async function checkDatabaseHealth(timeoutMs: number = 5000): Promise<DatabaseHealthStatus> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    return {
      provider: 'mongodb_atlas',
      configured: false,
      connected: false,
      status: 'not_configured',
      latencyMs: null,
    };
  }

  const start = Date.now();
  let timer: NodeJS.Timeout | undefined;

  try {
    const operation = connectDB()
      .then(async (conn) => {
        if (!conn) return null;
        if (conn.connection.readyState === 1) {
          try {
            if (conn.connection.db) {
              await conn.connection.db.command({ ping: 1 });
            }
          } catch (pingErr) {
            console.warn('MongoDB ping command warning (continuing with readyState 1):', pingErr);
          }
          return conn;
        }
        return null;
      })
      .catch((err) => {
        console.error('Database connection failed during health check:', err);
        return null;
      });
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
    });

    const conn = await Promise.race([operation, timeoutPromise]);
    if (timer) clearTimeout(timer);

    if (conn && conn.connection.readyState === 1) {
      return {
        provider: 'mongodb_atlas',
        configured: true,
        connected: true,
        status: 'connected',
        latencyMs: Date.now() - start,
      };
    }

    return {
      provider: 'mongodb_atlas',
      configured: true,
      connected: false,
      status: 'connection_failed',
      latencyMs: null,
    };
  } catch (error) {
    if (timer) clearTimeout(timer);
    const isTimeout = error instanceof Error && error.message === 'TIMEOUT';
    console.error('checkDatabaseHealth catch error:', error);
    return {
      provider: 'mongodb_atlas',
      configured: true,
      connected: false,
      status: isTimeout ? 'timed_out' : 'connection_failed',
      latencyMs: null,
    };
  }
}
