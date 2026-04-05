/**
 * MongoDB Database Connection
 *
 * Uses Mongoose for schema validation and connection management.
 */
import mongoose from "mongoose";

// Connection options
const options: mongoose.ConnectOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

// Connect to MongoDB (optional - falls back to in-memory)
export async function connectDB(): Promise<typeof mongoose | null> {
  if (!process.env.DATABASE_URL) {
    console.log("[DB] No DATABASE_URL, using in-memory mode");
    return null;
  }
  if (mongoose.connection.readyState >= 1) {
    return mongoose;
  }
  try {
    await mongoose.connect(process.env.DATABASE_URL!, options);
    console.log("[DB] MongoDB connected:", mongoose.connection.name);
    return mongoose;
  } catch (err) {
    console.log("[DB] MongoDB connection failed, using in-memory mode");
    return null;
  }
}

// Disconnect helper
export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  console.log("[DB] MongoDB disconnected");
}

// Re-export mongoose
export { mongoose };

// Export connection for direct use
export const connection = mongoose.connection;
