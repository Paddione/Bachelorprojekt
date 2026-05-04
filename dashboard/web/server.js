'use strict';

const express = require('express');
const app = express();

app.get('/healthz', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`dashboard-web listening on :${PORT}`);
});
