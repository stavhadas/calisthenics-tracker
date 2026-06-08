require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
// Fallback: also load from CWD (works when run directly from project root)
if (!process.env.ENCRYPTION_KEY) require('dotenv').config();
const { migrate } = require('./src/db/schema');
const { loadStoredSession } = require('./src/garmin/client');
const app = require('./src/app');

const PORT = process.env.PORT || 3000;

migrate();

loadStoredSession()
  .then((restored) => {
    if (restored) console.log('Garmin session restored from storage');
  })
  .catch((err) => {
    console.warn('Could not restore Garmin session:', err.message);
  });

app.listen(PORT, () => {
  console.log(`Calisthenics Tracker running on http://localhost:${PORT}`);
});
