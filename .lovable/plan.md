Build AidConnect as a working Lovable full-stack app using React + Lovable Cloud/Supabase instead of separate Node/Express + MongoDB folders, since this project runs on the Lovable stack. The app will still deliver the requested full-stack behavior: database schema, authentication, realtime updates, role-based dashboards, chat, notifications, and run guidance.

## App structure

Create a responsive emergency-assistance platform with these main areas:

```text
Public
- Landing page
- Login
- Signup with role selection: Resident or Volunteer

Resident dashboard
- Create emergency request
- SOS quick request
- Track active requests
- Chat with assigned volunteer
- Rate volunteer after completion

Volunteer dashboard
- View nearby open requests
- Accept/reject requests
- Update request status
- Chat with resident
- View ratings

Admin dashboard
- Manage users and volunteers
- View all emergency requests
- Analytics cards and request tables
```

## Core features to implement

1. **Authentication and profiles**
   - Add email/password signup and login.
   - Store full user profile data: display name, phone, address/area, avatar-ready field, role-related metadata, volunteer availability, and rating summary.
   - Store roles in a separate secure `user_roles` table, not on profiles.
   - Add route protection so residents, volunteers, and admins only access the correct dashboard areas.

2. **Emergency request system**
   - Residents can create requests with title, description, type, location, urgency, and optional geolocation coordinates.
   - Add browser geolocation with permission prompt and manual location fallback.
   - Include request statuses: `pending`, `accepted`, `completed`, and cancelled/rejected handling where appropriate.
   - Add color-coded urgency badges for Low, Medium, and High.

3. **SOS button**
   - Prominent SOS action for residents.
   - Creates a high-urgency request quickly using current geolocation if available.
   - Shows clear confirmation and realtime feedback.

4. **Volunteer workflow**
   - Volunteers see open emergency requests, prioritized by urgency and proximity when coordinates are available.
   - Volunteers can accept a request, reject/dismiss it from their view, and mark accepted requests as completed.
   - Accepted requests are assigned to one volunteer to avoid duplicate responders.

5. **Realtime updates and in-app notifications**
   - Subscribe to request and chat updates in realtime.
   - Show toast notifications when request status changes, a volunteer accepts a request, or a new chat message arrives.
   - Keep dashboards updated without page refresh.

6. **Chat system**
   - Enable resident-volunteer chat after a request is accepted.
   - Store messages securely per request.
   - Show realtime message updates and basic read-friendly timestamps.

7. **Admin dashboard**
   - Admin can view all users, volunteers, and requests.
   - Add analytics cards: total requests, pending requests, accepted/in-progress, completed, volunteers, residents.
   - Provide tables with filters by status, urgency, type, and role.

8. **Volunteer ratings**
   - Residents can rate a volunteer after a completed request.
   - Store rating and optional comment.
   - Display volunteer average rating and count.

9. **App emails**
   - Use Lovable’s built-in app email system for one-to-one emergency notifications.
   - Send expected event emails such as: request accepted, request completed, and important status update notifications.
   - If no sender domain is configured yet, set up the email-domain step first, then continue with the app email implementation.

## UI/UX direction

- Clean emergency-response dashboard layout inspired by Bootstrap-style cards, tables, badges, and forms, implemented with the existing React/Tailwind/shadcn stack.
- Mobile-first responsive design.
- Clear role-based navigation.
- Urgency colors:
  - Low: green/blue calm state
  - Medium: amber warning state
  - High/SOS: red emergency state
- Use strong visual hierarchy for active emergencies, request status, location, and action buttons.

## Database and security plan

Create Supabase tables with Row Level Security:

- `profiles` — user profile details linked to authenticated users.
- `user_roles` — secure separate role table with `admin`, `resident`, `volunteer` roles.
- `emergency_requests` — request details, status, urgency, type, coordinates, creator, assigned volunteer.
- `request_messages` — chat messages scoped to accepted requests.
- `request_status_events` — audit trail for request status changes.
- `volunteer_ratings` — ratings/comments linked to completed requests.
- Optional notification records for in-app notification history.

Security rules will ensure:

- Users can manage their own profile.
- Residents can create and view their own requests.
- Volunteers can view open nearby requests and assigned requests.
- Only the assigned volunteer can update an accepted request.
- Only request participants can read/send chat messages.
- Admins can view and manage platform data.
- Admin checks happen through secure database role validation, not client-side storage.

## Technical implementation details

- Use React Router routes for auth pages and dashboards.
- Use Supabase Auth for signup/login/session handling.
- Use realtime database subscriptions for requests and chat.
- Use browser geolocation APIs for coordinates, with graceful manual fallback.
- Use Sonner toasts for in-app notifications.
- Use Lovable Cloud/Supabase migrations for schema and RLS.
- Use Lovable app emails for event-triggered one-to-one notifications.
- Add clear code comments around important auth, realtime, and role-based logic.

## Run instructions to include in the project

Update the README with:

- What the app does.
- How to run locally in Lovable/Vite.
- Required Lovable Cloud setup.
- How auth roles work.
- How browser geolocation permissions work.
- How app emails are configured.
- Demo testing flow for Resident, Volunteer, and Admin roles.

## Notes on the requested stack

The original request mentioned Node.js/Express, MongoDB/Firebase, Socket.io, and separate frontend/backend folders. In this Lovable project, the equivalent full-stack implementation will use React + Lovable Cloud/Supabase:

- Supabase Auth replaces custom Express auth.
- Supabase Postgres replaces MongoDB/Firebase schema storage.
- Supabase Realtime replaces Socket.io/Firebase realtime updates.
- Edge/app email infrastructure replaces custom Node email handling.

This keeps the app deployable and functional in Lovable while matching the requested product features.