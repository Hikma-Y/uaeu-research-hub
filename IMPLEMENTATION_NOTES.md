# UAEU Research Hub integration

This package preserves the React/Vite interface and translates the Streamlit administration workflows into the same frontend design system.

## Demo accounts

- `student@uaeu.ac.ae`
- `faculty@uaeu.ac.ae`
- `admin@uaeu.ac.ae`

Any password with at least six characters works in this frontend demo.

## Integrated administration workflows

- Portfolio overview and project snapshot
- Create, edit, and archive research opportunities
- Program, department, research-centre, funding, capacity, timeline, and status fields
- Student-group and milestone progress tracking
- Faculty report and research-outcome oversight
- Capacity, portfolio-status, program, publication, and award analytics
- University announcement and important-date publishing

## Architecture note

The original Streamlit package uses Python and PostgreSQL. This package is the React frontend prototype, so its interactions use React session state. To make changes persist across devices, connect these handlers to the backend REST API when the backend is implemented.
