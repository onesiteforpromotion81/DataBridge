import app from "./app.js";
import { testConnection } from "./db/connections.js";

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await testConnection(); // Test DB connection on startup
});
