import { Pool } from "pg";

export const connectDB = () => {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
  });
};
