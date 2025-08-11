# BodyDouble - ADHD Focus Partner Platform

A web application that connects people with ADHD for virtual body doubling sessions, similar to Omegle but focused on productivity and focus support.

## Features

- **Random Matching**: Get instantly matched with compatible focus partners
- **Friends System**: Save and reconnect with people you work well with
- **ADHD-Friendly Design**: Built specifically for neurodivergent needs
- **Real-time Communication**: Chat and video during sessions
- **Session Management**: Built-in timers and goal tracking
- **Multiple Focus Styles**: Silent, social, or accountability-based sessions

## Quick Start

1. **Install dependencies:**
   ```bash
   npm run install-all
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. **Open your browser:**
   - Frontend: http://localhost:3000
   - Backend: http://localhost:5000

## How It Works

1. **Profile Setup**: Users create a profile with their focus preferences
2. **Matching**: Algorithm matches users based on focus style and work type
3. **Session**: Users work together in a virtual space with chat and video
4. **Friends**: Save successful partnerships for future sessions

## Tech Stack

- **Frontend**: React, Tailwind CSS, Socket.IO Client
- **Backend**: Node.js, Express, Socket.IO
- **Real-time**: WebSocket connections for instant matching and communication

## Focus Styles

- **Silent Focus**: Minimal interaction, just presence
- **Social Focus**: Light conversation and encouragement
- **Accountability**: Regular check-ins and progress sharing

## Development

The application runs in development mode with hot reloading:
- Client runs on port 3000
- Server runs on port 5000
- WebSocket connections handle real-time features

## Future Enhancements

- Video chat integration (WebRTC)
- User authentication and persistence
- Session history and analytics
- Mobile app version
- Group sessions (3+ people)
