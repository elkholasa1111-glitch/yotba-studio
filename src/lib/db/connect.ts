import mongoose from 'mongoose';
import { normalizeEnv } from '@/lib/config/runtime';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCache: MongooseCache | undefined;
}

function getCache(): MongooseCache {
  if (!global.mongooseCache) {
    global.mongooseCache = { conn: null, promise: null };
  }
  return global.mongooseCache;
}

export async function connectDB(): Promise<typeof mongoose | null> {
  const uri = normalizeEnv(process.env.MONGODB_URI);
  if (!uri) {
    // الخدمات الأعلى مستوى تقرر صراحةً هل تسمح بوضع الديمو؛ لا نفترض ذلك في الإنتاج.
    return null;
  }

  const cache = getCache();

  // 1. إعادة استخدام الاتصال النشط فوراً عند وجوده (Reuse when connected)
  if (cache.conn && cache.conn.connection.readyState === 1) {
    return cache.conn;
  }

  // 2. إذا كان الاتصال المحفوظ منقطعاً أو في حالة غير متصلة (stale / disconnected)،
  // نلغي الكاش الميت والوعد المرتبط به لتمكين إعادة الاتصال بأمان
  if (cache.conn && cache.conn.connection.readyState !== 1) {
    cache.conn = null;
    cache.promise = null;
  }

  // 3. منع الاتصالات المكررة المتزامنة (Single-flight): إذا كان هناك طلب اتصال جارٍ ننتظره
  if (!cache.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    };

    cache.promise = mongoose.connect(uri, opts).then((m) => {
      console.log('✅ Connected successfully to MongoDB Atlas');
      return m;
    }).catch((err) => {
      console.error('❌ MongoDB Atlas connection error:', err);
      throw err;
    });
  }

  const currentPromise = cache.promise;
  try {
    const conn = await currentPromise;
    if (!conn || conn.connection.readyState !== 1) {
      cache.conn = null;
      throw new Error('MongoDB connection is not in ready state');
    }
    cache.conn = conn;
    return cache.conn;
  } catch (e) {
    cache.conn = null;
    throw e;
  } finally {
    // تصفير الوعد بعد اكتمال محاولة الاتصال بأمان (نجاحاً أو فشلاً)
    // لتجنب بقاء الوعد resolved في الحالات الخاملة وتجاوز إعادة الاتصال
    if (cache.promise === currentPromise) {
      cache.promise = null;
    }
  }
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
  const uri = normalizeEnv(process.env.MONGODB_URI);
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
