const BASE = '';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  // Garmin
  garminStatus: () => request('/api/garmin/status'),
  garminConnect: (username, password) =>
    request('/api/garmin/connect', { method: 'POST', body: { username, password } }),
  garminSync: () => request('/api/garmin/sync', { method: 'POST' }),
  garminResync: () => request('/api/garmin/resync', { method: 'POST' }),
  garminDisconnect: () => request('/api/garmin/disconnect', { method: 'DELETE' }),
  garminSessionExport: () => request('/api/garmin/session-export'),
  garminSessionImport: (body) => request('/api/garmin/session-import', { method: 'POST', body }),

  // Activities
  getActivities: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
    ).toString();
    return request(`/api/activities${qs ? `?${qs}` : ''}`);
  },
  getActivityFilters: () => request('/api/activities/filters'),
  getActivity: (id) => request(`/api/activities/${id}`),
  deleteActivity: (id) => request(`/api/activities/${id}`, { method: 'DELETE' }),

  // Dashboard
  getDashboard: () => request('/api/dashboard'),

  // Levels
  getLevels: () => request('/api/levels'),
  getLevelDetail: (level, type) => request(`/api/levels/${level}/${encodeURIComponent(type)}`),

  // Exercises
  getExercises: () => request('/api/exercises'),
  updateExercise: (garminName, body) =>
    request(`/api/exercises/${encodeURIComponent(garminName)}`, { method: 'PATCH', body }),
  getExerciseProgress: (garminName, params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
    ).toString();
    return request(`/api/exercises/${encodeURIComponent(garminName)}/progress${qs ? `?${qs}` : ''}`);
  },
};
