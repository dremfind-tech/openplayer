# Privacy-First Analytics & Local Metrics
**Filename:** `10-Analytics-Metrics.md`
**Product:** BeatDrop — Offline Music Player & Downloader

---

## 1. Local-First Analytics

As an offline-first app targeting privacy-conscious users, BeatDrop tracks usage statistics **entirely inside the local SQLite database**. No network metrics are dispatched to external clouds.

### 1.1 Local Metrics Schema Additions
```sql
CREATE TABLE IF NOT EXISTS listening_stats (
    track_id TEXT NOT NULL,
    play_count INTEGER DEFAULT 0,
    last_played INTEGER,
    total_time_played INTEGER DEFAULT 0, -- in seconds
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);
```

---

## 2. Key Insights Rendered to User (Stats Dashboard)
BeatDrop turns analytics into a feature for the listener.
* **Top Artist & Track:** Computed via query grouping by `play_count` in `listening_stats`.
* **Total Library Size:** Computed via `SELECT COUNT(*) FROM tracks`.
* **Monthly Listening Trend:** Bar graph rendering duration sum grouped by date.

---

## 3. Opt-in Crash Reporting (Phase 2)
If the user explicitly opts in, errors captured via Sentry are sent.
* **Consent Check:** Checked on Settings page. Defaults to `false`.
* **Data Sanitization:** URL hashes and file paths are stripped from error logs prior to upload to protect user privacy.
