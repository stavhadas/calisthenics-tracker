const express = require('express');
const cors = require('cors');
const path = require('path');

const garminRoutes = require('./routes/garmin');
const activitiesRoutes = require('./routes/activities');
const exercisesRoutes = require('./routes/exercises');
const dashboardRoutes = require('./routes/dashboard');
const levelsRoutes = require('./routes/levels');

const app = express();

app.use(express.json());
app.use(cors());

app.use('/api/garmin', garminRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/exercises', exercisesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/levels', levelsRoutes);

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../../client/dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
