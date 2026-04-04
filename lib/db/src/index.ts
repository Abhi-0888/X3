/**
 * MongoDB Database Connection
 *
 * Uses Mongoose for schema validation and connection management.
 */
import mongoose from "mongoose";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Example: mongodb://localhost:27017/aeci",
  );
}

// Connection options
const options: mongoose.ConnectOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

// Connect to MongoDB
export async function connectDB(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState >= 1) {
    return mongoose;
  }
  await mongoose.connect(process.env.DATABASE_URL!, options);
  console.log("[DB] MongoDB connected:", mongoose.connection.name);
  return mongoose;
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
