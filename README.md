# AidConnect – Local Community Assistance Platform for Emergency Help

AidConnect connects residents who need emergency help with nearby volunteers who can respond quickly. It includes role-based dashboards, browser geolocation, realtime request/chat updates, SOS requests, volunteer ratings, and an admin overview.

## Stack

This Lovable project uses:

- React + Vite for the frontend
- Tailwind/shadcn-style UI components
- Lovable Cloud for authentication, database, security rules, and realtime data
- Browser geolocation for emergency locations
- Sonner toasts for live in-app alerts

The original Node/Express + MongoDB + Socket.io stack is represented here with Lovable Cloud equivalents so the app runs directly in Lovable.

## Database schema

Main tables:

- `profiles`: display name, phone, address, area, avatar URL, availability, coordinates, volunteer rating summary
- `user_roles`: secure separate role records for `admin`, `resident`, and `volunteer`
- `emergency_requests`: title, description, type, location, urgency, status, resident, assigned volunteer, SOS flag
- `request_messages`: chat messages scoped to emergency requests
- `request_status_events`: request status history/audit trail
- `volunteer_ratings`: resident ratings for completed volunteer help
- `notifications`: in-app notification records

Security rules ensure users only access data appropriate for their role and request participation.

## Running locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Auth and roles

1. Sign up as either Resident or Volunteer.
2. Resident users can create emergency requests and SOS alerts.
3. Volunteer users can view pending requests, accept them, chat, and complete them.
4. Admin users are assigned through the Cloud database by adding an `admin` role in `user_roles`.

Roles are intentionally stored separately from profiles to avoid privilege escalation.

## Testing flow

1. Create a Resident account.
2. Add a location manually or use browser location permission.
3. Create a Medical, Accident, Disaster, or Other request.
4. Create a Volunteer account in another browser/session.
5. Accept the pending request.
6. Chat between the resident and volunteer.
7. Mark the request completed.
8. Return to the resident account and rate the volunteer.

## Email notifications

The app is ready for app email notifications such as request accepted and request completed. A sender domain must be configured in Lovable Cloud before app emails can be activated.

## Geolocation

Browser geolocation requires user permission. If permission is denied, residents can type a location manually and volunteers can still respond based on the provided location text.
