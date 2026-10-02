# UAEU Research Hub integration

This package preserves the React/Vite interface and translates the Streamlit administration workflows into the same frontend design system.

## Accounts

Sign in with a registered account. Database setup adds no sample accounts or records.

## Integrated administration workflows

- Portfolio overview and project snapshot
- Create, edit, and archive research opportunities
- Program, department, research-centre, funding, capacity, timeline, and status fields
- Student-group and milestone progress tracking
- Faculty report and research-outcome oversight
- Capacity, portfolio-status, program, publication, and award analytics
- University announcement and important-date publishing

## Architecture note

The React frontend uses Supabase for authentication and saved research data. The optional PostgreSQL backend has a schema-only setup script.
